import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { KafkaOperationError, getKafkaService } from '@/lib/kafka';
import { GET as readConfig, PUT as writeConfig } from '@/app/api/topics/[name]/config/route';
import { POST as addPartitions } from '@/app/api/topics/[name]/partitions/route';
import { POST as purge } from '@/app/api/topics/[name]/cleanup/route';
import { DELETE as deleteTopic } from '@/app/api/topics/[name]/route';
import { GET as listTopics, POST as createTopic } from '@/app/api/topics/route';

// @group TestSetup : Exercise Next handlers against an isolated service boundary
vi.mock('@/lib/kafka', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/kafka')>(), getKafkaService: vi.fn() }));
vi.mock('@/services/kafka-config-store', () => ({ getStoredKafkaConfig: vi.fn() }));

const service = {
  connect: vi.fn().mockResolvedValue(undefined),
  getTopicConfigs: vi.fn().mockResolvedValue({ 'retention.ms': '4567' }),
  updateTopicConfigs: vi.fn().mockResolvedValue(undefined),
  addPartitions: vi.fn().mockResolvedValue(undefined),
  cleanupMessages: vi.fn().mockResolvedValue({ deletedPartitions: 2, totalMessages: 25 }),
  deleteTopic: vi.fn().mockResolvedValue(undefined),
  createTopic: vi.fn().mockResolvedValue(undefined),
  getTopicsWithConsumerInfo: vi.fn().mockResolvedValue([]),
};
const context = { params: Promise.resolve({ name: 'orders' }) };

function request(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3700/api/topics/${path}?profileId=remote`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) });
}

beforeEach(() => {
  vi.mocked(getKafkaService).mockResolvedValue(service as unknown as Awaited<ReturnType<typeof getKafkaService>>);
  service.connect.mockResolvedValue(undefined);
  service.updateTopicConfigs.mockResolvedValue(undefined);
  service.addPartitions.mockResolvedValue(undefined);
  service.cleanupMessages.mockResolvedValue({ deletedPartitions: 2, totalMessages: 25 });
  service.getTopicsWithConsumerInfo.mockResolvedValue([]);
});

// @group IntegrationTests > TopicConfiguration : Profile routing, broker values, and validated patches
 describe('topic configuration routes', () => {
  it('reads actual values using the explicitly selected profile', async () => {
    const response = await readConfig(request('orders/config'), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ 'retention.ms': '4567' });
    expect(getKafkaService).toHaveBeenCalledWith('remote');
    expect(service.getTopicConfigs).toHaveBeenCalledWith('orders');
  });

  it('applies config patches on the selected profile', async () => {
    const response = await writeConfig(request('orders/config', 'PUT', { configs: { 'retention.ms': '9000' } }), context);
    expect(response.status).toBe(200);
    expect(getKafkaService).toHaveBeenCalledWith('remote');
    expect(service.updateTopicConfigs).toHaveBeenCalledWith('orders', { 'retention.ms': '9000' });
  });

  it.each([null, [], {}, { configs: null }, { configs: { 'retention.ms': 20 } }, { configs: { invalid_key: 'x' } }])('rejects invalid configuration body %j before Kafka access', async body => {
    const response = await writeConfig(request('orders/config', 'PUT', body), context);
    expect(response.status).toBe(400);
    expect(getKafkaService).not.toHaveBeenCalled();
    expect(service.updateTopicConfigs).not.toHaveBeenCalled();
  });

  it('returns a safe broker failure rather than false success', async () => {
    service.updateTopicConfigs.mockRejectedValueOnce(new Error('internal hostname and secret'));
    const response = await writeConfig(request('orders/config', 'PUT', { configs: { 'retention.ms': '9000' } }), context);
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
  });
});

// @group IntegrationTests > PartitionAdministration : One total-count payload contract with real dispatch
 describe('partition route', () => {
  it('dispatches the total count and explicit profile', async () => {
    const response = await addPartitions(request('orders/partitions', 'POST', { count: 4 }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ newPartitionCount: 4 });
    expect(getKafkaService).toHaveBeenCalledWith('remote');
    expect(service.addPartitions).toHaveBeenCalledWith('orders', 4);
  });

  it.each([{ partitions: 4 }, { count: '4' }, { count: 0 }, { count: 2.5 }, { count: 10001 }])('rejects invalid count payload %j', async body => {
    const response = await addPartitions(request('orders/partitions', 'POST', body), context);
    expect(response.status).toBe(400);
    expect(service.addPartitions).not.toHaveBeenCalled();
    expect(getKafkaService).not.toHaveBeenCalled();
  });

  it('preserves the service validation error for an existing partition count', async () => {
    service.addPartitions.mockRejectedValueOnce(new KafkaOperationError('Partition count must exceed the current partition count', 400));
    const response = await addPartitions(request('orders/partitions', 'POST', { count: 4 }), context);
    expect(response.status).toBe(400);
  });
});

// @group IntegrationTests > DestructiveOperations : Scoped dispatch and visible partial failure
 describe('topic mutations', () => {
  it('purges on the selected profile and returns the completed partition count', async () => {
    const response = await purge(request('orders/cleanup', 'POST'), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ deletedPartitions: 2, totalMessages: 25 });
    expect(getKafkaService).toHaveBeenCalledWith('remote');
    expect(service.cleanupMessages).toHaveBeenCalledWith('orders');
    expect(service.deleteTopic).not.toHaveBeenCalled();
  });

  it('surfaces possible partial purge without claiming success', async () => {
    service.cleanupMessages.mockRejectedValueOnce(new KafkaOperationError('Some partitions may already be purged', 502));
    const response = await purge(request('orders/cleanup', 'POST'), context);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Some partitions may already be purged' });
  });

  it('deletes only the named topic on the selected profile', async () => {
    const response = await deleteTopic(request('orders', 'DELETE'), context);
    expect(response.status).toBe(200);
    expect(getKafkaService).toHaveBeenCalledWith('remote');
    expect(service.deleteTopic).toHaveBeenCalledWith('orders');
  });

  it('passes topic creation configuration to the service', async () => {
    const response = await createTopic(request('', 'POST', { name: 'orders', partitions: 2, replicationFactor: 1, configs: { 'cleanup.policy': 'compact' }, profileId: 'remote' }));
    expect(response.status).toBe(201);
    expect(service.createTopic).toHaveBeenCalledWith('orders', 2, 1, { 'cleanup.policy': 'compact' });
    expect(getKafkaService).toHaveBeenCalledWith('remote');
  });

  it.each(['', '..', 'bad/topic', 'x'.repeat(250)])('rejects invalid topic %s', async name => {
    const response = await createTopic(request('', 'POST', { name }));
    expect(response.status).toBe(400);
    expect(service.createTopic).not.toHaveBeenCalled();
  });
});

// @group EdgeCases : Malformed request, unavailable profile, and upstream metadata failures
 describe('topic route failures', () => {
  it('requires explicit profiles for mutations instead of following another user’s active profile', async () => {
    const noProfile = new NextRequest('http://localhost:3700/api/topics/orders/cleanup', { method: 'POST' });
    expect((await purge(noProfile, context)).status).toBe(400);
    expect((await deleteTopic(new NextRequest('http://localhost:3700/api/topics/orders', { method: 'DELETE' }), context)).status).toBe(400);
    expect((await createTopic(new NextRequest('http://localhost:3700/api/topics', { method: 'POST', body: JSON.stringify({ name: 'orders' }) }))).status).toBe(400);
    expect(getKafkaService).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await createTopic(new NextRequest('http://localhost:3700/api/topics', { method: 'POST', body: '{broken' }));
    expect(response.status).toBe(400);
    expect(getKafkaService).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing selected profile rather than using the active profile', async () => {
    vi.mocked(getKafkaService).mockRejectedValueOnce(new KafkaOperationError('Kafka profile was not found', 404));
    const response = await readConfig(request('orders/config'), context);
    expect(response.status).toBe(404);
  });

  it('returns an error when group metadata is unavailable rather than fake zero counts', async () => {
    service.getTopicsWithConsumerInfo.mockRejectedValueOnce(new Error('listGroups failed'));
    const response = await listTopics(request(''));
    expect(response.status).toBe(502);
  });
});
