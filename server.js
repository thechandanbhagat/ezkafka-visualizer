#!/usr/bin/env node

const { createServer } = require('node:http');
const { parse } = require('node:url');
const { loadEnvConfig } = require('@next/env');
const { createLaunchSettings } = require('./scripts/access-config.cjs');

// @group Configuration : Validate access before creating the production listener
loadEnvConfig(__dirname, false);
let settings;
try { settings = createLaunchSettings(process.env); } catch (error) {
  console.error(error.message);
  process.exit(1);
}
delete process.env.EZKAFKA_LOCAL_AUTHORITY;
Object.assign(process.env, settings.env);
const app = require('next')({ dev: false, hostname: settings.hostname, port: settings.port, dir: __dirname });
const handle = app.getRequestHandler();

// @group APIEndpoints : Bind explicitly so local access never implies a public socket
app.prepare().then(() => {
  const server = createServer(async (request, response) => {
    try { await handle(request, response, parse(request.url, true)); } catch {
      console.error('Application request failed.');
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('Internal server error');
    }
  });
  server.once('error', () => { console.error('Unable to bind the application server.'); process.exit(1); });
  server.listen(settings.port, settings.hostname, () => {
    const host = settings.hostname.includes(':') ? `[${settings.hostname}]` : settings.hostname;
    console.log(`EZ Kafka Visualizer ready at http://${host}:${settings.port}`);
  });

  // @group Configuration > Shutdown : Stop accepting requests before terminating the process
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}).catch(() => { console.error('Application initialization failed.'); process.exit(1); });
