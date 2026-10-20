import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizeRequest } from '../../src/services/access-control';
import { createLaunchSettings, readAccessSettings } from '../../scripts/access-config.cjs';

// @group TestSetup : Isolated access settings without deployment credentials
const adminPassword = randomBytes(24).toString('hex');
const readonlyPassword = randomBytes(24).toString('hex');
const networkEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  EZKAFKA_ADMIN_USERNAME: 'admin',
  EZKAFKA_ADMIN_PASSWORD: adminPassword,
  EZKAFKA_READONLY_USERNAME: 'reader',
  EZKAFKA_READONLY_PASSWORD: readonlyPassword,
  EZKAFKA_PUBLIC_ORIGIN: 'https://kafka.example.test',
};
const localEnv: NodeJS.ProcessEnv = { NODE_ENV: 'test', EZKAFKA_LOCAL_AUTHORITY: '127.0.0.1:3700' };

// @group TestHelpers : Build requests for each role and browser origin
function request(path = '/api/topics', method = 'GET', headers: Record<string, string> = {}) {
  return new Request(`https://kafka.example.test${path}`, {
    method,
    headers: { host: 'kafka.example.test', ...headers },
  });
}
function basic(username = 'admin', password = adminPassword) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

// @group UnitTests > Authentication : All network requests require valid configured credentials
describe('access configuration and credentials', () => {
  it('fails closed for direct network/standalone startup without credentials', () => {
    expect(authorizeRequest(request(), { NODE_ENV: 'test' })).toMatchObject({ allowed: false, status: 503 });
    expect(authorizeRequest(request(), { NODE_ENV: 'test', EZKAFKA_PUBLIC_ORIGIN: networkEnv.EZKAFKA_PUBLIC_ORIGIN })).toMatchObject({ status: 503 });
  });

  it.each([
    { EZKAFKA_ADMIN_PASSWORD: 'short' },
    { EZKAFKA_ADMIN_USERNAME: 'bad:name' },
    { EZKAFKA_ADMIN_USERNAME: '' },
    { EZKAFKA_READONLY_USERNAME: 'admin' },
    { EZKAFKA_READONLY_PASSWORD: '' },
    { EZKAFKA_PUBLIC_ORIGIN: 'https://kafka.example.test/path' },
    { EZKAFKA_PUBLIC_ORIGIN: 'https://user:pass@kafka.example.test' },
    { EZKAFKA_PUBLIC_ORIGIN: '' },
    { EZKAFKA_LOCAL_AUTHORITY: '0.0.0.0:3700' },
  ])('rejects incomplete or invalid configuration %j', invalid => {
    expect(authorizeRequest(request(), { ...networkEnv, ...invalid })).toMatchObject({ status: 503 });
  });

  it.each([undefined, 'Bearer unsupported', 'Basic !!!', basic('admin', 'incorrect'), basic('unknown')])('rejects invalid authentication', authorization => {
    expect(authorizeRequest(request('/', 'GET', authorization ? { authorization } : {}), networkEnv)).toMatchObject({ status: 401 });
  });

  it('compares the full credential including password colons and Unicode', () => {
    const password = `${adminPassword}:café`;
    expect(authorizeRequest(request('/', 'GET', { authorization: basic('admin', password) }), {
      ...networkEnv, EZKAFKA_ADMIN_PASSWORD: password,
    })).toEqual({ allowed: true, role: 'admin' });
  });

  it('requires configured credentials even on a guarded loopback listener', () => {
    expect(authorizeRequest(request(), { ...networkEnv, ...localEnv })).toMatchObject({ status: 401 });
  });

  it('requires credentials when a public origin is configured behind a loopback proxy', () => {
    expect(authorizeRequest(request(), { ...localEnv, EZKAFKA_PUBLIC_ORIGIN: 'https://kafka.example.test' })).toMatchObject({ status: 503 });
  });
});

// @group UnitTests > Authorization : Readers can inspect but cannot modify cluster settings or records
describe('role authorization', () => {
  const authorization = basic('reader', readonlyPassword);

  it.each([
    ['/api/topics', 'GET'], ['/api/settings', 'GET'], ['/api/consumer-groups', 'GET'],
    ['/api/messages/consume', 'POST'], ['/api/messages/consume', 'DELETE'], ['/', 'GET'],
    ['/api/messages/browse', 'POST'],
  ])('allows reader inspection %s %s', (path, method) => {
    expect(authorizeRequest(request(path, method, { authorization }), networkEnv)).toEqual({ allowed: true, role: 'readonly' });
  });

  it.each([
    ['/api/topics', 'POST'], ['/api/topics/orders', 'DELETE'], ['/api/topics/orders/cleanup', 'POST'],
    ['/api/topics/orders/config', 'PUT'], ['/api/topics/orders/partitions', 'POST'],
    ['/api/messages', 'POST'], ['/api/settings', 'POST'], ['/api/settings', 'PUT'],
    ['/api/messages/consume/other', 'DELETE'], ['/api/messages/consume', 'PUT'],
    ['/api/messages/browse', 'DELETE'], ['/api/messages/browse', 'PUT'], ['/api/messages/browse/other', 'POST'],
  ])('blocks reader mutation %s %s', (path, method) => {
    expect(authorizeRequest(request(path, method, { authorization }), networkEnv)).toMatchObject({ status: 403 });
  });

  it('permits an authenticated non-browser administrator to mutate without Origin', () => {
    expect(authorizeRequest(request('/api/topics', 'POST', { authorization: basic() }), networkEnv)).toEqual({ allowed: true, role: 'admin' });
  });

  it('does not trust role or middleware-bypass headers', () => {
    expect(authorizeRequest(request('/api/topics', 'DELETE', {
      authorization, 'x-ezkafka-role': 'admin', 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware',
    }), networkEnv)).toMatchObject({ status: 403 });
  });
});

// @group EdgeCases > CSRF : Reject cross-site browser requests and rebinding Host values
describe('origin and host boundaries', () => {
  it.each<Record<string, string>>([
    { origin: 'https://attacker.example' }, { origin: 'null' },
    { host: 'attacker.example' }, { host: 'kafka.example.test.attacker.example' },
    { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' },
  ])('rejects hostile request metadata %j', headers => {
    expect(authorizeRequest(request('/', 'GET', { authorization: basic(), ...headers }), networkEnv)).toMatchObject({ status: 403 });
  });

  it('rejects browser mutations with missing Origin and accepts matching Origin', () => {
    const headers = { authorization: basic(), 'sec-fetch-site': 'same-origin' };
    expect(authorizeRequest(request('/api/topics', 'POST', headers), networkEnv)).toMatchObject({ status: 403 });
    expect(authorizeRequest(request('/api/topics', 'POST', { ...headers, origin: 'https://kafka.example.test' }), networkEnv)).toMatchObject({ allowed: true });
  });

  it('ignores forwarded host headers as proof of trust', () => {
    expect(authorizeRequest(request('/', 'GET', {
      authorization: basic(), host: 'attacker.test', 'x-forwarded-host': 'kafka.example.test',
    }), networkEnv)).toMatchObject({ status: 403 });
  });

  it.each(['127.0.0.1:3700', 'localhost:3700'])('allows guarded local browsing through %s', host => {
    expect(authorizeRequest(request('/', 'GET', { host }), localEnv)).toEqual({ allowed: true, role: 'admin' });
    expect(authorizeRequest(request('/api/topics', 'POST', { host, origin: `http://${host}` }), localEnv)).toMatchObject({ allowed: true });
    expect(authorizeRequest(request('/api/topics', 'POST', { host }), localEnv)).toMatchObject({ status: 403 });
  });

  it.each(['localhost:3701', '127.0.0.1:80', '127.0.0.1.attacker.test:3700'])('rejects unbound local authorities %s', host => {
    expect(authorizeRequest(request('/', 'GET', { host }), localEnv)).toMatchObject({ status: 403 });
  });
});

// @group UnitTests > Startup : Local exemptions must correspond to validated socket options
describe('guarded startup', () => {
  it('defaults to a literal loopback bind regardless of inherited HOSTNAME', () => {
    expect(createLaunchSettings({ NODE_ENV: 'test', HOSTNAME: '0.0.0.0' })).toMatchObject({ hostname: '127.0.0.1', port: 3700, env: localEnv });
  });

  it.each(['0', '-1', '65536', '3700oops', '3700;echo unsafe', '1.2'])('rejects invalid port %s', port => {
    expect(() => createLaunchSettings({ NODE_ENV: 'test' }, port)).toThrow();
  });

  it('does not reuse a loopback exemption for network binding', () => {
    expect(() => createLaunchSettings({ ...localEnv, EZKAFKA_BIND_HOST: '0.0.0.0' })).toThrow();
    const settings = createLaunchSettings({ ...networkEnv, ...localEnv, EZKAFKA_BIND_HOST: '0.0.0.0' });
    expect(settings.env.EZKAFKA_LOCAL_AUTHORITY).toBeUndefined();
  });

  it('rejects nonliteral bind names and validates a literal IPv6 loopback', () => {
    expect(() => createLaunchSettings({ NODE_ENV: 'test', EZKAFKA_BIND_HOST: 'localhost' })).toThrow();
    expect(createLaunchSettings({ NODE_ENV: 'test', EZKAFKA_BIND_HOST: '::1' }).env.EZKAFKA_LOCAL_AUTHORITY).toBe('[::1]:3700');
  });

  it('validates optional accounts even in local mode instead of silently disabling authentication', () => {
    expect(() => readAccessSettings({ ...localEnv, EZKAFKA_READONLY_USERNAME: 'reader' })).toThrow();
  });
});
