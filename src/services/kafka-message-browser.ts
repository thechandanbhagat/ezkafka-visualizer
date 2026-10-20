import { randomUUID } from 'node:crypto';
import { AssignerProtocol } from 'kafkajs';
import type { Consumer, EachBatchPayload, Kafka, KafkaMessage, PartitionAssigner } from 'kafkajs';
import type { BrowseMessagesRequest, BrowseMessagesResponse, ExplorerEncoding, ExplorerMessage } from '@/models/message-explorer';

// @group Types : Bounded operations use isolated clients and never join an application group
export class MessageBrowserError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'MessageBrowserError';
  }
}

interface BrowserLimits {
  maxActiveRequests: number;
  timeoutMs: number;
  cleanupTimeoutMs: number;
  cleanupRetryMs: number;
  maxResponseBytes: number;
}

interface ActiveBrowse {
  controller: AbortController;
  done: Promise<void>;
  cleanup?: Promise<void>;
}

// @group Constants : Offset arithmetic is exact across Kafka's signed 64-bit range
const MAX_OFFSET = BigInt('9223372036854775807');
const DEFAULT_LIMITS: BrowserLimits = {
  maxActiveRequests: 8,
  timeoutMs: 15_000,
  cleanupTimeoutMs: 2000,
  cleanupRetryMs: 1000,
  maxResponseBytes: 4 * 1024 * 1024,
};
const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

// @group Validation : Validate requests and bind continuations to the selected resource
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function offset(value: unknown, label: string, status = 400): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value) || BigInt(value) > MAX_OFFSET) {
    throw new MessageBrowserError(`${label} must be a non-negative decimal offset within Kafka's signed 64-bit range`, status);
  }
  return BigInt(value);
}

export function validateBrowseMessagesRequest(value: unknown): asserts value is BrowseMessagesRequest {
  if (!object(value)) throw new MessageBrowserError('Request body must be a JSON object', 400);
  if (typeof value.profileId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.profileId)) {
    throw new MessageBrowserError('An explicit valid profileId is required', 400);
  }
  if (typeof value.topic !== 'string' || !/^[A-Za-z0-9._-]{1,249}$/.test(value.topic) || ['.', '..'].includes(value.topic)) {
    throw new MessageBrowserError('A valid topic is required', 400);
  }
  if (typeof value.partition !== 'number' || !Number.isSafeInteger(value.partition) || value.partition < 0 || value.partition > 2147483647) {
    throw new MessageBrowserError('Partition must be a non-negative integer', 400);
  }
  if (value.limit !== undefined && (typeof value.limit !== 'number' || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 200)) {
    throw new MessageBrowserError('Limit must be an integer from 1 to 200', 400);
  }
  if (value.start !== undefined && value.cursor !== undefined) throw new MessageBrowserError('Choose a starting position or a continuation cursor, not both', 400);
  if (value.start !== undefined) {
    const start = value.start;
    if (!object(start) || typeof start.kind !== 'string' || !['earliest', 'latest', 'offset', 'timestamp'].includes(start.kind)) {
      throw new MessageBrowserError('Choose earliest, latest, offset, or timestamp as the starting position', 400);
    }
    if (start.kind === 'offset') offset(start.offset, 'Starting offset');
    if (start.kind === 'timestamp' && (typeof start.timestamp !== 'string' || start.timestamp.length > 40 ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(start.timestamp) ||
        !validTimestamp(start.timestamp))) {
      throw new MessageBrowserError('Timestamp must be an ISO date with a timezone at or after 1970-01-01', 400);
    }
  }
  if (value.cursor !== undefined) {
    const cursor = value.cursor;
    if (!object(cursor) || typeof cursor.connectionId !== 'string' || cursor.connectionId.length > 100 || !cursor.connectionId) {
      throw new MessageBrowserError('Invalid continuation cursor', 400);
    }
    if (cursor.profileId !== value.profileId || cursor.topic !== value.topic || cursor.partition !== value.partition) {
      throw new MessageBrowserError('Continuation belongs to another cluster, topic, or partition. Start a new browse.', 409);
    }
    if (offset(cursor.nextOffset, 'Cursor offset') > offset(cursor.endOffset, 'Cursor end offset')) {
      throw new MessageBrowserError('Continuation offset exceeds its snapshot end', 400);
    }
  }
}

function validTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed < 0) return false;
  const date = value.slice(0, 10);
  // Date.parse normalizes February 31; validate the calendar date separately.
  const calendarDate = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === date &&
    Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60;
}

// @group Utilities > Encoding : Preserve tombstones, repeated headers, and binary payloads losslessly
function decode(value: Buffer | string): { text: string; encoding: ExplorerEncoding } {
  if (typeof value === 'string') return { text: value, encoding: 'utf8' };
  if (!Buffer.isBuffer(value)) throw new MessageBrowserError('A record contains a header that cannot be decoded safely', 422);
  try { return { text: utf8Decoder.decode(value), encoding: 'utf8' }; } catch {
    return { text: value.toString('base64'), encoding: 'base64' };
  }
}

export function toExplorerMessage(topic: string, partition: number, message: KafkaMessage): ExplorerMessage {
  if (message.headers && ![Object.prototype, null].includes(Object.getPrototypeOf(message.headers))) {
    throw new MessageBrowserError('A record contains a header that cannot be decoded safely', 422);
  }
  const key = message.key === null ? null : decode(message.key);
  const value = message.value === null ? null : decode(message.value);
  const headerEntries = Object.entries(message.headers ?? {}).map(([name, header]) => {
    const values = Array.isArray(header) ? header : [header];
    const decoded = values.map(value => value === null || value === undefined ? null : decode(value));
    return { name, text: Array.isArray(header) ? decoded.map(value => value?.text ?? null) : decoded[0]?.text ?? null,
      encoding: Array.isArray(header) ? decoded.map(value => value?.encoding ?? null) : decoded[0]?.encoding ?? null };
  });
  const timestamp = /^\d+$/.test(message.timestamp) ? Number(message.timestamp) : Number.NaN;
  return {
    topic, partition, offset: message.offset,
    timestamp: Number.isSafeInteger(timestamp) && timestamp <= 8.64e15 ? new Date(timestamp).toISOString() : null,
    key: key?.text ?? null, value: value?.text ?? null,
    headers: Object.fromEntries(headerEntries.map(header => [header.name, header.text])),
    encoding: { key: key?.encoding ?? 'utf8', value: value?.encoding ?? 'utf8', headers: Object.fromEntries(headerEntries.map(header => [header.name, header.encoding])) },
  };
}

// @group Configuration > Assignment : A fresh, private group only fetches the requested partition
function singlePartitionAssigner(topic: string, partition: number): PartitionAssigner {
  return () => ({
    name: 'EzKafkaMessageBrowser', version: 0,
    async assign({ members }) {
      if (members.length !== 1) throw new MessageBrowserError('Unexpected member in the isolated browse group', 409);
      return [{ memberId: members[0].memberId,
        memberAssignment: AssignerProtocol.MemberAssignment.encode({ version: 0, assignment: { [topic]: [partition] }, userData: Buffer.alloc(0) }) }];
    },
    protocol() {
      return { name: 'EzKafkaMessageBrowser', metadata: AssignerProtocol.MemberMetadata.encode({ version: 0, topics: [topic], userData: Buffer.alloc(0) }) };
    },
  });
}

// @group BusinessLogic > Lifecycle : Global admission bounds concurrent requests across all profiles
export class KafkaMessageBrowser {
  private static activeCount = 0;
  private readonly active = new Set<ActiveBrowse>();
  private readonly limits: BrowserLimits;
  private readonly connectionId = randomUUID();
  private closed = false;

  constructor(private readonly kafka: Pick<Kafka, 'consumer' | 'admin'>, limits: Partial<BrowserLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  async browse(request: BrowseMessagesRequest, signal?: AbortSignal): Promise<BrowseMessagesResponse> {
    validateBrowseMessagesRequest(request);
    if (this.closed) throw new MessageBrowserError('Kafka profile changed. Start a new browse.', 409);
    if (signal?.aborted) throw new MessageBrowserError('Browse request was cancelled', 499);
    if (request.cursor && request.cursor.connectionId !== this.connectionId) {
      throw new MessageBrowserError('The cluster connection changed. Start a new browse.', 409);
    }
    if (KafkaMessageBrowser.activeCount >= this.limits.maxActiveRequests) {
      throw new MessageBrowserError('Too many message browse requests. Try again after another browse finishes.', 429);
    }
    const controller = new AbortController();
    const cancel = () => controller.abort(new MessageBrowserError('Browse request was cancelled', 499));
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    KafkaMessageBrowser.activeCount += 1;
    let finish!: () => void;
    const active: ActiveBrowse = { controller, done: new Promise<void>(resolve => { finish = resolve; }) };
    this.active.add(active);
    try {
      return await this.read(request, active);
    } finally {
      signal?.removeEventListener('abort', cancel);
      // A timed-out or failed disconnect keeps its admission slot until teardown really succeeds.
      void (active.cleanup ?? Promise.resolve()).then(() => {
        this.active.delete(active);
        KafkaMessageBrowser.activeCount -= 1;
      });
      finish();
    }
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    const requests = [...this.active];
    for (const active of requests) active.controller.abort(new MessageBrowserError('Kafka profile changed. Start a new browse.', 409));
    await Promise.all(requests.map(active => active.done));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(requests.map(active => active.cleanup)),
        new Promise<never>((resolve, reject) => { timer = setTimeout(() => reject(new MessageBrowserError('Kafka message browse connections are still closing. Retry after checking the cluster.', 502)), this.limits.cleanupTimeoutMs); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  // @group BusinessLogic > Snapshot : A cursor never extends the initial exclusive high offset
  private async read(request: BrowseMessagesRequest, active: ActiveBrowse): Promise<BrowseMessagesResponse> {
    const { controller } = active;
    const admin = this.kafka.admin();
    let consumer: Consumer | undefined;
    let closing = false;
    let ready = false;
    let timedOut = false;
    let low = BigInt(0);
    let end = BigInt(0);
    let next = BigInt(0);
    const messages: ExplorerMessage[] = [];
    const warnings: string[] = [];
    const limit = request.limit ?? 50;
    let bytes = 0;
    let finished = false;
    let finishReading!: () => void;
    const readComplete = new Promise<void>(resolve => { finishReading = () => { finished = true; resolve(); }; });
    const deadline = setTimeout(() => controller.abort(new MessageBrowserError('Message browsing timed out', 504)), this.limits.timeoutMs);
    let onAbort!: () => void;
    const aborted = new Promise<never>((resolve, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    });
    // Observe cancellation even before the first broker operation is awaited.
    void aborted.catch(() => undefined);
    const pendingStages = new Set<Promise<unknown>>();
    const stage = async <T>(operation: Promise<T>): Promise<T> => {
      pendingStages.add(operation);
      void operation.then(() => pendingStages.delete(operation), () => pendingStages.delete(operation));
      const result = await Promise.race([operation, aborted]);
      if (controller.signal.aborted) throw controller.signal.reason;
      return result;
    };
    const fail = (error: unknown) => controller.abort(error instanceof MessageBrowserError ? error : new MessageBrowserError('Kafka could not read this partition', 502));

    const readBatch = async ({ batch, resolveOffset, isRunning, isStale, heartbeat }: EachBatchPayload) => {
      if (!ready || finished || controller.signal.aborted || !isRunning() || isStale() || batch.topic !== request.topic || batch.partition !== request.partition) return;
      try {
        for (const message of batch.messages) {
          if (finished || controller.signal.aborted || !isRunning() || isStale()) return;
          const current = offset(message.offset, 'Kafka message offset', 502);
          if (current < next) continue;
          if (current >= end) { next = end; finishReading(); return; }
          const record = toExplorerMessage(batch.topic, batch.partition, message);
          const recordBytes = Buffer.byteLength(JSON.stringify(record));
          if (recordBytes > this.limits.maxResponseBytes) {
            throw new MessageBrowserError('A record exceeds the 4 MiB browse response limit. No part of that record was returned.', 413);
          }
          if (bytes + recordBytes > this.limits.maxResponseBytes) {
            warnings.push('This page reached the response size limit. Continue to read the remaining records.');
            finishReading();
            return;
          }
          messages.push(record);
          bytes += recordBytes;
          next = current + BigInt(1);
          resolveOffset(message.offset);
          if (messages.length >= limit || next >= end) { finishReading(); return; }
        }
        // Kafka can filter control records/aborted transactions at the end of a batch.
        const last = offset(batch.lastOffset(), 'Kafka batch offset', 502) + BigInt(1);
        if (last > next) next = last < end ? last : end;
        if (next >= end) finishReading();
        await heartbeat();
      } catch (error) { fail(error); }
    };

    try {
      await stage(admin.connect());
      const partitions = await stage(admin.fetchTopicOffsets(request.topic));
      const partition = partitions.find(value => value.partition === request.partition);
      if (!partition) throw new MessageBrowserError('The selected partition was not found', 404);
      low = offset(partition.low, 'Kafka low offset', 502);
      const high = offset(partition.high, 'Kafka high offset', 502);
      if (low > high) throw new MessageBrowserError('Kafka returned an invalid partition offset range', 502);
      end = request.cursor ? offset(request.cursor.endOffset, 'Cursor end offset') : high;
      if (end > high) throw new MessageBrowserError('The partition was truncated after this snapshot. Start a new browse.', 409);
      if (request.cursor) {
        next = offset(request.cursor.nextOffset, 'Cursor offset');
        if (next < low) throw new MessageBrowserError('The continuation expired because records were removed by retention or purge. Start a new browse.', 416);
      } else {
        const start = request.start ?? { kind: 'latest' };
        if (start.kind === 'offset') {
          next = offset(start.offset, 'Starting offset');
          if (next < low || next > high) throw new MessageBrowserError(`Starting offset is outside the retained range ${low}–${high} (end exclusive).`, 416);
        } else if (start.kind === 'timestamp') {
          const matches = await stage(admin.fetchTopicOffsetsByTimestamp(request.topic, Date.parse(start.timestamp)));
          const match = matches.find(value => value.partition === request.partition);
          if (!match) throw new MessageBrowserError('Kafka did not return the timestamp position for this partition', 502);
          const found = match.offset === '-1' ? high : offset(match.offset, 'Kafka timestamp offset', 502);
          next = found < low ? low : found > high ? high : found;
        } else if (start.kind === 'earliest') next = low;
        else {
          next = high - BigInt(limit) > low ? high - BigInt(limit) : low;
          warnings.push('Latest starts within the last requested number of offset positions. Compaction, transactions, or retention can leave fewer records.');
        }
      }
      if (next >= end) return { messages, nextCursor: null, lowOffset: low.toString(), highOffset: end.toString(), complete: true, timedOut: false, warnings };
      consumer = this.kafka.consumer({
        groupId: `ezkafka-browse-${randomUUID()}`, allowAutoTopicCreation: false,
        partitionAssigners: [singlePartitionAssigner(request.topic, request.partition)],
        retry: { retries: 0, restartOnFailure: async () => false },
        maxBytes: this.limits.maxResponseBytes, maxBytesPerPartition: this.limits.maxResponseBytes,
        minBytes: 1, maxWaitTimeInMs: 250, readUncommitted: false,
      });
      consumer.on(consumer.events.CRASH, () => fail(new MessageBrowserError('Kafka could not read this partition. Retry the browse.', 502)));
      // KafkaJS emits GROUP_JOIN synchronously after assignment and before starting its fetch loop.
      // Seek here so every subsequent batch event belongs to this requested position, including rebalances.
      consumer.on(consumer.events.GROUP_JOIN, () => {
        if (closing || finished || controller.signal.aborted) return;
        try {
          consumer!.seek({ topic: request.topic, partition: request.partition, offset: next.toString() });
          ready = true;
        } catch (error) { fail(error); }
      });
      consumer.on(consumer.events.END_BATCH_PROCESS, event => {
        const batch = event.payload;
        if (!ready || finished || controller.signal.aborted || batch.batchSize !== 0 || batch.topic !== request.topic || batch.partition !== request.partition) return;
        // Filtered-only batches bypass eachBatch, but KafkaJS emits this after resolving their offsets.
        try {
          const after = offset(batch.lastOffset, 'Kafka filtered batch offset', 502) + BigInt(1);
          if (after > next) next = after < end ? after : end;
          if (next >= end) finishReading();
        } catch (error) { fail(error); }
      });
      await stage(consumer.connect());
      await stage(consumer.subscribe({ topics: [request.topic], fromBeginning: true }));
      await stage(consumer.run({ autoCommit: false, eachBatchAutoResolve: false, partitionsConsumedConcurrently: 1, eachBatch: readBatch }));
      await Promise.race([readComplete, aborted]);
    } catch (error) {
      if (error instanceof MessageBrowserError && error.status === 504 && ready) {
        timedOut = true;
        warnings.push('The read deadline was reached. Continue from the returned cursor; no completion is assumed for unobserved offsets.');
      } else throw error;
    } finally {
      finished = true;
      closing = true;
      clearTimeout(deadline);
      controller.signal.removeEventListener('abort', onAbort);
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      active.cleanup = (async () => {
        for (;;) {
          const pending = [...pendingStages];
          const results = await Promise.allSettled([
            Promise.resolve().then(() => admin.disconnect()),
            Promise.resolve().then(() => consumer?.disconnect()),
          ]);
          if (results.every(result => result.status === 'fulfilled') && pending.length === 0) return;
          // Connections that finish or fail after cancellation may still own sockets: close them again.
          await Promise.allSettled(pending);
          if (results.some(result => result.status === 'rejected')) {
            await new Promise<void>(resolve => {
              const retry = setTimeout(resolve, this.limits.cleanupRetryMs);
              retry.unref?.();
            });
          }
        }
      })();
      try {
        await Promise.race([active.cleanup, new Promise<void>(resolve => {
          cleanupTimer = setTimeout(() => {
            warnings.push('Kafka connection cleanup is pending. Browse capacity stays reserved until the connection closes.');
            resolve();
          }, this.limits.cleanupTimeoutMs);
        })]);
      } finally { if (cleanupTimer) clearTimeout(cleanupTimer); }
    }
    const complete = next >= end;
    return {
      messages, lowOffset: low.toString(), highOffset: end.toString(), complete, timedOut, warnings,
      nextCursor: complete ? null : { profileId: request.profileId, topic: request.topic, partition: request.partition,
        connectionId: this.connectionId, nextOffset: next.toString(), endOffset: end.toString() },
    };
  }
}
