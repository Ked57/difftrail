import { expect, test } from 'vitest';
import { repository } from '../../../tests/helpers.js';
import { withComparison } from '@difftrail/git';
import { extractGraph } from './index.js';

test('extracts both Vue script blocks and type-only relationships onto their owner', async () => {
  const repo = await repository({
    'shape.ts': 'export interface Shape { readonly value: number }',
    'value.ts': 'export const value = 1;',
    'lazy.ts': 'export const loaded = true;',
    'Widget.vue': [
      '<template><div /></template>',
      '<script lang="ts">import {value} from "./value"; export {value} from "./value"; export {type Shape} from "./shape"; const lazy = import("./lazy");</script>',
      '<script setup lang="ts">import type {Shape} from "./shape"; const shape: Shape = {value: 1};</script>',
    ].join('\n'),
    'Page.vue':
      '<template><Widget /></template><script setup>import Widget from "./Widget.vue";</script>',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) => edge.importer.endsWith('.vue'))
          .map((edge) => [
            edge.importer,
            edge.specifier,
            edge.dependency,
            edge.kind,
          ])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([
        ['Page.vue', './Widget.vue', 'Widget.vue', 'import'],
        ['Widget.vue', './lazy', 'lazy.ts', 'dynamic-import'],
        ['Widget.vue', './shape', 'shape.ts', 'type-import'],
        ['Widget.vue', './shape', 'shape.ts', 'type-re-export'],
        ['Widget.vue', './value', 'value.ts', 'import'],
        ['Widget.vue', './value', 'value.ts', 're-export'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('extracts Vue import-equals and import-type-query relationships', async () => {
  const repo = await repository({
    'Widget.ts': 'export class Widget {}',
    'shape.ts': 'export interface Shape { value: number }',
    'Page.vue': [
      '<template><Widget /></template>',
      '<script lang="ts">import Widget = require("./Widget"); type Shape = import("./shape").Shape;</script>',
    ].join('\n'),
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) => edge.importer === 'Page.vue')
          .map((edge) => [
            edge.importer,
            edge.specifier,
            edge.dependency,
            edge.kind,
          ])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual(
        [
          ['Page.vue', './Widget', 'Widget.ts', 'import-equals'],
          ['Page.vue', './shape', 'shape.ts', 'type-import'],
        ].sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      );
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('tracks Vue block src, template assets, and CSS imports and URLs', async () => {
  const repo = await repository({
    'Page.vue': [
      '<template src="./page.html"></template>',
      '<script src="./logic.js"></script>',
      '<style src="./page.css"></style>',
    ].join('\n'),
    'Inline.vue': '<template><img src="./image.png" /></template>',
    'page.html':
      '<img src="./image.png" /><video poster="https://cdn.example/poster.png"></video>',
    'logic.js': 'export const page = true;',
    'page.css':
      '@import "./tokens.css"; .hero { background: url("./image.png") }',
    'tokens.css': ':root { --color: red; }',
    'image.png': 'fixture',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      const relationships = graph.edges.map((edge) => [
        edge.importer,
        edge.specifier,
        edge.dependency,
        edge.kind,
      ]);
      expect(
        relationships.sort((left, right) =>
          left.join('/').localeCompare(right.join('/')),
        ),
      ).toEqual(
        [
          ['Inline.vue', './image.png', 'image.png', 'template-asset'],
          ['Page.vue', './logic.js', 'logic.js', 'script-src'],
          ['Page.vue', './page.css', 'page.css', 'style-src'],
          ['Page.vue', './page.html', 'page.html', 'template-src'],
          ['page.html', './image.png', 'image.png', 'template-asset'],
          ['page.css', './image.png', 'image.png', 'css-url'],
          ['page.css', './tokens.css', 'tokens.css', 'css-import'],
        ].sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      );
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('does not treat URL-like CSS strings as asset references', async () => {
  const repo = await repository({
    'theme.css': `.icon { content: "url('./not-an-asset.png')"; background: url("./image.png"); }`,
    'image.png': 'fixture',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges.map((edge) => [
          edge.importer,
          edge.specifier,
          edge.dependency,
          edge.kind,
        ]),
      ).toEqual([['theme.css', './image.png', 'image.png', 'css-url']]);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('accepts a scriptless Vue component and diagnoses invalid template syntax', async () => {
  const valid = await repository({
    'Empty.vue': '<template><main /></template>',
  });
  try {
    await withComparison(valid.root, async (comparison) => {
      expect(await extractGraph(comparison.headSnapshot)).toEqual({
        revision: comparison.head,
        edges: [],
      });
    });
  } finally {
    await valid.cleanup();
  }

  const invalid = await repository({
    'Broken.vue': '<template><main></template>',
  });
  try {
    await withComparison(invalid.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        `Analysis gap in Broken.vue at ${comparison.head}`,
      ),
    );
  } finally {
    await invalid.cleanup();
  }
}, 30_000);

test('resolves Vue and CSS asset references through committed aliases', async () => {
  const repo = await repository({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '@assets/*': ['assets/*'] } },
    }),
    'Page.vue': '<template><img src="@assets/icon.svg" /></template>',
    'theme.css': '@import "@assets/theme.css";',
    'assets/icon.svg': '<svg />',
    'assets/theme.css': ':root { --color: red; }',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .map((edge) => [
            edge.importer,
            edge.specifier,
            edge.dependency,
            edge.kind,
          ])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([
        ['Page.vue', '@assets/icon.svg', 'assets/icon.svg', 'template-asset'],
        ['Page.vue', 'tsconfig.json', 'tsconfig.json', 'configuration'],
        ['theme.css', '@assets/theme.css', 'assets/theme.css', 'css-import'],
        ['theme.css', 'tsconfig.json', 'tsconfig.json', 'configuration'],
      ]);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('fails when a required local template asset is missing', async () => {
  const repo = await repository({
    'Page.vue': '<template><img src="./missing.svg" /></template>',
  });
  try {
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        `Analysis gap in Page.vue at ${comparison.head}`,
      ),
    );
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test.each([
  [
    'aliased named import',
    'import { createRequire as makeRequire } from "node:module"; const load = makeRequire(import.meta.url); load("./provider.cjs");',
  ],
  [
    'namespace member',
    'import * as Module from "node:module"; const load = Module.createRequire(import.meta.url); load("./provider.cjs");',
  ],
  [
    'default member',
    'import Module from "node:module"; const load = Module["createRequire"](import.meta.url); load("./provider.cjs");',
  ],
  [
    'CommonJS acquisition',
    'const { createRequire: makeRequire } = require("module"); const load = makeRequire(import.meta.url); load("./provider.cjs");',
  ],
])(
  'resolves Vue createRequire through %s',
  async (_name, script) => {
    const repo = await repository({
      'provider.cjs': 'module.exports = true;',
      'Widget.vue': `<script>${script}</script>`,
    });
    try {
      await withComparison(repo.root, async (comparison) => {
        const graph = await extractGraph(comparison.headSnapshot);
        expect(
          graph.edges
            .filter((edge) => edge.importer === 'Widget.vue')
            .map((edge) => [edge.specifier, edge.dependency, edge.kind]),
        ).toContainEqual(['./provider.cjs', 'provider.cjs', 'require']);
      });
    } finally {
      await repo.cleanup();
    }
  },
  30_000,
);

test('ordinary Vue helpers named like Node loaders do not add dependencies', async () => {
  const repo = await repository({
    'provider.cjs': 'module.exports = true;',
    'Widget.vue':
      '<script setup>function createRequire(_base) { return (name) => name; } function load(_name) {} load("./provider.cjs");</script>',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges.filter((edge) => edge.importer === 'Widget.vue'),
      ).toEqual([]);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test('resolves a TypeScript script-setup namespace loader and rejects missing or nonliteral targets', async () => {
  const repo = await repository({
    'provider.cjs': 'module.exports = true;',
    'Widget.vue':
      '<script setup lang="ts">import * as Module from "node:module"; const load = Module.createRequire(import.meta.url); load("./provider.cjs");</script>',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) => edge.importer === 'Widget.vue')
          .map((edge) => [edge.specifier, edge.dependency, edge.kind]),
      ).toContainEqual(['./provider.cjs', 'provider.cjs', 'require']);
    });
  } finally {
    await repo.cleanup();
  }

  for (const dependency of ['target', '"./missing.cjs"']) {
    const invalid = await repository({
      'Widget.vue': `<script setup lang="ts">import { createRequire } from "node:module"; const load = createRequire(import.meta.url); load(${dependency});</script>`,
    });
    try {
      await withComparison(invalid.root, async (comparison) =>
        expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
          `Analysis gap in Widget.vue at ${comparison.head}`,
        ),
      );
    } finally {
      await invalid.cleanup();
    }
  }
}, 30_000);

test.each([
  ['invalid SFC script', '<script lang="ts">export const = 2;</script>'],
  ['dynamic template asset', '<template><img :src="imagePath" /></template>'],
])(
  'reports an analysis gap for %s',
  async (_name, source) => {
    const repo = await repository({ 'Page.vue': source });
    try {
      await withComparison(repo.root, async (comparison) =>
        expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
          `Analysis gap in Page.vue at ${comparison.head}`,
        ),
      );
    } finally {
      await repo.cleanup();
    }
  },
  30_000,
);

test('resolves renamed Vue createRequire loaders from the owning component', async () => {
  const repo = await repository({
    'nested/provider.cjs': 'module.exports = true;',
    'provider.cjs': 'module.exports = false;',
    'nested/Widget.vue':
      '<script setup>import { createRequire } from "node:module"; const load = createRequire(import.meta.url); load("./provider.cjs");</script>',
    'Page.vue':
      '<script setup>import Widget from "./nested/Widget.vue";</script>',
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) => edge.importer === 'nested/Widget.vue')
          .map((edge) => [edge.specifier, edge.dependency, edge.kind])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([['./provider.cjs', 'nested/provider.cjs', 'require']]);
    });
  } finally {
    await repo.cleanup();
  }
}, 30_000);

test.each([
  [
    'unrelated base',
    'import { createRequire as makeRequire } from "node:module"; const load = makeRequire("/other/file.cjs"); load("./provider.cjs");',
    'Node createRequire base must be the owning import.meta.url; other bases require unsupported resolution',
  ],
  [
    'indirect factory result',
    'import { createRequire } from "node:module"; const factory = createRequire; const load = factory(import.meta.url); load("./provider.cjs");',
    'Node createRequire passed as a value is not supported; use a direct binding with import.meta.url',
  ],
])(
  'reports a Vue analysis gap for %s',
  async (_name, script, reason) => {
    const repo = await repository({
      'provider.cjs': 'module.exports = true;',
      'Widget.vue': `<script setup>${script}</script>`,
    });
    try {
      await withComparison(repo.root, async (comparison) =>
        expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
          `Analysis gap in Widget.vue at ${comparison.head}: ${reason}`,
        ),
      );
    } finally {
      await repo.cleanup();
    }
  },
  30_000,
);
