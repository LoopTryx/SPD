const fs = require('node:fs');
const path = require('node:path');
const { validateBuildInputs, validateModelHashes } = require('./artifacts.cjs');
const { createReleaseConfig, createRuntimeMetadata } = require('./release-config.cjs');

module.exports = async context => {
  const root = context.packager.projectDir;
  validateBuildInputs(root);
  validateModelHashes(name => fs.readFileSync(path.join(root, 'dist', name)), require('../docs/model-assets.json'));
  const config = createReleaseConfig(process.env, context.packager.appInfo.version);
  const directory = path.join(root, '.release-build');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'spd-release.json'), `${JSON.stringify(createRuntimeMetadata(config), null, 2)}\n`);
};
