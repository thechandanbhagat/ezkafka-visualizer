import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/messages/browse/route';
import { MessageBrowserError } from '@/services/kafka-message-browser';
import { KafkaOperationError } from '@/lib/kafka';

// @group TestSetup : Mock only the connection boundary, keeping validation and safe errors real
const mocks = vi.hoisted(() => ({ getKafkaService: vi.fn(), browseMessages: vi.fn() }));
vi.mock('@/lib/kafka', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/kafka')>(), getKafkaService: mocks.getKafkaService }));
const input = { profileId: 'development', topic: 'orders', partition: 0, limit: 50, start: { kind: 'earliest' } };
const result = { messages: [], nextCursor: null, lowOffset: '0', highOffset: '0', complete: true, timedOut: false, warnings: [] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getKafkaService.mockResolvedValue({ browseMessages: mocks.browseMessages });
  mocks.browseMessages.mockResolvedValue(result);
});

// @group TestHelpers : Every browser request has an explicit cluster and abort signal
function request(payload: unknown, signal?: AbortSignal) {
  return new NextRequest('http://localhost/api/messages/browse', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' }, signal });
}

// @group IntegrationTests : Preserve scoping, cancellation, error status, and cache boundaries
describe('message browser endpoint', () => {
  it('forwards the explicit profile, bounded request and HTTP cancellation signal', async () => {
    const req = request(input);
    const response = await POST(req);
    expect(mocks.getKafkaService).toHaveBeenCalledWith('development');
    expect(mocks.browseMessages).toHaveBeenCalledWith(input, req.signal);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual(result);
  });

  it.each([{ profileId: undefined }, { partition: undefined }, { limit: 1000 }, { topic: '../topic' }])('rejects invalid requests before a connection is created: %j', async invalid => {
    expect((await POST(request({ ...input, ...invalid }))).status).toBe(400);
    expect(mocks.getKafkaService).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and an already aborted HTTP request', async () => {
    expect((await POST(new NextRequest('http://localhost/api/messages/browse', { method: 'POST', body: '{' }))).status).toBe(400);
    expect((await POST(request(input, AbortSignal.abort()))).status).toBe(499);
    expect(mocks.getKafkaService).not.toHaveBeenCalled();
  });

  it.each([409, 413, 416, 429, 499, 504])('preserves safe browse status %s', async status => {
    mocks.browseMessages.mockRejectedValue(new MessageBrowserError('Safe actionable error', status));
    const response = await POST(request(input));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: 'Safe actionable error' });
  });

  it('preserves a missing profile and redacts broker implementation errors', async () => {
    mocks.getKafkaService.mockRejectedValueOnce(new KafkaOperationError('Kafka profile was not found', 404));
    expect((await POST(request(input))).status).toBe(404);
    mocks.getKafkaService.mockRejectedValueOnce(new Error('secret=private-password broker.internal:9092'));
    const response = await POST(request(input));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Unable to browse messages from the selected partition' });
  });
});
