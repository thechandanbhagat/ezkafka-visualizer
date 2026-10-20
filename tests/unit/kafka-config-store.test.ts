import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { KafkaConfigStore, ConfigStorageError } from '@/services/kafka-config-store';
import { DEFAULT_MULTI_SERVER_CONFIG } from '@/lib/kafka-settings';

// @group TestSetup : Real local file operations in disposable, workspace-scoped directories
const scratchRoot = resolve('excluded/test-scripts');
let testDirectory: string;
let filePath: string;
let store: KafkaConfigStore;
const initialConfig = () => structuredClone(DEFAULT_MULTI_SERVER_CONFIG);

beforeEach(async () => {
  await mkdir(scratchRoot, { recursive: true });
  testDirectory = await mkdtemp(join(scratchRoot, 'config-store-'));
  filePath = join(testDirectory, 'nested', 'profiles.json');
  store = new KafkaConfigStore(filePath, initialConfig);
});

afterEach(async () => {
  if (dirname(resolve(testDirectory)) !== scratchRoot) throw new Error('Refusing to remove a directory outside test scratch space');
  await rm(testDirectory, { recursive: true, force: true });
});

// @group UnitTests > Persistence : Durable snapshots survive new store instances and failed writers
 describe('Kafka configuration file store', () => {
  it('initializes an absent file without sharing mutable default objects', async () => {
    const first = await store.load();
    first.profiles[0].settings.brokers = ['changed:9092'];
    expect((await store.load()).profiles[0].settings.brokers).toEqual(['localhost:9092']);
    expect(DEFAULT_MULTI_SERVER_CONFIG.profiles[0].settings.brokers).toEqual(['localhost:9092']);
  });

  it('persists updates across store recreation and returns independent snapshots', async () => {
    const saved = await store.update(config => ({ ...config, profiles: [{ ...config.profiles[0], name: 'Durable cluster', settings: { ...config.profiles[0].settings, brokers: ['persistent:9092'] } }] }));
    saved.profiles[0].settings.brokers[0] = 'modified-client-copy:9092';
    const restarted = new KafkaConfigStore(filePath, initialConfig);
    expect((await restarted.load()).profiles[0]).toMatchObject({ name: 'Durable cluster', settings: { brokers: ['persistent:9092'] } });
    expect(JSON.parse(await readFile(filePath, 'utf8')).profiles[0].settings.brokers).toEqual(['persistent:9092']);
  });

  it('serializes updates across independent store instances without lost profiles', async () => {
    const otherProcess = new KafkaConfigStore(filePath, initialConfig);
    await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? store : otherProcess).update(config => ({
      ...config,
      profiles: [...config.profiles, { ...config.profiles[0], id: `cluster-${index}`, name: `Cluster ${index}` }],
    }))));
    const saved = await store.load();
    expect(saved.profiles).toHaveLength(13);
    expect(new Set(saved.profiles.map(profile => profile.id)).size).toBe(13);
  });

  it('keeps the original file and releases the lock when a mutator rejects', async () => {
    await store.update(config => config);
    const before = await readFile(filePath, 'utf8');
    await expect(store.update(() => { throw new Error('rejected operation'); })).rejects.toThrow('rejected operation');
    expect(await readFile(filePath, 'utf8')).toBe(before);
    await expect(access(`${filePath}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.update(config => config)).resolves.toBeDefined();
  });

  it('leaves the file unchanged and unlocks when updated data is invalid', async () => {
    await store.update(config => config);
    const before = await readFile(filePath, 'utf8');
    await expect(store.update(config => ({ ...config, activeProfileId: 'missing' }))).rejects.toThrow('active profile');
    expect(await readFile(filePath, 'utf8')).toBe(before);
    await expect(access(`${filePath}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['{broken', JSON.stringify({ profiles: [], activeProfileId: 'local' }), JSON.stringify({ profiles: [{ id: 'local', name: 'Local', settings: {} }], activeProfileId: 'local' })])('fails closed for invalid persisted content', async content => {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    await expect(store.load()).rejects.toBeInstanceOf(ConfigStorageError);
    await expect(store.update(config => config)).rejects.toBeInstanceOf(ConfigStorageError);
    expect(await readFile(filePath, 'utf8')).toBe(content);
    await expect(access(`${filePath}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
