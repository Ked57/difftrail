import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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

test('built CLI keeps dangling and external opaque symlink paths as root seeds', async () => {
  const repo = await repository({ 'README.md': 'tracked seed' });
  try {
    await symlink('missing-local.txt', join(repo.root, 'dangling.txt'));
    await symlink('../outside.txt', join(repo.root, 'external.txt'));
    repo.git('add', 'dangling.txt', 'external.txt');
    repo.git('commit', '--quiet', '-m', 'track opaque links');
    const result = cli(repo.root, '--json');
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).files).toEqual([
      'dangling.txt',
      'external.txt',
    ]);
  } finally {
    await repo.cleanup();
  }
});

test('built CLI retains opaque symlink add and delete seed paths', async () => {
  const repo = await repository({ 'README.md': 'tracked seed' });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    await symlink('missing.txt', join(repo.root, 'dangling.txt'));
    await symlink('../outside.txt', join(repo.root, 'external.txt'));
    repo.git('add', 'dangling.txt', 'external.txt');
    repo.git('commit', '--quiet', '-m', 'add opaque links');
    const added = repo.git('rev-parse', 'HEAD');
    const addedResult = cli(
      repo.root,
      '--base',
      base,
      '--head',
      added,
      '--json',
    );
    if (addedResult.status !== 0) throw new Error(JSON.stringify(addedResult));
    expect({
      status: addedResult.status,
      stdout: addedResult.stdout,
      stderr: addedResult.stderr,
    }).toMatchObject({ status: 0 });
    expect(JSON.parse(addedResult.stdout)).toMatchObject({
      files: ['dangling.txt', 'external.txt'],
      removed: [],
    });
    repo.git('rm', '--quiet', 'dangling.txt');
    repo.git('commit', '--quiet', '-m', 'delete dangling link');
    const deleted = repo.git('rev-parse', 'HEAD');
    expect(
      JSON.parse(
        cli(repo.root, '--base', added, '--head', deleted, '--json').stdout,
      ),
    ).toMatchObject({ files: [], removed: ['dangling.txt'] });
  } finally {
    await repo.cleanup();
  }
});

test.each([
  ['dangling', 'missing-local.js'],
  ['external', '../outside.js'],
  ['cyclic', 'entry.js'],
])(
  'built CLI fails atomically for a %s tracked source symlink',
  async (_kind, target) => {
    const repo = await repository({ 'README.md': 'tracked seed' });
    try {
      await symlink(target, join(repo.root, 'entry.js'));
      repo.git('add', 'entry.js');
      repo.git('commit', '--quiet', '-m', 'track source link');
      const head = repo.git('rev-parse', 'HEAD');
      const result = cli(repo.root, '--json');
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(head);
      expect(result.stderr).toContain('entry.js');
      expect(result.stderr).toMatch(/no tracked target|unsafe target|cycle/);
    } finally {
      await repo.cleanup();
    }
  },
);

// Windows filesystems cannot represent a literal backslash inside a filename.
test.skipIf(process.platform === 'win32')(
  'built CLI parses and explains a standalone literal-backslash TypeScript source',
  async () => {
    const repo = await repository({
      'deps/leaf.ts': 'export const leaf = 1;\n',
      'odd/back\\slash.ts':
        "import {leaf} from '../deps/leaf'; export const value = leaf;\n",
    });
    try {
      const base = repo.git('rev-parse', 'HEAD');
      await writeFile(
        join(repo.root, 'deps/leaf.ts'),
        'export const leaf = 2;\n',
      );
      repo.git('add', '--all');
      repo.git('commit', '--quiet', '-m', 'change imported dependency');
      const head = repo.git('rev-parse', 'HEAD');
      const result = cli(
        repo.root,
        '--base',
        base,
        '--head',
        head,
        '--json',
        '--explain',
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const output = JSON.parse(result.stdout);
      expect(output.files).toEqual(['deps/leaf.ts', 'odd/back\\slash.ts']);
      expect(
        output.explanations.find(
          (item: { file: string }) => item.file === 'odd/back\\slash.ts',
        ).chain,
      ).toEqual(['deps/leaf.ts', 'odd/back\\slash.ts']);
    } finally {
      await repo.cleanup();
    }
  },
);

test.skipIf(process.platform === 'win32')(
  'built CLI preserves literal backslashes in source identity and dependency closure',
  async () => {
    const repo = await repository({
      'deps/back.ts': 'export const back = 1;\n',
      'deps/slash.ts': 'export const slash = 1;\n',
      'odd/back\\slash.ts':
        "import {back} from '../deps/back'; export const value = back;\n",
      'odd/back/slash.ts':
        "import {slash} from '../../deps/slash'; export const value = slash;\n",
    });
    try {
      const base = repo.git('rev-parse', 'HEAD');
      await writeFile(
        join(repo.root, 'deps/back.ts'),
        'export const back = 2;\n',
      );
      repo.git('add', '--all');
      repo.git('commit', '--quiet', '-m', 'change back dependency');
      const backHead = repo.git('rev-parse', 'HEAD');
      const result = cli(
        repo.root,
        '--base',
        base,
        '--head',
        backHead,
        '--json',
        '--explain',
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const output = JSON.parse(result.stdout);
      expect(output.files).toEqual(['deps/back.ts', 'odd/back\\slash.ts']);
      expect(
        output.explanations.find(
          (item: { file: string }) => item.file === 'odd/back\\slash.ts',
        ).chain,
      ).toEqual(['deps/back.ts', 'odd/back\\slash.ts']);

      await writeFile(
        join(repo.root, 'deps/slash.ts'),
        'export const slash = 2;\n',
      );
      repo.git('add', '--all');
      repo.git('commit', '--quiet', '-m', 'change slash dependency');
      const slashHead = repo.git('rev-parse', 'HEAD');
      const slashResult = cli(
        repo.root,
        '--base',
        backHead,
        '--head',
        slashHead,
        '--json',
        '--explain',
      );
      expect(slashResult.status).toBe(0);
      expect(slashResult.stderr).toBe('');
      const slashOutput = JSON.parse(slashResult.stdout);
      expect(slashOutput.files).toEqual(['deps/slash.ts', 'odd/back/slash.ts']);
      expect(slashOutput.files).not.toContain('odd/back\\slash.ts');
      expect(
        slashOutput.explanations.find(
          (item: { file: string }) => item.file === 'odd/back/slash.ts',
        ).chain,
      ).toEqual(['deps/slash.ts', 'odd/back/slash.ts']);
    } finally {
      await repo.cleanup();
    }
  },
);

test('built CLI reports a Git submodule entry without fetching it', async () => {
  const repo = await repository({ 'README.md': 'tracked seed' });
  try {
    repo.git(
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${'a'.repeat(40)},vendor/submodule`,
    );
    const head = repo.git('commit', '--quiet', '-m', 'track submodule');
    const result = cli(repo.root, '--json');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(head);
    expect(result.stderr).toContain('Git submodule entry vendor/submodule');
  } finally {
    await repo.cleanup();
  }
});

test.each([
  {
    name: 'direct',
    chained: false,
    impacted: ['aliases/direct.ts', 'consumer.ts', 'real/actual.ts'],
    consumerChain: ['real/actual.ts', 'aliases/direct.ts', 'consumer.ts'],
  },
  {
    name: 'chained',
    chained: true,
    impacted: [
      'aliases/chained.ts',
      'aliases/direct.ts',
      'consumer.ts',
      'real/actual.ts',
    ],
    consumerChain: [
      'real/actual.ts',
      'aliases/direct.ts',
      'aliases/chained.ts',
      'consumer.ts',
    ],
  },
])(
  'built CLI propagates referent changes through $name symlink chains',
  async ({ name, chained, impacted, consumerChain }) => {
    const repo = await repository({
      'real/actual.ts': 'export const value = 1;\n',
      'consumer.ts': 'export const value = 1;\n',
      'unrelated.ts': 'export const unrelated = 1;\n',
    });
    try {
      await mkdir(join(repo.root, 'aliases'), { recursive: true });
      await symlink('../real/actual.ts', join(repo.root, 'aliases/direct.ts'));
      if (chained)
        await symlink('direct.ts', join(repo.root, 'aliases/chained.ts'));
      const imported = chained ? 'chained' : 'direct';
      await writeFile(
        join(repo.root, 'consumer.ts'),
        `import {value} from './aliases/${imported}'; console.log(value);\n`,
      );
      repo.git('add', '--all');
      repo.git('commit', '--quiet', '-m', `${name} symlink baseline`);
      const base = repo.git('rev-parse', 'HEAD');
      await writeFile(
        join(repo.root, 'real/actual.ts'),
        'export const value = 2;\n',
      );
      repo.git('add', '--all');
      repo.git('commit', '--quiet', '-m', 'change symlink referent');
      const head = repo.git('rev-parse', 'HEAD');
      const result = cli(
        repo.root,
        '--base',
        base,
        '--head',
        head,
        '--json',
        '--explain',
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const output = JSON.parse(result.stdout);
      expect(output.files).toEqual(impacted);
      expect(output.files).not.toContain('unrelated.ts');
      expect(
        output.explanations.find(
          (item: { file: string }) => item.file === 'consumer.ts',
        ).chain,
      ).toEqual(consumerChain);
    } finally {
      await repo.cleanup();
    }
  },
);
