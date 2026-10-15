import { expect, test } from 'vitest';
import { impactedPaths, selectImpact } from './index.js';
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
