#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// @group Configuration : Parse CLI arguments without passing them through a command shell
const args = process.argv.slice(2);
let port = process.env.PORT || '3700';
let kafkaBrokers = process.env.KAFKA_BROKERS || 'localhost:9092';
let help = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '-p':
    case '--port':
      port = args[++i];
      break;
    case '-k':
    case '--kafka-brokers':
      kafkaBrokers = args[++i];
      break;
    case '-h':
    case '--help':
      help = true;
      break;
    default:
      console.error('Unknown option. Use --help for supported arguments.');
      process.exit(1);
  }
}

if (help) {
  console.log(`
EZ Kafka Visualizer - A modern web application for Kafka cluster management

Usage: ezkafka-visualizer [options]

Options:
  -p, --port <number>           Port to run the server on (default: 3700)
  -k, --kafka-brokers <string>  Kafka broker addresses (default: localhost:9092)
  -h, --help                    Show this help message

Environment Variables:
  PORT                         Server port (default: 3700)
  KAFKA_BROKERS               Kafka broker addresses (default: localhost:9092)
  KAFKA_CLIENT_ID             Kafka client identifier (default: ezkafka-visualizer)
  KAFKA_CONNECTION_TIMEOUT    Connection timeout in ms (default: 3000)
  KAFKA_REQUEST_TIMEOUT       Request timeout in ms (default: 30000)
  EZKAFKA_BIND_HOST           Bind address (default: 127.0.0.1)
  EZKAFKA_PUBLIC_ORIGIN       Exact HTTP(S) origin for authenticated deployment
  EZKAFKA_ADMIN_USERNAME      Required for network deployment
  EZKAFKA_ADMIN_PASSWORD      Required for network deployment (16+ characters)
  EZKAFKA_READONLY_USERNAME   Optional read-only account
  EZKAFKA_READONLY_PASSWORD   Optional read-only password (16+ characters)

Examples:
  ezkafka-visualizer                           # Run on default port 3700
  ezkafka-visualizer -p 8080                  # Run on port 8080
  ezkafka-visualizer -p 3000 -k kafka:9092   # Custom port and Kafka broker
  PORT=9000 ezkafka-visualizer                # Use environment variable
`);
  process.exit(0);
}

// @group Configuration : Delegate final validation and socket binding to the guarded server
process.env.PORT = port;
process.env.KAFKA_BROKERS = kafkaBrokers;

console.log(`🚀 Starting EZ Kafka Visualizer...`);
console.log(`📡 Port: ${port}`);

// @group Validation : Verify the installed server entry point
const serverPath = path.join(__dirname, '..', 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('❌ Server file not found. Please ensure the package is properly installed.');
  console.error('   Run: npm run build');
  process.exit(1);
}

// @group Configuration > Launch : Reuse the current Node runtime
const serverProcess = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  env: { ...process.env }
});

serverProcess.on('error', (error) => {
  console.error('❌ Failed to start server:', error.message);
  process.exit(1);
});

serverProcess.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Server exited with code ${code}`);
  }
  process.exit(code ?? 1);
});

// @group Configuration > Shutdown : Forward termination to the owned child server
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down EZ Kafka Visualizer...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down EZ Kafka Visualizer...');
  serverProcess.kill('SIGTERM');
});
