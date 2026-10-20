import { DEFAULT_SETTINGS, type KafkaSettings, type KafkaServerProfile, type MultiServerConfig } from '@/lib/kafka-settings';

// @group ErrorHandling : Validation failures safe to return to configuration clients
export class ConfigValidationError extends Error {}

// @group Validation : Strict configuration boundaries shared by persistence and routes
export function requireObject(value: unknown, label = 'Request'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConfigValidationError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

export function requireText(value: unknown, label: string, maxLength = 128): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength || /[\x00-\x1f\x7f]/.test(value)) {
    throw new ConfigValidationError(`${label} must contain 1–${maxLength} characters without control characters.`);
  }
  return value.trim();
}

export function requireProfileId(value: unknown): string {
  const id = requireText(value, 'Profile ID');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) throw new ConfigValidationError('Profile ID contains unsupported characters.');
  return id;
}

function requireInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ConfigValidationError(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export function parseKafkaSettings(value: unknown): KafkaSettings {
  const settings = requireObject(value, 'Settings');
  if (!Object.hasOwn(settings, 'brokers')) throw new ConfigValidationError('Settings must specify broker addresses.');
  const input = { ...DEFAULT_SETTINGS, ...settings };
  if (!Array.isArray(input.brokers) || input.brokers.length < 1 || input.brokers.length > 100) {
    throw new ConfigValidationError('Provide between 1 and 100 broker addresses.');
  }
  const brokers = input.brokers.map((value: unknown) => {
    const address = requireText(value, 'Broker address', 300);
    const match = /^(\[[a-fA-F0-9:]+\]|[a-zA-Z0-9][a-zA-Z0-9._-]*):(\d{1,5})$/.exec(address);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) {
      throw new ConfigValidationError('Broker addresses must use host:port or [IPv6]:port.');
    }
    return address;
  });
  if (!['none', 'gzip'].includes(input.compressionType)) throw new ConfigValidationError('Compression must be none or gzip.');
  if (![-1, 0, 1].includes(input.acks)) throw new ConfigValidationError('Acknowledgements must be -1, 0 or 1.');
  return {
    brokers: [...new Set(brokers)],
    clientId: requireText(input.clientId, 'Client ID'),
    appName: requireText(input.appName === undefined ? DEFAULT_SETTINGS.appName : input.appName, 'Application name', 80),
    connectionTimeout: requireInteger(input.connectionTimeout, 'Connection timeout', 1000, 60000),
    requestTimeout: requireInteger(input.requestTimeout, 'Request timeout', 1000, 300000),
    maxMessageSize: requireInteger(input.maxMessageSize, 'Maximum message size', 1024, 104857600),
    retries: requireInteger(input.retries, 'Retries', 0, 10),
    initialRetryTime: requireInteger(input.initialRetryTime, 'Initial retry delay', 100, 10000),
    acks: input.acks,
    compressionType: input.compressionType,
    batchSize: requireInteger(input.batchSize, 'Batch size', 1, 1000000),
    lingerMs: requireInteger(input.lingerMs, 'Linger delay', 0, 60000),
  };
}

export function parseKafkaProfile(value: unknown): KafkaServerProfile {
  const input = requireObject(value, 'Profile');
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 500)) {
    throw new ConfigValidationError('Description must be at most 500 characters.');
  }
  return {
    id: requireProfileId(input.id),
    name: requireText(input.name, 'Profile name', 80),
    description: typeof input.description === 'string' ? input.description.trim() : undefined,
    settings: parseKafkaSettings(input.settings),
    ...(typeof input.lastConnected === 'string' && !Number.isNaN(Date.parse(input.lastConnected)) ? { lastConnected: input.lastConnected } : {}),
  };
}

export function parseMultiServerConfig(value: unknown): MultiServerConfig {
  const input = requireObject(value, 'Cluster configuration');
  if (!Array.isArray(input.profiles) || input.profiles.length < 1 || input.profiles.length > 100) {
    throw new ConfigValidationError('Cluster configuration must contain between 1 and 100 profiles.');
  }
  const profiles = input.profiles.map(parseKafkaProfile);
  if (new Set(profiles.map(profile => profile.id)).size !== profiles.length) throw new ConfigValidationError('Profile IDs must be unique.');
  const activeProfileId = requireProfileId(input.activeProfileId);
  if (!profiles.some(profile => profile.id === activeProfileId)) throw new ConfigValidationError('The active profile must exist.');
  return { profiles, activeProfileId };
}
