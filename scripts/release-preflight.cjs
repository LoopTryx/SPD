const { createReleaseConfig } = require('./release-config.cjs');
try {
  const config = createReleaseConfig({ ...process.env, SPD_PUBLIC_RELEASE: '1' });
  console.log(JSON.stringify({ publicRelease: true, channel: config.publish.channel, publish: 'never' }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
