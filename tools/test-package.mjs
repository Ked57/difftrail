import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** @param {string} command @param {string[]} args @param {string} cwd */
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command !== process.execPath,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.error ?? result.stderr}\n${result.stdout}`,
    );
  return result.stdout;
}
const temporary = await realpath(
  await mkdtemp(join(tmpdir(), 'difftrail-package-')),
);
try {
  run(
    'pnpm',
    ['--filter', 'difftrail', 'pack', '--pack-destination', temporary],
    process.cwd(),
  );
  const archive = (await readdir(temporary)).find((file) =>
    file.endsWith('.tgz'),
  );
  assert.ok(archive, 'pack produced a tarball');
  const consumer = join(temporary, 'consumer');
  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), '{}');
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(temporary, archive),
    ],
    consumer,
  );
  const packageRoot = join(consumer, 'node_modules', 'difftrail');
  const manifest = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8'),
  );
  assert.equal(manifest.name, 'difftrail');
  assert.equal(manifest.license, 'Apache-2.0');
  assert.equal(manifest.bin.difftrail, 'dist/cli.js');
  assert.equal(manifest.dependencies['dependency-cruiser'], '18.6.0');
  assert.equal(manifest.dependencies.typescript, '6.0.3');
  assert.ok(!JSON.stringify(manifest.dependencies).includes('workspace:'));
  const code = await readFile(join(packageRoot, 'dist/cli.js'), 'utf8');
  assert.ok(code.startsWith('#!/usr/bin/env node\n'));
  assert.ok(!code.includes('@difftrail/'));
  await readFile(join(packageRoot, 'LICENSE'));
  await readFile(join(packageRoot, 'README.md'));
  const fixture = join(temporary, 'repository');
  await mkdir(fixture);
  run('git', ['init', '--quiet'], fixture);
  run('git', ['config', 'user.email', 'fixture@example.invalid'], fixture);
  run('git', ['config', 'user.name', 'Fixture'], fixture);
  await writeFile(join(fixture, 'leaf.js'), 'export const value=1;');
  await writeFile(
    join(fixture, 'consumer.js'),
    "export {value} from './leaf.js';",
  );
  run('git', ['add', '--all'], fixture);
  run('git', ['commit', '--quiet', '-m', 'baseline'], fixture);
  await writeFile(join(fixture, 'leaf.js'), 'export const value=2;');
  run('git', ['commit', '--quiet', '-am', 'change'], fixture);
  const bin = join(
    consumer,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'difftrail.cmd' : 'difftrail',
  );
  assert.equal(run(bin, [], fixture), 'consumer.js\nleaf.js\n');
  await writeFile(
    join(fixture, 'types.ts'),
    'export interface Value {value:number}',
  );
  await writeFile(
    join(fixture, 'typed.ts'),
    "import type {Value} from './types'; export const value:Value={value:1};",
  );
  const parserSmoke = join(packageRoot, 'parser-smoke.mjs');
  await writeFile(
    parserSmoke,
    await readFile('packages/cli/tests/parser-smoke.mjs'),
  );
  run(process.execPath, [parserSmoke, fixture], consumer);
  console.log(
    'Isolated tarball install, executable, bundled modules, license, metadata and real shipped TypeScript parser passed.',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
