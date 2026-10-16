import { writeFile, mkdir, access, symlink } from 'node:fs/promises';
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

test('preserves safe tracked source symlink identity for importers and targets', async () => {
  const repo = await repository({
    'actual.ts':
      "import {dependency} from './dependency'; export {dependency};",
    'dependency.ts': 'export const dependency = 1;',
    'consumer.ts': "import {actual} from './alias'; export {actual};",
  });
  try {
    await symlink('actual.ts', join(repo.root, 'alias.ts'));
    await symlink('alias.ts', join(repo.root, 'linked.ts'));
    repo.git('add', 'alias.ts', 'linked.ts');
    repo.git('commit', '--quiet', '-m', 'track source alias');
    await repo.commit({ 'dependency.ts': 'export const dependency = 2;' });
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(graph.edges).toContainEqual({
        importer: 'consumer.ts',
        dependency: 'alias.ts',
        specifier: './alias',
        kind: 'import',
      });
      expect(graph.edges).toContainEqual({
        importer: 'alias.ts',
        dependency: 'dependency.ts',
        specifier: './dependency',
        kind: 'import',
      });
    });
  } finally {
    await repo.cleanup();
  }
});

test('extracts TypeScript imports from the committed snapshot', async () => {
  const repo = await repository({
    'leaf.ts': 'export const leaf: number = 1;',
    'consumer.ts': "import {leaf} from './leaf'; export const value = leaf;",
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(graph.edges).toEqual([
        {
          importer: 'consumer.ts',
          dependency: 'leaf.ts',
          specifier: './leaf',
          kind: 'import',
        },
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});

test('retains TypeScript import, type, re-export, and literal dynamic relationships', async () => {
  const repo = await repository({
    'types.ts': 'export interface Shape { readonly value: number }',
    'values.ts': 'export const value = 1;',
    'lazy.ts': 'export const lazy = true;',
    'consumer.ts': [
      "import type {Shape} from './types';",
      "export {value} from './values';",
      "void import('./lazy');",
      'export const shape: Shape = {value: 1};',
    ].join('\n'),
    'jsx-widget.tsx': 'export const Widget = () => <section />;',
    'jsx-page.tsx':
      "import {Widget} from './jsx-widget'; export const page = <Widget />;",
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter(
            (edge) =>
              edge.importer === 'consumer.ts' ||
              edge.importer === 'jsx-page.tsx',
          )
          .map((edge) => [edge.importer, edge.specifier, edge.kind])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([
        ['consumer.ts', './lazy', 'dynamic-import'],
        ['consumer.ts', './types', 'type-import'],
        ['consumer.ts', './values', 're-export'],
        ['jsx-page.tsx', './jsx-widget', 'import'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});

test('retains TypeScript import-equals and import type query relationships', async () => {
  const repo = await repository({
    'leaf.ts': 'export const value = 1;',
    'types.ts': 'export interface Shape {value: number}',
    'consumer.ts': [
      "import leaf = require('./leaf');",
      "type Shape = import('./types').Shape;",
      'export const value: Shape = {value: leaf.value};',
    ].join('\n'),
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) => edge.importer === 'consumer.ts')
          .map((edge) => [edge.specifier, edge.kind, edge.dependency])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([
        ['./leaf', 'import-equals', 'leaf.ts'],
        ['./types', 'type-import', 'types.ts'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});

test('resolves inherited package aliases without a baseUrl', async () => {
  const repo = await repository({
    'base.json': JSON.stringify({
      compilerOptions: { paths: { '@a/*': ['packages/a/src/*'] } },
    }),
    'packages/a/tsconfig.json': JSON.stringify({ extends: '../../base.json' }),
    'packages/a/src/leaf.ts': 'export const leaf = 1;',
    'packages/a/src/consumer.ts':
      "import {leaf} from '@a/leaf'; export const value = leaf;",
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .map((edge) => `${edge.importer} -> ${edge.dependency}`)
          .sort(),
      ).toEqual(
        [
          'packages/a/src/consumer.ts -> base.json',
          'packages/a/src/consumer.ts -> packages/a/src/leaf.ts',
          'packages/a/src/consumer.ts -> packages/a/tsconfig.json',
          'packages/a/src/leaf.ts -> base.json',
          'packages/a/src/leaf.ts -> packages/a/tsconfig.json',
        ].sort(),
      );
    });
  } finally {
    await repo.cleanup();
  }
});

test('resolves snapshot workspace exports and retains the manifests used', async () => {
  const repo = await repository({
    'package.json': JSON.stringify({
      name: 'example',
      workspaces: ['packages/*', 'apps/*'],
    }),
    'packages/shared/package.json': JSON.stringify({
      name: '@demo/shared',
      exports: {
        '.': {
          import: './src/esm.js',
          require: './src/cjs.cjs',
        },
      },
    }),
    'packages/shared/src/esm.js': 'export const value = 1;',
    'packages/shared/src/cjs.cjs': 'module.exports = {value: 1};',
    'apps/site/package.json': JSON.stringify({
      name: 'site',
      dependencies: { '@demo/shared': 'workspace:*' },
    }),
    'apps/site/src/page.mjs':
      "import {value} from '@demo/shared'; export const page = value;",
    'apps/site/src/page.cjs':
      "const {value} = require('@demo/shared'); module.exports = value;",
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) =>
            ['apps/site/src/page.mjs', 'apps/site/src/page.cjs'].includes(
              edge.importer,
            ),
          )
          .map((edge) => [edge.importer, edge.dependency, edge.kind])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([
        ['apps/site/src/page.cjs', 'apps/site/package.json', 'metadata'],
        ['apps/site/src/page.cjs', 'package.json', 'metadata'],
        ['apps/site/src/page.cjs', 'packages/shared/package.json', 'metadata'],
        ['apps/site/src/page.cjs', 'packages/shared/src/cjs.cjs', 'require'],
        ['apps/site/src/page.mjs', 'apps/site/package.json', 'metadata'],
        ['apps/site/src/page.mjs', 'package.json', 'metadata'],
        ['apps/site/src/page.mjs', 'packages/shared/package.json', 'metadata'],
        ['apps/site/src/page.mjs', 'packages/shared/src/esm.js', 'import'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});

test.each([
  ['invalid syntax', 'export const = 1;', 'consumer.js'],
  [
    'dynamic non-literal import',
    'const target = "./leaf.js"; void import(target);',
    'consumer.js',
  ],
  ['unresolved static import', "import './missing.js';", 'consumer.js'],
])(
  'fails with an actionable analysis gap for %s',
  async (_case, source, filename) => {
    const repo = await repository({ [filename]: source });
    try {
      await withComparison(repo.root, async (comparison) =>
        expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
          `Analysis gap in ${filename} at ${comparison.head}`,
        ),
      );
    } finally {
      await repo.cleanup();
    }
  },
);

test('accepts a pnpm v9 installed package only with matching committed lock evidence', async () => {
  const manifest = JSON.stringify({
    name: 'pnpm-fixture',
    dependencies: { 'external-leaf': '1.2.3' },
  });
  const lock = [
    'lockfileVersion: 9.0',
    'settings: {}',
    'importers:',
    '  .:',
    '    dependencies:',
    '      external-leaf:',
    '        specifier: 1.2.3',
    '        version: 1.2.3',
    'packages:',
    '  external-leaf@1.2.3:',
    '    resolution:',
    '      integrity: sha512-fixture',
    'snapshots:',
    '  external-leaf@1.2.3: {}',
  ].join('\n');
  const repo = await repository({
    'package.json': manifest,
    'pnpm-lock.yaml': lock,
    'consumer.js': "import {value} from 'external-leaf'; export {value};",
  });
  try {
    const installedRoot = join(repo.root, 'node_modules/external-leaf');
    await mkdir(installedRoot, { recursive: true });
    await writeFile(
      join(installedRoot, 'package.json'),
      JSON.stringify({
        name: 'external-leaf',
        version: '1.2.3',
        main: 'index.js',
      }),
    );
    await writeFile(join(installedRoot, 'index.js'), 'export const value = 1;');
    await mkdir(join(repo.root, 'node_modules/.pnpm'), { recursive: true });
    await writeFile(
      join(repo.root, 'node_modules/.modules.yaml'),
      'virtualStoreDir: .pnpm\n',
    );
    await writeFile(join(repo.root, 'node_modules/.pnpm/lock.yaml'), lock);
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(graph.edges).toEqual([
        {
          importer: 'consumer.js',
          dependency: 'package.json',
          specifier: 'external-leaf',
          kind: 'metadata',
        },
        {
          importer: 'consumer.js',
          dependency: 'pnpm-lock.yaml',
          specifier: 'external-leaf',
          kind: 'metadata',
        },
      ]);
    });
    await writeFile(
      join(repo.root, 'node_modules/.pnpm/lock.yaml'),
      lock.replace('version: 1.2.3', 'version: 1.2.4'),
    );
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        'installed pnpm lock metadata differs from committed pnpm-lock.yaml',
      ),
    );
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
    'factory-helper.js':
      "function createRequire() {return value=>value;} const require=createRequire();const target='plain';export const value=require(target);require('./not-a-module.js');",
    'local.js':
      "function require(value) {return value;} const input='local'; export const value=require(input); require('./not-a-module.js');",
    'block.cjs':
      "{const require=value=>value; require('./not-a-module.js');} module.exports=require('./leaf.cjs');",
    'parameter.cjs':
      "function invoke(require, value) {require(value); require('./not-a-module.js');} const leaf=require('./leaf.cjs'); module.exports={invoke,leaf};",
    'imported.js':
      "import {loader as require} from './loader.js'; const input='local'; export const value=require(input); require('./not-a-module.js');",
    'ambient.ts':
      "declare const require: (name: string) => unknown; export const value = require('./leaf.cjs');",
    'ambient-function.ts':
      "declare function require(name: string): unknown; export const value = require('./leaf.cjs');",
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges.map((edge) => [edge.importer, edge.dependency]).sort(),
      ).toEqual([
        ['ambient-function.ts', 'leaf.cjs'],
        ['ambient.ts', 'leaf.cjs'],
        ['block.cjs', 'leaf.cjs'],
        ['imported.js', 'loader.js'],
        ['parameter.cjs', 'leaf.cjs'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});

test('retains Node createRequire bindings with the owning import.meta.url base', async () => {
  const repo = await repository({
    'leaf.cjs': 'module.exports=1;',
    'sub/leaf.cjs': 'module.exports=2;',
    'sub/consumer.mjs':
      "import {createRequire as makeRequire} from 'module'; const require=makeRequire(import.meta.url); export const value=require('./leaf.cjs');",
    'default.mjs':
      "import nodeModule from 'node:module';const require=nodeModule['createRequire'](import.meta.url);export const value=require('./leaf.cjs');",
    'alias.mjs':
      "import * as nodeModule from 'node:module'; const load=nodeModule.createRequire(import.meta.url); export const value=load('./leaf.cjs');",
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges.map((edge) => [edge.importer, edge.dependency]).sort(),
      ).toEqual([
        ['alias.mjs', 'leaf.cjs'],
        ['default.mjs', 'leaf.cjs'],
        ['sub/consumer.mjs', 'sub/leaf.cjs'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
});
