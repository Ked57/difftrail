import { spawnSync } from 'node:child_process';
import { realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from './helpers.js';
const executable = resolve('packages/cli/dist/cli.js');
function cli(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd,
    encoding: 'utf8',
  });
}
test('built CLI returns exact latest-commit consumers as text and JSON from dirty checkout', async () => {
  const repo = await repository({
    'leaf.js': 'export const leaf=1;',
    'consumer.js': "import {leaf} from './leaf.js'; export {leaf};",
    'page.js': "export {leaf} from './consumer.js';",
    'independent.js': 'export const independent=1;',
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    const head = await repo.commit({ 'leaf.js': 'export const leaf=2;' });
    await writeFile(resolve(repo.root, 'leaf.js'), 'not valid JavaScript !');
    const before = repo.git('status', '--porcelain=v1');
    const result = cli(repo.root);
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      stdout: 'consumer.js\nleaf.js\npage.js\n',
      stderr: '',
    });
    expect(JSON.parse(cli(repo.root, '--json').stdout)).toEqual({
      root: await realpath(repo.root),
      base,
      head,
      scope: 'static',
      files: ['consumer.js', 'leaf.js', 'page.js'],
      removed: [],
    });
    expect(repo.git('status', '--porcelain=v1')).toBe(before);
  } finally {
    await repo.cleanup();
  }
});

test.each([
  ['missing import', "import './missing.js';"],
  ['variable import', 'const name="./leaf.js"; import(name);'],
  ['invalid JavaScript', 'const = ;'],
])('fails atomically on %s in either endpoint', async (_name, source) => {
  const repo = await repository({
    'leaf.js': 'export const leaf=1;',
    'broken.js': source,
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    await repo.commit({
      'broken.js': 'export const repaired=1;',
      'leaf.js': 'export const leaf=2;',
    });
    const result = cli(repo.root, '--json');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('broken.js');
    expect(result.stderr).toContain(base);
  } finally {
    await repo.cleanup();
  }
});
test('succeeds with zero bytes for an empty commit and rejects invalid flags before output', async () => {
  const repo = await repository({ 'only.js': 'export const value=1;' });
  try {
    await repo.commit({});
    expect(cli(repo.root).stdout).toBe('');
    expect(cli(repo.root).status).toBe(0);
    const invalid = cli(repo.root, '--unknown');
    expect(invalid.status).toBe(2);
    expect(invalid.stdout).toBe('');
  } finally {
    await repo.cleanup();
  }
});
