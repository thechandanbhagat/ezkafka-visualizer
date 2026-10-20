// @group Configuration > Validation : Shared access settings used by launchers and request middleware
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);

function readCredentials(env) {
  const credentials = [];
  for (const [prefix, role] of [['ADMIN', 'admin'], ['READONLY', 'readonly']]) {
    const username = env[`EZKAFKA_${prefix}_USERNAME`];
    const password = env[`EZKAFKA_${prefix}_PASSWORD`];
    if (!username && !password) continue;
    if (!username || !/^[A-Za-z0-9_.@-]{1,64}$/.test(username) ||
        !password || password.length < 16 || password.length > 1024 || /[\u0000-\u001f\u007f]/.test(password)) {
      throw new Error(`Configure a valid EZKAFKA_${prefix}_USERNAME and a password of 16–1024 characters.`);
    }
    credentials.push({ username, password, role });
  }
  if (credentials.length && !credentials.some(({ role }) => role === 'admin')) {
    throw new Error('An administrator account is required when authentication is enabled.');
  }
  if (credentials.length === 2 && credentials[0].username === credentials[1].username) {
    throw new Error('Administrator and read-only usernames must be different.');
  }
  return credentials;
}

function readPublicOrigin(value) {
  if (!value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('EZKAFKA_PUBLIC_ORIGIN must be an HTTP(S) origin.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash || value.replace(/\/$/, '') !== parsed.origin) {
    throw new Error('EZKAFKA_PUBLIC_ORIGIN must contain only the HTTP(S) scheme, hostname, and optional port.');
  }
  return parsed.origin;
}

function readLocalAuthority(value) {
  if (!value) return null;
  const match = /^(127\.0\.0\.1|\[::1\]):([0-9]{1,5})$/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) {
    throw new Error('Invalid internal loopback binding.');
  }
  return value;
}

function readAccessSettings(env = process.env) {
  const credentials = readCredentials(env);
  const publicOrigin = readPublicOrigin(env.EZKAFKA_PUBLIC_ORIGIN);
  const localAuthority = readLocalAuthority(env.EZKAFKA_LOCAL_AUTHORITY);
  if (publicOrigin && !credentials.length) {
    throw new Error('A configured public origin requires administrator credentials, including behind a local proxy.');
  }
  if (!localAuthority && (!credentials.length || !publicOrigin)) {
    throw new Error('Network and standalone servers require administrator credentials and EZKAFKA_PUBLIC_ORIGIN.');
  }
  return { credentials, publicOrigin, localAuthority };
}

// @group Configuration > Launch : Set the local exemption only alongside an explicit loopback bind
function createLaunchSettings(env = process.env, portArgument) {
  const rawPort = String(portArgument ?? env.PORT ?? '3700');
  if (!/^[0-9]{1,5}$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const hostname = env.EZKAFKA_BIND_HOST || '127.0.0.1';
  if (!['127.0.0.1', '::1', '0.0.0.0', '::'].includes(hostname)) {
    throw new Error('EZKAFKA_BIND_HOST must be 127.0.0.1, ::1, 0.0.0.0, or ::.');
  }
  const port = Number(rawPort);
  /** @type {NodeJS.ProcessEnv} */
  const childEnv = { ...env, PORT: String(port) };
  // Never accept an inherited exemption when changing the socket binding.
  delete childEnv.EZKAFKA_LOCAL_AUTHORITY;
  if (LOOPBACK_HOSTS.has(hostname)) {
    childEnv.EZKAFKA_LOCAL_AUTHORITY = `${hostname === '::1' ? '[::1]' : hostname}:${port}`;
  }
  readAccessSettings(childEnv);
  return { hostname, port, env: childEnv };
}

// @group Exports : Share configuration validation without depending on Next.js
module.exports = { readAccessSettings, createLaunchSettings };
