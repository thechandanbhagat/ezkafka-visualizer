#!/usr/bin/env node

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const path = require('path');

const dev = false;
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3700', 10);

// For standalone builds, we need to set the correct path
const app = next({
  dev,
  hostname,
  port,
  dir: __dirname,
  conf: {
    output: 'standalone',
    experimental: {
      outputFileTracingRoot: path.join(__dirname)
    }
  }
});

const handle = app.getRequestHandler();

console.log(`🚀 EZ Kafka Visualizer starting...`);
console.log(`📡 Environment: ${dev ? 'development' : 'production'}`);
console.log(`🔗 Kafka Brokers: ${process.env.KAFKA_BROKERS || 'localhost:9092'}`);

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  })
    .once('error', (err) => {
      console.error('❌ Server error:', err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`🌐 Server ready at http://${hostname}:${port}`);
      console.log(`📊 Dashboard: http://${hostname}:${port}`);
      console.log(`⚙️  Settings: http://${hostname}:${port}/settings`);
    });
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});