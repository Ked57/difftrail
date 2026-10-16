import { spawnSync } from 'node:child_process';
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

test('built CLI returns Vue createRequire provider and consumers from its directory', async () => {
  const repo = await repository({
    'nested/provider.cjs': 'module.exports = true;',
    'provider.cjs': 'module.exports = false;',
    'nested/Widget.vue':
      '<script setup>import { createRequire as makeRequire } from "node:module"; const load = makeRequire(import.meta.url); load("./provider.cjs");</script>',
    'Page.vue':
      '<script setup>import Widget from "./nested/Widget.vue";</script>',
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    const head = await repo.commit({
      'nested/provider.cjs': 'module.exports = 2;',
    });
    expect(cli(repo.root, '--base', base, '--head', head)).toMatchObject({
      status: 0,
      stdout: 'Page.vue\nnested/Widget.vue\nnested/provider.cjs\n',
      stderr: '',
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI emits no result when a filtered Vue component has an unsupported factory base', async () => {
  const repo = await repository({
    'provider.cjs': 'module.exports = true;',
    'Widget.vue':
      '<script setup>import { createRequire } from "node:module"; const load = createRequire("/other/file.cjs"); load("./provider.cjs");</script>',
  });
  try {
    const head = repo.git('rev-parse', 'HEAD');
    const result = cli(
      repo.root,
      '--base',
      head,
      '--head',
      head,
      '--filter',
      'never-matches',
    );
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 1,
      stdout: '',
      stderr: expect.stringContaining(`Analysis gap in Widget.vue at ${head}`),
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI rejects an unsupported base endpoint even after the component is repaired at head', async () => {
  const repo = await repository({
    'provider.cjs': 'module.exports = true;',
    'Widget.vue':
      '<script setup>import { createRequire } from "node:module"; const load = createRequire("/other/file.cjs"); load("./provider.cjs");</script>',
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    await repo.commit({
      'Widget.vue':
        '<script setup>import { createRequire } from "node:module"; const load = createRequire(import.meta.url); load("./provider.cjs");</script>',
    });
    const head = repo.git('rev-parse', 'HEAD');
    const result = cli(
      repo.root,
      '--base',
      base,
      '--head',
      head,
      '--filter',
      'never-matches',
    );
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 1,
      stdout: '',
      stderr: expect.stringContaining(`Analysis gap in Widget.vue at ${base}`),
    });
  } finally {
    await repo.cleanup();
  }
});
