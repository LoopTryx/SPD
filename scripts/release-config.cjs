function createReleaseConfig(env = process.env, version = require('../package.json').version) {
  const channel = env.SPD_RELEASE_CHANNEL || 'beta';
  if (!['beta', 'stable'].includes(channel)) throw new Error('Release channel must be beta or stable');
  if (env.SPD_PUBLIC_RELEASE && !['0', '1'].includes(env.SPD_PUBLIC_RELEASE)) {
    throw new Error('SPD_PUBLIC_RELEASE must be 0 or 1');
  }
  const publicRelease = env.SPD_PUBLIC_RELEASE === '1';
  const versionPattern = channel === 'beta' ? /^\d+\.\d+\.\d+-beta\.\d+$/ : /^\d+\.\d+\.\d+$/;
  if (!versionPattern.test(version)) throw new Error(`Version must match ${channel} channel`);
  let publish = null;
  if (publicRelease) {
    for (const key of ['SPD_PUBLISHER', 'SPD_UPDATE_BASE_URL', 'CSC_LINK', 'CSC_KEY_PASSWORD']) {
      if (!env[key]?.trim()) throw new Error(`${key} is required for a public release`);
    }
    let url;
    try { url = new URL(env.SPD_UPDATE_BASE_URL); } catch { /* validation below */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('SPD_UPDATE_BASE_URL must be an HTTPS base URL without credentials, query or fragment');
    }
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${channel}/`;
    publish = { provider: 'generic', url: url.href, channel: channel === 'stable' ? 'latest' : 'beta' };
  }
  return {
    appId: 'spatial-pointer-device',
    productName: 'Spatial Pointer Device',
    directories: { output: `release/${channel}` },
    artifactName: `SPD-\${version}-${channel}-\${arch}-Setup.\${ext}`,
    asar: true,
    files: ['.electron-build/**/*', 'dist/**/*', 'package.json', '!**/*.map', '!**/__tests__/**'],
    extraResources: [
      { from: 'native/bin/win-x64', to: 'native', filter: ['Spd.InputHelper.exe', 'Spd.TargetHelper.exe'] },
      { from: '.release-build/spd-release.json', to: 'spd-release.json' },
      { from: 'docs/model-assets.json', to: 'model-assets.json' },
      { from: 'docs/third-party-notices.md', to: 'third-party-notices.md' },
    ],
    beforePack: './scripts/before-pack.cjs',
    npmRebuild: false,
    forceCodeSigning: publicRelease,
    detectUpdateChannel: false,
    generateUpdatesFilesForAllChannels: false,
    publish,
    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      executableName: 'SPD',
      requestedExecutionLevel: 'asInvoker',
      signAndEditExecutable: publicRelease,
      verifyUpdateCodeSignature: true,
      ...(publicRelease ? { signtoolOptions: { publisherName: [env.SPD_PUBLISHER.trim()] } } : {}),
    },
    nsis: {
      oneClick: true, perMachine: false, allowElevation: false, packElevateHelper: false,
      runAfterFinish: false, deleteAppDataOnUninstall: false, differentialPackage: true,
    },
  };
}
function createRuntimeMetadata(config) {
  return {
    version: 1, signed: config.forceCodeSigning,
    publisherName: config.forceCodeSigning ? config.win.signtoolOptions.publisherName[0] : null,
    updateUrl: config.publish?.url || null,
    channel: config.directories.output.endsWith('/stable') ? 'stable' : 'beta',
  };
}
module.exports = { createReleaseConfig, createRuntimeMetadata };
