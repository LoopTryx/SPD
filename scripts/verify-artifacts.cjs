const path = require('node:path');
const { verifyArtifacts } = require('./artifacts.cjs');
const { createReleaseConfig } = require('./release-config.cjs');
async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--directory')) throw new Error('Usage: verify-artifacts.cjs [--directory PATH]');
  const config = createReleaseConfig();
  const report = await verifyArtifacts(path.resolve(args[1] || config.directories.output), {
    version: require('../package.json').version,
    channel: config.directories.output.endsWith('/stable') ? 'stable' : 'beta',
    publicRelease: config.forceCodeSigning,
    publisherName: config.win.signtoolOptions?.publisherName[0], updateUrl: config.publish?.url,
  });
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
