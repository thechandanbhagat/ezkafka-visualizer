#!/usr/bin/env node

/**
 * Simple start script that respects PORT environment variable
 * This is used by the npm start script
 */

const port = process.env.PORT || '3700';
const { spawn } = require('child_process');

console.log(`🚀 Starting EZ Kafka Visualizer on port ${port}...`);

const nextProcess = spawn('npx', ['next', 'start', '--port', port], {
  stdio: 'inherit',
  shell: true
});

nextProcess.on('error', (error) => {
  console.error('❌ Failed to start:', error.message);
  process.exit(1);
});

nextProcess.on('exit', (code) => {
  process.exit(code || 0);
});