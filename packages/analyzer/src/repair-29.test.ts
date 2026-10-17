import { expect, test } from 'vitest';
import { repository } from '../../../tests/helpers.js';
import { withComparison } from '@difftrail/git';
import { extractGraph } from './index.js';

test('extracts inline and external video sources relative to their template files', async () => {
  const repo = await repository({
    'App.vue': [
      '<template><video src="./media/inline.mp4?download#start" poster="./poster.png"><source src="./media/alternate.webm" /></video><audio src="./media/sound.ogg"><track src="./media/captions.vtt" /></audio><img src="./cover.png" /></template>',
    ].join(''),
    'External.vue': '<template src="./templates/player.html"></template>',
    'templates/player.html': '<video src="./media/clip.mp4#t=1"></video>',
    'media/inline.mp4': 'inline',
    'media/alternate.webm': 'alternate',
    'media/sound.ogg': 'sound',
    'media/captions.vtt': 'captions',
    'media/clip.mp4': 'decoy',
    'templates/media/clip.mp4': 'clip',
    'poster.png': 'poster',
    'cover.png': 'cover',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) => edge.kind === 'template-asset')
          .map((edge) => [edge.importer, edge.specifier, edge.dependency])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([
        ['App.vue', './cover.png', 'cover.png'],
        ['App.vue', './media/alternate.webm', 'media/alternate.webm'],
        ['App.vue', './media/captions.vtt', 'media/captions.vtt'],
        ['App.vue', './media/inline.mp4?download#start', 'media/inline.mp4'],
        ['App.vue', './media/sound.ogg', 'media/sound.ogg'],
        ['App.vue', './poster.png', 'poster.png'],
        [
          'templates/player.html',
          './media/clip.mp4#t=1',
          'templates/media/clip.mp4',
        ],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('reports a dynamic video source in an external template as a revisioned gap', async () => {
  const repo = await repository({
    'Player.vue': '<template src="./player.html"></template>',
    'player.html': '<video :src="movie"></video>',
  });
  try {
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        `Analysis gap in player.html at ${comparison.head}: dynamic template asset requires static resolution`,
      ),
    );
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test.each([
  ['missing', '<video src="./missing.mp4"></video>'],
  ['dynamic', '<video :src="movie"></video>'],
])(
  'reports an inline %s video source as a revisioned gap',
  async (_name, template) => {
    const repo = await repository({
      'Player.vue': `<template>${template}</template>`,
    });
    try {
      await withComparison(repo.root, async (comparison) =>
        expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
          `Analysis gap in Player.vue at ${comparison.head}`,
        ),
      );
    } finally {
      await repo.cleanup();
    }
  },
  30_000,
);

test('keeps terminal video URLs and fragments out of repository edges', async () => {
  const repo = await repository({
    'Player.vue': [
      '<template>',
      '<video src="https://cdn.example/movie.mp4"></video>',
      '<video src="data:video/mp4;base64,AAAA"></video>',
      '<video src="#media-fragment"></video>',
      '</template>',
    ].join(''),
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      expect(await extractGraph(comparison.headSnapshot)).toEqual({
        revision: comparison.head,
        edges: [],
      });
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('resolves root and committed alias video sources after suffixes', async () => {
  const repo = await repository({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '@media/*': ['assets/*'] } },
    }),
    'Player.vue': [
      '<template>',
      '<video src="/movies/root.mp4?download"></video>',
      '<video src="@media/clip.mp4#t=2"></video>',
      '</template>',
    ].join(''),
    'movies/root.mp4': 'root',
    'assets/clip.mp4': 'alias',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      expect(
        (await extractGraph(comparison.headSnapshot)).edges
          .filter((edge) => edge.kind === 'template-asset')
          .map((edge) => [edge.importer, edge.specifier, edge.dependency])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([
        ['Player.vue', '@media/clip.mp4#t=2', 'assets/clip.mp4'],
        ['Player.vue', '/movies/root.mp4?download', 'movies/root.mp4'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);
