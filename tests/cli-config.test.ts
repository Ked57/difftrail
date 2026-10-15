import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from './helpers.js';

const executable = resolve('packages/cli/dist/cli.js');

test('built CLI includes TypeScript import-equals consumers', async () => {
  const repo = await repository({
    'leaf.ts': 'export const value = 1;',
    'consumer.ts':
      "import leaf = require('./leaf'); export const result = leaf.value;",
  });
  try {
    await repo.commit({ 'leaf.ts': 'export const value = 2;' });
    const result = spawnSync(process.execPath, [executable], {
      cwd: repo.root,
      encoding: 'utf8',
    });
    expect(result).toMatchObject({
      status: 0,
      stdout: 'consumer.ts\nleaf.ts\n',
      stderr: '',
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI includes TypeScript import type query consumers', async () => {
  const repo = await repository({
    'leaf.ts': 'export interface Leaf {value: number}',
    'consumer.ts':
      "type Leaf = import('./leaf').Leaf; export const result: Leaf = {value: 1};",
  });
  try {
    await repo.commit({ 'leaf.ts': 'export interface Leaf {value: string}' });
    const result = spawnSync(process.execPath, [executable], {
      cwd: repo.root,
      encoding: 'utf8',
    });
    expect(result).toMatchObject({
      status: 0,
      stdout: 'consumer.ts\nleaf.ts\n',
      stderr: '',
    });
  } finally {
    await repo.cleanup();
  }
});

test('config-only alias changes reach configured consumers and exclude another package', async () => {
  const repo = await repository({
    'base.json': JSON.stringify({
      compilerOptions: { paths: { '@a/*': ['packages/a/src/current/*'] } },
    }),
    'packages/a/tsconfig.json': JSON.stringify({ extends: '../../base.json' }),
    'packages/a/src/current/value.ts': 'export const value = 1;',
    'packages/a/src/alternate/value.ts': 'export const value = 2;',
    'packages/a/src/consumer.ts':
      "import {value} from '@a/value'; export const page = value;",
    'packages/b/tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '@b/*': ['src/*'] } },
    }),
    'packages/b/src/value.ts': 'export const value = 3;',
    'packages/b/src/consumer.ts':
      "import {value} from '@b/value'; export const page = value;",
  });
  try {
    await repo.commit({
      'base.json': JSON.stringify({
        compilerOptions: { paths: { '@a/*': ['packages/a/src/alternate/*'] } },
      }),
    });
    const result = spawnSync(process.execPath, [executable], {
      cwd: repo.root,
      encoding: 'utf8',
    });
    expect(result).toMatchObject({
      status: 0,
      stdout:
        [
          'base.json',
          'packages/a/src/alternate/value.ts',
          'packages/a/src/consumer.ts',
          'packages/a/src/current/value.ts',
        ].join('\n') + '\n',
      stderr: '',
    });
    expect(result.stdout).not.toContain('packages/b/');
  } finally {
    await repo.cleanup();
  }
});
