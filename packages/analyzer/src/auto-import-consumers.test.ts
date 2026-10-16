import { expect, test } from 'vitest';
import { withComparison } from '@difftrail/git';
import { repository } from '../../../tests/helpers.js';
import { autoImportEdges } from './auto-imports.js';
import { localReferenceEdges } from './local.js';
import { inspectSources } from './source.js';

test('gives setup bindings and registered Options API components local precedence', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "export default Components({ dts: 'components.d.ts' });",
    ].join('\n'),
    'components.d.ts': [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    AutoButton: typeof import('./GlobalButton.vue')['default']",
      '  }',
      '}',
    ].join('\n'),
    'GlobalButton.vue': '<template><button>Global</button></template>',
    'AliasButton.vue': '<template><button>Alias</button></template>',
    'pages/setup.vue': [
      '<script setup>',
      'const AutoButton = {};',
      '</script>',
      '<template><AutoButton /></template>',
    ].join('\n'),
    'pages/options.vue': [
      '<script>',
      "import { defineComponent as defineVueComponent } from 'vue';",
      "import AliasButton from '../AliasButton.vue';",
      'export default defineVueComponent({ components: { AutoButton: AliasButton } });',
      '</script>',
      '<template><AutoButton /></template>',
    ].join('\n'),
    'pages/unregistered.vue': [
      '<script>',
      "import AutoButton from '../AliasButton.vue';",
      '</script>',
      '<template><AutoButton /></template>',
    ].join('\n'),
    'pages/wrapped.vue': [
      '<script>',
      "import { wrap } from '../wrappers';",
      "import LocalButton from '../AliasButton.vue';",
      'export default wrap({ components: { AutoButton: LocalButton } });',
      '</script>',
      '<template><AutoButton /></template>',
    ].join('\n'),
    'wrappers.ts': 'export const wrap = (options: unknown) => options;',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const edges = await autoImportEdges(comparison.headSnapshot);
      expect(edges).toContainEqual(
        expect.objectContaining({
          importer: 'pages/unregistered.vue',
          dependency: 'GlobalButton.vue',
          kind: 'auto-import',
        }),
      );
      expect(edges).toContainEqual(
        expect.objectContaining({
          importer: 'pages/wrapped.vue',
          dependency: 'GlobalButton.vue',
          kind: 'auto-import',
        }),
      );
      expect(edges).not.toContainEqual(
        expect.objectContaining({
          importer: expect.stringMatching(/^pages\/(?:setup|options)\.vue$/),
          dependency: 'GlobalButton.vue',
          kind: 'auto-import',
        }),
      );
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('keeps nested script bindings out of the Vue template scope', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      'export default Components({ dts: false, resolvers: [name => makeResolution(name)] });',
    ].join('\n'),
    'pages/page.vue': [
      '<script setup>',
      'function render() { const RemoteWidget = {}; return RemoteWidget; }',
      '</script>',
      '<template><RemoteWidget /></template>',
    ].join('\n'),
  });
  try {
    await withComparison(repo.root, async (comparison) =>
      expect(autoImportEdges(comparison.headSnapshot)).rejects.toThrow(
        `Analysis gap in pages/page.vue at ${comparison.head}: component RemoteWidget has no committed static auto-import mapping`,
      ),
    );
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('resolves mapped component usage in committed external Vue templates', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "export default Components({ dts: 'components.d.ts' });",
    ].join('\n'),
    'components.d.ts': [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    AutoButton: typeof import('./shared/AutoButton.vue')['default']",
      '  }',
      '}',
    ].join('\n'),
    'shared/AutoButton.vue': '<template><button>Auto</button></template>',
    'pages/page.vue': '<template src="./page.html"></template>',
    'pages/page.html': '<AutoButton />',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const inspections = await inspectSources(comparison.headSnapshot);
      const templateEdges = await localReferenceEdges(
        comparison.headSnapshot,
        [],
        inspections,
      );
      expect(templateEdges).toContainEqual(
        expect.objectContaining({
          importer: 'pages/page.vue',
          dependency: 'pages/page.html',
          kind: 'template-src',
        }),
      );
      const edges = await autoImportEdges(
        comparison.headSnapshot,
        templateEdges,
      );
      expect(edges).toContainEqual(
        expect.objectContaining({
          importer: 'pages/page.vue',
          dependency: 'shared/AutoButton.vue',
          kind: 'auto-import',
        }),
      );
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);
