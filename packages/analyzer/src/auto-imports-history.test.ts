import { expect, test } from 'vitest';
import { selectImpact } from '@difftrail/core';
import { withComparison } from '@difftrail/git';
import { repository } from '../../../tests/helpers.js';
import { autoImportEdges } from './auto-imports.js';

test('ignores lexically bound auto-import names and same-basename components', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "import AutoImport from 'unplugin-auto-import';",
      "export default [Components({ dts: 'components.d.ts' }), AutoImport({ dts: 'auto-imports.d.ts' })];",
    ].join('\n'),
    'components.d.ts': [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    AutoButton: typeof import('./src/components/AutoButton.vue')['default']",
      '  }',
      '}',
    ].join('\n'),
    'auto-imports.d.ts': [
      'export {};',
      'declare global {',
      "  const usePrice: typeof import('./composables/usePrice')['default'];",
      '}',
    ].join('\n'),
    'src/components/AutoButton.vue':
      '<template><button>Mapped</button></template>',
    'other/AutoButton.vue': '<template><button>Unrelated</button></template>',
    'composables/usePrice.ts': 'export default () => 42;',
    'pages/checkout.vue': '<template><AutoButton /></template>',
    'pages/bound.ts':
      'export function local(usePrice: () => number) { return usePrice(); }',
    'pages/free.ts': 'export const price = usePrice();',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const edges = await autoImportEdges(comparison.headSnapshot);
      expect(
        edges
          .filter((edge) => edge.kind === 'auto-import')
          .map((edge) => [edge.importer, edge.dependency])
          .sort(),
      ).toEqual([
        ['pages/checkout.vue', 'src/components/AutoButton.vue'],
        ['pages/free.ts', 'composables/usePrice.ts'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});

test('follows a mapping-only change through its snapshot-owned consumer', async () => {
  const declaration = (target: string) =>
    [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      `    AutoButton: typeof import('${target}')['default']`,
      '  }',
      '}',
    ].join('\n');
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "export default Components({ dts: 'generated/components.d.ts' });",
    ].join('\n'),
    'generated/components.d.ts': declaration('../src/AutoButton.vue'),
    'src/AutoButton.vue': '<template><button>Old target</button></template>',
    'elsewhere/AutoButton.vue':
      '<template><button>Same basename</button></template>',
    'pages/checkout.vue': '<template><AutoButton /></template>',
  });
  try {
    const base = repo.git('rev-parse', 'HEAD');
    await repo.commit({
      'generated/components.d.ts': declaration('../elsewhere/AutoButton.vue'),
    });
    await withComparison(repo.root, async (comparison) => {
      const baseEdges = await autoImportEdges(comparison.baseSnapshot);
      const headEdges = await autoImportEdges(comparison.headSnapshot);
      const impact = selectImpact(
        comparison.seeds,
        baseEdges,
        headEdges,
        comparison.headSnapshot.paths,
      );
      expect(comparison.base).toBe(base);
      expect(impact.files).toContain('pages/checkout.vue');
      expect(headEdges).toContainEqual({
        importer: 'pages/checkout.vue',
        dependency: 'elsewhere/AutoButton.vue',
        specifier: '../elsewhere/AutoButton.vue',
        kind: 'auto-import',
      });
      expect(headEdges).not.toContainEqual(
        expect.objectContaining({
          importer: 'pages/checkout.vue',
          dependency: 'src/AutoButton.vue',
        }),
      );
    });
  } finally {
    await repo.cleanup();
  }
});

function expectSnapshotMappingOwnership(
  baseEdges: Awaited<ReturnType<typeof autoImportEdges>>,
  headEdges: Awaited<ReturnType<typeof autoImportEdges>>,
): void {
  expect(baseEdges).toContainEqual({
    importer: 'src/pages/ReportsPage.vue',
    dependency: 'src/components/auto-primary/AutoBadge.vue',
    specifier: './src/components/auto-primary/AutoBadge.vue',
    kind: 'auto-import',
  });
  expect(baseEdges).not.toContainEqual({
    importer: 'src/pages/ReportsPage.vue',
    dependency: 'src/components/auto-alternate/AutoBadge.vue',
    specifier: './src/components/auto-alternate/AutoBadge.vue',
    kind: 'auto-import',
  });
  expect(headEdges).toContainEqual({
    importer: 'src/pages/ReportsPage.vue',
    dependency: 'src/components/auto-alternate/AutoBadge.vue',
    specifier: './src/components/auto-alternate/AutoBadge.vue',
    kind: 'auto-import',
  });
  expect(headEdges).not.toContainEqual({
    importer: 'src/pages/ReportsPage.vue',
    dependency: 'src/components/auto-primary/AutoBadge.vue',
    specifier: './src/components/auto-primary/AutoBadge.vue',
    kind: 'auto-import',
  });
  for (const edges of [baseEdges, headEdges]) {
    expect(edges).toContainEqual({
      importer: 'src/pages/ReportsPage.vue',
      dependency: 'components.d.ts',
      specifier: 'AutoBadge',
      kind: 'metadata',
    });
    expect(edges).toContainEqual({
      importer: 'src/pages/ReportsPage.vue',
      dependency: 'vite.config.ts',
      specifier: 'vite.config.ts',
      kind: 'configuration',
    });
  }
}

test('tracks the recognized Vite component entrypoint through consumers and config provenance', async () => {
  const declaration = (target: string) =>
    [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      `    AutoBadge: typeof import('${target}')['default']`,
      '  }',
      '}',
    ].join('\n');
  const config = (directory: string) =>
    [
      "import Components from 'unplugin-vue-components/vite';",
      `export default Components({ dirs: ['./src/components/${directory}'], dts: 'components.d.ts' });`,
    ].join('\n');
  const repo = await repository({
    'vite.config.ts': config('auto-primary'),
    'components.d.ts': declaration(
      './src/components/auto-primary/AutoBadge.vue',
    ),
    'src/components/auto-primary/AutoBadge.vue':
      '<template><span>Primary</span></template>',
    'src/components/auto-alternate/AutoBadge.vue':
      '<template><span>Alternate</span></template>',
    'src/pages/ReportsPage.vue': '<template><AutoBadge /></template>',
    'src/pages/SettingsPage.vue':
      '<template><main>Independent</main></template>',
    'src/App.vue': [
      '<script setup>',
      "import ReportsPage from './pages/ReportsPage.vue';",
      '</script>',
      '<template><ReportsPage /></template>',
    ].join('\n'),
    'src/main.ts': "import App from './App.vue';\nvoid App;",
  });
  try {
    const primary = repo.git('rev-parse', 'HEAD');
    await repo.commit({
      'components.d.ts': declaration(
        './src/components/auto-alternate/AutoBadge.vue',
      ),
    });
    const alternate = repo.git('rev-parse', 'HEAD');
    await withComparison(repo.root, async (comparison) => {
      const baseEdges = await autoImportEdges(comparison.baseSnapshot);
      const headEdges = await autoImportEdges(comparison.headSnapshot);
      expect(comparison.base).toBe(primary);
      expect(comparison.head).toBe(alternate);
      expectSnapshotMappingOwnership(baseEdges, headEdges);
      expect(
        selectImpact(
          comparison.seeds,
          baseEdges,
          headEdges,
          comparison.headSnapshot.paths,
        ).files,
      ).toEqual(['components.d.ts', 'src/pages/ReportsPage.vue'].sort());
    });

    await repo.commit({ 'vite.config.ts': config('auto-alternate') });
    await withComparison(repo.root, async (comparison) => {
      const baseEdges = await autoImportEdges(comparison.baseSnapshot);
      const headEdges = await autoImportEdges(comparison.headSnapshot);
      expect(
        selectImpact(
          comparison.seeds,
          baseEdges,
          headEdges,
          comparison.headSnapshot.paths,
        ).files,
      ).toEqual(['src/pages/ReportsPage.vue', 'vite.config.ts'].sort());
    });
  } finally {
    await repo.cleanup();
  }
});

test('recognizes the Vite auto-import entrypoint and rejects missing metadata at either endpoint', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components/vite';",
      "import AutoImport from 'unplugin-auto-import/vite';",
      "export default [Components({ dts: 'components.d.ts' }), AutoImport({ dts: false, imports: [{ './composables/usePrice': ['usePrice'] }] })];",
    ].join('\n'),
    'composables/usePrice.ts': 'export default () => 42;',
    'pages/page.vue': [
      '<script setup>const price = usePrice();</script>',
      '<template><AutoButton>{{ price }}</AutoButton></template>',
    ].join('\n'),
  });
  try {
    const missingBase = repo.git('rev-parse', 'HEAD');
    await repo.commit({
      'components.d.ts': [
        "declare module 'vue' {",
        '  export interface GlobalComponents {',
        "    AutoButton: typeof import('./components/AutoButton.vue')['default']",
        '  }',
        '}',
      ].join('\n'),
      'components/AutoButton.vue':
        '<template><button>Mapped</button></template>',
    });
    const validHead = repo.git('rev-parse', 'HEAD');
    await withComparison(
      repo.root,
      async (comparison) => {
        expect(comparison.base).toBe(missingBase);
        expect(comparison.head).toBe(validHead);
        await expect(autoImportEdges(comparison.baseSnapshot)).rejects.toThrow(
          `Analysis gap in pages/page.vue at ${missingBase}: component AutoButton requires generated metadata components.d.ts configured by vite.config.ts, but that committed file is missing`,
        );
        expect(await autoImportEdges(comparison.headSnapshot)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              importer: 'pages/page.vue',
              dependency: 'composables/usePrice.ts',
              kind: 'auto-import',
            }),
            expect.objectContaining({
              importer: 'pages/page.vue',
              dependency: 'components/AutoButton.vue',
              kind: 'auto-import',
            }),
          ]),
        );
      },
      { base: missingBase, head: validHead },
    );

    const missingHead = await repo.commit({ 'components.d.ts': '' });
    await withComparison(
      repo.root,
      async (comparison) => {
        expect(comparison.head).toBe(missingHead);
        await expect(autoImportEdges(comparison.headSnapshot)).rejects.toThrow(
          `Analysis gap in pages/page.vue at ${missingHead}: component AutoButton has no committed static auto-import mapping`,
        );
      },
      { base: validHead, head: missingHead },
    );
  } finally {
    await repo.cleanup();
  }
});

test('fails for a component usage that only an imported runtime resolver could map', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      'export default Components({ dts: false, resolvers: [name => makeResolution(name)] });',
    ].join('\n'),
    'pages/page.vue': '<template><remote-widget /></template>',
  });
  try {
    await withComparison(repo.root, async (comparison) =>
      expect(autoImportEdges(comparison.headSnapshot)).rejects.toThrow(
        `Analysis gap in pages/page.vue at ${comparison.head}: component remote-widget has no committed static auto-import mapping`,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});

test('does not treat Vue native tags or compiler builtins as auto-import gaps', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      'export default Components({ dts: false, resolvers: [name => makeResolution(name)] });',
    ].join('\n'),
    'pages/page.vue':
      '<template><main><svg><path /></svg><Transition><div /></Transition><slot /><component :is="view" /></main></template>',
  });
  try {
    await withComparison(repo.root, async (comparison) =>
      expect(await autoImportEdges(comparison.headSnapshot)).toEqual([]),
    );
  } finally {
    await repo.cleanup();
  }
});

test('does not classify custom element tags as auto-imports without a resolver setup', async () => {
  const repo = await repository({
    'pages/page.vue': '<template><remote-widget /></template>',
  });
  try {
    await withComparison(repo.root, async (comparison) =>
      expect(await autoImportEdges(comparison.headSnapshot)).toEqual([]),
    );
  } finally {
    await repo.cleanup();
  }
});

test('reports the exact missing generated metadata path configured for a component resolver', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "export default Components({ dts: 'generated/components.d.ts' });",
    ].join('\n'),
    'pages/page.vue': '<template><RemoteWidget /></template>',
  });
  try {
    await withComparison(repo.root, async (comparison) =>
      expect(autoImportEdges(comparison.headSnapshot)).rejects.toThrow(
        `Analysis gap in pages/page.vue at ${comparison.head}: component RemoteWidget requires generated metadata generated/components.d.ts configured by vite.config.ts, but that committed file is missing`,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});

test('fails when configured API metadata or its import map is unavailable at runtime', async () => {
  const missing = await repository({
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: 'types/auto-imports.d.ts' });",
    ].join('\n'),
  });
  try {
    await withComparison(
      missing.root,
      async (comparison) =>
        await expect(autoImportEdges(comparison.headSnapshot)).rejects.toThrow(
          `Analysis gap in vite.config.ts at ${comparison.head}: configured auto-import metadata types/auto-imports.d.ts is missing from the committed snapshot`,
        ),
    );
  } finally {
    await missing.cleanup();
  }

  const dynamic = await repository({
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      'export default AutoImport({ imports: loadImports() });',
    ].join('\n'),
  });
  try {
    await withComparison(
      dynamic.root,
      async (comparison) =>
        await expect(autoImportEdges(comparison.headSnapshot)).rejects.toThrow(
          `Analysis gap in vite.config.ts at ${comparison.head}: auto-import imports option is not a static literal mapping`,
        ),
    );
  } finally {
    await dynamic.cleanup();
  }
});

test('connects a nondefault generated mapping file and its static plugin config to consumers', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "export default Components({ dts: 'types/components.d.ts' });",
    ].join('\n'),
    'types/components.d.ts': [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    AutoButton: typeof import('../components/AutoButton.vue')['default']",
      '  }',
      '}',
    ].join('\n'),
    'components/AutoButton.vue': '<template><button>Auto</button></template>',
    'pages/page.vue': '<template><AutoButton /></template>',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      expect(await autoImportEdges(comparison.headSnapshot)).toEqual([
        {
          importer: 'pages/page.vue',
          dependency: 'components/AutoButton.vue',
          specifier: '../components/AutoButton.vue',
          kind: 'auto-import',
        },
        {
          importer: 'pages/page.vue',
          dependency: 'types/components.d.ts',
          specifier: 'AutoButton',
          kind: 'metadata',
        },
        {
          importer: 'pages/page.vue',
          dependency: 'vite.config.ts',
          specifier: 'vite.config.ts',
          kind: 'configuration',
        },
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});

test('rejects conflicting committed mappings for the same component symbol', async () => {
  const mapping = (path: string) =>
    [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      `    AutoButton: typeof import('./${path}')['default']`,
      '  }',
      '}',
    ].join('\n');
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "export default [Components({ dts: 'components.d.ts' }), Components({ dts: 'other-components.d.ts' })];",
    ].join('\n'),
    'components.d.ts': mapping('components/AutoButton.vue'),
    'other-components.d.ts': mapping('alternate/AutoButton.vue'),
    'components/AutoButton.vue': '<template><button>One</button></template>',
    'alternate/AutoButton.vue': '<template><button>Two</button></template>',
    'pages/page.vue': '<template><AutoButton /></template>',
  });
  try {
    await withComparison(repo.root, async (comparison) =>
      expect(autoImportEdges(comparison.headSnapshot)).rejects.toThrow(
        `Analysis gap in pages/page.vue at ${comparison.head}: auto-import mapping for AutoButton is ambiguous`,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});
