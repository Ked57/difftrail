import { expect, test } from 'vitest';
import { realpath } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { repository } from './helpers.js';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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

test('built CLI emits exact NUL output and rejects incompatible options atomically', async () => {
  const repo = await repository({
    'space name.md': 'base',
    'é.md': 'base',
    '.hidden.md': 'base',
    ...(process.platform === 'win32' ? {} : { 'back\\slash.md': 'base' }),
    'src/é.md': 'base',
  });
  try {
    await repo.commit({
      'space name.md': 'head',
      'é.md': 'head',
      '.hidden.md': 'head',
      ...(process.platform === 'win32' ? {} : { 'back\\slash.md': 'head' }),
      'src/é.md': 'head',
    });
    const expected =
      process.platform === 'win32'
        ? '.hidden.md\0space name.md\0src/é.md\0é.md\0'
        : '.hidden.md\0back\\slash.md\0space name.md\0src/é.md\0é.md\0';
    expect(cli(repo.root, '--null')).toMatchObject({
      status: 0,
      stdout: expected,
      stderr: '',
    });
    expect(
      cli(repo.root, '--filter', 'é.md', '--filter', '.hidden.md'),
    ).toMatchObject({
      status: 0,
      stdout: '.hidden.md\né.md\n',
      stderr: '',
    });
    expect(cli(repo.root, '--filter', '**/é.md').stdout).toBe(
      'src/é.md\né.md\n',
    );
    expect(cli(repo.root, '--filter', '?.md').stdout).toBe('é.md\n');
    expect(cli(repo.root, '--filter', '*.md').stdout).toBe(
      process.platform === 'win32'
        ? '.hidden.md\nspace name.md\né.md\n'
        : '.hidden.md\nback\\slash.md\nspace name.md\né.md\n',
    );
    for (const args of [
      ['--json', '--null'],
      ['--explain'],
      ['--null', '--null'],
      ['--filter'],
      ['--filter', '!*.md'],
    ]) {
      const invalid = cli(repo.root, ...args);
      expect(invalid.status).toBe(2);
      expect(invalid.stdout).toBe('');
      expect(invalid.stderr).not.toBe('');
    }
    const missingFilter = cli(repo.root, '--filter');
    expect(missingFilter.status).toBe(2);
    expect(missingFilter.stderr).toContain('filter pattern after --filter');
  } finally {
    await repo.cleanup();
  }
});

test('built CLI keeps filtered intermediate paths in a transitive explanation', async () => {
  const repo = await repository({
    'shared.js': 'export const value=1;',
    'middle.js': "export {value} from './shared.js';",
    'page.js': "export {value} from './middle.js';",
    'independent.js': 'export const independent=1;',
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    const changedShared = await repo.commit({
      'shared.js': 'export const value=2;',
    });
    const filtered = cli(
      repo.root,
      '--base',
      base,
      '--head',
      changedShared,
      '--json',
      '--explain',
      '--filter',
      '**/page.js',
    );
    expect(JSON.parse(filtered.stdout)).toMatchObject({
      files: ['page.js'],
      removed: [],
      explanations: [
        {
          file: 'page.js',
          snapshot: 'head',
          chain: ['shared.js', 'middle.js', 'page.js'],
        },
      ],
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI filters removed paths and explains them from the base snapshot', async () => {
  const repo = await repository({
    'old.js': 'export const value=1;',
    'page.js': "export {value} from './old.js';",
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    repo.git('rm', 'old.js');
    const head = await repo.commit({ 'page.js': 'export const value=2;' });
    const result = cli(
      repo.root,
      '--base',
      base,
      '--head',
      head,
      '--json',
      '--explain',
      '--filter',
      'page.js',
      '--filter',
      'old.js',
    );
    expect(JSON.parse(result.stdout)).toEqual({
      root: await realpath(repo.root),
      base,
      head,
      scope: 'static',
      files: ['page.js'],
      removed: ['old.js'],
      explanations: [
        { file: 'old.js', snapshot: 'base', chain: ['old.js'] },
        { file: 'page.js', snapshot: 'head', chain: ['page.js'] },
      ],
    });
  } finally {
    await repo.cleanup();
  }
});

// Windows filesystems reject CR and LF in path components, so these exact
// path-serialization cases are runnable only on hosts that can create them.
test.skipIf(process.platform === 'win32')(
  'built CLI handles selected paths containing line breaks without partial output',
  async () => {
    const repo = await repository({ 'base.md': 'base' });
    try {
      await repo.commit({
        'line\nbreak.md': 'changed',
        'carriage\rreturn.md': 'changed',
      });
      const lineResult = cli(repo.root);
      expect(lineResult.status).toBe(2);
      expect(lineResult.stdout).toBe('');
      expect(lineResult.stderr).toContain('--json');
      expect(lineResult.stderr).toContain('--null');
      expect(JSON.parse(cli(repo.root, '--json').stdout).files).toContain(
        'line\nbreak.md',
      );
      expect(cli(repo.root, '--null').stdout).toContain('line\nbreak.md\0');
      expect(JSON.parse(cli(repo.root, '--json').stdout).files).toContain(
        'carriage\rreturn.md',
      );
      expect(cli(repo.root, '--null').stdout).toContain(
        'carriage\rreturn.md\0',
      );
      expect(cli(repo.root, '--filter', 'base.md').stdout).toBe('');
      expect(
        JSON.parse(cli(repo.root, '--json', '--filter', '**/line*').stdout)
          .files,
      ).toEqual(['line\nbreak.md']);
    } finally {
      await repo.cleanup();
    }
  },
);

test.skipIf(process.platform === 'win32')(
  'recursive filters preserve paths through newline directory components',
  async () => {
    const repo = await repository({ 'before.md': 'base' });
    try {
      const base = repo.git('rev-parse', 'HEAD');
      const head = await repo.commit({ 'dir\nname/page.md': 'changed' });
      const expectedJson =
        JSON.stringify({
          root: await realpath(repo.root),
          base,
          head,
          scope: 'static',
          files: ['dir\nname/page.md'],
          removed: [],
        }) + '\n';
      expect(cli(repo.root, '--json', '--filter', '**/page.md')).toMatchObject({
        status: 0,
        stdout: expectedJson,
        stderr: '',
      });
      expect(cli(repo.root, '--null', '--filter', '**/page.md')).toMatchObject({
        status: 0,
        stdout: 'dir\nname/page.md\0',
        stderr: '',
      });
    } finally {
      await repo.cleanup();
    }
  },
);
