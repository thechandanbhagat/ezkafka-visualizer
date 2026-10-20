import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsumerSessionError } from '@/services/kafka-consumer-sessions';
import { POST, DELETE } from '@/app/api/messages/consume/route';

// @group TestSetup : Route contract with the asynchronous connection manager boundary
const mocks = vi.hoisted(() => ({ getKafkaService: vi.fn(), pollConsumerSession: vi.fn(), stopConsumerSession: vi.fn() }));
vi.mock('@/lib/kafka', () => ({ getKafkaService: mocks.getKafkaService }));

beforeEach(() => {
  mocks.getKafkaService.mockResolvedValue({ pollConsumerSession: mocks.pollConsumerSession, stopConsumerSession: mocks.stopConsumerSession });
  mocks.stopConsumerSession.mockResolvedValue(undefined);
});
afterEach(() => vi.resetAllMocks());

// @group TestHelpers : Explicit profile and unique session on every request
function request(method: string, payload: unknown) {
  return new NextRequest('http://localhost/api/messages/consume', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}
function payload() { return { sessionId: randomUUID(), topics: ['orders'], profileId: 'development', maxMessages: 10 }; }

describe('inspection routes', () => {
  // @group IntegrationTests : Poll/stop methods, server errors and profile isolation
  it('awaits the selected profile and forwards only the inspection contract', async () => {
    const input = { ...payload(), groupId: 'real-production-consumer' };
    mocks.pollConsumerSession.mockResolvedValue({ sessionId: input.sessionId, messages: [{ offset: '1' }], bufferedMessages: 4, droppedMessages: 2 });
    const response = await POST(request('POST', input));
    expect(response.status).toBe(200);
    expect(mocks.getKafkaService).toHaveBeenCalledWith('development');
    expect(mocks.pollConsumerSession.mock.calls[0][0]).not.toHaveProperty('groupId');
    expect(await response.json()).toMatchObject({ sessionId: input.sessionId, bufferedMessages: 4, droppedMessages: 2 });
  });

  it('explicitly stops the session on its original profile', async () => {
    const input = payload();
    const response = await DELETE(request('DELETE', input));
    expect(response.status).toBe(200);
    expect(mocks.getKafkaService).toHaveBeenCalledWith(input.profileId);
    expect(mocks.stopConsumerSession).toHaveBeenCalledWith(input.sessionId);
    expect(await response.json()).toEqual({ sessionId: input.sessionId, stopped: true });
  });

  it.each([{ profileId: undefined }, { sessionId: undefined }, { topics: [] }, { maxMessages: -10 }, { timeoutMs: 10000 }])('rejects invalid input before touching Kafka: %j', async invalid => {
    const response = await POST(request('POST', { ...payload(), ...invalid }));
    expect(response.status).toBe(400);
    expect(mocks.getKafkaService).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and malformed stop requests', async () => {
    const response = await POST(new NextRequest('http://localhost/api/messages/consume', { method: 'POST', body: '{' }));
    expect(response.status).toBe(400);
    expect((await DELETE(request('DELETE', { sessionId: randomUUID() }))).status).toBe(400);
  });

  it('preserves session conflict status and redacts unexpected connection errors', async () => {
    mocks.pollConsumerSession.mockRejectedValueOnce(new ConsumerSessionError('Session topic mismatch', 409));
    expect((await POST(request('POST', payload()))).status).toBe(409);
    mocks.getKafkaService.mockRejectedValueOnce(new Error('password=secret broker.private:9092'));
    const response = await POST(request('POST', payload()));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Kafka inspection request failed' });
  });
});
