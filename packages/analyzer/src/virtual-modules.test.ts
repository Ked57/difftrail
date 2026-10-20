import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { withComparison } from '@difftrail/git';
import { repository } from '../../../tests/helpers.js';
import { autoImportEdges } from './auto-imports.js';
import { extractGraph } from './index.js';

function lock(name: string, version: string) {
  const declaration = {
    version,
    resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`,
    integrity: 'sha512-fixture',
  };
  const manifest = {
    name: 'virtual-fixture',
    devDependencies: { [name]: version },
  };
  return {
    manifest,
    text: JSON.stringify({
      name: manifest.name,
      lockfileVersion: 3,
      packages: { '': manifest, [`node_modules/${name}`]: declaration },
    }),
  };
}

async function install(
  root: string,
  name: string,
  version: string,
  lockText: string,
) {
  const installed = join(root, 'node_modules', ...name.split('/'));
  await mkdir(installed, { recursive: true });
  await writeFile(
    join(installed, 'package.json'),
    JSON.stringify({ name, version, main: 'index.js' }),
  );
  await writeFile(join(installed, 'index.js'), 'export default {};');
  await writeFile(join(root, 'node_modules/.package-lock.json'), lockText);
}

test('resolves an iconify auto-import through its installed collection package', async () => {
  const icon = lock('@iconify-json/lucide', '1.2.3');
  const repo = await repository({
    'package.json': JSON.stringify(icon.manifest),
    'package-lock.json': icon.text,
    'vite.config.ts':
      "import Components from 'unplugin-vue-components';\nexport default Components({ dts: 'components.d.ts' });\n",
    'components.d.ts': [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    ILucideHouse: typeof import('~icons/lucide/house')['default']",
      '  }',
      '}',
    ].join('\n'),
    'page.vue': '<template><ILucideHouse /></template>',
  });
  try {
    await install(repo.root, '@iconify-json/lucide', '1.2.3', icon.text);
    await withComparison(repo.root, async (comparison) => {
      const edges = await autoImportEdges(comparison.headSnapshot);
      expect(edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            importer: 'page.vue',
            dependency: 'package.json',
            specifier: '~icons/lucide/house',
            kind: 'metadata',
          }),
          expect.objectContaining({
            importer: 'page.vue',
            dependency: 'package-lock.json',
            specifier: '~icons/lucide/house',
            kind: 'metadata',
          }),
        ]),
      );
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('resolves a custom icon auto-import to the committed svg', async () => {
  const repo = await repository({
    'vite.config.ts': [
      "import Components from 'unplugin-vue-components';",
      "import { FileSystemIconLoader } from 'unplugin-icons/loaders';",
      'export default {',
      "  plugins: [Components({ dts: 'components.d.ts' })],",
      '  customCollections: { example: FileSystemIconLoader("./src/assets/icons") },',
      '};',
    ].join('\n'),
    'components.d.ts': [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    IExampleMark: typeof import('~icons/example/mark')['default']",
      '  }',
      '}',
    ].join('\n'),
    'src/assets/icons/mark.svg': '<svg></svg>',
    'page.vue': '<template><IExampleMark /></template>',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const edges = await autoImportEdges(comparison.headSnapshot);
      expect(edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            importer: 'page.vue',
            dependency: 'src/assets/icons/mark.svg',
            specifier: '~icons/example/mark',
            kind: 'auto-import',
          }),
          expect.objectContaining({
            importer: 'page.vue',
            dependency: 'vite.config.ts',
            kind: 'configuration',
          }),
        ]),
      );
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('connects vue-router auto routes to the configured page files', async () => {
  const plugin = lock('unplugin-vue-router', '0.0.0');
  const repo = await repository({
    'package.json': JSON.stringify(plugin.manifest),
    'package-lock.json': plugin.text,
    'vite.config.ts': [
      "import VueRouter from 'unplugin-vue-router/vite';",
      "export default VueRouter({ routesFolder: 'src/routes' });",
    ].join('\n'),
    'src/routes/index.vue': '<template><p>Home</p></template>',
    'src/main.ts':
      "import { routes } from 'vue-router/auto-routes';\nexport const pages = routes;\n",
  });
  try {
    await install(repo.root, 'unplugin-vue-router', '0.0.0', plugin.text);
    const installed = join(repo.root, 'node_modules/unplugin-vue-router');
    await writeFile(
      join(installed, 'package.json'),
      JSON.stringify({
        name: 'unplugin-vue-router',
        version: '0.0.0',
        exports: { '.': './index.js', './vite': './vite.js' },
      }),
    );
    await writeFile(
      join(installed, 'vite.js'),
      'export default function VueRouter() {};',
    );
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(graph.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            importer: 'src/main.ts',
            dependency: 'src/routes/index.vue',
            specifier: 'vue-router/auto-routes',
            kind: 'import',
          }),
          expect.objectContaining({
            importer: 'src/main.ts',
            dependency: 'package.json',
            specifier: 'vue-router/auto-routes',
            kind: 'metadata',
          }),
          expect.objectContaining({
            importer: 'src/main.ts',
            dependency: 'vite.config.ts',
            kind: 'configuration',
          }),
        ]),
      );
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('treats a bare tailwind css import as installed package metadata', async () => {
  const tailwind = lock('tailwindcss', '4.0.0');
  const repo = await repository({
    'package.json': JSON.stringify(tailwind.manifest),
    'package-lock.json': tailwind.text,
    'src/styles/tailwind.css': '@import "tailwindcss";\n',
    'src/main.ts': "import './styles/tailwind.css';\n",
  });
  try {
    await install(repo.root, 'tailwindcss', '4.0.0', tailwind.text);
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(graph.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            importer: 'src/styles/tailwind.css',
            dependency: 'package.json',
            specifier: 'tailwindcss',
            kind: 'metadata',
          }),
        ]),
      );
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);
