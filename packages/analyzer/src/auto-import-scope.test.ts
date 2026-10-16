import { expect, test } from 'vitest';
import { withComparison } from '@difftrail/git';
import { repository } from '../../../tests/helpers.js';
import { autoImportEdges } from './auto-imports.js';

test('scopes identical configured API names to each config directory', async () => {
  const repo = await repository({
    'apps/a/vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: false, imports: [{ './useValue': ['useValue'] }] });",
    ].join('\n'),
    'apps/a/useValue.ts': 'export default () => "a";',
    'apps/a/page.ts': 'export const value = useValue();',
    'apps/b/vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: false, imports: [{ './useValue': ['useValue'] }] });",
    ].join('\n'),
    'apps/b/useValue.ts': 'export default () => "b";',
    'apps/b/page.ts': 'export const value = useValue();',
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
        ['apps/a/page.ts', 'apps/a/useValue.ts'],
        ['apps/b/page.ts', 'apps/b/useValue.ts'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

function expectGeneratedScope(
  edges: Awaited<ReturnType<typeof autoImportEdges>>,
) {
  expect(
    edges
      .filter((edge) => edge.kind === 'auto-import')
      .map((edge) => [edge.importer, edge.dependency])
      .sort(),
  ).toEqual([
    ['apps/a/page.ts', 'apps/a/useValue.ts'],
    ['apps/a/page.vue', 'apps/a/AutoWidget.vue'],
    ['apps/b/page.ts', 'apps/b/useValue.ts'],
    ['apps/b/page.vue', 'apps/b/AutoWidget.vue'],
  ]);
  for (const [importer, metadata] of [
    ['apps/a/page.ts', 'types/a-auto-imports.d.ts'],
    ['apps/a/page.vue', 'types/a-components.d.ts'],
  ])
    expect(edges).toContainEqual(
      expect.objectContaining({
        importer,
        dependency: metadata,
        kind: 'metadata',
      }),
    );
  for (const importer of ['apps/a/page.ts', 'apps/a/page.vue']) {
    expect(edges).toContainEqual(
      expect.objectContaining({
        importer,
        dependency: 'apps/a/vite.config.ts',
        kind: 'configuration',
      }),
    );
    expect(edges).not.toContainEqual(
      expect.objectContaining({
        importer,
        dependency: 'apps/b/vite.config.ts',
        kind: 'configuration',
      }),
    );
  }
  expect(edges).not.toContainEqual(
    expect.objectContaining({
      importer: 'apps/a/page.ts',
      dependency: 'types/b-auto-imports.d.ts',
      kind: 'metadata',
    }),
  );
  expect(edges).not.toContainEqual(
    expect.objectContaining({
      importer: 'apps/a/page.vue',
      dependency: 'types/b-components.d.ts',
      kind: 'metadata',
    }),
  );
}

test('scopes generated mappings by config when declarations are elsewhere', async () => {
  const repo = await repository({
    'apps/a/vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "import AutoImport from 'unplugin-auto-import';",
      "export default [Components({ dts: '../../types/a-components.d.ts' }), AutoImport({ dts: '../../types/a-auto-imports.d.ts' })];",
    ].join('\n'),
    'apps/a/useValue.ts': 'export default () => "a";',
    'apps/a/AutoWidget.vue': '<template><div>A</div></template>',
    'apps/a/page.ts': 'export const value = useValue();',
    'apps/a/page.vue': '<template><AutoWidget /></template>',
    'apps/b/vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "import AutoImport from 'unplugin-auto-import';",
      "export default [Components({ dts: '../../types/b-components.d.ts' }), AutoImport({ dts: '../../types/b-auto-imports.d.ts' })];",
    ].join('\n'),
    'apps/b/useValue.ts': 'export default () => "b";',
    'apps/b/AutoWidget.vue': '<template><div>B</div></template>',
    'apps/b/page.ts': 'export const value = useValue();',
    'apps/b/page.vue': '<template><AutoWidget /></template>',
    'types/a-components.d.ts': [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    AutoWidget: typeof import('../apps/a/AutoWidget.vue')['default']",
      '  }',
      '}',
    ].join('\n'),
    'types/a-auto-imports.d.ts': [
      'export {};',
      'declare global {',
      "  const useValue: typeof import('../apps/a/useValue')['default'];",
      '}',
    ].join('\n'),
    'types/b-components.d.ts': [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    AutoWidget: typeof import('../apps/b/AutoWidget.vue')['default']",
      '  }',
      '}',
    ].join('\n'),
    'types/b-auto-imports.d.ts': [
      'export {};',
      'declare global {',
      "  const useValue: typeof import('../apps/b/useValue')['default'];",
      '}',
    ].join('\n'),
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const edges = await autoImportEdges(comparison.headSnapshot);
      expectGeneratedScope(edges);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

async function conflictingRepository(
  rootConfig: string,
  appConfig: string,
  rootDeclaration: string,
  appDeclaration: string,
) {
  const files: Record<string, string> = {
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      rootConfig,
    ].join('\n'),
    'apps/a/vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      appConfig,
    ].join('\n'),
    'apps/a/rootValue.ts': 'export default () => "root";',
    'apps/a/appValue.ts': 'export default () => "app";',
    'apps/a/page.ts': 'export const value = useValue();',
  };
  if (!rootConfig.includes('dts: false'))
    files['types/root-auto-imports.d.ts'] = rootDeclaration;
  if (!appConfig.includes('dts: false'))
    files['types/app-auto-imports.d.ts'] = appDeclaration;
  return repository(files);
}

test.each([
  {
    name: 'root inline and app generated',
    rootConfig:
      "export default AutoImport({ dts: false, imports: [{ './apps/a/rootValue': ['useValue'] }] });",
    appConfig:
      "export default AutoImport({ dts: '../../types/app-auto-imports.d.ts' });",
    rootDeclaration: [
      'export {};',
      'declare global {',
      "  const useValue: typeof import('../apps/a/rootValue')['default'];",
      '}',
    ].join('\n'),
    appDeclaration: [
      'export {};',
      'declare global {',
      "  const useValue: typeof import('../apps/a/appValue')['default'];",
      '}',
    ].join('\n'),
  },
  {
    name: 'root generated and app inline',
    rootConfig:
      "export default AutoImport({ dts: 'types/root-auto-imports.d.ts' });",
    appConfig:
      "export default AutoImport({ dts: false, imports: [{ './appValue': ['useValue'] }] });",
    rootDeclaration: [
      'export {};',
      'declare global {',
      "  const useValue: typeof import('../apps/a/rootValue')['default'];",
      '}',
    ].join('\n'),
    appDeclaration: [
      'export {};',
      'declare global {',
      "  const useValue: typeof import('../apps/a/appValue')['default'];",
      '}',
    ].join('\n'),
  },
])(
  'keeps mixed-scope conflicts ambiguous ($name)',
  async ({ rootConfig, appConfig, rootDeclaration, appDeclaration }) => {
    const repo = await conflictingRepository(
      rootConfig,
      appConfig,
      rootDeclaration,
      appDeclaration,
    );
    try {
      await withComparison(repo.root, async (comparison) => {
        const result = autoImportEdges(comparison.headSnapshot);
        await expect(result).rejects.toThrow(
          `Analysis gap in apps/a/page.ts at ${comparison.head}: auto-import mapping for useValue is ambiguous`,
        );
      });
    } finally {
      await repo.cleanup();
    }
  },
  30_000,
);

test('retains equivalent applicable mapping provenance without ambiguity', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: false, imports: [{ './apps/a/appValue': ['useValue'] }] });",
    ].join('\n'),
    'apps/a/vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: false, imports: [{ './appValue': ['useValue'] }] });",
    ].join('\n'),
    'apps/a/appValue.ts': 'export default () => "app";',
    'apps/a/page.ts': 'export const value = useValue();',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const edges = await autoImportEdges(comparison.headSnapshot);
      expect(edges).toContainEqual(
        expect.objectContaining({
          importer: 'apps/a/page.ts',
          dependency: 'apps/a/appValue.ts',
          kind: 'auto-import',
        }),
      );
      expect(edges).toContainEqual(
        expect.objectContaining({
          importer: 'apps/a/page.ts',
          dependency: 'vite.config.ts',
          kind: 'configuration',
        }),
      );
      expect(edges).toContainEqual(
        expect.objectContaining({
          importer: 'apps/a/page.ts',
          dependency: 'apps/a/vite.config.ts',
          kind: 'configuration',
        }),
      );
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);
