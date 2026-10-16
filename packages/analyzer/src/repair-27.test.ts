import { expect, test } from 'vitest';
import { withComparison } from '@difftrail/git';
import { repository } from '../../../tests/helpers.js';
import { autoImportEdges } from './auto-imports.js';

test('rejects an imported plugin called with identifier options without evaluating them', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import { default as ConfigureImports } from 'unplugin-auto-import';",
      "const options = (globalThis.marker = 'executed', { dts: false, imports: [{ './composables/usePrice': ['usePrice'] }] });",
      'export default ConfigureImports(options);',
    ].join('\n'),
    'composables/usePrice.ts': 'export default () => 42;',
    'pages/checkout.ts': 'export const total = usePrice();',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      await expect(autoImportEdges(comparison.headSnapshot)).rejects.toThrow(
        `Analysis gap in vite.config.ts at ${comparison.head}: auto-import options use an unsupported static expression; expected a static object literal`,
      );
    });
  } finally {
    await repo.cleanup();
  }
});

test('recognizes only imported plugin bindings and keeps direct literal mappings', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import { default as ConfigureImports } from 'unplugin-auto-import';",
      "export default ConfigureImports({ dts: false, imports: [{ './composables/usePrice': ['usePrice'] }] });",
      "function helper(ConfigureImports: (options: unknown) => unknown) { return ConfigureImports({ dts: false, imports: [{ './composables/useShadowed': ['useShadowed'] }] }); }",
      'function AutoImport(options: unknown) { return options; }',
      'void helper((options: unknown) => options);',
      "void AutoImport({ dts: false, imports: [{ './composables/useShadowed': ['useShadowed'] }] });",
    ].join('\n'),
    'composables/usePrice.ts': 'export default () => 42;',
    'composables/useShadowed.ts': 'export default () => 24;',
    'pages/checkout.ts': 'export const total = usePrice();',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      expect(await autoImportEdges(comparison.headSnapshot)).toEqual([
        {
          importer: 'pages/checkout.ts',
          dependency: 'composables/usePrice.ts',
          specifier: './composables/usePrice',
          kind: 'auto-import',
        },
        {
          importer: 'pages/checkout.ts',
          dependency: 'vite.config.ts',
          specifier: 'usePrice',
          kind: 'configuration',
        },
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});

test('keeps JavaScript module configuration scanning for .mjs files', async () => {
  const repo = await repository({
    'vite.config.mjs': [
      "import { default as ConfigureImports } from 'unplugin-auto-import';",
      "export default ConfigureImports({ dts: false, imports: [{ './composables/usePrice': ['usePrice'] }] });",
    ].join('\n'),
    'composables/usePrice.ts': 'export default () => 42;',
    'pages/checkout.ts': 'export const total = usePrice();',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      expect(await autoImportEdges(comparison.headSnapshot)).toContainEqual({
        importer: 'pages/checkout.ts',
        dependency: 'composables/usePrice.ts',
        specifier: './composables/usePrice',
        kind: 'auto-import',
      });
    });
  } finally {
    await repo.cleanup();
  }
});

test('rejects nonliteral JavaScript module options for an imported plugin', async () => {
  const repo = await repository({
    'vite.config.mjs': [
      "import { default as ConfigureImports } from 'unplugin-auto-import';",
      'const options = loadOptions();',
      'export default ConfigureImports(options);',
    ].join('\n'),
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      await expect(autoImportEdges(comparison.headSnapshot)).rejects.toThrow(
        `Analysis gap in vite.config.mjs at ${comparison.head}: auto-import options use an unsupported static expression; expected a static object literal`,
      );
    });
  } finally {
    await repo.cleanup();
  }
});
