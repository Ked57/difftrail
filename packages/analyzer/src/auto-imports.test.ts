import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { withComparison } from '@difftrail/git';
import { repository } from '../../../tests/helpers.js';
import { autoImportEdges } from './auto-imports.js';

function expectWorkspaceMapping(
  edges: Awaited<ReturnType<typeof autoImportEdges>>,
  importer: string,
  target: string,
  otherTarget: string,
): void {
  expect(edges).toContainEqual(
    expect.objectContaining({
      importer,
      dependency: target,
      kind: 'auto-import',
    }),
  );
  expect(edges).not.toContainEqual(
    expect.objectContaining({
      importer,
      dependency: otherTarget,
      kind: 'auto-import',
    }),
  );
}

test('resolves committed Vue component and auto-import declarations to actual consumers', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "import AutoImport from 'unplugin-auto-import';",
      "export default [Components({ dts: 'components.d.ts' }), AutoImport({ dts: 'auto-imports.d.ts' })];",
    ].join('\n'),
    'components.d.ts': [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    AutoButton: typeof import('./components/AutoButton.vue')['default']",
      '  }',
      '}',
      'export {};',
    ].join('\n'),
    'auto-imports.d.ts': [
      'export {};',
      'declare global {',
      "  const usePrice: typeof import('./composables/usePrice')['default'];",
      '}',
    ].join('\n'),
    'components/AutoButton.vue': '<template><button>Auto</button></template>',
    'composables/usePrice.ts': 'export default () => 42;',
    'pages/checkout.vue': [
      '<script setup lang="ts">',
      'const price = usePrice();',
      '</script>',
      '<template><AutoButton>{{ price }}</AutoButton></template>',
    ].join('\n'),
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const edges = await autoImportEdges(comparison.headSnapshot);
      expect(
        edges.map((edge) => [edge.importer, edge.dependency, edge.kind]).sort(),
      ).toEqual(
        [
          ['pages/checkout.vue', 'auto-imports.d.ts', 'metadata'],
          ['pages/checkout.vue', 'vite.config.ts', 'configuration'],
          ['pages/checkout.vue', 'components.d.ts', 'metadata'],
          ['pages/checkout.vue', 'components/AutoButton.vue', 'auto-import'],
          ['pages/checkout.vue', 'composables/usePrice.ts', 'auto-import'],
        ].sort(),
      );
    });
  } finally {
    await repo.cleanup();
  }
});

test('fails when a committed auto-import declaration points outside its snapshot', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "export default Components({ dts: 'components.d.ts' });",
    ].join('\n'),
    'components.d.ts': [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    AutoButton: typeof import('./missing/AutoButton.vue')['default']",
      '  }',
      '}',
    ].join('\n'),
    'page.vue': '<template><AutoButton /></template>',
  });
  try {
    await withComparison(repo.root, async (comparison) =>
      expect(autoImportEdges(comparison.headSnapshot)).rejects.toThrow(
        `Analysis gap in page.vue at ${comparison.head}: auto-import mapping AutoButton in components.d.ts targets missing tracked file ./missing/AutoButton.vue`,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});

test('links a static unplugin-auto-import config directly to its script consumer', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ imports: [{ './composables/usePrice': ['usePrice'] }] });",
    ].join('\n'),
    'composables/usePrice.ts': 'export default () => 42;',
    'pages/checkout.vue': '<script setup>const price = usePrice();</script>',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      expect(await autoImportEdges(comparison.headSnapshot)).toEqual([
        {
          importer: 'pages/checkout.vue',
          dependency: 'composables/usePrice.ts',
          specifier: './composables/usePrice',
          kind: 'auto-import',
        },
        {
          importer: 'pages/checkout.vue',
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

test('resolves a static external API mapping through committed package evidence', async () => {
  const declaration = {
    version: '3.5.13',
    resolved: 'https://registry.npmjs.org/vue/-/vue-3.5.13.tgz',
    integrity: 'sha512-vue-fixture',
  };
  const manifest = {
    name: 'auto-import-fixture',
    devDependencies: { vue: '3.5.13' },
  };
  const lock = {
    name: manifest.name,
    lockfileVersion: 3,
    packages: {
      '': manifest,
      'node_modules/vue': declaration,
    },
  };
  const repo = await repository({
    'package.json': JSON.stringify(manifest),
    'package-lock.json': JSON.stringify(lock),
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: 'auto-imports.d.ts' });",
    ].join('\n'),
    'auto-imports.d.ts': [
      'export {};',
      'declare global {',
      "  const useRef: typeof import('vue')['ref'];",
      '}',
    ].join('\n'),
    'pages/page.ts': 'export const value = useRef(1);',
  });
  try {
    const installed = join(repo.root, 'node_modules/vue');
    await mkdir(installed, { recursive: true });
    await writeFile(
      join(installed, 'package.json'),
      JSON.stringify({ name: 'vue', version: '3.5.13', main: 'index.js' }),
    );
    await writeFile(
      join(installed, 'index.js'),
      'exports.ref = value => value;',
    );
    await mkdir(join(repo.root, 'node_modules'), { recursive: true });
    await writeFile(
      join(repo.root, 'node_modules/.package-lock.json'),
      JSON.stringify(lock),
    );
    await withComparison(repo.root, async (comparison) => {
      expect(await autoImportEdges(comparison.headSnapshot)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            importer: 'pages/page.ts',
            dependency: 'auto-imports.d.ts',
            kind: 'metadata',
          }),
          expect.objectContaining({
            importer: 'pages/page.ts',
            dependency: 'package.json',
            kind: 'metadata',
          }),
          expect.objectContaining({
            importer: 'pages/page.ts',
            dependency: 'package-lock.json',
            kind: 'metadata',
          }),
        ]),
      );
    });
  } finally {
    await repo.cleanup();
  }
});

test('resolves direct workspace API mappings through committed package exports', async () => {
  const repo = await repository({
    'package.json': JSON.stringify({
      name: 'workspace-root',
      private: true,
      workspaces: ['packages/*', 'apps/*'],
    }),
    'packages/shared/package.json': JSON.stringify({
      name: '@demo/shared',
      exports: {
        '.': {
          types: './src/index.d.ts',
          import: './src/index.js',
          require: './src/index.cjs',
        },
      },
    }),
    'packages/shared/src/index.d.ts':
      'export declare function useShared(): number;',
    'packages/shared/src/index.js': 'export const useShared = () => 1;',
    'packages/shared/src/index.cjs': 'exports.useShared = () => 1;',
    'apps/site/package.json': JSON.stringify({
      name: 'site',
      type: 'module',
      dependencies: { '@demo/shared': 'workspace:*' },
    }),
    'apps/site/vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: false, imports: [{ '@demo/shared': ['useShared'] }] });",
    ].join('\n'),
    'apps/site/src/page.ts': 'export const page = useShared();',
    'apps/site/src/page.cjs': 'exports.page = useShared();',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const edges = await autoImportEdges(comparison.headSnapshot);
      expect(edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            importer: 'apps/site/src/page.ts',
            dependency: 'packages/shared/src/index.js',
            kind: 'auto-import',
          }),
          expect.objectContaining({
            importer: 'apps/site/src/page.cjs',
            dependency: 'packages/shared/src/index.cjs',
            kind: 'auto-import',
          }),
          expect.objectContaining({
            importer: 'apps/site/src/page.ts',
            dependency: 'package.json',
            kind: 'metadata',
          }),
          expect.objectContaining({
            importer: 'apps/site/src/page.ts',
            dependency: 'apps/site/package.json',
            kind: 'metadata',
          }),
          expect.objectContaining({
            importer: 'apps/site/src/page.ts',
            dependency: 'packages/shared/package.json',
            kind: 'metadata',
          }),
          expect.objectContaining({
            importer: 'apps/site/src/page.ts',
            dependency: 'apps/site/vite.config.ts',
            kind: 'configuration',
          }),
        ]),
      );
    });
  } finally {
    await repo.cleanup();
  }
});

test('selects workspace JS export conditions from each nearest package type', async () => {
  const repo = await repository({
    'package.json': JSON.stringify({
      private: true,
      workspaces: ['packages/*', 'apps/*'],
    }),
    'packages/shared/package.json': JSON.stringify({
      name: '@demo/shared',
      exports: {
        '.': { import: './src/import.js', require: './src/require.cjs' },
      },
    }),
    'packages/shared/src/import.js': 'export const useShared = () => 1;',
    'packages/shared/src/require.cjs': 'exports.useShared = () => 2;',
    'apps/commonjs/package.json': JSON.stringify({
      name: 'commonjs-app',
      type: 'commonjs',
      dependencies: { '@demo/shared': 'workspace:*' },
    }),
    'apps/commonjs/src/page.js': 'exports.page = useShared();',
    'apps/esm/package.json': JSON.stringify({
      name: 'esm-app',
      type: 'module',
      dependencies: { '@demo/shared': 'workspace:*' },
    }),
    'apps/esm/src/page.js': 'export const page = useShared();',
    'apps/detected/package.json': JSON.stringify({
      name: 'syntax-detected-app',
      dependencies: { '@demo/shared': 'workspace:*' },
    }),
    'apps/detected/src/page.js': 'export const page = useShared();',
    'apps/defaultjs/package.json': JSON.stringify({
      name: 'default-js-app',
      dependencies: { '@demo/shared': 'workspace:*' },
    }),
    'apps/defaultjs/src/page.js':
      "const page = useShared(); void import('./lazy.js');",
    'apps/defaultjs/src/lazy.js': 'export const loaded = true;',
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: false, imports: [{ '@demo/shared': ['useShared'] }] });",
    ].join('\n'),
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const edges = await autoImportEdges(comparison.headSnapshot);
      expectWorkspaceMapping(
        edges,
        'apps/commonjs/src/page.js',
        'packages/shared/src/require.cjs',
        'packages/shared/src/import.js',
      );
      expectWorkspaceMapping(
        edges,
        'apps/esm/src/page.js',
        'packages/shared/src/import.js',
        'packages/shared/src/require.cjs',
      );
      expectWorkspaceMapping(
        edges,
        'apps/detected/src/page.js',
        'packages/shared/src/import.js',
        'packages/shared/src/require.cjs',
      );
      expectWorkspaceMapping(
        edges,
        'apps/defaultjs/src/page.js',
        'packages/shared/src/require.cjs',
        'packages/shared/src/import.js',
      );
      for (const app of ['commonjs', 'esm', 'detected'])
        expect(edges).toContainEqual(
          expect.objectContaining({
            importer: `apps/${app}/src/page.js`,
            dependency: `apps/${app}/package.json`,
            kind: 'metadata',
          }),
        );
    });
  } finally {
    await repo.cleanup();
  }
});

test('resolves static auto-import targets through inherited TypeScript aliases', async () => {
  const repo = await repository({
    'base.json': JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '@/*': ['src/*'] },
      },
    }),
    'tsconfig.json': JSON.stringify({ extends: './base.json' }),
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: false, imports: [{ '@/composables/usePrice': ['usePrice'] }] });",
    ].join('\n'),
    'src/composables/usePrice.ts': 'export const usePrice = () => 42;',
    'pages/page.ts': 'export const value = usePrice();',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const edges = await autoImportEdges(comparison.headSnapshot);
      expect(edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            importer: 'pages/page.ts',
            dependency: 'src/composables/usePrice.ts',
            kind: 'auto-import',
          }),
          expect.objectContaining({
            importer: 'pages/page.ts',
            dependency: 'base.json',
            kind: 'configuration',
          }),
          expect.objectContaining({
            importer: 'pages/page.ts',
            dependency: 'tsconfig.json',
            kind: 'configuration',
          }),
        ]),
      );
    });
  } finally {
    await repo.cleanup();
  }
});
