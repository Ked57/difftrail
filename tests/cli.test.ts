import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'vitest';
import { repository } from './helpers.js';
const executable = resolve('packages/cli/dist/cli.js');
function cli(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd,
    encoding: 'utf8',
  });
}
async function snapshotDirectories(): Promise<string[]> {
  return (await readdir(tmpdir()))
    .filter((name) => name.startsWith('difftrail-snapshots-'))
    .sort();
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
    const head = await repo.commit({ 'leaf.js': 'export const leaf=2;' });
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

test('built CLI compares explicit endpoints by their net tree difference', async () => {
  const repo = await repository({ 'value.js': 'export const value=1;' });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    await repo.commit({ 'value.js': 'export const value=2;' });
    const head = await repo.commit({ 'value.js': 'export const value=1;' });
    const result = cli(repo.root, '--base', base, '--head', head, '--json');
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      stdout:
        JSON.stringify({
          root: await realpath(repo.root),
          base,
          head,
          scope: 'static',
          files: [],
          removed: [],
        }) + '\n',
      stderr: '',
    });
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
    const head = repo.git('rev-parse', 'HEAD');
    expect(cli(repo.root).stdout).toBe('README.md\nsrc/only.js\n');
    expect(JSON.parse(cli(repo.root, '--json').stdout)).toMatchObject({
      base: null,
      head,
      files: ['README.md', 'src/only.js'],
      removed: [],
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
    await repo.commit({ 'first.js': 'export const x=2;' });
    repo.git('checkout', 'side');
    await repo.commit({ 'second.js': 'export const y=2;' });
    repo.git('checkout', main);
    repo.git('merge', '--no-ff', '--no-edit', 'side');
    expect(cli(repo.root).stdout).toBe('second.js\n');
  } finally {
    await repo.cleanup();
  }
});

test('built CLI reports a deleted seed as removed and keeps its base consumer', async () => {
  const repo = await repository({
    'old.js': 'export const value=1;',
    'page.js': "import {value} from './old.js'; export {value};",
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    repo.git('rm', 'old.js');
    const head = await repo.commit({ 'page.js': 'export const value=1;' });
    expect(
      JSON.parse(
        cli(repo.root, '--base', base, '--head', head, '--json').stdout,
      ),
    ).toMatchObject({
      base,
      head,
      files: ['page.js'],
      removed: ['old.js'],
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI retains both rename names as seeds and presents the removed old path', async () => {
  const repo = await repository({
    'old.js': 'export const value=1;',
    'page.js': "import {value} from './old.js'; export {value};",
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    repo.git('mv', 'old.js', 'new.js');
    const head = await repo.commit({
      'new.js': 'export const value=1;',
      'page.js': "import {value} from './new.js'; export {value};",
    });
    expect(
      JSON.parse(
        cli(repo.root, '--base', base, '--head', head, '--json').stdout,
      ),
    ).toMatchObject({
      files: ['new.js', 'page.js'],
      removed: ['old.js'],
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI uses an explicit merge base only when requested', async () => {
  const repo = await repository({ 'root.js': 'export const root=1;' });
  try {
    const branch = repo.git('branch', '--show-current');
    const root = repo.git('rev-parse', 'HEAD');
    repo.git('branch', 'side', root);
    repo.git('checkout', 'side');
    const side = await repo.commit({ 'side.js': 'export const side=1;' });
    repo.git('checkout', branch);
    const head = await repo.commit({ 'main.js': 'export const main=1;' });
    expect(
      JSON.parse(
        cli(repo.root, '--base', side, '--head', head, '--json').stdout,
      ),
    ).toMatchObject({
      files: ['main.js'],
      removed: ['side.js'],
    });
    expect(
      JSON.parse(
        cli(repo.root, '--base', side, '--head', head, '--merge-base', '--json')
          .stdout,
      ),
    ).toMatchObject({
      files: ['main.js'],
      removed: [],
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI traverses a real cyclic dependency history once per file', async () => {
  const repo = await repository({
    'a.js': "import './b.js'; export const a=1;",
    'b.js': "import './a.js'; export const b=1;",
  });
  try {
    await repo.commit({ 'a.js': "import './b.js'; export const a=2;" });
    expect(cli(repo.root).stdout).toBe('a.js\nb.js\n');
  } finally {
    await repo.cleanup();
  }
});

test('built CLI keeps historical and current package-resolution chains independent', async () => {
  const repo = await repository({
    'bridge.js': "export {value} from './package-a';",
    'consumer.js': "export {value} from './package-b';",
    'package-a/package.json': '{"main":"old.js"}',
    'package-a/old.js': 'export const value=1;',
    'package-a/new.js': 'export const value=1;',
    'package-b/package.json': '{"main":"other.js"}',
    'package-b/other.js': 'export const value=1;',
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    const head = await repo.commit({
      'package-a/old.js': 'export const value=2;',
      'package-a/package.json': '{"main":"new.js"}',
      'package-b/package.json': '{"main":"../bridge.js"}',
    });
    const result = cli(repo.root, '--base', base, '--head', head, '--json');
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      stdout:
        JSON.stringify({
          root: await realpath(repo.root),
          base,
          head,
          scope: 'static',
          files: [
            'bridge.js',
            'package-a/old.js',
            'package-a/package.json',
            'package-b/package.json',
          ],
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
      `file://${repo.root}`,
      clone,
    ]);
    const unavailable = cli(clone);
    expect(unavailable.status).toBe(1);
    expect(unavailable.stdout).toBe('');
    expect(unavailable.stderr).toContain('first parent');
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

test('built CLI cleans snapshot directories after a Git blob read failure', async () => {
  const repo = await repository({ 'damaged.js': 'export const value=1;' });
  try {
    const head = await repo.commit({ 'damaged.js': 'export const value=2;' });
    const object = repo.git('rev-parse', `${head}:damaged.js`);
    const looseObject = resolve(
      repo.root,
      '.git',
      'objects',
      object.slice(0, 2),
      object.slice(2),
    );
    const snapshotsBefore = await snapshotDirectories();
    await unlink(looseObject);
    const result = cli(repo.root, '--json');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Git cat-file failed');
    expect(await snapshotDirectories()).toEqual(snapshotsBefore);
  } finally {
    await repo.cleanup();
  }
});

test('built CLI validates comparison flag combinations and unresolved refs atomically', async () => {
  const repo = await repository({ 'only.js': 'export const value=1;' });
  try {
    for (const args of [
      ['--head', 'HEAD'],
      ['--merge-base'],
      ['--base'],
      ['--json', '--json'],
    ]) {
      const invalid = cli(repo.root, ...args);
      expect(invalid.status).toBe(2);
      expect(invalid.stdout).toBe('');
    }
    const unavailable = cli(repo.root, '--base', 'no-such-ref', '--json');
    expect(unavailable.status).toBe(1);
    expect(unavailable.stdout).toBe('');
    expect(unavailable.stderr).toContain('no-such-ref');
    expect(unavailable.stderr).toContain('available commit');
    const missingHead = cli(
      repo.root,
      '--base',
      'HEAD',
      '--head',
      'no-such-head',
    );
    expect(missingHead.status).toBe(1);
    expect(missingHead.stdout).toBe('');
    expect(missingHead.stderr).toContain('no-such-head');
  } finally {
    await repo.cleanup();
  }
});

test.each([
  ['missing import', "import './missing.js';"],
  ['missing require', "require('./missing.js');"],
  ['variable import', 'const name="./leaf.js"; import(name);'],
  ['variable require', 'const name="./leaf.js"; require(name);'],
  [
    'factory missing require',
    "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);require('./missing.cjs');",
  ],
  [
    'factory variable require',
    "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const target='./leaf.js';require(target);",
  ],
  [
    'factory unsupported base',
    "import {createRequire} from 'node:module';const require=createRequire('/different/owner.cjs');require('./leaf.js');",
  ],
  [
    'factory passed as value',
    "import {createRequire} from 'node:module';const factory=createRequire;const require=factory(import.meta.url);require('./leaf.js');",
  ],
  [
    'CommonJS factory unsupported base',
    "const {createRequire}=require('node:module');const load=createRequire(__filename);load('./leaf.js');",
  ],
  [
    'namespace factory unsupported base',
    "import nodeModule from 'module';const require=nodeModule.createRequire(new URL('../other.cjs',import.meta.url));require('./leaf.js');",
  ],
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

test('built CLI accepts ordinary changes that use a local require helper', async () => {
  const repo = await repository({ 'consumer.js': 'export const value=1;' });
  try {
    await repo.commit({
      'consumer.js':
        "function require(value) {return value;} const input='local'; export const value=require(input);",
    });
    const result = cli(repo.root);
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({ status: 0, stdout: 'consumer.js\n', stderr: '' });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI returns the consumer of a Node createRequire loader', async () => {
  const repo = await repository({
    'leaf.cjs': 'module.exports=1;',
    'consumer.mjs':
      "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);export const value=require('./leaf.cjs');",
  });
  try {
    await repo.commit({ 'leaf.cjs': 'module.exports=2;' });
    const result = cli(repo.root);
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({ status: 0, stdout: 'consumer.mjs\nleaf.cjs\n', stderr: '' });
  } finally {
    await repo.cleanup();
  }
});
