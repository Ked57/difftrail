import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** @param {string} command @param {string[]} args @param {string} cwd */
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command !== process.execPath,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.error ?? result.stderr}\n${result.stdout}`,
    );
  return result.stdout;
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
  assert.equal(manifest.name, 'difftrail');
  assert.equal(manifest.license, 'Apache-2.0');
  assert.equal(manifest.bin.difftrail, 'dist/cli.js');
  assert.equal(manifest.dependencies['dependency-cruiser'], '18.6.0');
  assert.equal(manifest.dependencies['@vue/compiler-sfc'], '3.5.44');
  assert.equal(manifest.dependencies.typescript, '6.0.3');
  assert.ok(!JSON.stringify(manifest.dependencies).includes('workspace:'));
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
  await writeFile(join(vueFixture, 'Page.vue'), '<template><main></template>');
  run('git', ['commit', '--quiet', '-am', 'invalid Vue template'], vueFixture);
  const invalidVue = spawnSync(
    process.execPath,
    [join(packageRoot, 'dist', 'cli.js')],
    { cwd: vueFixture, encoding: 'utf8' },
  );
  assert.equal(invalidVue.status, 1);
  assert.equal(invalidVue.stdout, '');
  assert.ok(invalidVue.stderr.includes('Page.vue'));
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
  const pluginLock = {
    lockfileVersion: 3,
    packages: {
      '': {
        devDependencies: { 'unplugin-vue-components': '1.0.0' },
      },
      'node_modules/unplugin-vue-components': pluginRecord,
    },
  };
  await writeFile(
    join(autoImportFixture, 'package.json'),
    JSON.stringify({
      private: true,
      devDependencies: { 'unplugin-vue-components': '1.0.0' },
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
  await commitAutoImport(
    {
      'vite.config.mjs': [
        "import Components from 'unplugin-vue-components';",
        "export default Components({ dts: 'generated/components.d.ts' });",
      ].join('\n'),
      'generated/components.d.ts': declaration('../src/AutoButton.vue'),
      'src/AutoButton.vue': '<template><button>Mapped</button></template>',
      'elsewhere/AutoButton.vue':
        '<template><button>Same name</button></template>',
      'pages/checkout.vue': '<template><AutoButton /></template>',
    },
    'baseline auto-import mapping',
  );
  await commitAutoImport(
    {
      'generated/components.d.ts': declaration('../elsewhere/AutoButton.vue'),
    },
    'change only the auto-import mapping',
  );
  assert.equal(
    run(bin, [], autoImportFixture),
    'generated/components.d.ts\npages/checkout.vue\n',
  );
  const headGap = await commitAutoImport(
    { 'pages/checkout.vue': '<template><RemoteWidget /></template>' },
    'introduce a runtime-only auto-import gap',
  );
  const headGapResult = spawnSync(
    process.execPath,
    [join(packageRoot, 'dist', 'cli.js')],
    { cwd: autoImportFixture, encoding: 'utf8' },
  );
  assert.equal(headGapResult.status, 1);
  assert.equal(headGapResult.stdout, '');
  assert.ok(headGapResult.stderr.includes('RemoteWidget'));
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
    baseGapResult.stderr.includes('RemoteWidget'),
    baseGapResult.stderr,
  );
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
  console.log(
    'Isolated npm and strict pnpm tarball installs, CLI, Vue assets with conflicting consumer parsers, config-alias resolver, bundled modules, license, metadata and TypeScript parser passed.',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
