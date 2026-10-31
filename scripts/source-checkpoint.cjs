const { createHash } = require('node:crypto');
const { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } = require('node:fs');
const path = require('node:path');

// Local source-only checkpoints preserve the existing Git index unchanged.
const root = path.resolve(__dirname, '..');
const label = process.argv[2];
if (!label || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(label)) throw new Error('Use a short lowercase checkpoint name.');
const destination = path.join(root, '.source-checkpoints', label);
if (existsSync(destination)) throw new Error('Checkpoint already exists; choose a new name.');
const files = [];
const omitted = new Set(['node_modules', 'bin', 'obj', '.git', '.freebuff', '.tools']);
function collect(relative) {
  const full = path.join(root, relative);
  for (const item of readdirSync(full, { withFileTypes: true })) {
    if (item.isSymbolicLink() || omitted.has(item.name)) continue;
    const child = path.join(relative, item.name);
    if (item.isDirectory()) collect(child);
    else if (/\.(?:ts|tsx|js|cjs|mjs|mts|json|md|html|css|cs|csproj|ps1|task|manifest)$/.test(item.name)) files.push(child);
  }
}
for (const folder of ['src', 'electron', 'native', 'scripts', 'docs']) collect(folder);
for (const item of readdirSync(root, { withFileTypes: true })) {
  if (item.isFile() && (/\.(?:json|md|html|cjs|mts|task)$/.test(item.name) || item.name === '.gitignore')) files.push(item.name);
}
mkdirSync(destination, { recursive: true });
const entries = files.sort().map(relative => {
  const content = readFileSync(path.join(root, relative));
  const saved = path.join(destination, relative);
  mkdirSync(path.dirname(saved), { recursive: true });
  copyFileSync(path.join(root, relative), saved);
  return { path: relative.replaceAll('\\', '/'), bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex') };
});
writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ schema: 1, label,
  createdAt: new Date().toISOString(), files: entries }, null, 2) + '\n');
console.log(`Saved ${entries.length} source files to ${destination}`);
