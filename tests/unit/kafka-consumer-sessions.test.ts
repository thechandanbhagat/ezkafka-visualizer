import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Consumer, ConsumerConfig, ConsumerRunConfig, EachMessagePayload, Kafka } from 'kafkajs';
import { KafkaConsumerSessions } from '@/services/kafka-consumer-sessions';

// @group TestHelpers : Kafka double preserves asynchronous startup and message callbacks
function makeKafka() {
  const consumers: ReturnType<typeof makeConsumer>[] = [];
  const consumer = vi.fn((config: ConsumerConfig) => {
    const result = makeConsumer(config);
    consumers.push(result);
    return result as unknown as Consumer;
  });
  return { kafka: { consumer } as Pick<Kafka, 'consumer'>, consumers, consumer };
}

function makeConsumer(config: ConsumerConfig) {
  let runConfig: ConsumerRunConfig | undefined;
  let crash: (() => void) | undefined;
  return {
    config,
    connect: vi.fn(async (): Promise<void> => undefined),
    subscribe: vi.fn(async () => undefined),
    run: vi.fn(async (options: ConsumerRunConfig) => { runConfig = options; }),
    stop: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    events: { CRASH: 'consumer.crash' },
    on: vi.fn((event: string, callback: () => void) => { crash = callback; }),
    crash: () => crash?.(),
    emit: async (offset: number, topic = 'orders', value = 'record', heartbeat: () => Promise<void> = async () => undefined) => {
      await runConfig?.eachMessage?.({ topic, partition: 0, heartbeat, pause: () => () => undefined,
        message: { offset: String(offset), timestamp: '1729000000000', attributes: 0, key: Buffer.from('key'), value: Buffer.from(value), headers: { source: Buffer.from('test') } },
      } as EachMessagePayload);
    },
  };
}

// @group TestSetup : Every test releases its manager and timers
const managers: KafkaConsumerSessions[] = [];
function setup(limits: ConstructorParameters<typeof KafkaConsumerSessions>[1] = {}) {
  const fake = makeKafka();
  const manager = new KafkaConsumerSessions(fake.kafka, limits);
  managers.push(manager);
  const request = { sessionId: randomUUID(), topics: ['orders'], timeoutMs: 0 };
  return { manager, request, ...fake };
}

afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.disconnect().catch(() => undefined);
  vi.useRealTimers();
});

describe('Kafka inspection sessions', () => {
  // @group UnitTests : FIFO drain and inspection isolation
  it('drains 25 queued records as 10, 10, 5 without loss or reordering', async () => {
    const { manager, request, consumers } = setup();
    await manager.poll(request);
    for (let index = 0; index < 25; index++) await consumers[0].emit(index);
    const batches = [await manager.poll(request), await manager.poll(request), await manager.poll(request)];
    expect(batches.map(batch => batch.messages.length)).toEqual([10, 10, 5]);
    expect(batches.flatMap(batch => batch.messages.map(message => message.offset))).toEqual(Array.from({ length: 25 }, (value, index) => String(index)));
    expect(batches.map(batch => batch.bufferedMessages)).toEqual([15, 5, 0]);
    expect(batches[0].messages[0].headers).toEqual({ source: 'test' });
  });

  it('generates unique server groups, never commits offsets, and isolates sessions', async () => {
    const { manager, request, consumers } = setup();
    const second = { ...request, sessionId: randomUUID(), topics: ['payments'] };
    await Promise.all([manager.poll(request), manager.poll(second)]);
    expect(consumers[0].config.groupId).toMatch(/^ezkafka-inspect-/);
    expect(consumers[1].config.groupId).not.toBe(consumers[0].config.groupId);
    expect(consumers[0].config.allowAutoTopicCreation).toBe(false);
    expect(consumers[0].run).toHaveBeenCalledWith(expect.objectContaining({ autoCommit: false }));
    await consumers[0].emit(1);
    await consumers[1].emit(2, 'payments');
    expect((await manager.poll(request)).messages.map(message => message.topic)).toEqual(['orders']);
    expect((await manager.poll(second)).messages.map(message => message.topic)).toEqual(['payments']);
    await expect(manager.poll({ ...request, topics: ['payments'] })).rejects.toMatchObject({ status: 409 });
    await expect(manager.poll({ ...request, fromBeginning: true })).rejects.toMatchObject({ status: 409 });
  });

  it('creates only one consumer for concurrent starts and does not double drain', async () => {
    const { manager, request, consumer, consumers } = setup();
    await Promise.all([manager.poll(request), manager.poll(request)]);
    expect(consumer).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 20; index++) await consumers[0].emit(index);
    const batches = await Promise.all([manager.poll(request), manager.poll(request)]);
    expect(new Set(batches.flatMap(batch => batch.messages.map(message => message.offset))).size).toBe(20);
  });

  // @group EdgeCases : Bounds are explicit and cumulative overflow remains visible
  it('retains FIFO records at the count limit and reports every skipped record', async () => {
    const { manager, request, consumers } = setup({ maxBufferedMessages: 2 });
    await manager.poll(request);
    for (let index = 0; index < 5; index++) await consumers[0].emit(index);
    const result = await manager.poll(request);
    expect(result.messages.map(message => message.offset)).toEqual(['0', '1']);
    expect(result.droppedMessages).toBe(3);
    expect((await manager.poll(request)).droppedMessages).toBe(3);
  });

  it('bounds bytes as well as count and frees byte capacity after draining', async () => {
    const { manager, request, consumers } = setup({ maxBufferedBytes: 40 });
    await manager.poll(request);
    await consumers[0].emit(0, 'orders', 'x'.repeat(50));
    await consumers[0].emit(1);
    const result = await manager.poll(request);
    expect(result.droppedMessages).toBe(1);
    expect(result.messages.map(message => message.offset)).toEqual(['1']);
    await consumers[0].emit(2);
    expect((await manager.poll(request)).messages).toHaveLength(1);
  });

  it.each([{ maxMessages: 0 }, { maxMessages: 201 }, { maxMessages: 1.5 }, { timeoutMs: -1 }, { timeoutMs: 5001 }, { topics: [] }, { topics: ['invalid topic'] }, { sessionId: 'application-group' }])('rejects invalid requests before connecting: %j', async invalid => {
    const { manager, request, consumer } = setup();
    await expect(manager.poll({ ...request, ...invalid })).rejects.toMatchObject({ status: 400 });
    expect(consumer).not.toHaveBeenCalled();
  });

  it('caps simultaneous sessions', async () => {
    const { manager, request } = setup({ maxSessions: 1 });
    await manager.poll(request);
    await expect(manager.poll({ ...request, sessionId: randomUUID() })).rejects.toMatchObject({ status: 429 });
  });

  // @group IntegrationTests : Lifecycle cancellation, idle expiry and failures
  it('stops and disconnects once, wakes waiting polls, and prevents resurrection', async () => {
    const { manager, request, consumers } = setup();
    await manager.poll(request);
    const pending = manager.poll({ ...request, timeoutMs: 5000 });
    const rejected = expect(pending).rejects.toMatchObject({ status: 410 });
    await Promise.all([manager.stop(request.sessionId), manager.stop(request.sessionId)]);
    await rejected;
    expect(consumers[0].stop).toHaveBeenCalledTimes(1);
    expect(consumers[0].disconnect).toHaveBeenCalledTimes(1);
    await expect(manager.poll(request)).rejects.toMatchObject({ status: 410 });
  });

  it('honors stop arriving before start', async () => {
    const { manager, request, consumer } = setup();
    await manager.stop(request.sessionId);
    await expect(manager.poll(request)).rejects.toMatchObject({ status: 410 });
    expect(consumer).not.toHaveBeenCalled();
  });

  it('does not subscribe or run when stop races an in-flight connection', async () => {
    const { manager, request, consumers, consumer } = setup();
    let finishConnect!: () => void;
    consumer.mockImplementationOnce(config => {
      const fake = makeConsumer(config);
      fake.connect.mockImplementationOnce(() => new Promise<void>(resolve => { finishConnect = resolve; }));
      consumers.push(fake);
      return fake as unknown as Consumer;
    });
    const pending = manager.poll(request);
    const rejected = expect(pending).rejects.toMatchObject({ status: 410 });
    const stopping = manager.stop(request.sessionId);
    finishConnect();
    await Promise.all([rejected, stopping]);
    expect(consumers[0].subscribe).not.toHaveBeenCalled();
    expect(consumers[0].run).not.toHaveBeenCalled();
    expect(consumers[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('discards a callback that completes after stop', async () => {
    const { manager, request, consumers } = setup();
    await manager.poll(request);
    let finishHeartbeat!: () => void;
    const emission = consumers[0].emit(0, 'orders', 'late', () => new Promise<void>(resolve => { finishHeartbeat = resolve; }));
    await manager.stop(request.sessionId);
    finishHeartbeat();
    await emission;
    await expect(manager.poll(request)).rejects.toMatchObject({ status: 410 });
  });

  it('expires idle sessions and clears the cleanup timer', async () => {
    vi.useFakeTimers();
    const { manager, request, consumers } = setup({ idleTimeoutMs: 100, cleanupIntervalMs: 50 });
    await manager.poll(request);
    await vi.advanceTimersByTimeAsync(150);
    expect(consumers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns empty when the bounded poll window ends', async () => {
    vi.useFakeTimers();
    const { manager, request } = setup();
    await manager.poll(request);
    const pending = manager.poll({ ...request, timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    expect((await pending).messages).toEqual([]);
  });

  it('propagates crashes and forbids new sessions after disconnect', async () => {
    const { manager, request, consumers } = setup();
    await manager.poll(request);
    consumers[0].crash();
    await expect(manager.poll(request)).rejects.toMatchObject({ status: 502 });
    await manager.disconnect();
    await expect(manager.poll({ ...request, sessionId: randomUUID() })).rejects.toMatchObject({ status: 410 });
  });

  it('cleans up failed startup instead of leaving a hidden background consumer', async () => {
    const { manager, request, consumer, consumers } = setup();
    consumer.mockImplementationOnce(config => {
      const fake = makeConsumer(config);
      fake.run.mockRejectedValueOnce(new Error('broker failure'));
      consumers.push(fake);
      return fake as unknown as Consumer;
    });
    await expect(manager.poll(request)).rejects.toMatchObject({ status: 502 });
    expect(consumers[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('times out startup and disconnects a connection that completes late', async () => {
    vi.useFakeTimers();
    const { manager, request, consumer, consumers } = setup({ startupTimeoutMs: 100 });
    let finishConnect!: () => void;
    consumer.mockImplementationOnce(config => {
      const fake = makeConsumer(config);
      fake.connect.mockImplementationOnce(() => new Promise<void>(resolve => { finishConnect = resolve; }));
      consumers.push(fake);
      return fake as unknown as Consumer;
    });
    const pending = manager.poll(request);
    const rejected = expect(pending).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    finishConnect();
    await vi.advanceTimersByTimeAsync(0);
    expect(consumers[0].subscribe).not.toHaveBeenCalled();
    expect(consumers[0].disconnect).toHaveBeenCalledTimes(2);
  });

  it('retries failed teardown rather than forgetting a connected session', async () => {
    const { manager, request, consumers } = setup();
    await manager.poll(request);
    consumers[0].disconnect.mockRejectedValueOnce(new Error('temporary disconnect failure'));
    await expect(manager.stop(request.sessionId)).rejects.toThrow('temporary disconnect failure');
    await manager.stop(request.sessionId);
    expect(consumers[0].disconnect).toHaveBeenCalledTimes(2);
  });
});
