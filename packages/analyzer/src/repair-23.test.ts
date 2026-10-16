import { expect, test } from 'vitest';
import { repository } from '../../../tests/helpers.js';
import { withComparison } from '@difftrail/git';
import { extractGraph } from './index.js';

test('resolves source and Vue asset aliases from an explicit baseUrl', async () => {
  const repo = await repository({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        baseUrl: './src',
        paths: { '@/*': ['*'] },
      },
    }),
    'src/value.ts': 'export const value = 1;',
    'src/consumer.ts':
      "import {value} from '@/value'; export const result = value;",
    'Page.vue': '<template><img src="@/image.svg" /></template>',
    'src/image.svg': '<svg />',
    'independent.ts': 'export const independent = true;',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) =>
            ['src/consumer.ts', 'Page.vue'].includes(edge.importer),
          )
          .map((edge) => [
            edge.importer,
            edge.specifier,
            edge.dependency,
            edge.kind,
          ])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([
        ['Page.vue', '@/image.svg', 'src/image.svg', 'template-asset'],
        ['Page.vue', 'tsconfig.json', 'tsconfig.json', 'configuration'],
        ['src/consumer.ts', '@/value', 'src/value.ts', 'import'],
        ['src/consumer.ts', 'tsconfig.json', 'tsconfig.json', 'configuration'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('keeps an inherited explicit baseUrl relative to its declaring config', async () => {
  const repo = await repository({
    'base.json': JSON.stringify({
      compilerOptions: {
        baseUrl: './src',
        paths: { '@/*': ['*'] },
      },
    }),
    'packages/app/tsconfig.json': JSON.stringify({
      extends: '../../base.json',
    }),
    'src/value.ts': 'export const value = 1;',
    'packages/app/src/value.ts': 'export const value = 2;',
    'packages/app/src/consumer.ts':
      "import {value} from '@/value'; export const result = value;",
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) => edge.importer === 'packages/app/src/consumer.ts')
          .map((edge) => [edge.specifier, edge.dependency, edge.kind])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([
        ['@/value', 'src/value.ts', 'import'],
        ['base.json', 'base.json', 'configuration'],
        [
          'packages/app/tsconfig.json',
          'packages/app/tsconfig.json',
          'configuration',
        ],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);
