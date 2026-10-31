const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateBuildInputs, verifyArtifacts, validateModelHashes } = require('./artifacts.cjs');

// Synthetic PE headers are fixture data; these files are never executed.
function pe(machine = 0x8664) {
  const bytes = Buffer.alloc(256);
  bytes.write('MZ'); bytes.writeUInt32LE(128, 60); bytes.write('PE\0\0', 128);
  bytes.writeUInt16LE(machine, 132);
  return bytes;
}
function write(root, name, bytes = 'fixture') {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spd-artifact-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, '.electron-build/main.js');
  write(root, '.electron-build/preload.js');
  write(root, 'dist/index.html');
  write(root, 'dist/hand_landmarker.task', Buffer.alloc(2048));
  write(root, 'dist/face_landmarker.task', Buffer.alloc(2048));
  write(root, 'dist/wasm/vision_wasm_internal.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
  write(root, 'dist/wasm/vision_wasm_internal.js');
  write(root, 'native/bin/win-x64/Spd.InputHelper.exe', pe());
  write(root, 'native/bin/win-x64/Spd.TargetHelper.exe', pe());
  return root;
}

test('build preflight requires both models, WASM and a real x64 helper header', t => {
  const root = fixture(t);
  assert.doesNotThrow(() => validateBuildInputs(root));
  fs.unlinkSync(path.join(root, 'dist/face_landmarker.task'));
  assert.throws(() => validateBuildInputs(root), /face_landmarker/);
});

test('build preflight rejects a missing targeting helper', t => {
  const root=fixture(t);
  fs.unlinkSync(path.join(root,'native/bin/win-x64/Spd.TargetHelper.exe'));
  assert.throws(()=>validateBuildInputs(root),/Spd.TargetHelper/);
});

test('build preflight rejects x86 helper, invalid WASM and framework-dependent runtime', t => {
  const root = fixture(t);
  write(root, 'native/bin/win-x64/Spd.InputHelper.exe', pe(0x14c));
  assert.throws(() => validateBuildInputs(root), /x64/);
  write(root, 'native/bin/win-x64/Spd.InputHelper.exe', pe());
  write(root, 'dist/wasm/vision_wasm_internal.wasm', 'download failed');
  assert.throws(() => validateBuildInputs(root), /WASM/);
  write(root, 'dist/wasm/vision_wasm_internal.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
  write(root, 'native/bin/win-x64/Spd.InputHelper.runtimeconfig.json', JSON.stringify({ runtimeOptions: { framework: { name: 'Microsoft.NETCore.App' } } }));
  assert.throws(() => validateBuildInputs(root), /self-contained/);
});

async function packagedFixture(t) {
  const root = fixture(t);
  const source = path.join(root, 'app');
  for (const name of ['dist', '.electron-build']) fs.cpSync(path.join(root, name), path.join(source, name), { recursive: true });
  write(source, 'package.json', JSON.stringify({ version: '1.0.0-beta.1', main: '.electron-build/main.js' }));
  write(source, 'node_modules/electron-updater/package.json', '{"name":"electron-updater"}');
  const out = path.join(root, 'release/beta');
  write(out, 'win-unpacked/SPD.exe', pe());
  for (const name of ['icudtl.dat', 'resources.pak', 'locales/en-US.pak']) write(out, `win-unpacked/${name}`);
  write(out, 'win-unpacked/resources/native/Spd.InputHelper.exe', pe());
  write(out, 'win-unpacked/resources/native/Spd.TargetHelper.exe', pe());
  write(out, 'win-unpacked/resources/spd-release.json', JSON.stringify({ version: 1, signed: false, publisherName: null, updateUrl: null, channel: 'beta' }));
  const asar = await import('@electron/asar');
  await asar.createPackage(source, path.join(out, 'win-unpacked/resources/app.asar'));
  const installerName = 'SPD-1.0.0-beta.1-beta-x64-Setup.exe';
  write(out, installerName, pe(0x14c)); // NSIS launcher may itself be x86.
  write(out, `${installerName}.blockmap`);
  return { root, source, out, installerName, asar };
}

test('artifact check opens ASAR and checks actual installer bytes without running them', async t => {
  const { out, installerName } = await packagedFixture(t);
  const report = await verifyArtifacts(out, { version: '1.0.0-beta.1', channel: 'beta' });
  assert.equal(report.installer, installerName);
  assert.equal(report.sha256, crypto.createHash('sha256').update(pe(0x14c)).digest('hex'));
  assert.equal(report.publicRelease, false);
});

test('artifact check rejects absent bundled face model and mismatched application version', async t => {
  const { out, source, asar } = await packagedFixture(t);
  await assert.rejects(verifyArtifacts(out, { version: '1.0.0-beta.2', channel: 'beta' }), /version|installer/i);
  fs.unlinkSync(path.join(source, 'dist/face_landmarker.task'));
  const archive = path.join(out, 'win-unpacked/resources/app.asar');
  await asar.createPackage(source, archive);
  asar.uncache(archive);
  await assert.rejects(verifyArtifacts(out, { version: '1.0.0-beta.1', channel: 'beta' }), /face_landmarker/);
});

test('updater metadata rejects wrong channel and corrupted installer digest', async t => {
  const { out, installerName } = await packagedFixture(t);
  write(out, 'latest.yml', 'version: 1.0.0');
  await assert.rejects(verifyArtifacts(out, { version: '1.0.0-beta.1', channel: 'beta' }), /channel/i);
  fs.unlinkSync(path.join(out, 'latest.yml'));
  write(out, 'beta.yml', `version: 1.0.0-beta.1\npath: ${installerName}\nsha512: corrupt\nfiles:\n  - url: ${installerName}\n    sha512: corrupt\n    size: 256\n`);
  await assert.rejects(verifyArtifacts(out, { version: '1.0.0-beta.1', channel: 'beta' }), /sha512/i);
});

test('public artifact verification refuses unsigned or unconfigured update packages', async t => {
  const { out } = await packagedFixture(t);
  await assert.rejects(verifyArtifacts(out, { version: '1.0.0-beta.1', channel: 'beta', publicRelease: true }), /publisher|feed|metadata/i);
});

test('artifact check rejects metadata that silently enables updates for a private beta', async t => {
  const { out } = await packagedFixture(t);
  write(out, 'win-unpacked/resources/spd-release.json', JSON.stringify({ version: 1, signed: true, publisherName: 'unexpected', updateUrl: 'https://unexpected.test', channel: 'beta' }));
  await assert.rejects(verifyArtifacts(out, { version: '1.0.0-beta.1', channel: 'beta' }), /release metadata/i);
});

test('model hash checks reject substituted model bytes', () => {
  const manifest = { models: [{ file: 'face_landmarker.task', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }] };
  assert.doesNotThrow(() => validateModelHashes(() => Buffer.from('abc'), manifest));
  assert.throws(() => validateModelHashes(() => Buffer.from('abd'), manifest), /SHA-256/);
});
