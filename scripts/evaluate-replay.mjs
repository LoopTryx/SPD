import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/evaluate-replay.mjs recording.json');
  const replay = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { write: false,
    minify: false, lib: { entry: fileURLToPath(new URL('../src/spd/gesture-replay.ts', import.meta.url)), formats: ['es'] } } });
  const output = (Array.isArray(bundle) ? bundle[0] : bundle).output;
  const entry = output.find(item => item.type === 'chunk' && item.isEntry);
  if (!entry) throw new Error('Replay evaluator did not compile.');
  const { evaluateGestureReplay } = await import('data:text/javascript;base64,' + Buffer.from(entry.code).toString('base64'));
  const report = evaluateGestureReplay(replay);
  console.log(JSON.stringify(report, null, 2));
  if (report.missed.length || report.unexpected.length) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 2; }
