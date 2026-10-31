const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const yaml = require('yaml');

function readFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
    throw new Error(`Missing or empty resource: ${file}`);
  }
  return fs.readFileSync(file);
}

function validatePE(bytes, label, x64 = true) {
  const offset = bytes.length >= 64 ? bytes.readUInt32LE(60) : -1;
  if (bytes.toString('ascii', 0, 2) !== 'MZ' || offset < 64 || offset + 6 > bytes.length ||
      bytes.toString('ascii', offset, offset + 4) !== 'PE\0\0') throw new Error(`Invalid PE executable: ${label}`);
  if (x64 && bytes.readUInt16LE(offset + 4) !== 0x8664) throw new Error(`Expected x64 executable: ${label}`);
}

function validateRuntime(directory) {
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.runtimeconfig.json'))) {
    const options = JSON.parse(readFile(path.join(directory, name))).runtimeOptions;
    if (!options || options.framework || options.frameworks) throw new Error(`Native runtime must be self-contained: ${name}`);
  }
}

function validateApp(read, names) {
  for (const name of ['.electron-build/main.js', '.electron-build/preload.js', 'dist/index.html',
    'dist/hand_landmarker.task', 'dist/face_landmarker.task']) {
    const bytes = read(name);
    if (!bytes.length || (name.endsWith('.task') && bytes.length < 1024)) throw new Error(`Invalid bundled resource: ${name}`);
  }
  const wasm = names.filter(name => /^dist\/wasm\/.*\.wasm$/.test(name));
  if (!wasm.length || !names.some(name => /^dist\/wasm\/.*\.js$/.test(name))) throw new Error('Missing bundled WASM runtime');
  for (const name of wasm) {
    const bytes = read(name);
    if (!bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) throw new Error(`Invalid WASM: ${name}`);
  }
}

function listFiles(root, prefix = '') {
  return fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(root, name) : [name];
  });
}

function validateBuildInputs(root) {
  const native = path.join(root, 'native/bin/win-x64');
  validatePE(readFile(path.join(native, 'Spd.InputHelper.exe')), 'Spd.InputHelper.exe');
  validatePE(readFile(path.join(native, 'Spd.TargetHelper.exe')), 'Spd.TargetHelper.exe');
  validateRuntime(native);
  const wasmDirectory = path.join(root, 'dist/wasm');
  const names = fs.existsSync(wasmDirectory) ? listFiles(wasmDirectory).map(name => `dist/wasm/${name}`) : [];
  validateApp(name => readFile(path.join(root, name)), names);
}

function validateModelHashes(read, manifest) {
  for (const model of manifest.models) {
    const hash = crypto.createHash('sha256').update(read(model.file)).digest('hex');
    if (hash !== model.sha256.toLowerCase()) throw new Error(`Model SHA-256 mismatch: ${model.file}`);
  }
}

async function verifyArtifacts(output, { version, channel = 'beta', publicRelease = false, publisherName, updateUrl } = {}) {
  if (!['beta', 'stable'].includes(channel) || !/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version || '')) {
    throw new Error('Expected version and beta/stable channel');
  }
  if (publicRelease && (!publisherName || !updateUrl?.startsWith('https://'))) throw new Error('Public verification requires publisher and HTTPS feed');
  const installer = `SPD-${version}-${channel}-x64-Setup.exe`;
  const installerPath = path.join(output, installer);
  if (!fs.existsSync(installerPath)) throw new Error(`Missing installer for expected version: ${installer}`);
  const installerBytes = readFile(installerPath);
  validatePE(installerBytes, installer, false);
  readFile(`${installerPath}.blockmap`);
  const app = path.join(output, 'win-unpacked');
  validatePE(readFile(path.join(app, 'SPD.exe')), 'SPD.exe');
  for (const name of ['icudtl.dat', 'resources.pak', 'locales/en-US.pak']) readFile(path.join(app, name));
  const native = path.join(app, 'resources/native');
  validatePE(readFile(path.join(native, 'Spd.InputHelper.exe')), 'Spd.InputHelper.exe');
  validatePE(readFile(path.join(native, 'Spd.TargetHelper.exe')), 'Spd.TargetHelper.exe');
  validateRuntime(native);
  const release = JSON.parse(readFile(path.join(app, 'resources/spd-release.json')));
  if (release.version !== 1 || release.signed !== publicRelease || release.channel !== channel ||
      release.publisherName !== (publicRelease ? publisherName : null) || release.updateUrl !== (publicRelease ? updateUrl : null)) {
    throw new Error('Packaged release metadata does not match expected signing/feed/channel policy');
  }
  const asar = await import('@electron/asar');
  const archive = path.join(app, 'resources/app.asar');
  readFile(archive);
  asar.uncache(archive);
  const names = asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
  const read = name => {
    try { return asar.extractFile(archive, path.normalize(name)); } catch (error) { throw new Error(`Missing ASAR resource: ${name}: ${error.message}`); }
  };
  validateApp(read, names);
  const pkg = JSON.parse(read('package.json'));
  if (pkg.version !== version || pkg.main !== '.electron-build/main.js') throw new Error('Packaged application version/entrypoint mismatch');
  read('node_modules/electron-updater/package.json');
  if (names.some(name => /(^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:pfx|p12))$/i.test(name))) throw new Error('Sensitive signing/environment file packaged');
  const digest = algorithm => crypto.createHash(algorithm).update(installerBytes).digest(algorithm === 'sha512' ? 'base64' : 'hex');
  const metadataName = channel === 'beta' ? 'beta.yml' : 'latest.yml';
  const otherMetadata = channel === 'beta' ? 'latest.yml' : 'beta.yml';
  if (fs.existsSync(path.join(output, otherMetadata))) throw new Error('Wrong channel update metadata in release output');
  const metadataPath = path.join(output, metadataName);
  if (publicRelease || fs.existsSync(metadataPath)) {
    const metadata = yaml.parse(readFile(metadataPath).toString());
    if (metadata.version !== version || metadata.path !== installer) throw new Error('Update metadata version/installer mismatch');
    if (metadata.sha512 !== digest('sha512')) throw new Error('Update metadata sha512 mismatch');
    const file = metadata.files?.find(file => file.url === installer);
    if (!file || file.sha512 !== digest('sha512') || file.size !== installerBytes.length) throw new Error('Update file sha512/size mismatch');
  }
  if (publicRelease) {
    const update = yaml.parse(readFile(path.join(app, 'resources/app-update.yml')).toString());
    const publishers = Array.isArray(update.publisherName) ? update.publisherName : [update.publisherName];
    if (update.provider !== 'generic' || update.url !== updateUrl || update.channel !== (channel === 'beta' ? 'beta' : 'latest') ||
        !publishers.includes(publisherName)) throw new Error('Packaged updater publisher/feed/channel mismatch');
    if (process.platform !== 'win32') throw new Error('Public Authenticode verification requires Windows');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'verify-signatures.ps1'),
      '-OutputDirectory', path.resolve(output), '-InstallerName', installer, '-PublisherName', publisherName], { encoding: 'utf8', windowsHide: true });
    if (result.error || result.status !== 0) throw new Error(`Authenticode verification failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return { version, channel, publicRelease, installer, bytes: installerBytes.length, sha256: digest('sha256'), sha512: digest('sha512') };
}
module.exports = { validateBuildInputs, verifyArtifacts, validateModelHashes };
