import { AssignerProtocol, ConfigResourceTypes, ConfigSource, Kafka } from 'kafkajs';
import type { Admin, ConfigEntries, Producer } from 'kafkajs';
import type { MultiServerConfig } from './kafka-settings';
import { getStoredKafkaConfig } from '@/services/kafka-config-store';
import { KafkaConsumerSessions } from '@/services/kafka-consumer-sessions';
import { KafkaMessageBrowser } from '@/services/kafka-message-browser';
import type { BrowseMessagesRequest } from '@/models/message-explorer';

// @group Types : Kafka connections, topic summaries, and inspection records
export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  connectionTimeout?: number;
  requestTimeout?: number;
  maxMessageSize?: number;
  retries?: number;
  initialRetryTime?: number;
  acks?: number;
  compressionType?: string;
  batchSize?: number;
  lingerMs?: number;
}

export interface TopicInfo {
  name: string;
  partitions: number;
  replicationFactor: number;
  connectedConsumers?: number;
  consumerGroups?: string[];
  messageCount?: number;
}

export interface ConsumerGroupInfo {
  groupId: string;
  members: number;
  state: string;
  protocol: string;
  subscriptions: string[];
  topicMemberCounts: Record<string, number>;
}

export interface MessageInfo {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
}

// @group ErrorHandling : Safe API errors without leaking connection details
export class KafkaOperationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'KafkaOperationError';
  }
}

export function getKafkaErrorResponse(error: unknown, fallback: string): { error: string; status: number } {
  if (error instanceof KafkaOperationError) return { error: error.message, status: error.status };
  if (error instanceof SyntaxError) return { error: 'Request body must be valid JSON', status: 400 };
  const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
  if (type === 'UNKNOWN_TOPIC_OR_PARTITION') return { error: 'Topic or partition was not found', status: 404 };
  if (type === 'TOPIC_ALREADY_EXISTS') return { error: 'Topic already exists', status: 409 };
  if (typeof type === 'string' && ['INVALID_PARTITIONS', 'INVALID_REPLICATION_FACTOR', 'INVALID_CONFIG', 'INVALID_TOPIC_EXCEPTION', 'POLICY_VIOLATION'].includes(type)) {
    return { error: 'Kafka rejected the requested topic settings', status: 400 };
  }
  if (typeof type === 'string' && type.endsWith('_AUTHORIZATION_FAILED')) {
    return { error: 'Kafka denied permission for this operation', status: 403 };
  }
  return { error: fallback, status: 502 };
}

// @group Validation : Validate topic API input before contacting a cluster
export function validateTopicName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length > 249 || !/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') {
    throw new KafkaOperationError('Topic name must contain 1–249 letters, digits, dots, underscores, or hyphens', 400);
  }
}

export function validatePartitionCount(count: unknown): asserts count is number {
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 10000) {
    throw new KafkaOperationError('Partition count must be an integer between 1 and 10000', 400);
  }
}

export function validateTopicConfigs(configs: unknown): asserts configs is Record<string, string> {
  if (!configs || typeof configs !== 'object' || Array.isArray(configs) || Object.keys(configs).length > 100) {
    throw new KafkaOperationError('Topic configuration must be an object with at most 100 properties', 400);
  }
  for (const [name, value] of Object.entries(configs)) {
    if (!/^[a-z][a-z0-9.]{0,199}$/.test(name) || typeof value !== 'string' || value.length > 4096 || value.includes('\0')) {
      throw new KafkaOperationError('Topic configuration requires valid property names and string values of at most 4096 characters', 400);
    }
  }
}

export function validateRequestBody(body: unknown): asserts body is Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new KafkaOperationError('Request body must be a JSON object', 400);
  }
}

export function validateProfileId(profileId: unknown): asserts profileId is string | undefined {
  if (profileId !== undefined && (typeof profileId !== 'string' || profileId.length < 1 || profileId.length > 200)) {
    throw new KafkaOperationError('Invalid Kafka profile ID', 400);
  }
}

export function validateSelectedProfileId(profileId: unknown): asserts profileId is string {
  validateProfileId(profileId);
  if (profileId === undefined) throw new KafkaOperationError('Select a Kafka profile explicitly for this operation', 400);
}

function offsetSpan(offsets: Array<{ high: string; low: string }>): bigint {
  return offsets.reduce((total, { high, low }) => {
    if (!/^\d+$/.test(high) || !/^\d+$/.test(low) || BigInt(high) < BigInt(low)) {
      throw new KafkaOperationError('Kafka returned invalid partition offsets', 502);
    }
    return total + BigInt(high) - BigInt(low);
  }, BigInt(0));
}

// @group DatabaseOperations > Lifecycle : Share clients while rejecting retired profile connections
export class KafkaService {
  private readonly kafka: Kafka;
  private readonly admin: Admin;
  private readonly consumerSessions: KafkaConsumerSessions;
  private readonly messageBrowser: KafkaMessageBrowser;
  private producer?: Producer;
  private connecting?: Promise<void>;
  private producerConnecting?: Promise<Producer>;
  private readonly topicConfigWrites = new Map<string, Promise<void>>();
  private retired = false;

  constructor(private readonly config: KafkaConfig, kafka?: Kafka) {
    this.kafka = kafka ?? new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      retry: { initialRetryTime: config.initialRetryTime ?? 300, retries: config.retries ?? 3 },
      connectionTimeout: config.connectionTimeout ?? 10000,
      requestTimeout: config.requestTimeout ?? 30000,
    });
    this.admin = this.kafka.admin();
    this.consumerSessions = new KafkaConsumerSessions(this.kafka);
    this.messageBrowser = new KafkaMessageBrowser(this.kafka);
  }

  private assertCurrent(): void {
    if (this.retired) throw new KafkaOperationError('Kafka profile changed. Refresh and retry the operation.', 409);
  }

  async connect(): Promise<void> {
    this.assertCurrent();
    if (!this.connecting) {
      this.connecting = this.admin.connect().catch(error => {
        this.connecting = undefined;
        throw error;
      });
    }
    await this.connecting;
    this.assertCurrent();
  }

  async disconnect(): Promise<void> {
    await Promise.allSettled([this.connecting, this.producerConnecting]);
    const results = await Promise.allSettled([
      this.admin.disconnect(),
      this.producer?.disconnect(),
      this.consumerSessions.disconnect(),
      this.messageBrowser.disconnect(),
    ]);
    this.connecting = undefined;
    this.producerConnecting = undefined;
    this.producer = undefined;
    if (results.some(result => result.status === 'rejected')) {
      throw new KafkaOperationError('Could not close all Kafka connections', 502);
    }
  }

  async retire(): Promise<void> {
    this.retired = true;
    await this.disconnect();
  }

  // @group DatabaseOperations > Topics : Actual topic administration on the selected cluster
  async createTopic(name: string, partitions = 1, replicationFactor = 1, configs: Record<string, string> = {}): Promise<void> {
    this.assertCurrent();
    validateTopicName(name);
    validatePartitionCount(partitions);
    if (!Number.isInteger(replicationFactor) || replicationFactor < 1 || replicationFactor > 32767) {
      throw new KafkaOperationError('Replication factor must be an integer between 1 and 32767', 400);
    }
    validateTopicConfigs(configs);
    const created = await this.admin.createTopics({
      waitForLeaders: true,
      topics: [{ topic: name, numPartitions: partitions, replicationFactor, configEntries: Object.entries(configs).map(([name, value]) => ({ name, value })) }],
    });
    if (!created) throw new KafkaOperationError('Topic already exists', 409);
  }

  async deleteTopic(name: string): Promise<void> {
    this.assertCurrent();
    validateTopicName(name);
    await this.admin.deleteTopics({ topics: [name] });
  }

  async cleanupMessages(topicName: string): Promise<{ deletedPartitions: number; totalMessages: number }> {
    this.assertCurrent();
    validateTopicName(topicName);
    const offsets = await this.admin.fetchTopicOffsets(topicName);
    const span = offsetSpan(offsets);
    // Captured decimal strings preserve 64-bit offsets and exclude records arriving after this snapshot.
    const partitions = offsets.map(({ partition, high }) => ({ partition, offset: high }));
    if (partitions.length === 0) throw new KafkaOperationError('Topic has no available partitions', 404);
    this.assertCurrent();
    try {
      await this.admin.deleteTopicRecords({ topic: topicName, partitions });
    } catch {
      throw new KafkaOperationError('Kafka could not complete the purge. Some partitions may already be purged; refresh the topic before retrying.', 502);
    }
    return { deletedPartitions: partitions.length, totalMessages: Number(span) };
  }

  private async describeTopicConfigs(name: string): Promise<ConfigEntries[]> {
    this.assertCurrent();
    validateTopicName(name);
    const result = await this.admin.describeConfigs({ resources: [{ type: ConfigResourceTypes.TOPIC, name }], includeSynonyms: false });
    const resource = result.resources.find(resource => resource.resourceType === ConfigResourceTypes.TOPIC && resource.resourceName === name);
    if (!resource) throw new KafkaOperationError('Kafka did not return topic configuration', 502);
    if (resource.errorCode !== 0) {
      throw new KafkaOperationError('Kafka could not read topic configuration', resource.errorCode === 3 ? 404 : resource.errorCode === 29 ? 403 : 502);
    }
    return resource.configEntries;
  }

  async getTopicConfigs(name: string): Promise<Record<string, string>> {
    const entries = await this.describeTopicConfigs(name);
    return Object.fromEntries(entries.filter(entry => !entry.isSensitive && typeof entry.configValue === 'string').map(entry => [entry.configName, entry.configValue]));
  }

  async updateTopicConfigs(name: string, configs: Record<string, string>): Promise<void> {
    validateTopicName(name);
    validateTopicConfigs(configs);
    const previous = this.topicConfigWrites.get(name) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(() => this.applyTopicConfigs(name, configs));
    this.topicConfigWrites.set(name, write);
    try {
      await write;
    } finally {
      if (this.topicConfigWrites.get(name) === write) this.topicConfigWrites.delete(name);
    }
  }

  private async applyTopicConfigs(name: string, configs: Record<string, string>): Promise<void> {
    const entries = await this.describeTopicConfigs(name);
    const existing = new Map(entries.map(entry => [entry.configName, entry]));
    for (const key of Object.keys(configs)) {
      const entry = existing.get(key);
      if (!entry || entry.readOnly || entry.isSensitive) {
        throw new KafkaOperationError(`Topic setting cannot be edited: ${key}`, 400);
      }
    }
    if (Object.keys(configs).length === 0) return;
    // Kafka's alterConfigs replaces overrides; preserve every override outside this patch.
    const overrides = new Map<string, string>();
    for (const entry of entries) {
      if (entry.configSource === ConfigSource.TOPIC_CONFIG) {
        if (entry.isSensitive || entry.readOnly || typeof entry.configValue !== 'string') {
          throw new KafkaOperationError('Kafka returned a topic override that cannot be preserved safely', 409);
        }
        overrides.set(entry.configName, entry.configValue);
      }
    }
    for (const [key, value] of Object.entries(configs)) overrides.set(key, value);
    this.assertCurrent();
    await this.admin.alterConfigs({
      validateOnly: false,
      resources: [{ type: ConfigResourceTypes.TOPIC, name, configEntries: Array.from(overrides, ([name, value]) => ({ name, value })) }],
    });
  }

  async addPartitions(name: string, count: number): Promise<void> {
    this.assertCurrent();
    validateTopicName(name);
    validatePartitionCount(count);
    const metadata = await this.admin.fetchTopicMetadata({ topics: [name] });
    const topic = metadata.topics.find(topic => topic.name === name);
    if (!topic) throw new KafkaOperationError('Topic was not found', 404);
    if (count <= topic.partitions.length) throw new KafkaOperationError('Partition count must exceed the current partition count', 400);
    this.assertCurrent();
    await this.admin.createPartitions({ topicPartitions: [{ topic: name, count }] });
  }

  // @group BusinessLogic > Messages : Produce records and delegate isolated inspection sessions
  private async getProducer(): Promise<Producer> {
    this.assertCurrent();
    if (!this.producerConnecting) {
      this.producer = this.kafka.producer({ allowAutoTopicCreation: false });
      const producer = this.producer;
      this.producerConnecting = producer.connect().then(() => producer).catch(async error => {
        this.producerConnecting = undefined;
        this.producer = undefined;
        await producer.disconnect().catch(() => undefined);
        throw error;
      });
    }
    return this.producerConnecting;
  }

  async sendMessage(topic: string, message: { key?: string; value: string; headers?: Record<string, string> }): Promise<void> {
    validateTopicName(topic);
    const messageBytes = Buffer.byteLength(message.value) + Buffer.byteLength(message.key ?? '') +
      Object.entries(message.headers ?? {}).reduce((size, [key, value]) => size + Buffer.byteLength(key) + Buffer.byteLength(value), 0);
    if (messageBytes > (this.config.maxMessageSize ?? 1048576)) {
      throw new KafkaOperationError('Message exceeds the selected profile’s maximum message size', 413);
    }
    const compressionType = this.config.compressionType ?? 'none';
    if (compressionType !== 'none' && compressionType !== 'gzip') {
      throw new KafkaOperationError('Only none or gzip message compression is supported', 400);
    }
    const producer = await this.getProducer();
    this.assertCurrent();
    await producer.send({ topic, messages: [message], acks: this.config.acks ?? 1, compression: compressionType === 'gzip' ? 1 : undefined, timeout: this.config.requestTimeout ?? 30000 });
  }

  async pollConsumerSession(request: Parameters<KafkaConsumerSessions['poll']>[0]) {
    this.assertCurrent();
    return this.consumerSessions.poll(request);
  }

  async stopConsumerSession(sessionId: string): Promise<void> {
    await this.consumerSessions.stop(sessionId);
  }

  async browseMessages(request: BrowseMessagesRequest, signal?: AbortSignal) {
    this.assertCurrent();
    return this.messageBrowser.browse(request, signal);
  }

  // @group DatabaseOperations > Metadata : Decode member assignments and count members for each topic
  async getClusterInfo(): Promise<{ topics: number; metadata: unknown }> {
    this.assertCurrent();
    const metadata = await this.admin.fetchTopicMetadata();
    return { topics: metadata.topics.length, metadata: metadata.topics };
  }

  async getConsumerGroups(): Promise<ConsumerGroupInfo[]> {
    this.assertCurrent();
    const { groups } = await this.admin.listGroups();
    if (!groups.length) return [];
    const descriptions = await this.admin.describeGroups(groups.map(group => group.groupId));
    return groups.map(group => {
      const info = descriptions.groups.find(info => info.groupId === group.groupId);
      if (!info) throw new KafkaOperationError('Kafka returned incomplete consumer group metadata', 502);
      const topicMemberCounts: Record<string, number> = Object.create(null);
      if (info.protocolType === 'consumer') {
        for (const member of info.members) {
          if (!member.memberAssignment.length) continue;
          const decoded = AssignerProtocol.MemberAssignment.decode(member.memberAssignment);
          if (!decoded) throw new KafkaOperationError('Kafka returned an unsupported consumer assignment', 502);
          for (const [topic, partitions] of Object.entries(decoded.assignment)) {
            if (partitions.length) topicMemberCounts[topic] = (topicMemberCounts[topic] ?? 0) + 1;
          }
        }
      }
      return { groupId: info.groupId, members: info.members.length, state: info.state, protocol: info.protocol, subscriptions: Object.keys(topicMemberCounts), topicMemberCounts };
    });
  }

  async getTopicsWithConsumerInfo(): Promise<TopicInfo[]> {
    this.assertCurrent();
    const topics = await this.admin.listTopics();
    const metadata = await this.admin.fetchTopicMetadata({ topics });
    const groups = await this.getConsumerGroups();
    return Promise.all(metadata.topics.map(async topic => {
      const relevantGroups = groups.filter(group => (group.topicMemberCounts[topic.name] ?? 0) > 0);
      let messageCount: number | undefined;
      try {
        const span = offsetSpan(await this.admin.fetchTopicOffsets(topic.name));
        if (span <= BigInt(Number.MAX_SAFE_INTEGER)) messageCount = Number(span);
      } catch {
        // Offset visibility is permission dependent; leave the count explicitly unavailable.
      }
      return {
        name: topic.name,
        partitions: topic.partitions.length,
        replicationFactor: topic.partitions[0]?.replicas.length ?? 0,
        connectedConsumers: relevantGroups.reduce((total, group) => total + group.topicMemberCounts[topic.name], 0),
        consumerGroups: relevantGroups.map(group => group.groupId),
        messageCount,
      };
    }));
  }
}

// @group Configuration > Profiles : Serialize durable reads and retire all changed profile clients
export class KafkaConnectionManager {
  private static instance: KafkaConnectionManager | undefined;
  private readonly connections = new Map<string, { fingerprint: string; service: KafkaService }>();
  private configurationQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly readConfig: () => Promise<MultiServerConfig> = getStoredKafkaConfig,
    private readonly createService: (config: KafkaConfig) => KafkaService = config => new KafkaService(config),
  ) {}

  static getInstance(): KafkaConnectionManager {
    return this.instance ??= new KafkaConnectionManager();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.configurationQueue.then(operation, operation);
    this.configurationQueue = result.catch(() => undefined);
    return result;
  }

  private async applyConfig(config: MultiServerConfig): Promise<void> {
    const retirements: Promise<void>[] = [];
    for (const [id, connection] of this.connections) {
      const profile = config.profiles.find(profile => profile.id === id);
      if (!profile || JSON.stringify(profile.settings) !== connection.fingerprint) {
        this.connections.delete(id);
        retirements.push(connection.service.retire());
      }
    }
    const results = await Promise.allSettled(retirements);
    if (results.some(result => result.status === 'rejected')) {
      throw new KafkaOperationError('A changed Kafka connection could not be closed. Retry after checking the cluster.', 502);
    }
  }

  async refreshConfig(): Promise<void> {
    return this.enqueue(async () => this.applyConfig(await this.readConfig()));
  }

  async getConnection(profileId?: string): Promise<KafkaService> {
    validateProfileId(profileId);
    return this.enqueue(async () => {
      const config = await this.readConfig();
      await this.applyConfig(config);
      const id = profileId ?? config.activeProfileId;
      const profile = config.profiles.find(profile => profile.id === id);
      if (!profile) throw new KafkaOperationError('Kafka profile was not found', 404);
      let connection = this.connections.get(id);
      if (!connection) {
        connection = { fingerprint: JSON.stringify(profile.settings), service: this.createService(structuredClone(profile.settings)) };
        this.connections.set(id, connection);
      }
      return connection.service;
    });
  }

  async disconnectAll(): Promise<void> {
    return this.enqueue(async () => {
      const connections = Array.from(this.connections.values());
      this.connections.clear();
      const results = await Promise.allSettled(connections.map(connection => connection.service.retire()));
      if (results.some(result => result.status === 'rejected')) throw new KafkaOperationError('Could not close all Kafka connections', 502);
    });
  }
}

// @group Exports : Shared server-only connection access
export function getKafkaConnectionManager(): KafkaConnectionManager {
  return KafkaConnectionManager.getInstance();
}

export async function getKafkaService(profileId?: string): Promise<KafkaService> {
  return getKafkaConnectionManager().getConnection(profileId);
}
