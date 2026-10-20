import { createHash, timingSafeEqual } from 'node:crypto';
import { readAccessSettings } from '../../scripts/access-config.cjs';

// @group Types : Access decisions contain only safe response metadata
export type AccessDecision =
  | { allowed: true; role: 'admin' | 'readonly' }
  | { allowed: false; status: 401 | 403 | 503; message: string };

type AccessRequest = Pick<Request, 'headers' | 'method' | 'url'>;

// @group Authentication : Compare fixed-length digests for every configured account
function authenticate(authorization: string | null, credentials: ReturnType<typeof readAccessSettings>['credentials']) {
  let supplied = '';
  const match = authorization && /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (match && match[1].length <= 4096) {
    const decoded = Buffer.from(match[1], 'base64');
    if (decoded.toString('base64') === match[1]) {
      try { supplied = new TextDecoder('utf-8', { fatal: true }).decode(decoded); } catch { /* Invalid credentials. */ }
    }
  }
  const suppliedHash = createHash('sha256').update(supplied).digest();
  let role: 'admin' | 'readonly' | null = null;
  for (const account of credentials) {
    const expectedHash = createHash('sha256').update(`${account.username}:${account.password}`).digest();
    if (timingSafeEqual(suppliedHash, expectedHash)) {
      role = account.role === 'admin' ? 'admin' : 'readonly';
    }
  }
  return role;
}

// @group Validation > Origin : Host checks prevent DNS rebinding and reject untrusted proxy headers
function trustedOrigin(request: AccessRequest, settings: ReturnType<typeof readAccessSettings>) {
  const authority = request.headers.get('host');
  if (!authority) return null;
  if (settings.publicOrigin) {
    return authority === new URL(settings.publicOrigin).host ? settings.publicOrigin : null;
  }
  if (!settings.localAuthority) return null;
  const localOrigin = new URL(`http://${settings.localAuthority}`);
  const localhostAuthority = `localhost${localOrigin.port ? `:${localOrigin.port}` : ''}`;
  return [localOrigin.host, localhostAuthority].includes(authority) ? `http://${authority}` : null;
}

// @group Authentication > Authorization : Enforce authentication, CSRF boundaries, and read-only capabilities
export function authorizeRequest(request: AccessRequest, env: NodeJS.ProcessEnv = process.env): AccessDecision {
  let settings: ReturnType<typeof readAccessSettings>;
  try { settings = readAccessSettings(env); } catch {
    return { allowed: false, status: 503, message: 'Server access is not configured.' };
  }

  const expectedOrigin = trustedOrigin(request, settings);
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!expectedOrigin || (origin !== null && origin !== expectedOrigin) ||
      (fetchSite !== null && !['same-origin', 'none'].includes(fetchSite))) {
    return { allowed: false, status: 403, message: 'Request origin is not allowed.' };
  }

  const role = settings.credentials.length ? authenticate(request.headers.get('authorization'), settings.credentials) : 'admin';
  if (!role) return { allowed: false, status: 401, message: 'Authentication required.' };

  const method = request.method.toUpperCase();
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(method);
  // Browser mutations require Origin. Authenticated non-browser clients may omit it.
  if (!safe && !origin && (fetchSite !== null || !settings.credentials.length)) {
    return { allowed: false, status: 403, message: 'A same-origin request is required.' };
  }
  const path = new URL(request.url).pathname;
  const inspection = (path === '/api/messages/consume' && ['POST', 'DELETE'].includes(method)) ||
    (path === '/api/messages/browse' && method === 'POST');
  if (role === 'readonly' && !safe && !inspection) {
    return { allowed: false, status: 403, message: 'Administrator access is required.' };
  }
  return { allowed: true, role };
}
