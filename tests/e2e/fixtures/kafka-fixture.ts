import { test as base, expect } from '@playwright/test';
import type { TopicInfo, ConsumerGroupInfo } from '../../../src/lib/kafka';
import { DEFAULT_SETTINGS } from '../../../src/lib/kafka-settings';
import type { MultiServerConfig } from '../../../src/lib/kafka-settings';
import type { BrowseMessagesResponse } from '../../../src/models/message-explorer';
import { explorerBatch } from './explorer-records';

// @group Types : Per-test API state and recorded browser requests
interface ApiRequest {
  method: string;
  path: string;
  profileId: string | null;
  body: Record<string, unknown>;
}

export interface MockKafkaApi {
  topics: TopicInfo[];
  groups: ConsumerGroupInfo[];
  config: MultiServerConfig;
  topicError: string | null;
  settingsError: string | null;
  configError: string | null;
  purgeFailures: string[];
  topicConfigs: Record<string, Record<string, string>>;
  explorerBatches: BrowseMessagesResponse[];
  explorerError: string | null;
  explorerDelayMs: number;
  requests: ApiRequest[];
  unhandledRequests: string[];
}

// @group TestHelpers : Realistic deterministic records without a Kafka dependency
function createMockApi(): MockKafkaApi {
  return {
    topics: [
      { name: 'orders.created', partitions: 6, replicationFactor: 3, connectedConsumers: 3, consumerGroups: ['orders-service'], messageCount: 243817 },
      { name: 'payments.processed', partitions: 3, replicationFactor: 3, connectedConsumers: 2, consumerGroups: ['payments-service'], messageCount: 16542 },
      { name: 'inventory.updated', partitions: 3, replicationFactor: 3, connectedConsumers: 0, consumerGroups: [], messageCount: 4082 },
    ],
    groups: [
      { groupId: 'orders-service', members: 3, state: 'Stable', protocol: 'roundrobin', subscriptions: ['orders.created'], topicMemberCounts: { 'orders.created': 3 } },
      { groupId: 'payments-service', members: 2, state: 'Stable', protocol: 'roundrobin', subscriptions: ['payments.processed'], topicMemberCounts: { 'payments.processed': 2 } },
    ],
    config: {
      activeProfileId: 'local',
      profiles: [
        { id: 'local', name: 'Local Kafka', description: 'Local development cluster', settings: { ...DEFAULT_SETTINGS, brokers: ['localhost:9092'] } },
        { id: 'staging', name: 'Staging', description: 'Integration environment', settings: { ...DEFAULT_SETTINGS, brokers: ['staging.kafka:9092'] } },
      ],
    },
    topicError: null,
    settingsError: null,
    configError: null,
    purgeFailures: [],
    topicConfigs: {},
    explorerBatches: [explorerBatch()],
    explorerError: null,
    explorerDelayMs: 0,
    requests: [],
    unhandledRequests: [],
  };
}

// @group TestSetup : Intercept every API request so tests cannot reach real brokers
export const test = base.extend<{ mockApi: MockKafkaApi }>({
  mockApi: [async ({ page }, use) => {
    const api = createMockApi();
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const body: Record<string, unknown> = request.postData() ? request.postDataJSON() : {};
      api.requests.push({ method, path, body, profileId: new URL(request.url()).searchParams.get('profileId') });

      if (path === '/api/settings') {
        if (api.settingsError) { await route.fulfill({ status: 500, json: { error: api.settingsError } }); return; }
        if (body.action === 'updateProfile') api.config.profiles = api.config.profiles.map(profile => profile.id === (body.profile as { id: string }).id ? body.profile as MultiServerConfig['profiles'][number] : profile);
        if (body.action === 'createProfile') api.config.profiles.push({ id: 'new-profile', name: String(body.name), settings: body.settings as MultiServerConfig['profiles'][number]['settings'] });
        if (body.action === 'deleteProfile') {
          api.config.profiles = api.config.profiles.filter(profile => profile.id !== body.profileId);
          if (api.config.activeProfileId === body.profileId) api.config.activeProfileId = api.config.profiles[0].id;
        }
        const activeProfile = api.config.profiles.find(profile => profile.id === api.config.activeProfileId);
        await route.fulfill({ json: { success: true, settings: activeProfile?.settings, multiServerConfig: api.config, activeProfile, presets: { messageSizes: { large: 1048576 } } } });
        return;
      }
      if (path === '/api/topics' && method === 'GET') {
        await route.fulfill(api.topicError
          ? { status: 503, json: { error: 'Failed to fetch topics', message: api.topicError } }
          : { json: api.topics });
        return;
      }
      if (path === '/api/topics' && method === 'POST') {
        api.topics.push({ name: String(body.name), partitions: Number(body.partitions), replicationFactor: Number(body.replicationFactor || 1), connectedConsumers: 0, messageCount: 0 });
        await route.fulfill({ json: { message: 'Topic created successfully' } });
        return;
      }
      if (path === '/api/consumer-groups' && method === 'GET') {
        await route.fulfill({ json: api.groups });
        return;
      }
      if (/^\/api\/topics\/[^/]+\/config$/.test(path)) {
        if (api.configError) { await route.fulfill({ status: 502, json: { error: api.configError } }); return; }
        const topic = decodeURIComponent(path.split('/')[3]);
        const configs = api.topicConfigs[topic] ?? { 'cleanup.policy': 'delete', 'retention.ms': '604800000' };
        api.topicConfigs[topic] = method === 'PUT' ? { ...configs, ...body.configs as Record<string, string> } : configs;
        await route.fulfill({ json: method === 'GET' ? api.topicConfigs[topic] : { message: 'Updated' } });
        return;
      }
      if (/^\/api\/topics\/[^/]+\/partitions$/.test(path) && method === 'POST') {
        const topic = api.topics.find(topic => topic.name === decodeURIComponent(path.split('/')[3]));
        if (topic) topic.partitions = Number(body.count);
        await route.fulfill({ json: { message: 'Updated' } });
        return;
      }
      if (/^\/api\/topics\/[^/]+\/cleanup$/.test(path) && method === 'POST') {
        const name = decodeURIComponent(path.split('/')[3]);
        if (api.purgeFailures.includes(name)) { await route.fulfill({ status: 403, json: { error: 'Kafka denied permission for this operation' } }); return; }
        const topic = api.topics.find(topic => topic.name === name);
        if (topic) topic.messageCount = 0;
        await route.fulfill({ json: { message: 'Purged' } });
        return;
      }
      if (path === '/api/messages/browse' && method === 'POST') {
        const error = api.explorerError;
        const result = structuredClone(api.explorerBatches.length > 1 ? api.explorerBatches.shift()! : api.explorerBatches[0]);
        result.messages = result.messages.map(message => ({ ...message, topic: String(body.topic), partition: Number(body.partition) }));
        if (api.explorerDelayMs) await new Promise(resolve => setTimeout(resolve, api.explorerDelayMs));
        await route.fulfill(error ? { status: 502, json: { error } } : { json: result }).catch(() => undefined);
        return;
      }
      if (path === '/api/messages/consume' && method === 'POST') {
        await route.fulfill({ json: { sessionId: body.sessionId, messages: [], bufferedMessages: 0, droppedMessages: 0 } });
        return;
      }
      if (path === '/api/messages/consume' && method === 'DELETE') {
        await route.fulfill({ json: { stopped: true } });
        return;
      }
      if (path === '/api/messages' && method === 'POST') {
        await route.fulfill({ json: { message: 'Message sent successfully' } });
        return;
      }

      api.unhandledRequests.push(`${method} ${path}`);
      await route.fulfill({ status: 501, json: { error: 'This API request has no test fixture' } });
    });

    await use(api);
    expect(api.unhandledRequests, 'Every API request must have an explicit safe fixture').toEqual([]);
  }, { auto: true }],
});

// @group Exports : Shared assertions for browser interaction tests
export { expect } from '@playwright/test';
