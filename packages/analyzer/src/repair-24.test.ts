import { rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { withComparison } from '@difftrail/git';
import { repository } from '../../../tests/helpers.js';
import { extractGraph } from './index.js';

test('resolves aliased source links to their tracked identity and endpoint target', async () => {
  const repo = await repository({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '@/*': ['*'] } },
    }),
    'first.ts': 'export const value = 1;',
    'second.ts': 'export const value = 2;',
    'selected.ts': 'placeholder',
    'sibling.ts': 'placeholder',
    'consumer.ts': "import {value} from '@/selected'; export {value};",
    'unrelated.ts': 'export const unrelated = 1;',
  });
  try {
    await rm(join(repo.root, 'selected.ts'));
    await rm(join(repo.root, 'sibling.ts'));
    await symlink('first.ts', join(repo.root, 'selected.ts'));
    await symlink('first.ts', join(repo.root, 'sibling.ts'));
    repo.git('add', '--all');
    repo.git('commit', '--quiet', '-m', 'track links');
    const base = repo.git('rev-parse', 'HEAD');

    await rm(join(repo.root, 'selected.ts'));
    await symlink('second.ts', join(repo.root, 'selected.ts'));
    repo.git('add', '--all');
    repo.git('commit', '--quiet', '-m', 'retarget selected link');
    const retargeted = repo.git('rev-parse', 'HEAD');
    await withComparison(repo.root, async (comparison) => {
      const baseGraph = await extractGraph(comparison.baseSnapshot);
      const headGraph = await extractGraph(comparison.headSnapshot);
      expect(
        baseGraph.edges.filter((edge) => edge.importer === 'consumer.ts'),
      ).toContainEqual({
        importer: 'consumer.ts',
        dependency: 'selected.ts',
        specifier: '@/selected',
        kind: 'import',
      });
      expect(
        baseGraph.edges.filter((edge) => edge.importer === 'consumer.ts'),
      ).not.toContainEqual(expect.objectContaining({ dependency: 'first.ts' }));
      expect(baseGraph.edges).toContainEqual({
        importer: 'selected.ts',
        dependency: 'first.ts',
        specifier: 'first.ts',
        kind: 'symlink',
      });
      expect(
        headGraph.edges.filter((edge) => edge.importer === 'consumer.ts'),
      ).toContainEqual({
        importer: 'consumer.ts',
        dependency: 'selected.ts',
        specifier: '@/selected',
        kind: 'import',
      });
      expect(headGraph.edges).toContainEqual({
        importer: 'selected.ts',
        dependency: 'second.ts',
        specifier: 'second.ts',
        kind: 'symlink',
      });
    });
    expect(base).not.toBe(retargeted);
  } finally {
    await repo.cleanup();
  }
});
