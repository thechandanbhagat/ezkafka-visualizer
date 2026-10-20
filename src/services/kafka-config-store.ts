import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DEFAULT_MULTI_SERVER_CONFIG, type MultiServerConfig } from '@/lib/kafka-settings';
import { parseMultiServerConfig } from '@/utils/kafka-config-validation';

// @group ErrorHandling : Storage errors never fall back to a different cluster
export class ConfigStorageError extends Error {}

// @group Configuration : Environment-backed initial configuration for a fresh installation
export function createInitialKafkaConfig(): MultiServerConfig {
  const config = structuredClone(DEFAULT_MULTI_SERVER_CONFIG);
  const settings = config.profiles[0].settings;
  if (process.env.KAFKA_BROKERS) settings.brokers = process.env.KAFKA_BROKERS.split(',').map(value => value.trim());
  if (process.env.KAFKA_CLIENT_ID) settings.clientId = process.env.KAFKA_CLIENT_ID;
  if (process.env.KAFKA_CONNECTION_TIMEOUT) settings.connectionTimeout = Number(process.env.KAFKA_CONNECTION_TIMEOUT);
  if (process.env.KAFKA_REQUEST_TIMEOUT) settings.requestTimeout = Number(process.env.KAFKA_REQUEST_TIMEOUT);
  return parseMultiServerConfig(config);
}

// @group DatabaseOperations : Durable configuration with atomic replacement and serialized writers
export class KafkaConfigStore {
  constructor(private readonly filePath: string, private readonly initialConfig: () => MultiServerConfig = createInitialKafkaConfig) {}

  async load(): Promise<MultiServerConfig> {
    let source: string;
    try {
      source = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return parseMultiServerConfig(this.initialConfig());
      throw new ConfigStorageError('Unable to read saved cluster configuration. Check storage permissions.');
    }
    try {
      return parseMultiServerConfig(JSON.parse(source));
    } catch {
      throw new ConfigStorageError('Saved cluster configuration is invalid. Restore the configuration file before connecting.');
    }
  }

  async update(mutator: (config: MultiServerConfig) => MultiServerConfig): Promise<MultiServerConfig> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const lockPath = `${this.filePath}.lock`;
    const deadline = Date.now() + 5000;
    let lock;
    while (!lock) {
      try {
        lock = await open(lockPath, 'wx', 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new ConfigStorageError('Unable to write cluster configuration. Check storage permissions.');
        if (Date.now() >= deadline) throw new ConfigStorageError('Cluster configuration is locked. Retry, or remove a stale lock after stopping all app instances.');
        await delay(25);
      }
    }
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      const updated = parseMultiServerConfig(mutator(await this.load()));
      const file = await open(temporaryPath, 'wx', 0o600);
      try {
        await file.writeFile(`${JSON.stringify(updated, null, 2)}\n`, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporaryPath, this.filePath);
      return structuredClone(updated);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
      await lock.close();
      await unlink(lockPath);
    }
  }
}

// @group Exports : A shared file path is used by every route and connection lookup
function getConfigStore(): KafkaConfigStore {
  const filePath = process.env.EZKAFKA_CONFIG_PATH
    ? resolve(process.env.EZKAFKA_CONFIG_PATH)
    : join(homedir(), '.ezkafka', 'profiles.json');
  return new KafkaConfigStore(filePath);
}

export function getStoredKafkaConfig(): Promise<MultiServerConfig> { return getConfigStore().load(); }
export function updateStoredKafkaConfig(mutator: (config: MultiServerConfig) => MultiServerConfig): Promise<MultiServerConfig> {
  return getConfigStore().update(mutator);
}
