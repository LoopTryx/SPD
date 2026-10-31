const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(file, args = [], extraEnv = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(SPD_PUBLIC_RELEASE|SPD_RELEASE_CHANNEL|SPD_UPDATE_BASE_URL|SPD_PUBLISHER|CSC_|WIN_CSC_)/.test(key)) delete env[key];
  return spawnSync(process.execPath, [path.join(__dirname, file), ...args], {
    env: { ...env, ...extraEnv }, encoding: 'utf8', windowsHide: true,
  });
}
test('public preflight exits nonzero before build when signing configuration is missing', () => {
  const result = run('release-preflight.cjs');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SPD_PUBLISHER/);
});
test('public packaging fails before any compilation without release credentials', () => {
  const result = run('package-windows.cjs', ['public']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SPD_PUBLISHER/);
  assert.doesNotMatch(result.stdout, /Building|Compiling|Packaging/);
});
test('private beta plan disables signing and publishing despite inherited public credentials', () => {
  const result = run('package-windows.cjs', ['beta', '--plan'], {
    SPD_PUBLIC_RELEASE: '1', SPD_RELEASE_CHANNEL: 'stable', CSC_LINK: 'never-use-this-secret',
  });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.publicRelease, false);
  assert.equal(plan.channel, 'beta');
  assert.equal(plan.publish, 'never');
  assert.doesNotMatch(result.stdout, /never-use-this-secret/);
});
test('artifact CLI fails for missing actual output instead of reporting fixture success', () => {
  const result = run('verify-artifacts.cjs', ['--directory', path.join(__dirname, 'does-not-exist')]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing installer/);
});
