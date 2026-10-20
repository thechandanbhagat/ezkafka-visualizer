import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { GET, POST, PUT } from '@/app/api/settings/route';
import { DEFAULT_SETTINGS } from '@/lib/kafka-settings';
import { getStoredKafkaConfig } from '@/services/kafka-config-store';

// @group TestSetup : Real file persistence and Next handlers with only connection refresh isolated
const { refreshConfig } = vi.hoisted(() => ({ refreshConfig: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/kafka', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/kafka')>(), getKafkaConnectionManager: () => ({ refreshConfig }) }));

const scratchRoot = resolve('excluded/test-scripts');
let testDirectory: string;
let filePath: string;
function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3700/api/settings', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}
function createProfile(name = 'Remote') {
  return POST(request({ action: 'createProfile', name, settings: { ...DEFAULT_SETTINGS, brokers: ['remote:9092'] } }));
}

beforeEach(async () => {
  await mkdir(scratchRoot, { recursive: true });
  testDirectory = await mkdtemp(join(scratchRoot, 'settings-route-'));
  filePath = join(testDirectory, 'profiles.json');
  vi.stubEnv('EZKAFKA_CONFIG_PATH', filePath);
  for (const name of ['KAFKA_BROKERS', 'KAFKA_CLIENT_ID', 'KAFKA_CONNECTION_TIMEOUT', 'KAFKA_REQUEST_TIMEOUT']) vi.stubEnv(name, undefined);
  refreshConfig.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (dirname(resolve(testDirectory)) !== scratchRoot) throw new Error('Refusing to remove a directory outside test scratch space');
  await rm(testDirectory, { recursive: true, force: true });
});

// @group IntegrationTests > Settings : Save, reload, edit, select, delete, and reset durable profiles
 describe('settings routes with durable storage', () => {
  it('returns the persisted profile shape expected by clients', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, multiServerConfig: { activeProfileId: 'local' }, activeProfile: { id: 'local' }, settings: { brokers: ['localhost:9092'] } });
  });

  it('creates durable profiles then refreshes the connection manager exactly once', async () => {
    refreshConfig.mockImplementation(async () => {
      expect(JSON.parse(await readFile(filePath, 'utf8')).profiles).toHaveLength(2);
    });
    const response = await createProfile();
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.multiServerConfig.profiles[1]).toMatchObject({ name: 'Remote', settings: { brokers: ['remote:9092'] } });
    expect(saved.multiServerConfig.profiles[1].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(refreshConfig).toHaveBeenCalledOnce();
    expect((await (await GET()).json()).multiServerConfig).toEqual(saved.multiServerConfig);
  });

  it('updates existing broker profiles without changing identity or zero settings', async () => {
    const current = (await getStoredKafkaConfig()).profiles[0];
    const response = await POST(request({ action: 'updateProfile', profile: { ...current, settings: { ...current.settings, brokers: ['replacement:9092'], retries: 0, acks: 0, lingerMs: 0 } } }));
    expect(response.status).toBe(200);
    expect((await getStoredKafkaConfig()).profiles[0]).toMatchObject({ id: 'local', settings: { brokers: ['replacement:9092'], retries: 0, acks: 0, lingerMs: 0 } });
    expect(refreshConfig).toHaveBeenCalledOnce();
  });

  it('selects a saved profile and chooses an existing fallback when deleting it', async () => {
    await createProfile();
    const remote = (await getStoredKafkaConfig()).profiles[1];
    expect((await POST(request({ action: 'switchProfile', profileId: remote.id }))).status).toBe(200);
    expect((await getStoredKafkaConfig()).activeProfileId).toBe(remote.id);
    const deleted = await POST(request({ action: 'deleteProfile', profileId: remote.id }));
    expect(deleted.status).toBe(200);
    expect((await getStoredKafkaConfig())).toMatchObject({ activeProfileId: 'local', profiles: [{ id: 'local' }] });
  });

  it('keeps the active profile when another profile is deleted', async () => {
    await createProfile();
    const remote = (await getStoredKafkaConfig()).profiles[1];
    await POST(request({ action: 'deleteProfile', profileId: remote.id }));
    expect((await getStoredKafkaConfig()).activeProfileId).toBe('local');
  });

  it('rejects deleting the last profile without changing saved data', async () => {
    const response = await POST(request({ action: 'deleteProfile', profileId: 'local' }));
    expect(response.status).toBe(409);
    expect((await getStoredKafkaConfig()).profiles).toHaveLength(1);
    expect(refreshConfig).not.toHaveBeenCalled();
    expect((await createProfile()).status).toBe(200);
  });

  it('serializes simultaneous profile creations without dropping either one', async () => {
    const responses = await Promise.all([createProfile('First'), createProfile('Second')]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect((await getStoredKafkaConfig()).profiles.map(profile => profile.name).sort()).toEqual(['First', 'Local Kafka', 'Second']);
    expect(refreshConfig).toHaveBeenCalledTimes(2);
  });

  it('resets configuration durably and refreshes clients', async () => {
    await createProfile();
    refreshConfig.mockClear();
    expect((await PUT()).status).toBe(200);
    expect((await getStoredKafkaConfig()).profiles).toHaveLength(1);
    expect((await getStoredKafkaConfig()).activeProfileId).toBe('local');
    expect(refreshConfig).toHaveBeenCalledOnce();
  });
});

// @group EdgeCases : Invalid requests never mutate storage or select another cluster implicitly
 describe('settings route validation', () => {
  it.each([null, [], {}, { action: 'unknown' }, { action: ['createProfile'], profileId: 'local' }, { action: 'switchProfile' }, { action: 'deleteProfile', profileId: '../local' }, { action: 'createProfile', name: 'Bad', settings: {} }])('rejects malformed settings body %j', async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(refreshConfig).not.toHaveBeenCalled();
    expect((await getStoredKafkaConfig()).profiles).toHaveLength(1);
  });

  it.each(['switchProfile', 'deleteProfile'])('returns 404 for missing target of %s', async action => {
    expect((await POST(request({ action, profileId: 'missing' }))).status).toBe(404);
    expect(refreshConfig).not.toHaveBeenCalled();
  });

  it('rejects updating a missing profile instead of creating it', async () => {
    const response = await POST(request({ action: 'updateProfile', profile: { id: 'missing', name: 'Missing', settings: DEFAULT_SETTINGS } }));
    expect(response.status).toBe(404);
    expect((await getStoredKafkaConfig()).profiles).toHaveLength(1);
  });

  it('leaves a corrupted file untouched and returns a safe failure', async () => {
    await writeFile(filePath, '{secret-broken-configuration');
    const response = await GET();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
    expect((await createProfile()).status).toBe(500);
    expect(await readFile(filePath, 'utf8')).toBe('{secret-broken-configuration');
    expect(refreshConfig).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(new NextRequest('http://localhost:3700/api/settings', { method: 'POST', body: '{broken' }));
    expect(response.status).toBe(400);
  });
});
