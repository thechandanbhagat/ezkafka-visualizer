import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { middleware } from '../../src/middleware';

// @group TestSetup : Exercise the actual middleware over an isolated HTTP listener
const adminPassword = randomBytes(24).toString('hex');
const readonlyPassword = randomBytes(24).toString('hex');
let server: Server;
let origin: string;
let routeCalls = 0;

beforeAll(async () => {
  server = createServer(async (incoming, outgoing) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const response = middleware(new NextRequest(`${origin}${incoming.url}`, { method: incoming.method, headers }));
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    if (response.headers.get('x-middleware-next') === '1') {
      routeCalls += 1;
      outgoing.writeHead(200, { 'content-type': 'application/json' });
      outgoing.end(JSON.stringify({ reachedRoute: true }));
    } else {
      outgoing.statusCode = response.status;
      outgoing.end(await response.text());
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  routeCalls = 0;
  vi.stubEnv('EZKAFKA_LOCAL_AUTHORITY', '');
  vi.stubEnv('EZKAFKA_ADMIN_USERNAME', 'admin');
  vi.stubEnv('EZKAFKA_ADMIN_PASSWORD', adminPassword);
  vi.stubEnv('EZKAFKA_READONLY_USERNAME', 'reader');
  vi.stubEnv('EZKAFKA_READONLY_PASSWORD', readonlyPassword);
  vi.stubEnv('EZKAFKA_PUBLIC_ORIGIN', origin);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

// @group TestHelpers : Supply credentials without exposing them in request URLs
function authorization(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

// @group IntegrationTests : Authorization failures never execute downstream handlers
describe('HTTP access middleware', () => {
  it.each(['/', '/api/settings', '/api/topics', '/_next/static/chunk.js'])('challenges unauthenticated access to %s', async path => {
    const response = await fetch(`${origin}${path}`);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Basic realm=');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(routeCalls).toBe(0);
  });

  it('rejects a reader write while permitting isolated inspection', async () => {
    const headers = { authorization: authorization('reader', readonlyPassword), origin };
    expect((await fetch(`${origin}/api/settings`, { method: 'POST', headers })).status).toBe(403);
    expect(routeCalls).toBe(0);
    expect((await fetch(`${origin}/api/messages/consume`, { method: 'POST', headers })).status).toBe(200);
    expect((await fetch(`${origin}/api/messages/consume`, { method: 'DELETE', headers })).status).toBe(200);
    expect(routeCalls).toBe(2);
  });

  it('allows administrator requests and adds browser security headers', async () => {
    const response = await fetch(`${origin}/api/topics`, {
      method: 'POST', headers: { authorization: authorization('admin', adminPassword), origin, 'sec-fetch-site': 'same-origin' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(routeCalls).toBe(1);
  });

  it('blocks cross-origin requests despite valid browser-cached credentials', async () => {
    const response = await fetch(`${origin}/api/topics`, {
      method: 'POST', headers: { authorization: authorization('admin', adminPassword), origin: 'https://attacker.example' },
    });
    expect(response.status).toBe(403);
    expect(routeCalls).toBe(0);
  });

  it('fails closed on missing deployment credentials without leaking configuration', async () => {
    vi.stubEnv('EZKAFKA_ADMIN_PASSWORD', '');
    const response = await fetch(`${origin}/api/topics`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Server access is not configured.' });
    expect(routeCalls).toBe(0);
  });
});
