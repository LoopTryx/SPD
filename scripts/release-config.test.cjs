const test = require('node:test');
const assert = require('node:assert/strict');
const { createReleaseConfig, createRuntimeMetadata } = require('./release-config.cjs');

const publicEnv = {
  SPD_PUBLIC_RELEASE: '1', SPD_RELEASE_CHANNEL: 'beta',
  SPD_PUBLISHER: 'Test certificate subject',
  SPD_UPDATE_BASE_URL: 'https://updates.spd.test/releases/',
  CSC_LINK: 'test-certificate.pfx', CSC_KEY_PASSWORD: 'test-only-password',
};

test('private beta builds have no update destination or signing side effects', () => {
  const config = createReleaseConfig({}, '1.0.0-beta.1');
  assert.equal(config.publish, null);
  assert.equal(config.win.signAndEditExecutable, false);
  assert.equal(config.directories.output, 'release/beta');
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.nsis.allowElevation, false);
  assert.equal(config.nsis.runAfterFinish, false);
  assert.deepEqual(config.extraResources.find(resource => resource.to === 'native'), {
    from: 'native/bin/win-x64', to: 'native', filter: ['Spd.InputHelper.exe', 'Spd.TargetHelper.exe'],
  });
});

test('public release fails closed for every missing credential or identity field', () => {
  for (const key of ['SPD_PUBLISHER', 'SPD_UPDATE_BASE_URL', 'CSC_LINK', 'CSC_KEY_PASSWORD']) {
    const env = { ...publicEnv };
    delete env[key];
    assert.throws(() => createReleaseConfig(env, '1.0.0-beta.1'), new RegExp(key));
  }
});

test('public feeds reject HTTP, credentials, query strings and fragments', () => {
  for (const url of ['http://updates.spd.test', 'https://user:pass@updates.spd.test',
    'https://updates.spd.test?token=private', 'https://updates.spd.test/#beta', 'garbage']) {
    assert.throws(() => createReleaseConfig({ ...publicEnv, SPD_UPDATE_BASE_URL: url }, '1.0.0-beta.1'), /SPD_UPDATE_BASE_URL/);
  }
});

test('beta and stable use isolated feed paths, metadata and installer names', () => {
  const beta = createReleaseConfig(publicEnv, '1.0.0-beta.1');
  const stable = createReleaseConfig({ ...publicEnv, SPD_RELEASE_CHANNEL: 'stable' }, '1.0.0');
  assert.equal(beta.publish.url, 'https://updates.spd.test/releases/beta/');
  assert.equal(beta.publish.channel, 'beta');
  assert.equal(stable.publish.url, 'https://updates.spd.test/releases/stable/');
  assert.equal(stable.publish.channel, 'latest');
  assert.notEqual(beta.artifactName, stable.artifactName);
  assert.equal(stable.forceCodeSigning, true);
  assert.equal(stable.win.verifyUpdateCodeSignature, true);
  assert.deepEqual(stable.win.signtoolOptions.publisherName, ['Test certificate subject']);
  assert.equal(stable.generateUpdatesFilesForAllChannels, false);
});

test('versions cannot accidentally cross channels or bypass public validation', () => {
  for (const [env, version] of [
    [{}, '1.0.0'], [{ SPD_RELEASE_CHANNEL: 'stable' }, '1.0.0-beta.1'],
    [{ SPD_RELEASE_CHANNEL: 'nightly' }, '1.0.0-nightly.1'],
    [{ SPD_PUBLIC_RELEASE: 'true' }, '1.0.0-beta.1'], [{}, '1.0.0-alpha.1'],
  ]) assert.throws(() => createReleaseConfig(env, version), /channel|version|SPD_PUBLIC_RELEASE/i);
});

test('host metadata enables updates only with the validated public publisher and feed', () => {
  assert.deepEqual(createRuntimeMetadata(createReleaseConfig({}, '1.0.0-beta.1')), {
    version: 1, signed: false, publisherName: null, updateUrl: null, channel: 'beta',
  });
  assert.deepEqual(createRuntimeMetadata(createReleaseConfig(publicEnv, '1.0.0-beta.1')), {
    version: 1, signed: true, publisherName: 'Test certificate subject',
    updateUrl: 'https://updates.spd.test/releases/beta/', channel: 'beta',
  });
});
