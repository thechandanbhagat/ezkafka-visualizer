import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignerProtocol, ConfigResourceTypes, ConfigSource } from 'kafkajs';
import type { Admin, ConfigEntries, Kafka } from 'kafkajs';
import { KafkaConnectionManager, KafkaService, getKafkaErrorResponse } from '@/lib/kafka';
import type { KafkaConfig } from '@/lib/kafka';
import { DEFAULT_MULTI_SERVER_CONFIG } from '@/lib/kafka-settings';

// @group TestSetup : Actual service logic with isolated Kafka transport doubles
vi.mock('@/services/kafka-config-store', () => ({ getStoredKafkaConfig: vi.fn() }));

function createTransport() {
  const admin = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    fetchTopicOffsets: vi.fn().mockResolvedValue([{ partition: 0, high: '25', low: '0', offset: '25' }]),
    fetchTopicMetadata: vi.fn().mockResolvedValue({ topics: [{ name: 'orders', partitions: [{ partitionId: 0, replicas: [1] }, { partitionId: 1, replicas: [1] }] }] }),
    listTopics: vi.fn().mockResolvedValue(['orders']),
    createTopics: vi.fn().mockResolvedValue(true),
    deleteTopics: vi.fn().mockResolvedValue(undefined),
    deleteTopicRecords: vi.fn().mockResolvedValue(undefined),
    createPartitions: vi.fn().mockResolvedValue(undefined),
    describeConfigs: vi.fn(),
    alterConfigs: vi.fn().mockResolvedValue({ resources: [] }),
    listGroups: vi.fn().mockResolvedValue({ groups: [] }),
    describeGroups: vi.fn(),
  };
  const producer = { connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined), send: vi.fn().mockResolvedValue(undefined) };
  const kafka = { admin: () => admin as unknown as Admin, producer: vi.fn(() => producer), consumer: vi.fn() } as unknown as Kafka;
  return { admin, producer, kafka, service: new KafkaService({ brokers: ['test:9092'], clientId: 'tests', acks: 0 }, kafka) };
}

function configEntry(name: string, value: string, source = ConfigSource.TOPIC_CONFIG, overrides: Partial<ConfigEntries> = {}): ConfigEntries {
  return { configName: name, configValue: value, configSource: source, isDefault: source === ConfigSource.DEFAULT_CONFIG, isSensitive: false, readOnly: false, configSynonyms: [], ...overrides };
}

function configResponse(entries: ConfigEntries[]) {
  return { resources: [{ resourceName: 'orders', resourceType: ConfigResourceTypes.TOPIC, errorCode: 0, errorMessage: '', configEntries: entries }], throttleTime: 0 };
}

function member(memberId: string, assignment: Record<string, number[]>) {
  return { memberId, memberAssignment: AssignerProtocol.MemberAssignment.encode({ version: 0, assignment, userData: Buffer.alloc(0) }), memberMetadata: Buffer.alloc(0), clientId: memberId, clientHost: 'localhost' };
}

// @group UnitTests > Purge : Captured exact boundaries preserve topics and later records
 describe('Kafka record purge', () => {
  it('deletes through captured partition high offsets without deleting or recreating the topic', async () => {
    const { admin, service } = createTransport();
    admin.fetchTopicOffsets.mockResolvedValue([
      { partition: 0, high: '9007199254740999', low: '9007199254740990', offset: '9007199254740999' },
      { partition: 2, high: '17', low: '10', offset: '17' },
    ]);
    expect(await service.cleanupMessages('orders')).toEqual({ deletedPartitions: 2, totalMessages: 16 });
    expect(admin.deleteTopicRecords).toHaveBeenCalledWith({ topic: 'orders', partitions: [{ partition: 0, offset: '9007199254740999' }, { partition: 2, offset: '17' }] });
    expect(admin.fetchTopicOffsets).toHaveBeenCalledTimes(1);
    expect(admin.deleteTopics).not.toHaveBeenCalled();
    expect(admin.createTopics).not.toHaveBeenCalled();
  });

  it('reports partial failures without attempting topic recreation', async () => {
    const { admin, service } = createTransport();
    admin.deleteTopicRecords.mockRejectedValue(new Error('partition failure'));
    await expect(service.cleanupMessages('orders')).rejects.toMatchObject({ status: 502, message: expect.stringContaining('Some partitions may already be purged') });
    expect(admin.deleteTopics).not.toHaveBeenCalled();
    expect(admin.createTopics).not.toHaveBeenCalled();
  });

  it.each(['-1', 'not-an-offset'])('rejects an unsafe high offset %s before deletion', async high => {
    const { admin, service } = createTransport();
    admin.fetchTopicOffsets.mockResolvedValue([{ partition: 0, high, low: '0', offset: high }]);
    await expect(service.cleanupMessages('orders')).rejects.toMatchObject({ status: 502 });
    expect(admin.deleteTopicRecords).not.toHaveBeenCalled();
  });
});

// @group UnitTests > Configuration : Real reads, safe partial writes, and genuine broker failures
 describe('Kafka topic administration', () => {
  let transport: ReturnType<typeof createTransport>;
  beforeEach(() => { transport = createTransport(); });

  it('returns broker configuration and excludes sensitive values', async () => {
    transport.admin.describeConfigs.mockResolvedValue(configResponse([configEntry('retention.ms', '12345'), configEntry('secret.value', 'hidden', ConfigSource.TOPIC_CONFIG, { isSensitive: true })]));
    expect(await transport.service.getTopicConfigs('orders')).toEqual({ 'retention.ms': '12345' });
    expect(transport.admin.describeConfigs).toHaveBeenCalledWith({ resources: [{ type: ConfigResourceTypes.TOPIC, name: 'orders' }], includeSynonyms: false });
  });

  it('preserves existing topic overrides without pinning inherited broker defaults', async () => {
    transport.admin.describeConfigs.mockResolvedValue(configResponse([
      configEntry('retention.ms', '1000'), configEntry('cleanup.policy', 'compact'),
      configEntry('segment.bytes', '1024', ConfigSource.STATIC_BROKER_CONFIG),
      configEntry('compression.type', 'producer', ConfigSource.DEFAULT_CONFIG),
    ]));
    await transport.service.updateTopicConfigs('orders', { 'retention.ms': '2000' });
    expect(transport.admin.alterConfigs).toHaveBeenCalledWith({ validateOnly: false, resources: [{ type: ConfigResourceTypes.TOPIC, name: 'orders', configEntries: [{ name: 'retention.ms', value: '2000' }, { name: 'cleanup.policy', value: 'compact' }] }] });
  });

  it('serializes patches so simultaneous edits preserve both changes', async () => {
    transport.admin.describeConfigs.mockResolvedValueOnce(configResponse([configEntry('retention.ms', '1000'), configEntry('cleanup.policy', 'delete')])).mockResolvedValueOnce(configResponse([configEntry('retention.ms', '2000'), configEntry('cleanup.policy', 'delete')]));
    await Promise.all([transport.service.updateTopicConfigs('orders', { 'retention.ms': '2000' }), transport.service.updateTopicConfigs('orders', { 'cleanup.policy': 'compact' })]);
    expect(transport.admin.alterConfigs.mock.calls[1][0].resources[0].configEntries).toEqual([{ name: 'retention.ms', value: '2000' }, { name: 'cleanup.policy', value: 'compact' }]);
  });

  it.each(['unknown.property', 'message.format.version'])('rejects unsupported or read-only edit %s', async key => {
    transport.admin.describeConfigs.mockResolvedValue(configResponse([configEntry('message.format.version', '3.0', ConfigSource.DEFAULT_CONFIG, { readOnly: true })]));
    await expect(transport.service.updateTopicConfigs('orders', { [key]: 'value' })).rejects.toMatchObject({ status: 400 });
    expect(transport.admin.alterConfigs).not.toHaveBeenCalled();
  });

  it('propagates an alterConfigs failure instead of reporting a simulated save', async () => {
    transport.admin.describeConfigs.mockResolvedValue(configResponse([configEntry('retention.ms', '1000')]));
    transport.admin.alterConfigs.mockRejectedValue(new Error('broker unavailable'));
    await expect(transport.service.updateTopicConfigs('orders', { 'retention.ms': '2000' })).rejects.toThrow('broker unavailable');
  });

  it('creates partitions using the new total count', async () => {
    await transport.service.addPartitions('orders', 4);
    expect(transport.admin.createPartitions).toHaveBeenCalledWith({ topicPartitions: [{ topic: 'orders', count: 4 }] });
  });

  it.each([0, 1, 2, 2.5, 10001, NaN])('rejects invalid or non-increasing partition count %s', async count => {
    await expect(transport.service.addPartitions('orders', count)).rejects.toMatchObject({ status: 400 });
    expect(transport.admin.createPartitions).not.toHaveBeenCalled();
  });

  it('sends topic configuration during creation', async () => {
    await transport.service.createTopic('orders', 2, 1, { 'cleanup.policy': 'compact' });
    expect(transport.admin.createTopics).toHaveBeenCalledWith({ waitForLeaders: true, topics: [{ topic: 'orders', numPartitions: 2, replicationFactor: 1, configEntries: [{ name: 'cleanup.policy', value: 'compact' }] }] });
  });

  it('reports existing topics as a conflict', async () => {
    transport.admin.createTopics.mockResolvedValue(false);
    await expect(transport.service.createTopic('orders')).rejects.toMatchObject({ status: 409 });
  });
});

// @group UnitTests > ConsumerMetadata : Decode actual KafkaJS assignment bytes and count assigned members
 describe('Kafka group metadata', () => {
  it('counts only members assigned to each topic', async () => {
    const { admin, service } = createTransport();
    admin.listGroups.mockResolvedValue({ groups: [{ groupId: 'application', protocolType: 'consumer' }] });
    admin.describeGroups.mockResolvedValue({ groups: [{ groupId: 'application', protocolType: 'consumer', protocol: 'roundrobin', state: 'Stable', members: [member('first', { orders: [0, 1] }), member('second', { payments: [0] }), member('idle', { orders: [] })] }] });
    const groups = await service.getConsumerGroups();
    expect(groups[0]).toMatchObject({ members: 3, subscriptions: ['orders', 'payments'], topicMemberCounts: { orders: 1, payments: 1 } });
    expect((await service.getTopicsWithConsumerInfo())[0]).toMatchObject({ name: 'orders', connectedConsumers: 1, consumerGroups: ['application'], messageCount: 25 });
  });

  it('propagates group list and description failures rather than returning zero consumers', async () => {
    const { admin, service } = createTransport();
    admin.listGroups.mockRejectedValueOnce(new Error('permission denied'));
    await expect(service.getConsumerGroups()).rejects.toThrow('permission denied');
    admin.listGroups.mockResolvedValue({ groups: [{ groupId: 'application' }] });
    admin.describeGroups.mockRejectedValue(new Error('description failed'));
    await expect(service.getTopicsWithConsumerInfo()).rejects.toThrow('description failed');
  });
});

// @group UnitTests > Profiles : Durable reads, serialization, invalidation, and no stale broker fallback
 describe('Kafka profile connection lifecycle', () => {
  it('retires changed profiles before returning replacement connections and rejects old references', async () => {
    let config = structuredClone(DEFAULT_MULTI_SERVER_CONFIG);
    const transports: ReturnType<typeof createTransport>[] = [];
    const manager = new KafkaConnectionManager(async () => structuredClone(config), () => {
      const transport = createTransport(); transports.push(transport); return transport.service;
    });
    const old = await manager.getConnection('local');
    expect(await manager.getConnection('local')).toBe(old);
    config = { ...config, profiles: [{ ...config.profiles[0], settings: { ...config.profiles[0].settings, brokers: ['new:9092'] } }] };
    const replacement = await manager.getConnection('local');
    expect(replacement).not.toBe(old);
    expect(transports[0].admin.disconnect).toHaveBeenCalledOnce();
    await expect(old.deleteTopic('orders')).rejects.toMatchObject({ status: 409 });
    expect(transports[0].admin.deleteTopics).not.toHaveBeenCalled();
  });

  it('uses explicit profile selection and rejects deleted profiles', async () => {
    const config = structuredClone(DEFAULT_MULTI_SERVER_CONFIG);
    config.profiles.push({ ...config.profiles[0], id: 'remote', name: 'Remote', settings: { ...config.profiles[0].settings, brokers: ['remote:9092'] } });
    const factory = vi.fn<(config: KafkaConfig) => KafkaService>(() => createTransport().service);
    const manager = new KafkaConnectionManager(async () => structuredClone(config), factory);
    const remote = await manager.getConnection('remote');
    expect(factory.mock.calls[0][0]).toMatchObject({ brokers: ['remote:9092'] });
    expect(await manager.getConnection()).not.toBe(remote);
    config.profiles = config.profiles.filter(profile => profile.id !== 'remote');
    await expect(manager.getConnection('remote')).rejects.toMatchObject({ status: 404 });
    await expect(remote.connect()).rejects.toMatchObject({ status: 409 });
  });

  it('does not fall back to a cached cluster when durable configuration cannot be read', async () => {
    const read = vi.fn().mockResolvedValue(structuredClone(DEFAULT_MULTI_SERVER_CONFIG));
    const manager = new KafkaConnectionManager(read, () => createTransport().service);
    await manager.getConnection();
    read.mockRejectedValue(new Error('configuration unavailable'));
    await expect(manager.getConnection()).rejects.toThrow('configuration unavailable');
  });

  it('rejects a purge that captured offsets before its profile was retired', async () => {
    const { admin, service } = createTransport();
    let finishOffsets!: (offsets: Array<{ partition: number; high: string; low: string; offset: string }>) => void;
    admin.fetchTopicOffsets.mockReturnValue(new Promise(resolve => { finishOffsets = resolve; }));
    const pendingPurge = service.cleanupMessages('orders');
    const rejection = expect(pendingPurge).rejects.toMatchObject({ status: 409 });
    await service.retire();
    finishOffsets([{ partition: 0, high: '20', low: '0', offset: '20' }]);
    await rejection;
    expect(admin.deleteTopicRecords).not.toHaveBeenCalled();
  });

  it('waits for changed clients to disconnect before returning a replacement', async () => {
    const config = structuredClone(DEFAULT_MULTI_SERVER_CONFIG);
    const first = createTransport();
    let finishDisconnect!: () => void;
    first.admin.disconnect.mockImplementation(() => new Promise<void>(resolve => { finishDisconnect = resolve; }));
    const factory = vi.fn<(config: KafkaConfig) => KafkaService>().mockReturnValueOnce(first.service).mockImplementation(() => createTransport().service);
    const manager = new KafkaConnectionManager(async () => structuredClone(config), factory);
    await manager.getConnection();
    config.profiles[0].settings.brokers = ['replacement:9092'];
    const pending = manager.getConnection();
    await vi.waitFor(() => expect(first.admin.disconnect).toHaveBeenCalledOnce());
    expect(factory).toHaveBeenCalledOnce();
    await expect(first.service.deleteTopic('orders')).rejects.toMatchObject({ status: 409 });
    finishDisconnect();
    expect(await pending).not.toBe(first.service);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('attempts every connection cleanup when one client fails to close', async () => {
    const { admin, producer, service } = createTransport();
    await service.sendMessage('orders', { value: 'a' });
    admin.disconnect.mockRejectedValueOnce(new Error('disconnect failed'));
    await expect(service.retire()).rejects.toMatchObject({ status: 502 });
    expect(producer.disconnect).toHaveBeenCalledOnce();
    await expect(service.connect()).rejects.toMatchObject({ status: 409 });
  });

  it('serializes config reads so a later request cannot apply an older snapshot', async () => {
    let releaseFirst!: (config: typeof DEFAULT_MULTI_SERVER_CONFIG) => void;
    const firstRead = new Promise<typeof DEFAULT_MULTI_SERVER_CONFIG>(resolve => { releaseFirst = resolve; });
    const read = vi.fn().mockReturnValueOnce(firstRead).mockResolvedValue(structuredClone(DEFAULT_MULTI_SERVER_CONFIG));
    const manager = new KafkaConnectionManager(read, () => createTransport().service);
    const first = manager.getConnection();
    const second = manager.getConnection();
    await Promise.resolve();
    expect(read).toHaveBeenCalledOnce();
    releaseFirst(structuredClone(DEFAULT_MULTI_SERVER_CONFIG));
    const [firstService, secondService] = await Promise.all([first, second]);
    expect(firstService).toBe(secondService);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('deduplicates connection startup and retains acks=0', async () => {
    const { admin, producer, service } = createTransport();
    await Promise.all([service.connect(), service.connect()]);
    expect(admin.connect).toHaveBeenCalledOnce();
    await Promise.all([service.sendMessage('orders', { value: 'a' }), service.sendMessage('orders', { value: 'b' })]);
    expect(producer.connect).toHaveBeenCalledOnce();
    expect(producer.send).toHaveBeenCalledWith(expect.objectContaining({ acks: 0 }));
  });
});

// @group EdgeCases : Error status mapping and sensitive error detail redaction
 describe('safe Kafka failures', () => {
  it('hides arbitrary broker connection details', () => {
    expect(getKafkaErrorResponse(new Error('password=secret@internal-broker'), 'Kafka unavailable')).toEqual({ error: 'Kafka unavailable', status: 502 });
  });
  it('maps known broker authorization and conflict failures', () => {
    expect(getKafkaErrorResponse({ type: 'TOPIC_AUTHORIZATION_FAILED' }, 'failure').status).toBe(403);
    expect(getKafkaErrorResponse({ type: 'TOPIC_ALREADY_EXISTS' }, 'failure').status).toBe(409);
  });
});

// @group EdgeCases > Producer : Enforce the selected profile limit before any network connection
describe('Kafka producer bounds', () => {
  it('includes UTF-8 key, value, header keys, and header values in the message limit', async () => {
    const { kafka, producer } = createTransport();
    const service = new KafkaService({ brokers: ['test:9092'], clientId: 'bounded', maxMessageSize: 10 }, kafka);
    await expect(service.sendMessage('orders', { key: 'é', value: 'éé', headers: { name: 'é' } })).rejects.toMatchObject({ status: 413 });
    expect(producer.connect).not.toHaveBeenCalled();
    expect(producer.send).not.toHaveBeenCalled();
  });

  it('allows a message exactly at the configured limit and sends gzip when selected', async () => {
    const { kafka, producer } = createTransport();
    const service = new KafkaService({ brokers: ['test:9092'], clientId: 'bounded', maxMessageSize: 10, compressionType: 'gzip' }, kafka);
    await service.sendMessage('orders', { key: 'é', value: 'éé', headers: { ab: 'é' } });
    expect(kafka.producer).toHaveBeenCalledWith({ allowAutoTopicCreation: false });
    expect(producer.send).toHaveBeenCalledWith(expect.objectContaining({ compression: 1 }));
  });

  it('rejects unavailable codecs before connecting', async () => {
    const { kafka, producer } = createTransport();
    const service = new KafkaService({ brokers: ['test:9092'], clientId: 'bounded', compressionType: 'snappy' }, kafka);
    await expect(service.sendMessage('orders', { value: 'value' })).rejects.toMatchObject({ status: 400 });
    expect(producer.connect).not.toHaveBeenCalled();
  });
});
