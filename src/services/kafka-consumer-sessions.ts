import { randomUUID } from 'node:crypto';
import type { Consumer, EachMessagePayload, Kafka } from 'kafkajs';

// @group Types : Isolated inspection sessions and bounded polling contracts
export interface KafkaInspectionMessage {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
}

export interface PollConsumerSessionRequest {
  sessionId: string;
  topics: string[];
  fromBeginning?: boolean;
  maxMessages?: number;
  timeoutMs?: number;
}

export class ConsumerSessionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ConsumerSessionError';
  }
}

interface Session {
  consumer: Consumer;
  topics: string[];
  fromBeginning: boolean;
  buffer: Array<{ message: KafkaInspectionMessage; bytes: number }>;
  bufferedBytes: number;
  droppedMessages: number;
  lastAccess: number;
  stopped: boolean;
  error?: Error;
  ready: Promise<void>;
  stopPromise?: Promise<void>;
  listeners: Set<() => void>;
}

interface SessionLimits {
  maxSessions: number;
  maxBufferedMessages: number;
  maxBufferedBytes: number;
  idleTimeoutMs: number;
  cleanupIntervalMs: number;
  startupTimeoutMs: number;
}

// @group Constants : Limits prevent abandoned sessions and unbounded memory use
const DEFAULT_LIMITS: SessionLimits = {
  maxSessions: 20, maxBufferedMessages: 1000, maxBufferedBytes: 8 * 1024 * 1024,
  idleTimeoutMs: 60_000, cleanupIntervalMs: 5000, startupTimeoutMs: 15_000,
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// @group Validation : Validate the public contract before creating a Kafka consumer
export function validateConsumerSessionId(sessionId: unknown): asserts sessionId is string {
  if (typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) {
    throw new ConsumerSessionError('A valid inspection session ID is required', 400);
  }
}

export function validateConsumerPoll(request: PollConsumerSessionRequest): void {
  validateConsumerSessionId(request.sessionId);
  if (!Array.isArray(request.topics) || request.topics.length < 1 || request.topics.length > 50 ||
      request.topics.some(topic => typeof topic !== 'string' || !/^[a-zA-Z0-9._-]{1,249}$/.test(topic) || topic === '.' || topic === '..')) {
    throw new ConsumerSessionError('Select between 1 and 50 valid topic names', 400);
  }
  if (request.fromBeginning !== undefined && typeof request.fromBeginning !== 'boolean') {
    throw new ConsumerSessionError('fromBeginning must be a boolean', 400);
  }
  const maxMessages = request.maxMessages ?? 10;
  const timeoutMs = request.timeoutMs ?? 5000;
  if (!Number.isInteger(maxMessages) || maxMessages < 1 || maxMessages > 200) {
    throw new ConsumerSessionError('maxMessages must be an integer from 1 to 200', 400);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 5000) {
    throw new ConsumerSessionError('timeoutMs must be an integer from 0 to 5000', 400);
  }
}

// @group BusinessLogic : One manager belongs to one immutable cluster connection
export class KafkaConsumerSessions {
  private readonly sessions = new Map<string, Session>();
  private readonly stoppedSessions = new Map<string, number>();
  private readonly limits: SessionLimits;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(private readonly kafka: Pick<Kafka, 'consumer'>, limits: Partial<SessionLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  async poll(request: PollConsumerSessionRequest) {
    validateConsumerPoll(request);
    this.pruneStoppedSessions();
    if (this.closed || this.stoppedSessions.has(request.sessionId)) {
      throw new ConsumerSessionError('Inspection session has stopped; start a new session', 410);
    }
    const topics = [...new Set(request.topics)].sort();
    let session = this.sessions.get(request.sessionId);
    if (session && (session.fromBeginning !== (request.fromBeginning ?? false) || JSON.stringify(session.topics) !== JSON.stringify(topics))) {
      throw new ConsumerSessionError('This session belongs to a different topic selection', 409);
    }
    if (!session) {
      if (this.sessions.size >= this.limits.maxSessions) {
        throw new ConsumerSessionError('Too many inspection sessions; stop an existing session first', 429);
      }
      session = {
        consumer: this.kafka.consumer({ groupId: `ezkafka-inspect-${randomUUID()}`, allowAutoTopicCreation: false }),
        topics, fromBeginning: request.fromBeginning ?? false, buffer: [], bufferedBytes: 0,
        droppedMessages: 0, lastAccess: Date.now(), stopped: false,
        ready: Promise.resolve(), listeners: new Set(),
      };
      this.sessions.set(request.sessionId, session);
      session.ready = this.start(session);
      this.startCleanup();
    }
    session.lastAccess = Date.now();
    try {
      await session.ready;
    } catch (error) {
      await this.stop(request.sessionId).catch(() => undefined);
      if (error instanceof ConsumerSessionError) throw error;
      throw new ConsumerSessionError('Unable to start the Kafka inspection session', 502);
    }
    this.assertRunning(session);
    if (session.buffer.length === 0 && !session.error) await this.waitForMessages(session, request.timeoutMs ?? 5000);
    this.assertRunning(session);
    const drained = session.buffer.splice(0, request.maxMessages ?? 10);
    session.bufferedBytes -= drained.reduce((total, entry) => total + entry.bytes, 0);
    session.lastAccess = Date.now();
    return { sessionId: request.sessionId, messages: drained.map(entry => entry.message), bufferedMessages: session.buffer.length, droppedMessages: session.droppedMessages };
  }

  // @group BusinessLogic > Lifecycle : Stop is idempotent and also cancels startup
  async stop(sessionId: string): Promise<void> {
    validateConsumerSessionId(sessionId);
    this.pruneStoppedSessions();
    // Remember DELETE-before-POST so an in-flight request cannot resurrect a stopped session.
    this.stoppedSessions.set(sessionId, Date.now());
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.stopPromise) return session.stopPromise;
    session.stopped = true;
    this.notify(session);
    session.stopPromise = (async () => {
      try {
        await session.ready.catch(() => undefined);
        // Disconnect also stops KafkaJS; attempt it even if the initial stop fails.
        await session.consumer.stop().catch(() => undefined);
        await session.consumer.disconnect();
        session.buffer = [];
        session.bufferedBytes = 0;
        this.sessions.delete(sessionId);
        if (this.sessions.size === 0 && this.cleanupTimer) {
          clearInterval(this.cleanupTimer);
          this.cleanupTimer = undefined;
        }
      } catch (error) {
        // Retain failed teardown so explicit DELETE and idle cleanup can retry it.
        session.stopPromise = undefined;
        throw error;
      }
    })();
    return session.stopPromise;
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
    const results = await Promise.allSettled([...this.sessions.keys()].map(sessionId => this.stop(sessionId)));
    this.stoppedSessions.clear();
    if (results.some(result => result.status === 'rejected')) throw new ConsumerSessionError('Unable to disconnect every Kafka inspection session', 502);
  }

  private async start(session: Session): Promise<void> {
    await this.startOperation(session.consumer.connect(), session);
    this.assertRunning(session);
    await this.startOperation(session.consumer.subscribe({ topics: session.topics, fromBeginning: session.fromBeginning }), session);
    this.assertRunning(session);
    session.consumer.on(session.consumer.events.CRASH, () => {
      session.error = new ConsumerSessionError('Kafka inspection failed; stop and restart the session', 502);
      this.notify(session);
    });
    await this.startOperation(session.consumer.run({ autoCommit: false, eachMessage: async payload => this.enqueue(session, payload) }), session);
    this.assertRunning(session);
  }

  private async startOperation(operation: Promise<unknown>, session: Session): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      await Promise.race([
        operation,
        new Promise<never>((resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new ConsumerSessionError('Kafka inspection startup timed out', 504));
          }, this.limits.startupTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        // A transport that finishes after timeout must still release its connection.
        void operation.then(() => session.consumer.disconnect(), () => undefined).catch(() => undefined);
      }
    }
  }

  // @group BusinessLogic > Buffering : FIFO delivery with explicit overflow accounting
  private async enqueue(session: Session, { topic, partition, message, heartbeat }: EachMessagePayload) {
    if (session.stopped) return;
    await heartbeat();
    if (session.stopped) return;
    const bytes = (message.value?.length ?? 0) + (message.key?.length ?? 0) +
      Object.entries(message.headers ?? {}).reduce((total, [name, value]) => total + Buffer.byteLength(name) + Buffer.byteLength(String(value ?? '')), 0);
    if (session.buffer.length >= this.limits.maxBufferedMessages || session.bufferedBytes + bytes > this.limits.maxBufferedBytes) {
      session.droppedMessages += 1;
      this.notify(session);
      return;
    }
    const timestamp = Number(message.timestamp);
    session.buffer.push({
      bytes,
      message: {
        topic, partition, offset: message.offset,
        timestamp: Number.isFinite(timestamp) && Math.abs(timestamp) <= 8.64e15 ? new Date(timestamp).toISOString() : new Date().toISOString(),
        key: message.key?.toString(), value: message.value?.toString() ?? '',
        headers: message.headers ? Object.fromEntries(Object.entries(message.headers).map(([name, value]) => [name, value?.toString() ?? ''])) : undefined,
      },
    });
    session.bufferedBytes += bytes;
    this.notify(session);
  }

  // @group Utilities : Poll wakeups and idle cleanup
  private assertRunning(session: Session) {
    if (session.stopped) throw new ConsumerSessionError('Inspection session has stopped; start a new session', 410);
    if (session.error) throw session.error;
  }

  private notify(session: Session) {
    for (const listener of session.listeners) listener();
  }

  private async waitForMessages(session: Session, timeoutMs: number) {
    if (timeoutMs === 0) return;
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); session.listeners.delete(finish); resolve(); };
      const timer = setTimeout(finish, timeoutMs);
      session.listeners.add(finish);
    });
  }

  private startCleanup() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      for (const [sessionId, session] of this.sessions) {
        if (Date.now() - session.lastAccess >= this.limits.idleTimeoutMs) void this.stop(sessionId).catch(() => undefined);
      }
    }, this.limits.cleanupIntervalMs);
    this.cleanupTimer.unref?.();
  }

  private pruneStoppedSessions() {
    for (const [sessionId, stoppedAt] of this.stoppedSessions) {
      if (Date.now() - stoppedAt > this.limits.idleTimeoutMs * 2 || this.stoppedSessions.size > 1000) this.stoppedSessions.delete(sessionId);
    }
  }
}
