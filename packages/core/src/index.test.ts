import { expect, test } from 'vitest';
import { impactedPaths, selectExplanations, selectImpact } from './index.js';
test('retains seeds and reverse consumers through cycles without following imports', () => {
  expect(
    impactedPaths(
      ['leaf.js'],
      [
        { importer: 'middle.js', dependency: 'leaf.js' },
        { importer: 'page.js', dependency: 'middle.js' },
        { importer: 'middle.js', dependency: 'page.js' },
        { importer: 'leaf.js', dependency: 'unrelated.js' },
      ],
    ),
  ).toEqual(['leaf.js', 'middle.js', 'page.js']);
});

test('keeps isolated changed-file seeds and handles empty comparisons', () => {
  expect(impactedPaths(['asset.png', 'asset.png'], [])).toEqual(['asset.png']);
  expect(impactedPaths([], [])).toEqual([]);
});

test('unions separate endpoint closures without inventing cross-snapshot paths', () => {
  expect(
    selectImpact(
      ['a.js'],
      [{ importer: 'b.js', dependency: 'a.js' }],
      [{ importer: 'c.js', dependency: 'b.js' }],
      ['a.js', 'c.js'],
    ),
  ).toEqual({ files: ['a.js'], removed: ['b.js'] });
});

test('orders impacted paths independently of seed and graph insertion order', () => {
  expect(impactedPaths(['z.js', 'a.js'], [])).toEqual(['a.js', 'z.js']);
  expect(
    selectImpact(
      ['a.js'],
      [{ importer: 'z.js', dependency: 'a.js' }],
      [{ importer: 'b.js', dependency: 'a.js' }],
      ['a.js', 'b.js', 'z.js'],
    ),
  ).toEqual({ files: ['a.js', 'b.js', 'z.js'], removed: [] });
  expect(
    selectImpact(['z.js', 'b.js', 'a.js', 'c.js'], [], [], ['z.js', 'a.js']),
  ).toEqual({ files: ['a.js', 'z.js'], removed: ['b.js', 'c.js'] });
});

test('chooses shortest explanation chains with stable path and endpoint ties', () => {
  expect(
    selectExplanations(
      ['z-seed.js', 'a-seed.js'],
      [
        { importer: 'target.js', dependency: 'a-seed.js' },
        { importer: 'target.js', dependency: 'z-seed.js' },
        { importer: 'long.js', dependency: 'a-seed.js' },
        { importer: 'target.js', dependency: 'long.js' },
      ],
      ['z-seed.js', 'a-seed.js'],
      [
        { importer: 'target.js', dependency: 'z-seed.js' },
        { importer: 'target.js', dependency: 'a-seed.js' },
      ],
      ['target.js'],
    ),
  ).toEqual([
    {
      file: 'target.js',
      snapshot: 'head',
      chain: ['a-seed.js', 'target.js'],
    },
  ]);
});

test('keeps explanation chains inside one endpoint and orders explanation entries', () => {
  expect(
    selectExplanations(
      ['a.js', 'b.js'],
      [{ importer: 'b.js', dependency: 'a.js' }],
      ['b.js'],
      [{ importer: 'c.js', dependency: 'b.js' }],
      ['c.js'],
    ),
  ).toEqual([{ file: 'c.js', snapshot: 'head', chain: ['b.js', 'c.js'] }]);
});

test('omits a requested explanation when neither endpoint contains a witness', () => {
  expect(
    selectExplanations(['seed.js'], [], ['seed.js'], [], ['outside.js']),
  ).toEqual([]);
});

test('prefers a shorter base witness over a longer head witness', () => {
  expect(
    selectExplanations(
      ['seed.js'],
      [{ importer: 'target.js', dependency: 'seed.js' }],
      ['seed.js'],
      [
        { importer: 'middle.js', dependency: 'seed.js' },
        { importer: 'target.js', dependency: 'middle.js' },
      ],
      ['target.js'],
    ),
  ).toEqual([
    { file: 'target.js', snapshot: 'base', chain: ['seed.js', 'target.js'] },
  ]);
});
