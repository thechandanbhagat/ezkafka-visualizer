const { spawn } = require('node:child_process');
const path = require('node:path');
const { loadEnvConfig } = require('@next/env');
const { createLaunchSettings } = require('./access-config.cjs');

// @group Configuration > Launch : Forward only validated arguments to Next without a command shell
function launchNext(mode, portArgument) {
  loadEnvConfig(path.join(__dirname, '..'), mode === 'dev');
  let settings;
  try { settings = createLaunchSettings(process.env, portArgument); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const args = [require.resolve('next/dist/bin/next'), mode, '--hostname', settings.hostname, '--port', String(settings.port)];
  if (mode === 'dev') args.push('--turbopack');
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: settings.env, shell: false });
  child.on('error', () => { console.error('Unable to start the application server.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

// @group Exports : Shared guarded development and production launch
module.exports = { launchNext };
