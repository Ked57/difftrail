import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** @param {string} command @param {string[]} args @param {string} cwd */
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell:
      process.platform === 'win32' &&
      (command === 'pnpm' ||
        command === 'npm' ||
        command.toLowerCase().endsWith('.cmd')),
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.error ?? result.stderr}\n${result.stdout}`,
    );
  return result.stdout;
}

/** @param {string} temporary @param {string[]} installedBins */
async function testAliasedSourceLink(temporary, installedBins) {
  const fixture = join(temporary, 'aliased-link-repository');
  await mkdir(fixture);
  run('git', ['init', '--quiet'], fixture);
  run('git', ['config', 'user.email', 'fixture@example.invalid'], fixture);
  run('git', ['config', 'user.name', 'Fixture'], fixture);
  await writeFile(
    join(fixture, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { paths: { '@/*': ['*'] } } }),
  );
  await writeFile(join(fixture, 'first.ts'), 'export const value = 1;');
  await writeFile(join(fixture, 'second.ts'), 'export const value = 2;');
  await writeFile(
    join(fixture, 'consumer.ts'),
    "import {value} from '@/selected'; export {value};",
  );
  try {
    await symlink('first.ts', join(fixture, 'selected.ts'));
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : undefined;
    if (
      process.platform === 'win32' &&
      typeof code === 'string' &&
      ['EACCES', 'EINVAL', 'ENOSYS', 'EPERM'].includes(code)
    )
      return false;
    throw error;
  }
  run('git', ['add', '--all'], fixture);
  run('git', ['commit', '--quiet', '-m', 'baseline aliased link'], fixture);
  const base = run('git', ['rev-parse', 'HEAD'], fixture).trim();
  await rm(join(fixture, 'selected.ts'));
  await symlink('second.ts', join(fixture, 'selected.ts'));
  run('git', ['add', '--all'], fixture);
  run('git', ['commit', '--quiet', '-m', 'retarget aliased link'], fixture);
  const head = run('git', ['rev-parse', 'HEAD'], fixture).trim();
  for (const installedBin of installedBins) {
    const output = JSON.parse(
      run(installedBin, ['--base', base, '--head', head, '--json'], fixture),
    );
    assert.deepEqual(output.files, ['consumer.ts', 'selected.ts']);
  }
  return true;
}

const temporary = await realpath(
  await mkdtemp(join(tmpdir(), 'difftrail-package-')),
);
try {
  run(
    'pnpm',
    ['--filter', 'difftrail', 'pack', '--pack-destination', temporary],
    process.cwd(),
  );
  const archive = (await readdir(temporary)).find((file) =>
    file.endsWith('.tgz'),
  );
  assert.ok(archive, 'pack produced a tarball');
  const consumer = join(temporary, 'consumer');
  await mkdir(consumer);
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      dependencies: {
        '@vue/compiler-dom': '3.5.13',
        '@vue/compiler-sfc': '3.5.13',
        postcss: '8.4.49',
        typescript: '5.7.3',
      },
    }),
  );
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(temporary, archive),
    ],
    consumer,
  );
  const packageRoot = join(consumer, 'node_modules', 'difftrail');
  const manifest = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8'),
  );
  const workspaceManifest = JSON.parse(
    await readFile(join(process.cwd(), 'package.json'), 'utf8'),
  );
  assert.equal(manifest.name, 'difftrail');
  assert.equal(manifest.license, 'Apache-2.0');
  assert.equal(manifest.bin.difftrail, 'dist/cli.js');
  assert.equal(manifest.engines.node, '^22.18.0 || ^24.11.0');
  assert.equal(workspaceManifest.engines.node, manifest.engines.node);
  assert.deepEqual(manifest.files, ['dist', 'README.md', 'LICENSE']);
  assert.equal(manifest.dependencies['dependency-cruiser'], '18.6.0');
  assert.equal(manifest.dependencies['@vue/compiler-sfc'], '3.5.44');
  assert.equal(manifest.dependencies.typescript, '6.0.3');
  assert.ok(!JSON.stringify(manifest.dependencies).includes('workspace:'));
  /** @type {{ files: { path: string }[] }[]} */
  const packMetadata = JSON.parse(
    run(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      join(process.cwd(), 'packages', 'cli'),
    ),
  );
  const packedArtifact = packMetadata[0];
  assert.ok(packedArtifact);
  const packedFiles = packedArtifact.files.map((file) => file.path);
  assert.deepEqual(packedFiles.sort(), [
    'LICENSE',
    'README.md',
    'dist/cli.js',
    'package.json',
  ]);
  const code = await readFile(join(packageRoot, 'dist/cli.js'), 'utf8');
  assert.ok(code.startsWith('#!/usr/bin/env node\n'));
  assert.ok(!code.includes('@difftrail/'));
  await readFile(join(packageRoot, 'LICENSE'));
  await readFile(join(packageRoot, 'README.md'));
  const fixture = join(temporary, 'repository');
  await mkdir(fixture);
  run('git', ['init', '--quiet'], fixture);
  run('git', ['config', 'user.email', 'fixture@example.invalid'], fixture);
  run('git', ['config', 'user.name', 'Fixture'], fixture);
  await writeFile(join(fixture, 'leaf.js'), 'export const value=1;');
  await writeFile(
    join(fixture, 'consumer.js'),
    "export {value} from './leaf.js';",
  );
  run('git', ['add', '--all'], fixture);
  run('git', ['commit', '--quiet', '-m', 'baseline'], fixture);
  await writeFile(join(fixture, 'leaf.js'), 'export const value=2;');
  run('git', ['commit', '--quiet', '-am', 'change'], fixture);
  const bin = join(
    consumer,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'difftrail.cmd' : 'difftrail',
  );
  assert.equal(run(bin, [], fixture), 'consumer.js\nleaf.js\n');
  await writeFile(
    join(fixture, 'types.ts'),
    'export interface Value {value:number}',
  );
  await writeFile(
    join(fixture, 'typed.ts'),
    "import type {Value} from './types'; export const value:Value={value:1};",
  );
  const parserSmoke = join(packageRoot, 'parser-smoke.mjs');
  await writeFile(
    parserSmoke,
    await readFile('packages/cli/tests/parser-smoke.mjs'),
  );
  run(process.execPath, [parserSmoke, fixture], consumer);
  const vueFixture = join(temporary, 'vue-repository');
  await mkdir(vueFixture);
  run('git', ['init', '--quiet'], vueFixture);
  run('git', ['config', 'user.email', 'fixture@example.invalid'], vueFixture);
  run('git', ['config', 'user.name', 'Fixture'], vueFixture);
  for (const [path, contents] of Object.entries({
    'App.vue':
      '<template><Page /></template><script setup>import Page from "./Page.vue";</script>',
    'Use.vue':
      '<template><Page /></template><script lang="ts">import Page = require("./Page.vue"); type Shape = import("./shape").Shape;</script>',
    'Page.vue': [
      '<template src="./template.html"></template>',
      '<script src="./logic.js"></script>',
      '<style src="./style.css"></style>',
    ].join('\n'),
    'template.html': '<img src="./image.png" />',
    'logic.js': 'export const ready = true;',
    'style.css':
      '@import "./tokens.css"; .hero { content: "url(\'./not-an-asset.png\')"; background: url("./image.png") }',
    'tokens.css': ':root { --color: red; }',
    'image.png': 'before',
    'Video.vue':
      '<template><video src="./movie.mp4" poster="./poster.png"></video></template>',
    'VideoConsumer.vue':
      '<script setup>import Video from "./Video.vue";</script><template><Video /></template>',
    'movie.mp4': 'movie before',
    'poster.png': 'poster',
    'shape.ts': 'export interface Shape { readonly value: number }',
  }))
    await writeFile(join(vueFixture, path), contents);
  run('git', ['add', '--all'], vueFixture);
  run('git', ['commit', '--quiet', '-m', 'Vue baseline'], vueFixture);
  await writeFile(join(vueFixture, 'image.png'), 'after');
  run('git', ['commit', '--quiet', '-am', 'change Vue asset'], vueFixture);
  assert.equal(
    run(bin, [], vueFixture),
    'App.vue\nPage.vue\nUse.vue\nimage.png\nstyle.css\ntemplate.html\n',
  );
  await writeFile(
    join(vueFixture, 'shape.ts'),
    'export interface Shape { readonly value: string }',
  );
  run(
    'git',
    ['commit', '--quiet', '-am', 'change Vue imported type'],
    vueFixture,
  );
  assert.equal(run(bin, [], vueFixture), 'Use.vue\nshape.ts\n');
  await writeFile(join(vueFixture, 'movie.mp4'), 'movie after');
  run('git', ['commit', '--quiet', '-am', 'change Vue movie'], vueFixture);
  assert.equal(
    run(bin, [], vueFixture),
    'Video.vue\nVideoConsumer.vue\nmovie.mp4\n',
  );
  await writeFile(
    join(vueFixture, 'Video.vue'),
    '<template><video src="./missing.mp4"></video></template>',
  );
  run('git', ['commit', '--quiet', '-am', 'add missing Vue movie'], vueFixture);
  const missingMovie = spawnSync(
    process.execPath,
    [join(packageRoot, 'dist', 'cli.js')],
    {
      cwd: vueFixture,
      encoding: 'utf8',
    },
  );
  assert.equal(missingMovie.status, 1);
  assert.equal(missingMovie.stdout, '');
  assert.ok(
    missingMovie.stderr.includes(
      'cannot resolve required local reference ./missing.mp4',
    ),
  );
  await writeFile(
    join(vueFixture, 'Video.vue'),
    '<template><video src="./movie.mp4"></video></template>',
  );
  run(
    'git',
    ['commit', '--quiet', '-am', 'repair missing Vue movie'],
    vueFixture,
  );
  await writeFile(
    join(vueFixture, 'Video.vue'),
    '<template><video :src="movie"></video></template>',
  );
  run('git', ['commit', '--quiet', '-am', 'add dynamic Vue movie'], vueFixture);
  const dynamicMovie = spawnSync(
    process.execPath,
    [join(packageRoot, 'dist', 'cli.js')],
    { cwd: vueFixture, encoding: 'utf8' },
  );
  assert.equal(dynamicMovie.status, 1);
  assert.equal(dynamicMovie.stdout, '');
  assert.ok(
    dynamicMovie.stderr.includes(
      'dynamic template asset requires static resolution',
    ),
  );
  await writeFile(
    join(vueFixture, 'Video.vue'),
    '<template><video src="./movie.mp4"></video></template>',
  );
  run(
    'git',
    ['commit', '--quiet', '-am', 'repair dynamic Vue movie'],
    vueFixture,
  );
  const validMovieHead = run('git', ['rev-parse', 'HEAD'], vueFixture).trim();
  await writeFile(join(vueFixture, 'Page.vue'), '<template><main></template>');
  run('git', ['commit', '--quiet', '-am', 'invalid Vue template'], vueFixture);
  const invalidVue = spawnSync(
    process.execPath,
    [
      join(packageRoot, 'dist', 'cli.js'),
      '--base',
      validMovieHead,
      '--head',
      'HEAD',
    ],
    { cwd: vueFixture, encoding: 'utf8' },
  );
  assert.equal(invalidVue.status, 1);
  assert.equal(invalidVue.stdout, '');
  assert.ok(invalidVue.stderr.includes('Page.vue'));
  const createRequireFixture = join(temporary, 'vue-create-require-repository');
  await mkdir(createRequireFixture);
  run('git', ['init', '--quiet'], createRequireFixture);
  run(
    'git',
    ['config', 'user.email', 'fixture@example.invalid'],
    createRequireFixture,
  );
  run('git', ['config', 'user.name', 'Fixture'], createRequireFixture);
  await mkdir(join(createRequireFixture, 'nested'));
  for (const [path, contents] of Object.entries({
    'nested/provider.cjs': 'module.exports = 1;',
    'provider.cjs': 'module.exports = 0;',
    'nested/Widget.vue':
      '<script setup>import { createRequire as makeRequire } from "node:module"; const load = makeRequire(import.meta.url); load("./provider.cjs");</script>',
    'Page.vue':
      '<script setup>import Widget from "./nested/Widget.vue";</script>',
  }))
    await writeFile(join(createRequireFixture, path), contents);
  run('git', ['add', '--all'], createRequireFixture);
  run(
    'git',
    ['commit', '--quiet', '-m', 'Vue createRequire baseline'],
    createRequireFixture,
  );
  await writeFile(
    join(createRequireFixture, 'nested/provider.cjs'),
    'module.exports = 2;',
  );
  run(
    'git',
    ['commit', '--quiet', '-am', 'change nested provider'],
    createRequireFixture,
  );
  assert.equal(
    run(bin, [], createRequireFixture),
    'Page.vue\nnested/Widget.vue\nnested/provider.cjs\n',
  );
  await writeFile(
    join(createRequireFixture, 'nested/Widget.vue'),
    '<script setup>import { createRequire } from "node:module"; const load = createRequire("/other/file.cjs"); load("./provider.cjs");</script>',
  );
  run(
    'git',
    ['commit', '--quiet', '-am', 'unsupported Vue createRequire base'],
    createRequireFixture,
  );
  const unsupportedVueFactory = spawnSync(
    process.execPath,
    [join(packageRoot, 'dist', 'cli.js'), '--filter', 'never-matches'],
    { cwd: createRequireFixture, encoding: 'utf8' },
  );
  assert.equal(unsupportedVueFactory.status, 1);
  assert.equal(unsupportedVueFactory.stdout, '');
  assert.ok(unsupportedVueFactory.stderr.includes('nested/Widget.vue'));
  const autoImportFixture = join(temporary, 'auto-import-repository');
  await mkdir(autoImportFixture);
  run('git', ['init', '--quiet'], autoImportFixture);
  run(
    'git',
    ['config', 'user.email', 'fixture@example.invalid'],
    autoImportFixture,
  );
  run('git', ['config', 'user.name', 'Fixture'], autoImportFixture);
  const pluginRecord = {
    version: '1.0.0',
    resolved:
      'https://registry.npmjs.org/unplugin-vue-components/-/unplugin-vue-components-1.0.0.tgz',
    integrity: 'sha512-fixture',
  };
  const autoImportRecord = {
    version: '1.0.0',
    resolved:
      'https://registry.npmjs.org/unplugin-auto-import/-/unplugin-auto-import-1.0.0.tgz',
    integrity: 'sha512-fixture',
  };
  const pluginLock = {
    lockfileVersion: 3,
    packages: {
      '': {
        devDependencies: {
          'unplugin-vue-components': '1.0.0',
          'unplugin-auto-import': '1.0.0',
        },
      },
      'node_modules/unplugin-vue-components': pluginRecord,
      'node_modules/unplugin-auto-import': autoImportRecord,
    },
  };
  await writeFile(
    join(autoImportFixture, 'package.json'),
    JSON.stringify({
      private: true,
      devDependencies: {
        'unplugin-vue-components': '1.0.0',
        'unplugin-auto-import': '1.0.0',
      },
    }),
  );
  await writeFile(
    join(autoImportFixture, 'package-lock.json'),
    JSON.stringify(pluginLock),
  );
  const pluginRoot = join(
    autoImportFixture,
    'node_modules/unplugin-vue-components',
  );
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(
    join(pluginRoot, 'package.json'),
    JSON.stringify({
      name: 'unplugin-vue-components',
      version: '1.0.0',
      main: 'index.js',
    }),
  );
  await writeFile(join(pluginRoot, 'index.js'), 'module.exports = () => ({});');
  await writeFile(join(pluginRoot, 'vite.js'), 'module.exports = () => ({});');
  const autoImportRoot = join(
    autoImportFixture,
    'node_modules/unplugin-auto-import',
  );
  await mkdir(autoImportRoot, { recursive: true });
  await writeFile(
    join(autoImportRoot, 'package.json'),
    JSON.stringify({
      name: 'unplugin-auto-import',
      version: '1.0.0',
      main: 'index.js',
    }),
  );
  await writeFile(
    join(autoImportRoot, 'index.js'),
    'module.exports = () => ({});',
  );
  await writeFile(
    join(autoImportFixture, 'node_modules/.package-lock.json'),
    JSON.stringify(pluginLock),
  );
  /** @param {string} target */
  const declaration = (target) =>
    [
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      `    AutoButton: typeof import('${target}')['default']`,
      '  }',
      '}',
    ].join('\n');
  /** @param {Record<string, string>} files @param {string} message */
  const commitAutoImport = async (files, message) => {
    for (const [path, contents] of Object.entries(files)) {
      await mkdir(join(autoImportFixture, path, '..'), { recursive: true });
      await writeFile(join(autoImportFixture, path), contents);
    }
    run('git', ['add', '--all'], autoImportFixture);
    run('git', ['commit', '--quiet', '-m', message], autoImportFixture);
    return run('git', ['rev-parse', 'HEAD'], autoImportFixture).trim();
  };
  const baselineAutoImport = await commitAutoImport(
    {
      'vite.config.mjs': [
        "import Components from 'unplugin-vue-components/vite';",
        "import AutoImport from 'unplugin-auto-import';",
        "export default [Components({ dirs: ['./src/components/auto-primary'], dts: 'generated/components.d.ts' }), AutoImport({ dts: false, imports: [{ './src/composables/usePrice': ['usePrice'] }] })];",
      ].join('\n'),
      'generated/components.d.ts': declaration('../src/AutoButton.vue'),
      'src/AutoButton.vue': '<template><button><slot /></button></template>',
      'elsewhere/AutoButton.vue':
        '<template><button>Same name</button></template>',
      'pages/checkout.vue': '<template><AutoButton /></template>',
      'pages/settings.vue': '<template><main>Independent</main></template>',
      'src/App.vue': [
        '<script setup>',
        "import Checkout from '../pages/checkout.vue';",
        '</script>',
        '<template><Checkout /></template>',
      ].join('\n'),
      'src/main.ts': "import App from './App.vue';\nvoid App;",
      'src/composables/usePrice.ts': 'export default () => 1;',
      'pages/shorthand.ts': 'export const prices = { usePrice };',
      'pages/direct.ts': 'export const price = usePrice();',
    },
    'baseline auto-import mapping',
  );
  const mappedAutoImport = await commitAutoImport(
    {
      'generated/components.d.ts': declaration('../elsewhere/AutoButton.vue'),
    },
    'change only the auto-import mapping',
  );
  assert.deepEqual(
    run(
      bin,
      ['--base', baselineAutoImport, '--head', mappedAutoImport],
      autoImportFixture,
    )
      .trim()
      .split('\n'),
    [
      'generated/components.d.ts',
      'pages/checkout.vue',
      'src/App.vue',
      'src/main.ts',
    ],
  );
  const configOnlyAutoImport = await commitAutoImport(
    {
      'vite.config.mjs': [
        "import Components from 'unplugin-vue-components/vite';",
        "import AutoImport from 'unplugin-auto-import';",
        "export default [Components({ dirs: ['./src/components/auto-alternate'], dts: 'generated/components.d.ts' }), AutoImport({ dts: false, imports: [{ './src/composables/usePrice': ['usePrice'] }] })];",
      ].join('\n'),
    },
    'change only the component plugin configuration',
  );
  const configOnlyResult = JSON.parse(
    run(
      bin,
      ['--base', mappedAutoImport, '--head', configOnlyAutoImport, '--json'],
      autoImportFixture,
    ),
  );
  assert.deepEqual(configOnlyResult.files, [
    'pages/checkout.vue',
    'pages/direct.ts',
    'pages/shorthand.ts',
    'src/App.vue',
    'src/main.ts',
    'vite.config.mjs',
  ]);
  assert.ok(!configOnlyResult.files.includes('pages/settings.vue'));
  const shorthandAutoImport = await commitAutoImport(
    { 'src/composables/usePrice.ts': 'export default () => 2;' },
    'change auto-import provider used as shorthand value',
  );
  assert.deepEqual(
    run(
      bin,
      ['--base', configOnlyAutoImport, '--head', shorthandAutoImport],
      autoImportFixture,
    )
      .trim()
      .split('\n'),
    ['pages/direct.ts', 'pages/shorthand.ts', 'src/composables/usePrice.ts'],
  );
  const headGap = await commitAutoImport(
    { 'pages/checkout.vue': '<template><remote-widget /></template>' },
    'introduce a runtime-only auto-import gap',
  );
  const headGapResult = spawnSync(
    process.execPath,
    [join(packageRoot, 'dist', 'cli.js')],
    { cwd: autoImportFixture, encoding: 'utf8' },
  );
  assert.equal(headGapResult.status, 1);
  assert.equal(headGapResult.stdout, '');
  assert.ok(headGapResult.stderr.includes('remote-widget'));
  await commitAutoImport(
    { 'pages/checkout.vue': '<template><AutoButton /></template>' },
    'repair the runtime-only auto-import gap',
  );
  const baseGapResult = spawnSync(
    process.execPath,
    [join(packageRoot, 'dist', 'cli.js'), '--base', headGap, '--head', 'HEAD'],
    { cwd: autoImportFixture, encoding: 'utf8' },
  );
  assert.equal(baseGapResult.status, 1);
  assert.equal(baseGapResult.stdout, '');
  assert.ok(
    baseGapResult.stderr.includes('remote-widget'),
    baseGapResult.stderr,
  );
  const autoImportOptionsFixture = join(
    temporary,
    'auto-import-options-repository',
  );
  await mkdir(autoImportOptionsFixture);
  run('git', ['init', '--quiet'], autoImportOptionsFixture);
  run(
    'git',
    ['config', 'user.email', 'fixture@example.invalid'],
    autoImportOptionsFixture,
  );
  run('git', ['config', 'user.name', 'Fixture'], autoImportOptionsFixture);
  const autoImportPackageRecord = {
    version: '1.0.0',
    resolved:
      'https://registry.npmjs.org/unplugin-auto-import/-/unplugin-auto-import-1.0.0.tgz',
    integrity: 'sha512-fixture',
  };
  const autoImportLockPackages = {
    '': { devDependencies: { 'unplugin-auto-import': '1.0.0' } },
    'node_modules/unplugin-auto-import': autoImportPackageRecord,
  };
  for (const [path, contents] of Object.entries({
    'package.json': JSON.stringify({
      private: true,
      devDependencies: { 'unplugin-auto-import': '1.0.0' },
    }),
    'package-lock.json': JSON.stringify({
      lockfileVersion: 3,
      packages: autoImportLockPackages,
    }),
    'node_modules/.package-lock.json': JSON.stringify({
      lockfileVersion: 3,
      packages: autoImportLockPackages,
    }),
    'node_modules/unplugin-auto-import/package.json': JSON.stringify({
      name: 'unplugin-auto-import',
      version: '1.0.0',
      main: 'index.js',
    }),
    'node_modules/unplugin-auto-import/index.js':
      "module.exports = () => { throw new Error('plugin executed'); };",
    'composables/usePrice.ts': 'export default () => 41;',
    'pages/checkout.ts': 'export const total = usePrice();',
    'vite.config.mjs': [
      "import fs from 'node:fs';",
      "import { default as ConfigureImports } from 'unplugin-auto-import';",
      "const options = (fs.writeFileSync('executed', 'yes'), { dts: false, imports: [{ './composables/usePrice': ['usePrice'] }] });",
      'export default ConfigureImports(options);',
    ].join('\n'),
  })) {
    await mkdir(join(autoImportOptionsFixture, path, '..'), {
      recursive: true,
    });
    await writeFile(join(autoImportOptionsFixture, path), contents);
  }
  run('git', ['add', '--all'], autoImportOptionsFixture);
  run(
    'git',
    ['commit', '--quiet', '-m', 'unsupported auto-import options'],
    autoImportOptionsFixture,
  );
  const unsupportedOptionsBase = run(
    'git',
    ['rev-parse', 'HEAD'],
    autoImportOptionsFixture,
  ).trim();
  const literalOptionsConfig = [
    "import { default as ConfigureImports } from 'unplugin-auto-import';",
    "export default ConfigureImports({ dts: false, imports: [{ './composables/usePrice': ['usePrice'] }] });",
  ].join('\n');
  await writeFile(
    join(autoImportOptionsFixture, 'vite.config.mjs'),
    literalOptionsConfig,
  );
  await writeFile(
    join(autoImportOptionsFixture, 'composables/usePrice.ts'),
    'export default () => 42;',
  );
  run('git', ['add', '--all'], autoImportOptionsFixture);
  run(
    'git',
    ['commit', '--quiet', '-m', 'use literal auto-import options'],
    autoImportOptionsFixture,
  );
  const literalOptionsHead = run(
    'git',
    ['rev-parse', 'HEAD'],
    autoImportOptionsFixture,
  ).trim();
  const installedBaseGap = spawnSync(
    process.execPath,
    [
      join(packageRoot, 'dist', 'cli.js'),
      '--base',
      unsupportedOptionsBase,
      '--head',
      literalOptionsHead,
    ],
    { cwd: autoImportOptionsFixture, encoding: 'utf8' },
  );
  assert.equal(installedBaseGap.status, 1);
  assert.equal(installedBaseGap.stdout, '');
  assert.ok(installedBaseGap.stderr.includes(unsupportedOptionsBase));
  assert.ok(installedBaseGap.stderr.includes('unsupported static expression'));
  assert.equal(existsSync(join(autoImportOptionsFixture, 'executed')), false);
  await writeFile(
    join(autoImportOptionsFixture, 'composables/usePrice.ts'),
    'export default () => 43;',
  );
  run('git', ['add', '--all'], autoImportOptionsFixture);
  run(
    'git',
    ['commit', '--quiet', '-m', 'change mapped auto-import provider'],
    autoImportOptionsFixture,
  );
  const literalOptionsChange = run(
    'git',
    ['rev-parse', 'HEAD'],
    autoImportOptionsFixture,
  ).trim();
  assert.equal(
    run(
      bin,
      ['--base', literalOptionsHead, '--head', literalOptionsChange],
      autoImportOptionsFixture,
    ),
    'composables/usePrice.ts\npages/checkout.ts\n',
  );
  const siblingFixture = join(temporary, 'auto-import-sibling-repository');
  await mkdir(siblingFixture);
  run('git', ['init', '--quiet'], siblingFixture);
  run(
    'git',
    ['config', 'user.email', 'fixture@example.invalid'],
    siblingFixture,
  );
  run('git', ['config', 'user.name', 'Fixture'], siblingFixture);
  const siblingLock = {
    name: 'sibling-apps',
    lockfileVersion: 3,
    packages: {
      '': { name: 'sibling-apps' },
      'apps/a': {
        name: 'app-a',
        dependencies: { 'unplugin-auto-import': '1.0.0' },
      },
      'apps/b': {
        name: 'app-b',
        dependencies: { 'unplugin-auto-import': '1.0.0' },
      },
      'node_modules/unplugin-auto-import': autoImportRecord,
    },
  };
  for (const [path, contents] of Object.entries({
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({ name: 'sibling-apps', private: true }),
    'package-lock.json': JSON.stringify(siblingLock),
    'apps/a/package.json': JSON.stringify({
      name: 'app-a',
      dependencies: { 'unplugin-auto-import': '1.0.0' },
    }),
    'apps/a/vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: false, imports: [{ './useValue': ['useValue'] }] });",
    ].join('\n'),
    'apps/a/useValue.ts': 'export default () => "a";',
    'apps/a/page.ts': 'export const value = useValue();',
    'apps/b/package.json': JSON.stringify({
      name: 'app-b',
      dependencies: { 'unplugin-auto-import': '1.0.0' },
    }),
    'apps/b/vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: false, imports: [{ './useValue': ['useValue'] }] });",
    ].join('\n'),
    'apps/b/useValue.ts': 'export default () => "b";',
    'apps/b/page.ts': 'export const value = useValue();',
  })) {
    await mkdir(join(siblingFixture, path, '..'), { recursive: true });
    await writeFile(join(siblingFixture, path), contents);
  }
  run('git', ['add', '--all'], siblingFixture);
  run(
    'git',
    ['commit', '--quiet', '-m', 'sibling app baseline'],
    siblingFixture,
  );
  const siblingBase = run('git', ['rev-parse', 'HEAD'], siblingFixture).trim();
  const autoImportModule = join(
    siblingFixture,
    'node_modules/unplugin-auto-import',
  );
  await mkdir(autoImportModule, { recursive: true });
  await writeFile(
    join(autoImportModule, 'package.json'),
    JSON.stringify({
      name: 'unplugin-auto-import',
      version: '1.0.0',
      main: 'index.js',
    }),
  );
  await writeFile(
    join(autoImportModule, 'index.js'),
    'module.exports = options => options;',
  );
  await mkdir(join(siblingFixture, 'node_modules'), { recursive: true });
  await writeFile(
    join(siblingFixture, 'node_modules/.package-lock.json'),
    JSON.stringify({
      name: 'sibling-apps',
      lockfileVersion: 3,
      packages: {
        '': { name: 'sibling-apps' },
        'node_modules/unplugin-auto-import': autoImportRecord,
      },
    }),
  );
  await writeFile(
    join(siblingFixture, 'apps/a/useValue.ts'),
    'export default () => "a changed";',
  );
  run(
    'git',
    ['commit', '--quiet', '-am', 'change app A provider'],
    siblingFixture,
  );
  assert.deepEqual(
    JSON.parse(
      run(
        bin,
        ['--base', siblingBase, '--head', 'HEAD', '--json'],
        siblingFixture,
      ),
    ).files,
    ['apps/a/page.ts', 'apps/a/useValue.ts'],
  );
  const workspaceFixture = join(temporary, 'workspace-export-fixture');
  await mkdir(workspaceFixture);
  run('git', ['init', '--quiet'], workspaceFixture);
  run(
    'git',
    ['config', 'user.email', 'fixture@example.invalid'],
    workspaceFixture,
  );
  run('git', ['config', 'user.name', 'Fixture'], workspaceFixture);
  /** @param {Record<string, string>} files @param {string} message */
  const commitWorkspace = async (files, message) => {
    for (const [path, contents] of Object.entries(files)) {
      await mkdir(join(workspaceFixture, path, '..'), { recursive: true });
      await writeFile(join(workspaceFixture, path), contents);
    }
    run('git', ['add', '--all'], workspaceFixture);
    run('git', ['commit', '--quiet', '-m', message], workspaceFixture);
  };
  await commitWorkspace(
    {
      'package.json': JSON.stringify({
        name: 'workspace-root',
        private: true,
        type: 'module',
        workspaces: ['packages/*', 'apps/*'],
        devDependencies: { 'unplugin-auto-import': '1.0.0' },
      }),
      '.gitignore': 'node_modules/\n',
      'package-lock.json': JSON.stringify({
        name: 'workspace-root',
        lockfileVersion: 3,
        packages: {
          '': {
            name: 'workspace-root',
            workspaces: ['packages/*', 'apps/*'],
            devDependencies: { 'unplugin-auto-import': '1.0.0' },
          },
          'apps/site': {
            name: 'site',
            devDependencies: { 'unplugin-auto-import': '1.0.0' },
          },
          'apps/commonjs': { name: 'commonjs-app' },
          'apps/detected': { name: 'syntax-detected-app' },
          'apps/defaultjs': { name: 'default-js-app' },
          'apps/esm': { name: 'esm-app' },
          'packages/shared': { name: '@demo/shared' },
          'node_modules/unplugin-auto-import': { version: '1.0.0' },
        },
      }),
      'packages/shared/package.json': JSON.stringify({
        name: '@demo/shared',
        type: 'module',
        exports: {
          '.': {
            types: './types/index.d.ts',
            import: './src/import.js',
            require: './src/require.cjs',
          },
        },
      }),
      'packages/shared/types/index.d.ts':
        'export declare function useShared(): number;',
      'packages/shared/src/import.js': 'export const useShared = () => 1;',
      'packages/shared/src/require.cjs': 'exports.useShared = () => 2;',
      'vite.config.ts': [
        "import AutoImport from 'unplugin-auto-import';",
        "export default AutoImport({ dts: false, imports: [{ '@demo/shared': ['useShared'] }] });",
      ].join('\n'),
      'apps/site/package.json': JSON.stringify({
        name: 'site',
        type: 'module',
        dependencies: { '@demo/shared': 'workspace:*' },
        devDependencies: { 'unplugin-auto-import': '1.0.0' },
      }),
      'apps/commonjs/package.json': JSON.stringify({
        name: 'commonjs-app',
        type: 'commonjs',
        dependencies: { '@demo/shared': 'workspace:*' },
      }),
      'apps/detected/package.json': JSON.stringify({
        name: 'syntax-detected-app',
        dependencies: { '@demo/shared': 'workspace:*' },
      }),
      'apps/defaultjs/package.json': JSON.stringify({
        name: 'default-js-app',
        dependencies: { '@demo/shared': 'workspace:*' },
      }),
      'apps/esm/package.json': JSON.stringify({
        name: 'esm-app',
        type: 'module',
        dependencies: { '@demo/shared': 'workspace:*' },
      }),
      'node_modules/.package-lock.json': JSON.stringify({
        name: 'workspace-root',
        lockfileVersion: 3,
        packages: {
          '': {
            name: 'workspace-root',
            devDependencies: { 'unplugin-auto-import': '1.0.0' },
          },
          'node_modules/unplugin-auto-import': { version: '1.0.0' },
        },
      }),
      'apps/site/vite.config.ts': [
        "import AutoImport from 'unplugin-auto-import';",
        "export default AutoImport({ dts: false, imports: [{ '@demo/shared': ['useShared'] }] });",
      ].join('\n'),
      'apps/site/src/page.ts': 'export const page = useShared();',
      'apps/site/src/page.cjs': 'exports.page = useShared();',
      'apps/commonjs/src/page.js': 'exports.page = useShared();',
      'apps/detected/src/page.js': 'export const page = useShared();',
      'apps/defaultjs/src/page.js':
        "const page = useShared(); void import('./lazy.js');",
      'apps/defaultjs/src/lazy.js': 'export const loaded = true;',
      'apps/esm/src/page.js': 'export const page = useShared();',
    },
    'baseline workspace auto-import mapping',
  );
  const autoImportPlugin = join(
    workspaceFixture,
    'node_modules/unplugin-auto-import',
  );
  await mkdir(autoImportPlugin, { recursive: true });
  await writeFile(
    join(autoImportPlugin, 'package.json'),
    JSON.stringify({
      name: 'unplugin-auto-import',
      version: '1.0.0',
      main: 'index.js',
    }),
  );
  await writeFile(
    join(autoImportPlugin, 'index.js'),
    'module.exports = () => ({});',
  );
  await commitWorkspace(
    { 'packages/shared/src/import.js': 'export const useShared = () => 3;' },
    'change the ESM workspace entrypoint',
  );
  const toolWorkspace = join(consumer, 'node_modules/@demo/shared');
  await mkdir(toolWorkspace, { recursive: true });
  await writeFile(
    join(toolWorkspace, 'package.json'),
    JSON.stringify({
      name: '@demo/shared',
      type: 'module',
      exports: { '.': { import: './tool.js', require: './tool.cjs' } },
    }),
  );
  await writeFile(join(toolWorkspace, 'tool.js'), 'export const wrong = true;');
  await writeFile(join(toolWorkspace, 'tool.cjs'), 'exports.wrong = true;');
  const workspaceOutput = run(bin, [], workspaceFixture);
  assert.ok(workspaceOutput.includes('packages/shared/src/import.js'));
  assert.ok(workspaceOutput.includes('apps/site/src/page.ts'));
  assert.ok(workspaceOutput.includes('apps/esm/src/page.js'));
  assert.ok(workspaceOutput.includes('apps/detected/src/page.js'));
  assert.equal(workspaceOutput.includes('apps/defaultjs/src/page.js'), false);
  assert.equal(workspaceOutput.includes('apps/commonjs/src/page.js'), false);
  assert.ok(
    workspaceOutput.includes('packages/shared/src/require.cjs') === false,
  );
  assert.ok(workspaceOutput.includes('tool.js') === false);
  await commitWorkspace(
    { 'packages/shared/src/require.cjs': 'exports.useShared = () => 4;' },
    'change the CommonJS workspace entrypoint',
  );
  const requireOutput = run(bin, [], workspaceFixture);
  assert.ok(requireOutput.includes('packages/shared/src/require.cjs'));
  assert.ok(requireOutput.includes('apps/site/src/page.cjs'));
  assert.ok(requireOutput.includes('apps/commonjs/src/page.js'));
  assert.ok(requireOutput.includes('apps/defaultjs/src/page.js'));
  assert.equal(requireOutput.includes('apps/esm/src/page.js'), false);
  assert.equal(requireOutput.includes('apps/detected/src/page.js'), false);
  assert.ok(requireOutput.includes('packages/shared/src/import.js') === false);
  const pnpmConsumer = join(temporary, 'pnpm-consumer');
  await mkdir(pnpmConsumer);
  await writeFile(
    join(pnpmConsumer, 'package.json'),
    JSON.stringify({
      private: true,
      packageManager: 'pnpm@10.34.7',
      dependencies: { difftrail: `file:${join(temporary, archive)}` },
    }),
  );
  run(
    'pnpm',
    ['install', '--prefer-offline', '--ignore-scripts'],
    pnpmConsumer,
  );
  await writeFile(
    join(fixture, 'base.json'),
    JSON.stringify({
      compilerOptions: { paths: { '@a/*': ['packages/a/src/current/*'] } },
    }),
  );
  await mkdir(join(fixture, 'packages/a'), { recursive: true });
  await writeFile(
    join(fixture, 'packages/a/tsconfig.json'),
    JSON.stringify({ extends: '../../base.json' }),
  );
  await mkdir(join(fixture, 'packages/a/src/current'), { recursive: true });
  await mkdir(join(fixture, 'packages/a/src/alternate'), { recursive: true });
  await writeFile(
    join(fixture, 'packages/a/src/current/value.ts'),
    'export const value = 1;',
  );
  await writeFile(
    join(fixture, 'packages/a/src/alternate/value.ts'),
    'export const value = 2;',
  );
  await writeFile(
    join(fixture, 'packages/a/src/consumer.ts'),
    "import {value} from '@a/value'; export const page = value;",
  );
  run('git', ['add', '--all'], fixture);
  run('git', ['commit', '--quiet', '-m', 'add configured alias'], fixture);
  await writeFile(
    join(fixture, 'base.json'),
    JSON.stringify({
      compilerOptions: { paths: { '@a/*': ['packages/a/src/alternate/*'] } },
    }),
  );
  run('git', ['commit', '--quiet', '-am', 'change alias target'], fixture);
  const pnpmBin = join(
    pnpmConsumer,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'difftrail.cmd' : 'difftrail',
  );
  assert.equal(
    run(pnpmBin, [], fixture),
    [
      'base.json',
      'packages/a/src/alternate/value.ts',
      'packages/a/src/consumer.ts',
      'packages/a/src/current/value.ts',
    ].join('\n') + '\n',
  );
  const baseUrlFixture = join(temporary, 'base-url-repository');
  await mkdir(baseUrlFixture);
  run('git', ['init', '--quiet'], baseUrlFixture);
  run(
    'git',
    ['config', 'user.email', 'fixture@example.invalid'],
    baseUrlFixture,
  );
  run('git', ['config', 'user.name', 'Fixture'], baseUrlFixture);
  const baseUrlFiles = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: './src', paths: { '@/*': ['*'] } },
    }),
    'src/value.ts': 'export const value = 1;',
    'src/consumer.ts':
      "import {value} from '@/value'; export const page = value;",
    'src/image.svg': '<svg>real</svg>',
    'Page.vue': '<template><img src="@/image.svg" /></template>',
    'value.ts': 'export const decoy = true;',
    'image.svg': '<svg>decoy</svg>',
  };
  for (const [path, contents] of Object.entries(baseUrlFiles)) {
    const destination = join(baseUrlFixture, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
  run('git', ['add', '--all'], baseUrlFixture);
  run('git', ['commit', '--quiet', '-m', 'baseUrl aliases'], baseUrlFixture);
  await writeFile(
    join(baseUrlFixture, 'src/value.ts'),
    'export const value = 2;',
  );
  run(
    'git',
    ['commit', '--quiet', '-am', 'change aliased provider'],
    baseUrlFixture,
  );
  const baseUrlExpected = 'src/consumer.ts\nsrc/value.ts\n';
  assert.equal(run(bin, [], baseUrlFixture), baseUrlExpected);
  assert.equal(run(pnpmBin, [], baseUrlFixture), baseUrlExpected);
  const aliasedLinkSupported = await testAliasedSourceLink(temporary, [
    bin,
    pnpmBin,
  ]);
  console.log(
    `Isolated npm and strict pnpm tarball installs, explicit-baseUrl source aliases, Vue assets with conflicting consumer parsers, config-alias resolver, bundled modules, license, metadata and TypeScript parser passed; aliased source-link case ${aliasedLinkSupported ? 'passed' : 'skipped because this Windows runner does not allow creating symlinks'}.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
