import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

rmSync('dist/types', { recursive: true, force: true });
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.types.json'], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
