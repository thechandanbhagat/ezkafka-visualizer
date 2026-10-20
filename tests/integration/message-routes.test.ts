import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/messages/route';
import { GET } from '@/app/api/consumer-groups/route';
import { KafkaOperationError } from '@/lib/kafka';

// @group TestSetup : Preserve real validation while isolating every broker operation
const mocks = vi.hoisted(() => ({ getKafkaService: vi.fn(), sendMessage: vi.fn(), getConsumerGroups: vi.fn() }));
vi.mock('@/lib/kafka', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/kafka')>(), getKafkaService: mocks.getKafkaService }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getKafkaService.mockResolvedValue({ sendMessage: mocks.sendMessage, getConsumerGroups: mocks.getConsumerGroups });
});
function request(body: unknown) { return new NextRequest('http://localhost/api/messages', { method: 'POST', body: JSON.stringify(body) }); }
const validMessage = { profileId: 'staging', topic: 'orders.created', value: 'payload' };

// @group IntegrationTests : Explicit targeting, validation and safe error propagation
describe('producer route', () => {
  it('awaits the selected connection and accepts an empty record value', async () => {
    const response = await POST(request({ ...validMessage, value: '', key: 'order-1', headers: { type: 'created' } }));
    expect(response.status).toBe(200);
    expect(mocks.getKafkaService).toHaveBeenCalledWith('staging');
    expect(mocks.sendMessage).toHaveBeenCalledWith('orders.created', { value: '', key: 'order-1', headers: { type: 'created' } });
  });
  it.each([{ profileId: undefined }, { topic: 'invalid/topic' }, { value: {} }, { key: {} }, { headers: [] }, { headers: { bad: 1 } }])('rejects invalid payload before contacting Kafka: %j', async change => {
    expect((await POST(request({ ...validMessage, ...change }))).status).toBe(400);
    expect(mocks.getKafkaService).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and null', async () => {
    expect((await POST(new NextRequest('http://localhost/api/messages', { method: 'POST', body: '{' }))).status).toBe(400);
    expect((await POST(request(null))).status).toBe(400);
  });
  it('preserves size-limit status and redacts unexpected broker failures', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new KafkaOperationError('Message exceeds the profile size limit.', 413));
    expect((await POST(request(validMessage))).status).toBe(413);
    mocks.sendMessage.mockRejectedValueOnce(new Error('password=secret broker.private'));
    const response = await POST(request(validMessage));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toMatch(/secret|broker.private/);
  });
});

describe('consumer groups route', () => {
  it('returns groups from the selected cluster', async () => {
    mocks.getConsumerGroups.mockResolvedValue([{ groupId: 'orders' }]);
    const response = await GET(new NextRequest('http://localhost/api/consumer-groups?profileId=staging'));
    expect(mocks.getKafkaService).toHaveBeenCalledWith('staging');
    expect(await response.json()).toEqual([{ groupId: 'orders' }]);
  });
  it('reports broker failures instead of returning a false empty success', async () => {
    mocks.getConsumerGroups.mockRejectedValue(new Error('private broker details'));
    const response = await GET(new NextRequest('http://localhost/api/consumer-groups?profileId=staging'));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Unable to load consumer groups from the selected cluster.' });
  });
});
