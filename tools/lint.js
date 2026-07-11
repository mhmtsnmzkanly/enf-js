import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'bin', 'bench', 'test', 'tools'];
const files = [];
function visit(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) visit(child);
    else if (entry.name.endsWith('.js') && child !== 'tools/lint.js') files.push(child);
  }
}
for (const root of roots) visit(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exitCode = 1;
  }
}
if (!process.exitCode) process.stdout.write(`syntax checked ${files.length} JavaScript files\n`);
