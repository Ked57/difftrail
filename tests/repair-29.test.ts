import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
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

test('built CLI returns exact inline video, poster, and unrelated asset impacts', async () => {
  const repo = await repository({
    'Owner.vue': [
      '<template><video src="./movie.mp4" poster="./poster.png"></video></template>',
    ].join(''),
    'Consumer.vue': [
      '<script setup>import Owner from "./Owner.vue";</script>',
      '<template><Owner /></template>',
    ].join(''),
    'Unrelated.vue':
      '<template><video src="./unrelated.mp4"></video></template>',
    'movie.mp4': 'movie before',
    'poster.png': 'poster before',
    'unrelated.mp4': 'unrelated before',
  });
  try {
    const root = await realpath(repo.root);
    let base = repo.git('rev-parse', 'HEAD');
    let head = await repo.commit({ 'movie.mp4': 'movie after' });
    expect(
      JSON.parse(
        cli(repo.root, '--base', base, '--head', head, '--json').stdout,
      ),
    ).toMatchObject({
      root,
      base,
      head,
      files: ['Consumer.vue', 'Owner.vue', 'movie.mp4'],
      removed: [],
    });

    base = head;
    head = await repo.commit({ 'poster.png': 'poster after' });
    expect(
      JSON.parse(
        cli(repo.root, '--base', base, '--head', head, '--json').stdout,
      ),
    ).toMatchObject({
      base,
      head,
      files: ['Consumer.vue', 'Owner.vue', 'poster.png'],
      removed: [],
    });

    base = head;
    head = await repo.commit({ 'unrelated.mp4': 'unrelated after' });
    expect(
      JSON.parse(
        cli(repo.root, '--base', base, '--head', head, '--json').stdout,
      ),
    ).toMatchObject({
      base,
      head,
      files: ['Unrelated.vue', 'unrelated.mp4'],
      removed: [],
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI resolves an external video source relative to its template and excludes a decoy', async () => {
  const repo = await repository({
    'Owner.vue': '<template src="./templates/player.html"></template>',
    'Consumer.vue': '<script setup>import Owner from "./Owner.vue";</script>',
    'templates/player.html': '<video src="./media/movie.mp4#t=3"></video>',
    'templates/media/movie.mp4': 'movie before',
    'media/movie.mp4': 'decoy',
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    const head = await repo.commit({
      'templates/media/movie.mp4': 'movie after',
    });
    const result = cli(repo.root, '--base', base, '--head', head, '--json');
    expect({
      status: result.status,
      files: JSON.parse(result.stdout).files,
    }).toEqual({
      status: 0,
      files: [
        'Consumer.vue',
        'Owner.vue',
        'templates/media/movie.mp4',
        'templates/player.html',
      ],
    });
    const decoyChange = await repo.commit({ 'media/movie.mp4': 'decoy after' });
    expect(cli(repo.root, '--base', head, '--head', decoyChange).stdout).toBe(
      'media/movie.mp4\n',
    );
  } finally {
    await repo.cleanup();
  }
});

test.each([
  ['missing', '<video src="./missing.mp4"></video>'],
  ['dynamic', '<video :src="movie"></video>'],
])(
  'built CLI fails atomically on a %s video source gap',
  async (_name, template) => {
    const repo = await repository({
      'Owner.vue': `<template>${template}</template>`,
      'movie.mp4': 'movie',
    });
    try {
      const head = repo.git('rev-parse', 'HEAD');
      const result = cli(repo.root, '--json');
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(`Owner.vue at ${head}`);
    } finally {
      await repo.cleanup();
    }
  },
);

test('built CLI reports a dynamic source gap from an external template with its endpoint', async () => {
  const repo = await repository({
    'Owner.vue': '<template src="./player.html"></template>',
    'player.html': '<video :src="movie"></video>',
  });
  try {
    const head = repo.git('rev-parse', 'HEAD');
    const result = cli(repo.root, '--json');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(`player.html at ${head}`);
    expect(result.stderr).toContain(
      'dynamic template asset requires static resolution',
    );
  } finally {
    await repo.cleanup();
  }
});

test('built CLI reports a repaired base-only video gap despite a filter excluding its owner', async () => {
  const repo = await repository({
    'Owner.vue': '<template><video :src="movie"></video></template>',
    'movie.mp4': 'movie before',
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    const head = await repo.commit({
      'Owner.vue': '<template><video src="./movie.mp4"></video></template>',
      'movie.mp4': 'movie after',
    });
    const result = cli(
      repo.root,
      '--base',
      base,
      '--head',
      head,
      '--json',
      '--filter',
      'never-matches',
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(`Owner.vue at ${base}`);
  } finally {
    await repo.cleanup();
  }
});

test('built CLI retains base video impact when the movie and its reference are removed together', async () => {
  const repo = await repository({
    'Owner.vue': '<template><video src="./movie.mp4"></video></template>',
    'Consumer.vue': '<script setup>import Owner from "./Owner.vue";</script>',
    'movie.mp4': 'movie',
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    repo.git('rm', 'movie.mp4');
    const head = await repo.commit({
      'Owner.vue': '<template><main /></template>',
    });
    const result = cli(repo.root, '--base', base, '--head', head, '--json');
    expect(JSON.parse(result.stdout)).toMatchObject({
      base,
      head,
      files: ['Consumer.vue', 'Owner.vue'],
      removed: ['movie.mp4'],
    });
  } finally {
    await repo.cleanup();
  }
});
