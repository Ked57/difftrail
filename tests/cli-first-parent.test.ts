import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { repository } from './helpers.js';

const executable = resolve('packages/cli/dist/cli.js');
function cli(cwd: string, ...args: string[]) {
  const temporaryRoot = join(cwd, '.difftrail-test-tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  return spawnSync(process.execPath, [executable, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      TMPDIR: temporaryRoot,
      TMP: temporaryRoot,
      TEMP: temporaryRoot,
    },
  });
}
async function readFiles(
  root: string,
  paths: readonly string[],
): Promise<Buffer[]> {
  return Promise.all(paths.map((path) => readFile(resolve(root, path))));
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
    await repo.commit({ 'leaf.js': 'export const leaf=2;' });
    repo.git(
      'commit',
      '--amend',
      '--quiet',
      '--no-edit',
      '-m',
      'non-root fixture',
      '-m',
      `parent ${'a'.repeat(40)}`,
    );
    const head = repo.git('rev-parse', 'HEAD');
    await writeFile(resolve(repo.root, 'leaf.js'), 'not valid JavaScript !');
    await writeFile(
      resolve(repo.root, 'independent.js'),
      'export const independent=2;',
    );
    repo.git('add', 'independent.js');
    await writeFile(
      resolve(repo.root, 'untracked.js'),
      'export const local=1;',
    );
    const before = repo.git('status', '--porcelain=v1');
    const index = repo.git('write-tree');
    const refs = repo.git('show-ref');
    const config = repo.git('config', '--local', '--list');
    const filesBefore = await readFiles(repo.root, [
      'leaf.js',
      'independent.js',
      'untracked.js',
    ]);
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
    expect(repo.git('write-tree')).toBe(index);
    expect(repo.git('show-ref')).toBe(refs);
    expect(repo.git('config', '--local', '--list')).toBe(config);
    expect(
      await readFiles(repo.root, ['leaf.js', 'independent.js', 'untracked.js']),
    ).toEqual(filesBefore);
  } finally {
    await repo.cleanup();
  }
});

test('built CLI treats a genuine root as an empty base snapshot', async () => {
  const repo = await repository({
    'README.md': 'root',
    'src/only.js': 'export const x=1;',
  });
  try {
    repo.git(
      'commit',
      '--amend',
      '--quiet',
      '--no-edit',
      '-m',
      'root fixture',
      '-m',
      `parent ${'a'.repeat(40)}`,
    );
    const head = repo.git('rev-parse', 'HEAD');
    const text = cli(repo.root);
    expect({
      status: text.status,
      stdout: text.stdout,
      stderr: text.stderr,
    }).toEqual({
      status: 0,
      stdout: 'README.md\nsrc/only.js\n',
      stderr: '',
    });
    const result = cli(repo.root, '--json', '--explain');
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      stdout:
        JSON.stringify({
          root: await realpath(repo.root),
          base: null,
          head,
          scope: 'static',
          files: ['README.md', 'src/only.js'],
          removed: [],
          explanations: [
            { file: 'README.md', snapshot: 'head', chain: ['README.md'] },
            {
              file: 'src/only.js',
              snapshot: 'head',
              chain: ['src/only.js'],
            },
          ],
        }) + '\n',
      stderr: '',
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI ignores an available unrelated commit named in a root message', async () => {
  const repo = await repository({
    'README.md': 'root',
    'src/only.js': 'export const x=1;',
  });
  try {
    await writeFile(resolve(repo.root, 'unrelated.js'), 'export const y=1;');
    repo.git('add', '--all');
    const unrelatedTree = repo.git('write-tree');
    const unrelated = repo.git('commit-tree', unrelatedTree, '-m', 'unrelated');
    repo.git('reset', '--hard', 'HEAD');
    repo.git(
      'commit',
      '--amend',
      '--quiet',
      '--no-edit',
      '-m',
      'root fixture',
      '-m',
      `parent ${unrelated}`,
    );
    const head = repo.git('rev-parse', 'HEAD');
    const result = cli(repo.root, '--json');
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      stdout:
        JSON.stringify({
          root: await realpath(repo.root),
          base: null,
          head,
          scope: 'static',
          files: ['README.md', 'src/only.js'],
          removed: [],
        }) + '\n',
      stderr: '',
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI uses only a merge commit first parent for the default comparison', async () => {
  const repo = await repository({
    'first.js': 'export const x=1;',
    'second.js': 'export const y=1;',
  });
  try {
    const main = repo.git('branch', '--show-current');
    const root = repo.git('rev-parse', 'HEAD');
    repo.git('branch', 'side', root);
    const firstParent = await repo.commit({ 'first.js': 'export const x=2;' });
    repo.git('checkout', 'side');
    await repo.commit({ 'second.js': 'export const y=2;' });
    repo.git('checkout', main);
    repo.git('merge', '--no-ff', '--no-edit', 'side');
    repo.git(
      'commit',
      '--amend',
      '--quiet',
      '--no-edit',
      '-m',
      'merge fixture',
      '-m',
      `parent ${'a'.repeat(40)}`,
    );
    const head = repo.git('rev-parse', 'HEAD');
    const text = cli(repo.root);
    expect({
      status: text.status,
      stdout: text.stdout,
      stderr: text.stderr,
    }).toEqual({ status: 0, stdout: 'second.js\n', stderr: '' });
    const result = cli(repo.root, '--json');
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      stdout:
        JSON.stringify({
          root: await realpath(repo.root),
          base: firstParent,
          head,
          scope: 'static',
          files: ['second.js'],
          removed: [],
        }) + '\n',
      stderr: '',
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI rejects unavailable default history but accepts explicit shallow endpoints', async () => {
  const repo = await repository({ 'value.js': 'export const value=1;' });
  const clone = await mkdtemp(join(tmpdir(), 'difftrail-shallow-'));
  try {
    const base = repo.git('rev-parse', 'HEAD');
    const head = await repo.commit({ 'value.js': 'export const value=2;' });
    execFileSync('git', [
      'clone',
      '--quiet',
      '--depth=1',
      pathToFileURL(repo.root).href,
      clone,
    ]);
    const remoteHead = execFileSync(
      'git',
      ['symbolic-ref', 'refs/remotes/origin/HEAD'],
      { cwd: clone, encoding: 'utf8' },
    ).trim();
    const remoteTipBefore = execFileSync('git', ['rev-parse', remoteHead], {
      cwd: clone,
      encoding: 'utf8',
    }).trim();
    await repo.commit({ 'value.js': 'export const value=3;' });
    const unavailable = cli(clone);
    expect(unavailable.status).toBe(1);
    expect(unavailable.stdout).toBe('');
    expect(unavailable.stderr).toContain('first parent');
    expect(
      execFileSync('git', ['rev-parse', remoteHead], {
        cwd: clone,
        encoding: 'utf8',
      }).trim(),
    ).toBe(remoteTipBefore);
    const explicit = cli(clone, '--base', head, '--head', head);
    expect({ status: explicit.status, stdout: explicit.stdout }).toEqual({
      status: 0,
      stdout: '',
    });
    const absent = cli(clone, '--base', base, '--head', head);
    expect(absent.status).toBe(1);
    expect(absent.stdout).toBe('');
  } finally {
    await rm(clone, { recursive: true, force: true });
    await repo.cleanup();
  }
});
