import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MULTI_SERVER_CONFIG, DEFAULT_SETTINGS } from '@/lib/kafka-settings';
import { createInitialKafkaConfig } from '@/services/kafka-config-store';
import { parseKafkaSettings, parseKafkaProfile, parseMultiServerConfig, requireProfileId } from '@/utils/kafka-config-validation';

// @group TestSetup : Fresh fixtures and isolated environment configuration
const settings = () => structuredClone(DEFAULT_SETTINGS);
const config = () => structuredClone(DEFAULT_MULTI_SERVER_CONFIG);
afterEach(() => vi.unstubAllEnvs());

// @group UnitTests > Settings : Preserve valid zeroes and reject invalid numeric or broker inputs
 describe('Kafka settings validation', () => {
  it('preserves zero retries, acknowledgements, and linger without defaulting them', () => {
    expect(parseKafkaSettings({ ...settings(), retries: 0, acks: 0, lingerMs: 0 })).toMatchObject({ retries: 0, acks: 0, lingerMs: 0 });
  });

  it('normalizes whitespace and duplicate addresses without changing destinations', () => {
    expect(parseKafkaSettings({ ...settings(), brokers: [' kafka:9092 ', 'kafka:9092', '[::1]:9092'], clientId: ' client ' })).toMatchObject({ brokers: ['kafka:9092', '[::1]:9092'], clientId: 'client' });
  });

  it.each([
    { brokers: [] }, { brokers: ['http://host:9092'] }, { brokers: ['host'] }, { brokers: ['host:0'] }, { brokers: ['host:65536'] },
    { brokers: ['host:9092/path'] }, { brokers: [42] }, { brokers: ['host:9092\n'] },
    { retries: -1 }, { retries: 1.5 }, { retries: '0' }, { acks: 2 }, { lingerMs: -1 },
    { compressionType: 'snappy' }, { compressionType: 'lz4' }, { maxMessageSize: 100 },
    { appName: 0 }, { clientId: '' }, { connectionTimeout: Infinity }, { requestTimeout: NaN },
  ])('rejects invalid settings %j', invalid => {
    expect(() => parseKafkaSettings({ ...settings(), ...invalid })).toThrow();
  });

  it('rejects omitted broker settings instead of silently switching to localhost', () => {
    expect(() => parseKafkaSettings({})).toThrow('broker addresses');
  });

  it('allows only available compression codecs', () => {
    expect(parseKafkaSettings({ ...settings(), compressionType: 'gzip' }).compressionType).toBe('gzip');
    expect(parseKafkaSettings({ ...settings(), compressionType: 'none' }).compressionType).toBe('none');
  });
});

// @group UnitTests > Profiles : IDs, selected profile, unique identities, and bounded metadata
 describe('Kafka profile validation', () => {
  it.each(['', '.. / profile', 'a/b', 'id\n', 'x'.repeat(129), null, 123])('rejects invalid profile ID %j', id => {
    expect(() => requireProfileId(id)).toThrow();
  });

  it('rejects duplicate IDs and an absent active profile', () => {
    const duplicate = config(); duplicate.profiles.push(duplicate.profiles[0]);
    expect(() => parseMultiServerConfig(duplicate)).toThrow('unique');
    expect(() => parseMultiServerConfig({ ...config(), activeProfileId: 'missing' })).toThrow('active profile');
  });

  it.each([null, [], {}, { profiles: [], activeProfileId: 'local' }])('rejects malformed root configuration %j', value => {
    expect(() => parseMultiServerConfig(value)).toThrow();
  });

  it('strips unknown properties and invalid timestamps rather than persisting them', () => {
    expect(parseKafkaProfile({ ...config().profiles[0], unexpected: 'value', lastConnected: 'not-a-date' })).not.toHaveProperty('unexpected');
    expect(parseKafkaProfile({ ...config().profiles[0], lastConnected: 'not-a-date' })).not.toHaveProperty('lastConnected');
  });

  it('rejects oversized profile descriptions', () => {
    expect(() => parseKafkaProfile({ ...config().profiles[0], description: 'x'.repeat(501) })).toThrow();
  });
});

// @group EdgeCases > Initialization : Fresh installs honor environment, persisted files use their own profiles
 describe('initial configuration environment', () => {
  it('uses environment brokers and validates configured timeouts', () => {
    vi.stubEnv('KAFKA_BROKERS', 'first:9092, second:9093');
    vi.stubEnv('KAFKA_CLIENT_ID', 'deployment-client');
    vi.stubEnv('KAFKA_CONNECTION_TIMEOUT', '10000');
    vi.stubEnv('KAFKA_REQUEST_TIMEOUT', '30000');
    expect(createInitialKafkaConfig().profiles[0].settings).toMatchObject({ brokers: ['first:9092', 'second:9093'], clientId: 'deployment-client' });
    vi.stubEnv('KAFKA_CONNECTION_TIMEOUT', 'bad');
    expect(() => createInitialKafkaConfig()).toThrow();
    expect(DEFAULT_SETTINGS.brokers).toEqual(['localhost:9092']);
  });
});
