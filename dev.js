#!/usr/bin/env node

const { spawn } = require('child_process');

// Check for port argument (e.g., npm run dev -- 8080)
const portArg = process.argv[2];
const port = portArg || process.env.PORT || 3700;

const args = ['dev', '--turbopack', '--port', port.toString()];

console.log(`Starting development server on port ${port}...`);

const nextProcess = spawn('next', args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
});

nextProcess.on('error', (error) => {
  console.error('Failed to start development server:', error);
  process.exit(1);
});

nextProcess.on('close', (code) => {
  process.exit(code);
});