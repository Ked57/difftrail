import { expect, test } from 'vitest';
import { selectImpact } from '@difftrail/core';
import { repository } from '../../../tests/helpers.js';
import { withComparison } from '@difftrail/git';
import { autoImportEdges } from './auto-imports.js';

test('maps shorthand values to configured and generated auto-import providers', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: 'auto-imports.d.ts', imports: [{ './composables/usePrice': ['usePrice'] }] });",
    ].join('\n'),
    'auto-imports.d.ts': [
      'export {};',
      'declare global {',
      "  const usePrice: typeof import('./composables/usePrice')['default'];",
      '}',
    ].join('\n'),
    'composables/usePrice.ts': 'export default () => 42;',
    'scripts/plain.js': 'export const price = { usePrice };',
    'scripts/typed.ts': 'export const price = { usePrice };',
    'pages/ordinary.vue': '<script>export const price = { usePrice };</script>',
    'pages/setup.vue': '<script setup>const price = { usePrice };</script>',
    'pages/ordinary-shadow.vue':
      '<script>const usePrice = () => 0; const prices = { usePrice };</script>',
    'pages/setup-shadow.vue':
      '<script setup>const usePrice = () => 0; const prices = { usePrice };</script>',
    'scripts/shadowed.ts': [
      'const usePrice = () => 1;',
      'export const price = { usePrice };',
      'export function fromParameter(usePrice: () => number) { return { usePrice }; }',
    ].join('\n'),
    'scripts/imported.ts': [
      "import { usePrice } from './local.js';",
      'export const price = { usePrice };',
    ].join('\n'),
    'scripts/local.js': 'export const usePrice = () => 1;',
    'scripts/property.ts': 'export const price = { usePrice: 1 };',
  });
  try {
    await withComparison(repo.root, async ({ headSnapshot }) => {
      const edges = await autoImportEdges(headSnapshot);
      expect(
        edges
          .filter((edge) => edge.kind === 'auto-import')
          .map(({ importer, dependency }) => [importer, dependency])
          .sort(),
      ).toEqual([
        ['pages/ordinary.vue', 'composables/usePrice.ts'],
        ['pages/setup.vue', 'composables/usePrice.ts'],
        ['scripts/plain.js', 'composables/usePrice.ts'],
        ['scripts/typed.ts', 'composables/usePrice.ts'],
      ]);
      for (const importer of [
        'pages/ordinary.vue',
        'pages/setup.vue',
        'scripts/plain.js',
        'scripts/typed.ts',
      ]) {
        expect(edges).toContainEqual({
          importer,
          dependency: 'auto-imports.d.ts',
          specifier: 'usePrice',
          kind: 'metadata',
        });
        expect(edges).toContainEqual({
          importer,
          dependency: 'vite.config.ts',
          specifier: 'vite.config.ts',
          kind: 'configuration',
        });
      }
      for (const importer of [
        'scripts/shadowed.ts',
        'scripts/imported.ts',
        'scripts/property.ts',
        'pages/ordinary-shadow.vue',
        'pages/setup-shadow.vue',
      ])
        expectNoAutoImportEdge(edges, importer);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

function expectNoAutoImportEdge(
  edges: Awaited<ReturnType<typeof autoImportEdges>>,
  importer: string,
): void {
  expect(edges).not.toContainEqual(
    expect.objectContaining({ importer, kind: 'auto-import' }),
  );
}

test('uses each endpoint generated mapping for shorthand consumer impact', async () => {
  const declaration = (target: string) =>
    [
      'export {};',
      'declare global {',
      `  const usePrice: typeof import('${target}')['default'];`,
      '}',
    ].join('\n');
  const repo = await repository({
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: 'auto-imports.d.ts' });",
    ].join('\n'),
    'auto-imports.d.ts': declaration('./composables/oldPrice'),
    'composables/oldPrice.ts': 'export default () => 1;',
    'composables/newPrice.ts': 'export default () => 2;',
    'pages/shorthand.ts': 'export const prices = { usePrice };',
  });
  try {
    await repo.commit({
      'auto-imports.d.ts': declaration('./composables/newPrice'),
    });
    await withComparison(repo.root, async (comparison) => {
      const baseEdges = await autoImportEdges(comparison.baseSnapshot);
      const headEdges = await autoImportEdges(comparison.headSnapshot);
      expect(baseEdges).toContainEqual({
        importer: 'pages/shorthand.ts',
        dependency: 'composables/oldPrice.ts',
        specifier: './composables/oldPrice',
        kind: 'auto-import',
      });
      expect(baseEdges).not.toContainEqual(
        expect.objectContaining({
          importer: 'pages/shorthand.ts',
          dependency: 'composables/newPrice.ts',
          kind: 'auto-import',
        }),
      );
      expect(headEdges).toContainEqual({
        importer: 'pages/shorthand.ts',
        dependency: 'composables/newPrice.ts',
        specifier: './composables/newPrice',
        kind: 'auto-import',
      });
      expect(headEdges).not.toContainEqual(
        expect.objectContaining({
          importer: 'pages/shorthand.ts',
          dependency: 'composables/oldPrice.ts',
          kind: 'auto-import',
        }),
      );
      expect(
        selectImpact(
          comparison.seeds,
          baseEdges,
          headEdges,
          comparison.headSnapshot.paths,
        ),
      ).toEqual({
        files: ['auto-imports.d.ts', 'pages/shorthand.ts'],
        removed: [],
      });
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('uses each endpoint inline mapping when only auto-import configuration changes', async () => {
  const config = (target: string) =>
    [
      "import AutoImport from 'unplugin-auto-import';",
      `export default AutoImport({ dts: false, imports: [{ '${target}': ['usePrice'] }] });`,
    ].join('\n');
  const repo = await repository({
    'vite.config.ts': config('./composables/oldPrice'),
    'composables/oldPrice.ts': 'export default () => 1;',
    'composables/newPrice.ts': 'export default () => 2;',
    'pages/shorthand.ts': 'export const prices = { usePrice };',
  });
  try {
    await repo.commit({ 'vite.config.ts': config('./composables/newPrice') });
    await withComparison(repo.root, async (comparison) => {
      const baseEdges = await autoImportEdges(comparison.baseSnapshot);
      const headEdges = await autoImportEdges(comparison.headSnapshot);
      expect(baseEdges).toContainEqual({
        importer: 'pages/shorthand.ts',
        dependency: 'composables/oldPrice.ts',
        specifier: './composables/oldPrice',
        kind: 'auto-import',
      });
      expect(headEdges).toContainEqual({
        importer: 'pages/shorthand.ts',
        dependency: 'composables/newPrice.ts',
        specifier: './composables/newPrice',
        kind: 'auto-import',
      });
      expect(
        selectImpact(
          comparison.seeds,
          baseEdges,
          headEdges,
          comparison.headSnapshot.paths,
        ),
      ).toEqual({
        files: ['pages/shorthand.ts', 'vite.config.ts'],
        removed: [],
      });
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);
