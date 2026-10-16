import { spawnSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from './helpers.js';

const executable = resolve('packages/cli/dist/cli.js');
const aliasFixture = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { baseUrl: './src', paths: { '@/*': ['*'] } },
  }),
  'src/value.ts': 'export const value = 1;',
  'src/consumer.ts':
    "import {value} from '@/value'; export const result = value;",
  'Page.vue': '<template><img src="@/image.svg" /></template>',
  'src/image.svg': '<svg>real</svg>',
  'value.ts': 'export const value = 1;',
  'image.svg': '<svg>decoy</svg>',
  'independent.ts': 'export const independent = true;',
};

test('built CLI includes explicit-baseUrl source consumers in its exact result', async () => {
  const repo = await repository(aliasFixture);
  try {
    const base = repo.git('rev-parse', 'HEAD');
    const sourceHead = await repo.commit({
      'src/value.ts': 'export const value = 2;',
    });
    const sourceResult = spawnSync(
      process.execPath,
      [executable, '--base', base, '--head', sourceHead, '--json', '--explain'],
      { cwd: repo.root, encoding: 'utf8' },
    );
    expect(sourceResult.status).toBe(0);
    expect(sourceResult.stderr).toBe('');
    expect(JSON.parse(sourceResult.stdout)).toMatchObject({
      files: ['src/consumer.ts', 'src/value.ts'],
      removed: [],
      explanations: [
        {
          file: 'src/consumer.ts',
          chain: ['src/value.ts', 'src/consumer.ts'],
        },
        {
          file: 'src/value.ts',
          chain: ['src/value.ts'],
        },
      ],
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI includes explicit-baseUrl Vue asset consumers and ignores decoys', async () => {
  const repo = await repository(aliasFixture);
  try {
    const base = repo.git('rev-parse', 'HEAD');
    const sourceDecoyHead = await repo.commit({
      'value.ts': 'export const value = 2;',
    });
    const sourceDecoyResult = spawnSync(
      process.execPath,
      [executable, '--base', base, '--head', sourceDecoyHead],
      { cwd: repo.root, encoding: 'utf8' },
    );
    expect(sourceDecoyResult.status).toBe(0);
    expect(sourceDecoyResult.stdout).toBe('value.ts\n');

    const assetHead = await repo.commit({
      'src/image.svg': '<svg>updated</svg>',
    });
    const assetResult = spawnSync(
      process.execPath,
      [
        executable,
        '--base',
        sourceDecoyHead,
        '--head',
        assetHead,
        '--json',
        '--explain',
      ],
      { cwd: repo.root, encoding: 'utf8' },
    );
    expect(assetResult.status).toBe(0);
    expect(assetResult.stderr).toBe('');
    expect(JSON.parse(assetResult.stdout)).toMatchObject({
      files: ['Page.vue', 'src/image.svg'],
      removed: [],
      explanations: [
        {
          file: 'Page.vue',
          chain: ['src/image.svg', 'Page.vue'],
        },
        {
          file: 'src/image.svg',
          chain: ['src/image.svg'],
        },
      ],
    });

    const decoyHead = await repo.commit({ 'image.svg': '<svg>changed</svg>' });
    const decoyResult = spawnSync(
      process.execPath,
      [executable, '--base', assetHead, '--head', decoyHead],
      { cwd: repo.root, encoding: 'utf8' },
    );
    expect(decoyResult.status).toBe(0);
    expect(decoyResult.stdout).toBe('image.svg\n');
  } finally {
    await repo.cleanup();
  }
});

test('built CLI keeps endpoint alias targets independent after baseUrl changes', async () => {
  const repo = await repository({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: './src/current', paths: { '@/*': ['*'] } },
    }),
    'src/current/value.ts': 'export const value = 1;',
    'src/alternate/value.ts': 'export const value = 2;',
    'src/consumer.ts':
      "import {value} from '@/value'; export const result = value;",
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    const head = await repo.commit({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: './src/alternate',
          paths: { '@/*': ['*'] },
        },
      }),
    });
    const result = spawnSync(
      process.execPath,
      [executable, '--base', base, '--head', head, '--json', '--explain'],
      { cwd: repo.root, encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      files: [
        'src/alternate/value.ts',
        'src/consumer.ts',
        'src/current/value.ts',
        'tsconfig.json',
      ],
      removed: [],
    });
    expect(JSON.parse(result.stdout).explanations).toContainEqual({
      file: 'src/consumer.ts',
      snapshot: 'head',
      chain: ['tsconfig.json', 'src/consumer.ts'],
    });
    expect(JSON.parse(result.stdout).root).toBe(await realpath(repo.root));
  } finally {
    await repo.cleanup();
  }
});
