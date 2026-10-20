import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const probe = spawnSync('bun', ['--version'], { encoding: 'utf8' });

if (probe.error || probe.status !== 0) {
  process.stdout.write('bun is not on PATH; skipping effect-api smoke.\n');
  process.exit(0);
}

const source = `
import { app } from './src/app.ts';
const response = await app.handle(new Request('http://localhost/health'));
if (response.status !== 200) process.exit(1);
const body = await response.json();
if (body.ok !== true) process.exit(1);
`;

const result = spawnSync('bun', ['--bun', '-e', source], {
  cwd: appDir,
  encoding: 'utf8',
});

if (result.status !== 0) {
  process.stderr.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exit(result.status ?? 1);
}

process.stdout.write('effect-api smoke passed without binding a port.\n');
