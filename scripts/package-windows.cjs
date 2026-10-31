const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createReleaseConfig } = require('./release-config.cjs');
function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (!['beta', 'public'].includes(mode) || args.some(arg => arg !== '--plan') || args.length > 1) {
    throw new Error('Usage: package-windows.cjs beta|public [--plan]');
  }
  const env = { ...process.env, SPD_PUBLIC_RELEASE: mode === 'public' ? '1' : '0' };
  if (mode === 'beta') {
    for (const key of Object.keys(env)) if (/^(CSC_|WIN_CSC_)/.test(key)) delete env[key];
    env.SPD_RELEASE_CHANNEL = 'beta';
    env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  }
  const config = createReleaseConfig(env);
  const compiler = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
  if (args.includes('--plan')) {
    console.log(JSON.stringify({ publicRelease: config.forceCodeSigning,
      channel: env.SPD_RELEASE_CHANNEL || 'beta', publish: 'never' }));
    return;
  }
  if (process.platform !== 'win32') throw new Error('Windows packaging requires Windows');
  const root = path.resolve(__dirname, '..');
  function run(command, args) {
    const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) throw new Error(`Build step failed: ${path.basename(command)} (${result.status})`);
  }
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'native/build.ps1']);
  run(process.execPath, [compiler, '-p', 'tsconfig.electron.json']);
  run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build']);
  run(process.execPath, [path.join(root, 'node_modules/electron-builder/out/cli/cli.js'), '--config', 'electron-builder.config.cjs', '--win', '--x64', '--publish', 'never']);
  run(process.execPath, [path.join(__dirname, 'verify-artifacts.cjs')]);
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
