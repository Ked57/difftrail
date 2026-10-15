import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from '../../../tests/helpers.js';
import { withComparison } from '@difftrail/git';
import { extractGraph } from './index.js';
test('extracts real committed JS dependencies without current checkout changes', async () => {
  const repo = await repository({
    'leaf.js': 'export const leaf = 1;',
    'consumer.js': "import {leaf} from './leaf.js'; export {leaf};",
  });
  try {
    await repo.commit({ 'leaf.js': 'export const leaf = 2;' });
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(graph.edges).toEqual([
        {
          importer: 'consumer.js',
          dependency: 'leaf.js',
          specifier: './leaf.js',
          kind: 'import',
        },
      ]);
      expect(graph.revision).toBe(comparison.head);
    });
  } finally {
    await repo.cleanup();
  }
});

test('analyzes explicit tracked ignored and dependency-directory entries', async () => {
  const repo = await repository({
    '.gitignore': 'generated.js\nnode_modules/\n',
    '.hidden.js': 'export const x=1;',
    'generated.js': "export {x} from './.hidden.js';",
    'node_modules/tracked/index.js': "export {x} from '../../.hidden.js';",
  });
  try {
    // These files are intentionally tracked despite ignore rules.
    await mkdir(join(repo.root, 'node_modules/tracked'), { recursive: true });
    await writeFile(
      join(repo.root, 'generated.js'),
      "export {x} from './.hidden.js';",
    );
    await writeFile(
      join(repo.root, 'node_modules/tracked/index.js'),
      "export {x} from '../../.hidden.js';",
    );
    repo.git('add', '--force', 'generated.js', 'node_modules/tracked/index.js');
    repo.git('commit', '--quiet', '-m', 'tracked ignored files');
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges.map((edge) => [edge.importer, edge.dependency]).sort(),
      ).toEqual([
        ['generated.js', '.hidden.js'],
        ['node_modules/tracked/index.js', '.hidden.js'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});

test('cleans isolated snapshot storage after both successful and failed extraction callbacks', async () => {
  const repo = await repository({ 'file.js': 'export const value=1;' });
  try {
    await repo.commit({ 'file.js': 'export const value=2;' });
    let directory = '';
    await withComparison(repo.root, async (comparison) => {
      directory = comparison.headSnapshot.directory;
      await extractGraph(comparison.headSnapshot);
    });
    await expect(access(directory)).rejects.toThrow();
    await expect(
      withComparison(repo.root, async (comparison) => {
        directory = comparison.headSnapshot.directory;
        throw new Error('fixture failure');
      }),
    ).rejects.toThrow('fixture failure');
    await expect(access(directory)).rejects.toThrow();
  } finally {
    await repo.cleanup();
  }
});

test('distinguishes lexically bound require helpers from genuine CommonJS imports', async () => {
  const repo = await repository({
    'leaf.cjs': 'module.exports=1;',
    'loader.js': 'export function loader(value) {return value;}',
    'local.js':
      "function require(value) {return value;} const input='local'; export const value=require(input); require('./not-a-module.js');",
    'block.cjs':
      "{const require=value=>value; require('./not-a-module.js');} module.exports=require('./leaf.cjs');",
    'parameter.cjs':
      "function invoke(require, value) {require(value); require('./not-a-module.js');} const leaf=require('./leaf.cjs'); module.exports={invoke,leaf};",
    'imported.js':
      "import {loader as require} from './loader.js'; const input='local'; export const value=require(input); require('./not-a-module.js');",
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges.map((edge) => [edge.importer, edge.dependency]).sort(),
      ).toEqual([
        ['block.cjs', 'leaf.cjs'],
        ['imported.js', 'loader.js'],
        ['parameter.cjs', 'leaf.cjs'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});
