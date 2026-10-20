import { AssignerProtocol } from 'kafkajs';
import type { Consumer, ConsumerConfig, EachBatchPayload, Kafka, KafkaMessage } from 'kafkajs';
import { describe, expect, it, vi } from 'vitest';
import { KafkaMessageBrowser, MessageBrowserError, toExplorerMessage, validateBrowseMessagesRequest } from '@/services/kafka-message-browser';
import type { BrowseMessagesRequest } from '@/models/message-explorer';

// @group TestHelpers : Broker doubles retain decimal offsets and deliver only after an explicit seek
const request: BrowseMessagesRequest = { profileId: 'development', topic: 'orders', partition: 0, limit: 2, start: { kind: 'earliest' } };

function message(offset: string, overrides: Partial<KafkaMessage> = {}): KafkaMessage {
  return { offset, timestamp: '1700000000000', key: Buffer.from(`key-${offset}`), value: Buffer.from(`record-${offset}`), attributes: 0, headers: {}, ...overrides } as KafkaMessage;
}

function fixture(options: { low?: string; high?: string; records?: KafkaMessage[]; lastOffset?: string; limits?: ConstructorParameters<typeof KafkaMessageBrowser>[1] } = {}) {
  let eachBatch: ((payload: EachBatchPayload) => Promise<void>) | undefined;
  const listeners = new Map<string, (event?: { payload: Record<string, unknown> }) => void>();
  const records = options.records ?? ['0', '1', '2', '3', '4'].map(value => message(value));
  const resolved = vi.fn();
  const heartbeat = vi.fn().mockResolvedValue(undefined);
  const consumer = {
    events: { CRASH: 'crash', GROUP_JOIN: 'join', END_BATCH_PROCESS: 'end-batch' },
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, handler: (event?: { payload: Record<string, unknown> }) => void) => { listeners.set(event, handler); return () => listeners.delete(event); }),
    run: vi.fn(async (config: { eachBatch: typeof eachBatch }) => { eachBatch = config.eachBatch; listeners.get('join')?.(); }),
    seek: vi.fn(() => {
      queueMicrotask(() => {
        if (!records.length) return;
        void eachBatch?.({
          batch: { topic: 'orders', partition: 0, messages: records, lastOffset: () => options.lastOffset ?? records.at(-1)?.offset ?? '0' },
          resolveOffset: resolved, heartbeat, isRunning: () => true, isStale: () => false,
        } as unknown as EachBatchPayload);
      });
    }),
  };
  const admin = {
    connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined),
    fetchTopicOffsets: vi.fn().mockResolvedValue([{ partition: 0, low: options.low ?? '0', high: options.high ?? '5' }]),
    fetchTopicOffsetsByTimestamp: vi.fn().mockResolvedValue([{ partition: 0, offset: '3' }]),
  };
  const kafka = { admin: vi.fn(() => admin), consumer: vi.fn((config: ConsumerConfig) => { void config; return consumer as unknown as Consumer; }) };
  const browser = new KafkaMessageBrowser(kafka as unknown as Kafka, { timeoutMs: 200, cleanupTimeoutMs: 30, ...options.limits });
  return { browser, kafka, admin, consumer, resolved, heartbeat, listeners };
}

// @group UnitTests > Validation : Fail before allocating clients for malformed or cross-resource requests
describe('message browse validation', () => {
  it.each([
    null, [], {}, { ...request, profileId: undefined }, { ...request, profileId: '../cluster' },
    { ...request, topic: '..' }, { ...request, partition: -1 }, { ...request, partition: 1.1 },
    { ...request, limit: 0 }, { ...request, limit: 201 }, { ...request, limit: '50' },
    { ...request, start: { kind: 'offset', offset: '01' } }, { ...request, start: { kind: 'offset', offset: '-1' } },
    { ...request, start: { kind: 'offset', offset: 10 } }, { ...request, start: { kind: 'offset', offset: '9223372036854775808' } },
    { ...request, start: { kind: 'timestamp', timestamp: '2026-01-01' } },
    { ...request, start: { kind: 'timestamp', timestamp: '1960-01-01T00:00:00Z' } },
    { ...request, start: { kind: 'timestamp', timestamp: 'not-a-date' } },
    { ...request, start: { kind: 'unsupported' } },
    { ...request, start: { kind: ['earliest'] } },
    { ...request, start: { kind: 'timestamp', timestamp: '2026-02-31T00:00:00Z' } },
  ])('rejects invalid input %j', input => {
    expect(() => validateBrowseMessagesRequest(input)).toThrow(MessageBrowserError);
  });

  it('accepts the maximum signed offset and an explicit timezone', () => {
    expect(() => validateBrowseMessagesRequest({ ...request, start: { kind: 'offset', offset: '9223372036854775807' } })).not.toThrow();
    expect(() => validateBrowseMessagesRequest({ ...request, start: { kind: 'timestamp', timestamp: '2026-01-01T10:30:00+02:00' } })).not.toThrow();
  });

  it('rejects cursor and start together and a cursor from another resource', () => {
    const cursor = { profileId: 'development', topic: 'orders', partition: 0, connectionId: 'connection', nextOffset: '1', endOffset: '5' };
    expect(() => validateBrowseMessagesRequest({ ...request, cursor })).toThrow('not both');
    expect(() => validateBrowseMessagesRequest({ ...request, start: undefined, cursor: { ...cursor, topic: 'other' } })).toThrow('another cluster');
    expect(() => validateBrowseMessagesRequest({ ...request, start: undefined, cursor: { ...cursor, nextOffset: '9' } })).toThrow('exceeds');
  });
});

// @group UnitTests > Pagination : Pagination is ordered, snapshot bounded, exact, and gap aware
describe('partition snapshot browsing', () => {
  it('returns ordered pages with no overlap and keeps the initial end despite later writes', async () => {
    const { browser, admin, consumer } = fixture();
    const first = await browser.browse(request);
    expect(first.messages.map(record => record.offset)).toEqual(['0', '1']);
    expect(first).toMatchObject({ lowOffset: '0', highOffset: '5', complete: false, timedOut: false, nextCursor: { nextOffset: '2', endOffset: '5' } });
    admin.fetchTopicOffsets.mockResolvedValue([{ partition: 0, low: '0', high: '100' }]);
    const second = await browser.browse({ ...request, start: undefined, limit: 200, cursor: first.nextCursor! });
    expect(second.messages.map(record => record.offset)).toEqual(['2', '3', '4']);
    expect(second).toMatchObject({ highOffset: '5', complete: true, nextCursor: null });
    expect(consumer.disconnect).toHaveBeenCalledTimes(2);
    expect(admin.disconnect).toHaveBeenCalledTimes(2);
  });

  it('defaults latest to the final offset span and never includes writes after the snapshot', async () => {
    const { browser, consumer } = fixture({ high: '5', records: ['3', '4', '5', '6'].map(value => message(value)) });
    const result = await browser.browse({ ...request, start: undefined });
    expect(consumer.seek).toHaveBeenCalledWith({ topic: 'orders', partition: 0, offset: '3' });
    expect(result.messages.map(record => record.offset)).toEqual(['3', '4']);
    expect(result.warnings[0]).toContain('offset positions');
    expect(result.complete).toBe(true);
  });

  it('preserves offsets above JavaScript safe integers and advances across compaction gaps', async () => {
    const { browser } = fixture({ low: '9007199254740993', high: '9007199254741000', records: ['9007199254740993', '9007199254740998', '9007199254740999'].map(value => message(value)) });
    const first = await browser.browse(request);
    expect(first.nextCursor?.nextOffset).toBe('9007199254740999');
    const second = await browser.browse({ ...request, start: undefined, cursor: first.nextCursor! });
    expect(second.messages[0].offset).toBe('9007199254740999');
    expect(second.complete).toBe(true);
  });

  it('uses real timestamp lookup and returns empty when the timestamp falls beyond the snapshot', async () => {
    const { browser, admin, consumer } = fixture();
    const result = await browser.browse({ ...request, start: { kind: 'timestamp', timestamp: '2026-01-01T00:00:00Z' } });
    expect(admin.fetchTopicOffsetsByTimestamp).toHaveBeenCalledWith('orders', Date.parse('2026-01-01T00:00:00Z'));
    expect(result.messages.map(record => record.offset)).toEqual(['3', '4']);
    admin.fetchTopicOffsetsByTimestamp.mockResolvedValue([{ partition: 0, offset: '-1' }]);
    const empty = await browser.browse({ ...request, start: { kind: 'timestamp', timestamp: '2026-01-01T00:00:00Z' } });
    expect(empty).toMatchObject({ messages: [], complete: true, nextCursor: null });
    expect(consumer.run).toHaveBeenCalledTimes(1);
  });

  it('handles an empty partition without allocating a consumer', async () => {
    const { browser, kafka, admin } = fixture({ low: '7', high: '7' });
    expect(await browser.browse(request)).toMatchObject({ messages: [], lowOffset: '7', highOffset: '7', complete: true });
    expect(kafka.consumer).not.toHaveBeenCalled();
    expect(admin.disconnect).toHaveBeenCalledOnce();
  });

  it.each(['4', '11'])('rejects starting offset %s outside the retained range', async value => {
    const { browser } = fixture({ low: '5', high: '10' });
    await expect(browser.browse({ ...request, start: { kind: 'offset', offset: value } })).rejects.toMatchObject({ status: 416 });
  });

  it('expires continuations after retention and rejects changed connections or log truncation', async () => {
    const { browser, admin } = fixture();
    const first = await browser.browse(request);
    const continuation = { ...request, start: undefined, cursor: first.nextCursor! };
    admin.fetchTopicOffsets.mockResolvedValueOnce([{ partition: 0, low: '3', high: '5' }]);
    await expect(browser.browse(continuation)).rejects.toMatchObject({ status: 416 });
    admin.fetchTopicOffsets.mockResolvedValueOnce([{ partition: 0, low: '0', high: '4' }]);
    await expect(browser.browse(continuation)).rejects.toMatchObject({ status: 409 });
    await expect(fixture().browser.browse(continuation)).rejects.toMatchObject({ status: 409 });
  });

  it('advances through filtered control-record tails after all visible records are included', async () => {
    const { browser } = fixture({ high: '7', records: [message('2'), message('3')], lastOffset: '6' });
    expect(await browser.browse({ ...request, limit: 10 })).toMatchObject({ complete: true, messages: [{ offset: '2' }, { offset: '3' }] });
  });

  it('reports an inconclusive read deadline with a retry cursor rather than claiming completion', async () => {
    const { browser, consumer } = fixture({ records: [], limits: { timeoutMs: 15 } });
    const result = await browser.browse(request);
    expect(result).toMatchObject({ messages: [], timedOut: true, complete: false, nextCursor: { nextOffset: '0', endOffset: '5' } });
    expect(consumer.disconnect).toHaveBeenCalledOnce();
  });

  it('advances filtered-only batches without treating a fetch watermark as observed data', async () => {
    const { browser, consumer, listeners } = fixture({ records: [] });
    const pending = browser.browse(request);
    await vi.waitFor(() => expect(consumer.seek).toHaveBeenCalled());
    listeners.get('end-batch')!({ payload: { topic: 'other', partition: 0, batchSize: 0, lastOffset: '100' } });
    listeners.get('end-batch')!({ payload: { topic: 'orders', partition: 1, batchSize: 0, lastOffset: '100' } });
    listeners.get('end-batch')!({ payload: { topic: 'orders', partition: 0, batchSize: 2, lastOffset: '100' } });
    listeners.get('end-batch')!({ payload: { topic: 'orders', partition: 0, batchSize: 0, lastOffset: '4' } });
    expect(await pending).toMatchObject({ messages: [], complete: true, timedOut: false, nextCursor: null });
  });
});

// @group UnitTests > Isolation : No caller group, offset commit, or unrelated partition is involved
describe('isolated consumer configuration', () => {
  it('uses fresh groups, disables commits/restarts/auto creation, and assigns only one partition', async () => {
    const { browser, kafka, consumer } = fixture();
    await browser.browse(request);
    await browser.browse(request);
    const config = kafka.consumer.mock.calls[0][0];
    expect(config).toMatchObject({ groupId: expect.stringMatching(/^ezkafka-browse-/), allowAutoTopicCreation: false, readUncommitted: false, retry: { retries: 0 } });
    expect(config.groupId).not.toBe(kafka.consumer.mock.calls[1][0].groupId);
    expect(consumer.run).toHaveBeenCalledWith(expect.objectContaining({ autoCommit: false, eachBatchAutoResolve: false }));
    const assigner = config.partitionAssigners![0]({} as Parameters<NonNullable<ConsumerConfig['partitionAssigners']>[number]>[0]);
    const assignments = await assigner.assign({ members: [{ memberId: 'private-member', memberMetadata: Buffer.alloc(0) }], topics: ['orders'] });
    expect(AssignerProtocol.MemberAssignment.decode(assignments[0].memberAssignment)?.assignment).toEqual({ orders: [0] });
    expect(AssignerProtocol.MemberMetadata.decode(assigner.protocol({ topics: ['orders'] }).metadata)?.topics).toEqual(['orders']);
    await expect(assigner.assign({ members: [], topics: ['orders'] })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a missing partition and releases the admin', async () => {
    const { browser, admin, kafka } = fixture();
    await expect(browser.browse({ ...request, partition: 5 })).rejects.toMatchObject({ status: 404 });
    expect(admin.disconnect).toHaveBeenCalledOnce();
    expect(kafka.consumer).not.toHaveBeenCalled();
  });
});

// @group EdgeCases > Payloads : Null values and binary content remain distinguishable and complete
describe('record representation and byte bounds', () => {
  it('preserves tombstones, empty strings, invalid timestamps, binary values, and repeated headers', () => {
    expect(toExplorerMessage('orders', 0, message('1', { key: null, value: null, timestamp: '-1' }))).toMatchObject({ key: null, value: null, timestamp: null });
    expect(toExplorerMessage('orders', 0, message('1', { value: Buffer.alloc(0) })).value).toBe('');
    const record = toExplorerMessage('orders', 0, message('1', { key: Buffer.from([255]), value: Buffer.from([254]), headers: { repeated: [Buffer.from('one'), Buffer.from([255])] } }));
    expect(record).toMatchObject({ key: '/w==', value: '/g==', headers: { repeated: ['one', '/w=='] }, encoding: { key: 'base64', value: 'base64', headers: { repeated: ['utf8', 'base64'] } } });
  });

  it('preserves UTF-8 byte order marks and null headers independently from empty text', () => {
    const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x61]);
    const record = toExplorerMessage('orders', 0, message('1', {
      value: bytes, headers: { nullable: null, repeated: [null, Buffer.alloc(0)] } as unknown as KafkaMessage['headers'],
    }));
    expect(Buffer.from(record.value!, 'utf8')).toEqual(bytes);
    expect(record.headers).toEqual({ nullable: null, repeated: [null, ''] });
    expect(record.encoding.headers).toEqual({ nullable: null, repeated: [null, 'utf8'] });
  });

  it('rejects malformed prototype-colliding headers rather than exporting phantom data', () => {
    const headers = { constructor: [Object, Buffer.from('valid')] } as unknown as KafkaMessage['headers'];
    expect(() => toExplorerMessage('orders', 0, message('1', { headers }))).toThrow('cannot be decoded safely');
    const mutated = Object.create([Buffer.from('valid')]);
    expect(() => toExplorerMessage('orders', 0, message('1', { headers: mutated }))).toThrow('cannot be decoded safely');
  });

  it('rejects an oversized single record explicitly and releases its consumer', async () => {
    const { browser, consumer } = fixture({ records: [message('0', { value: Buffer.alloc(1000) })], limits: { maxResponseBytes: 100 } });
    await expect(browser.browse(request)).rejects.toMatchObject({ status: 413 });
    expect(consumer.disconnect).toHaveBeenCalledOnce();
  });

  it('stops before the page byte limit without dropping the next record', async () => {
    const records = [message('0'), message('1')];
    const oneSize = Buffer.byteLength(JSON.stringify(toExplorerMessage('orders', 0, records[0])));
    const { browser } = fixture({ records, high: '2', limits: { maxResponseBytes: oneSize + 10 } });
    const first = await browser.browse(request);
    expect(first.messages.map(record => record.offset)).toEqual(['0']);
    expect(first.nextCursor?.nextOffset).toBe('1');
    expect(first.warnings).toEqual([expect.stringContaining('size limit')]);
    const second = await browser.browse({ ...request, start: undefined, cursor: first.nextCursor! });
    expect(second.messages.map(record => record.offset)).toEqual(['1']);
  });
});

// @group EdgeCases > Cleanup : Abort, timeout, retirement, failures, and admission control release resources
describe('browse lifecycle', () => {
  it('does not allocate a client for an already cancelled request', async () => {
    const { browser, kafka } = fixture();
    await expect(browser.browse(request, AbortSignal.abort())).rejects.toMatchObject({ status: 499 });
    expect(kafka.admin).not.toHaveBeenCalled();
  });

  it('disconnects again if connect finishes after cancellation and never subscribes', async () => {
    const { browser, consumer } = fixture();
    let connect!: () => void;
    consumer.connect.mockImplementationOnce(() => new Promise<void>(resolve => { connect = resolve; }));
    const controller = new AbortController();
    const pending = browser.browse(request, controller.signal);
    await vi.waitFor(() => expect(consumer.connect).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 499 });
    connect();
    await vi.waitFor(() => expect(consumer.disconnect).toHaveBeenCalledTimes(2));
    expect(consumer.subscribe).not.toHaveBeenCalled();
  });

  it('times out startup and disconnects any transport that connects late', async () => {
    const { browser, admin } = fixture({ limits: { timeoutMs: 15 } });
    let connect!: () => void;
    admin.connect.mockImplementationOnce(() => new Promise<void>(resolve => { connect = resolve; }));
    await expect(browser.browse(request)).rejects.toMatchObject({ status: 504 });
    connect();
    await vi.waitFor(() => expect(admin.disconnect).toHaveBeenCalledTimes(2));
  });

  it('closes again when a cancelled connection settles while the first disconnect is pending', async () => {
    const { browser, consumer } = fixture({ limits: { cleanupTimeoutMs: 5 } });
    let connect!: () => void;
    let close!: () => void;
    consumer.connect.mockImplementationOnce(() => new Promise<void>(resolve => { connect = resolve; }));
    consumer.disconnect.mockImplementationOnce(() => new Promise<void>(resolve => { close = resolve; }));
    const controller = new AbortController();
    const pending = browser.browse(request, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ status: 499 });
    await vi.waitFor(() => expect(consumer.connect).toHaveBeenCalled());
    controller.abort();
    await vi.waitFor(() => expect(consumer.disconnect).toHaveBeenCalledOnce());
    connect();
    await Promise.resolve();
    close();
    await rejected;
    await vi.waitFor(() => expect(consumer.disconnect).toHaveBeenCalledTimes(2));
    expect(consumer.subscribe).not.toHaveBeenCalled();
  });

  it('retires an in-flight read and rejects further work', async () => {
    const { browser, consumer } = fixture({ records: [] });
    const pending = browser.browse(request);
    const rejected = expect(pending).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(consumer.seek).toHaveBeenCalled());
    await browser.disconnect();
    await rejected;
    await expect(browser.browse(request)).rejects.toMatchObject({ status: 409 });
    expect(consumer.disconnect).toHaveBeenCalledOnce();
  });

  it('enforces admission across profiles and frees capacity after cancellation', async () => {
    const { browser, consumer } = fixture({ records: [], limits: { maxActiveRequests: 1 } });
    const other = fixture({ limits: { maxActiveRequests: 1 } });
    const controller = new AbortController();
    const pending = browser.browse(request, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ status: 499 });
    await vi.waitFor(() => expect(consumer.seek).toHaveBeenCalled());
    await expect(other.browser.browse(request)).rejects.toMatchObject({ status: 429 });
    controller.abort();
    await rejected;
    expect((await other.browser.browse(request)).messages).toHaveLength(2);
  });

  it('turns asynchronous consumer crashes into a bounded error and releases clients', async () => {
    const { browser, consumer, listeners, admin } = fixture({ records: [] });
    const pending = browser.browse(request);
    const rejected = expect(pending).rejects.toMatchObject({ status: 502 });
    await vi.waitFor(() => expect(consumer.seek).toHaveBeenCalled());
    listeners.get('crash')!();
    await rejected;
    expect(consumer.disconnect).toHaveBeenCalledOnce();
    expect(admin.disconnect).toHaveBeenCalledOnce();
  });

  it('retains global capacity during failed cleanup and retries before accepting another request', async () => {
    const { browser, consumer } = fixture({ limits: { maxActiveRequests: 1, cleanupTimeoutMs: 5, cleanupRetryMs: 50 } });
    const other = fixture({ limits: { maxActiveRequests: 1 } });
    consumer.disconnect.mockRejectedValueOnce(new Error('temporary disconnect failure'));
    const result = await browser.browse(request);
    expect(result.warnings).toContainEqual(expect.stringContaining('cleanup is pending'));
    await expect(other.browser.browse(request)).rejects.toMatchObject({ status: 429 });
    await vi.waitFor(() => expect(consumer.disconnect).toHaveBeenCalledTimes(2));
    expect((await other.browser.browse(request)).messages).toHaveLength(2);
  });

  it('keeps pending connections tracked when cleanup hangs and bounds retirement', async () => {
    const { browser, consumer } = fixture({ limits: { maxActiveRequests: 1, cleanupTimeoutMs: 5 } });
    let close!: () => void;
    consumer.disconnect.mockImplementationOnce(() => new Promise<void>(resolve => { close = resolve; }));
    const result = await browser.browse(request);
    expect(result.warnings).toContainEqual(expect.stringContaining('cleanup is pending'));
    await expect(browser.disconnect()).rejects.toMatchObject({ status: 502 });
    await expect(fixture({ limits: { maxActiveRequests: 1 } }).browser.browse(request)).rejects.toMatchObject({ status: 429 });
    close();
    await vi.waitFor(async () => expect((await fixture({ limits: { maxActiveRequests: 1 } }).browser.browse(request)).complete).toBe(false));
  });
});
