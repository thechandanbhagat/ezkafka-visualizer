import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kafka, logLevel } from 'kafkajs';
import { KafkaService } from '@/lib/kafka';

// @group Configuration : Opt-in verification against an explicitly disposable local broker
// Never populate these variables with an existing development or production cluster.
const broker = process.env.EZKAFKA_TEST_BROKER;
const enabled = process.env.EZKAFKA_DISPOSABLE_BROKER === '1' && Boolean(broker);
const topic = `ezkafka-live-${randomUUID()}`;
const baselineGroup = `ezkafka-live-baseline-${randomUUID()}`;

describe.skipIf(!enabled)('disposable live Kafka regression', () => {
  const kafka = new Kafka({ brokers: [broker || '127.0.0.1:1'], clientId: 'ezkafka-live-verification', logLevel: logLevel.NOTHING, retry: { retries: 3 } });
  const admin = kafka.admin();
  const service = new KafkaService({ brokers: [broker || '127.0.0.1:1'], clientId: 'ezkafka-live-service', acks: -1 }, kafka);
  let created = false;

  // @group TestSetup : Create only namespaced temporary resources and release them
  beforeAll(async () => {
    if (!broker || !/^(127\.0\.0\.1|localhost):\d+$/.test(broker)) throw new Error('Live tests require an explicit disposable localhost broker');
    await admin.connect();
    await service.connect();
    await service.createTopic(topic, 1, 1, { 'retention.ms': '43200000', 'segment.bytes': '1048576' });
    created = true;
  }, 45_000);

  afterAll(async () => {
    try {
      await service.disconnect();
      if (created) await admin.deleteTopics({ topics: [topic] });
      await admin.deleteGroups([baselineGroup]).catch(() => undefined);
    } finally {
      await admin.disconnect();
    }
  }, 30_000);

  // @group IntegrationTests : Real configuration, partition, record and offset semantics
  it('preserves topic overrides, adds partitions, isolates inspection and purges records in place', async () => {
    expect(await service.getTopicConfigs(topic)).toMatchObject({ 'retention.ms': '43200000', 'segment.bytes': '1048576' });
    await service.updateTopicConfigs(topic, { 'retention.ms': '86400000' });
    expect(await service.getTopicConfigs(topic)).toMatchObject({ 'retention.ms': '86400000', 'segment.bytes': '1048576' });
    await service.addPartitions(topic, 2);
    expect((await admin.fetchTopicMetadata({ topics: [topic] })).topics[0].partitions).toHaveLength(2);

    for (let index = 0; index < 25; index++) await service.sendMessage(topic, { key: 'same-partition', value: `record-${index}` });
    await admin.setOffsets({ groupId: baselineGroup, topic, partitions: [{ partition: 0, offset: '1' }, { partition: 1, offset: '1' }] });
    const baseline = await admin.fetchOffsets({ groupId: baselineGroup, topics: [topic] });
    const sessionId = randomUUID();
    const received: string[] = [];
    const deadline = Date.now() + 30_000;
    while (received.length < 25 && Date.now() < deadline) {
      const batch = await service.pollConsumerSession({ sessionId, topics: [topic], fromBeginning: true, maxMessages: 10, timeoutMs: 1000 });
      expect(batch.droppedMessages).toBe(0);
      received.push(...batch.messages.map(message => message.value));
    }
    expect(received).toEqual(Array.from({ length: 25 }, (value, index) => `record-${index}`));
    expect(await admin.fetchOffsets({ groupId: baselineGroup, topics: [topic] })).toEqual(baseline);
    const inspection = (await service.getConsumerGroups()).find(group => group.groupId.startsWith('ezkafka-inspect-') && group.subscriptions.includes(topic));
    expect(inspection?.topicMemberCounts[topic]).toBe(1);
    const inspectionOffsets = await admin.fetchOffsets({ groupId: inspection!.groupId, topics: [topic] });
    expect(inspectionOffsets.flatMap(entry => entry.partitions.map(partition => partition.offset))).toEqual(['-1', '-1']);
    await service.stopConsumerSession(sessionId);
    await expect(service.pollConsumerSession({ sessionId, topics: [topic] })).rejects.toMatchObject({ status: 410 });

    const offsetsBefore = await admin.fetchTopicOffsets(topic);
    const purge = await service.cleanupMessages(topic);
    expect(purge.deletedPartitions).toBe(2);
    const offsetsAfter = await admin.fetchTopicOffsets(topic);
    expect(offsetsAfter.map(partition => partition.high)).toEqual(offsetsBefore.map(partition => partition.high));
    expect(offsetsAfter.every(partition => partition.low === partition.high)).toBe(true);
    expect((await admin.fetchTopicMetadata({ topics: [topic] })).topics[0].partitions).toHaveLength(2);
    expect(await service.getTopicConfigs(topic)).toMatchObject({ 'retention.ms': '86400000', 'segment.bytes': '1048576' });
    await service.sendMessage(topic, { key: 'same-partition', value: 'after-purge' });
    const nextSession = randomUUID();
    try {
      const result = await service.pollConsumerSession({ sessionId: nextSession, topics: [topic], fromBeginning: true, timeoutMs: 5000 });
      expect(result.messages.map(message => message.value)).toEqual(['after-purge']);
    } finally {
      await service.stopConsumerSession(nextSession);
    }
  }, 120_000);
});
