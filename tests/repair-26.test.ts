import { spawnSync } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from './helpers.js';

const executable = resolve('packages/cli/dist/cli.js');

test('built CLI includes shorthand and direct-call auto-import consumers', async () => {
  const repo = await repository({
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({
      name: 'auto-import-history',
      private: true,
      devDependencies: { 'unplugin-auto-import': '0.19.0' },
    }),
    'package-lock.json': JSON.stringify({
      name: 'auto-import-history',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'auto-import-history',
          devDependencies: { 'unplugin-auto-import': '0.19.0' },
        },
        'node_modules/unplugin-auto-import': {
          version: '0.19.0',
          resolved:
            'https://registry.npmjs.org/unplugin-auto-import/-/unplugin-auto-import-0.19.0.tgz',
          integrity: 'sha512-fixture',
        },
      },
    }),
    'vite.config.ts': [
      "import AutoImport from 'unplugin-auto-import';",
      "export default AutoImport({ dts: false, imports: [{ './src/composables/usePrice': ['usePrice'] }] });",
    ].join('\n'),
    'src/composables/usePrice.ts': 'export default () => 42;',
    'src/pages/direct.ts': 'export const price = usePrice();',
    'src/pages/shorthand.ts': 'export const prices = { usePrice };',
    'src/pages/shadowed.ts': [
      'const usePrice = () => 0;',
      'export const prices = { usePrice };',
    ].join('\n'),
    'src/pages/property.ts': 'export const prices = { usePrice: 0 };',
    'src/pages/unrelated.ts': 'export const message = "unchanged";',
  });
  try {
    const installed = join(repo.root, 'node_modules/unplugin-auto-import');
    await mkdir(installed, { recursive: true });
    await writeFile(
      join(installed, 'package.json'),
      JSON.stringify({
        name: 'unplugin-auto-import',
        version: '0.19.0',
        main: 'index.js',
      }),
    );
    await writeFile(
      join(installed, 'index.js'),
      'module.exports = function () {};',
    );
    await mkdir(join(repo.root, 'node_modules'), { recursive: true });
    await writeFile(
      join(repo.root, 'node_modules/.package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/unplugin-auto-import': {
            version: '0.19.0',
            resolved:
              'https://registry.npmjs.org/unplugin-auto-import/-/unplugin-auto-import-0.19.0.tgz',
            integrity: 'sha512-fixture',
          },
        },
      }),
    );
    const base = repo.git('rev-parse', 'HEAD');
    const head = await repo.commit({
      'src/composables/usePrice.ts': 'export default () => 43;',
    });
    const result = spawnSync(
      process.execPath,
      [executable, '--base', base, '--head', head, '--json'],
      { cwd: repo.root, encoding: 'utf8' },
    );
    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toEqual({
      root: await realpath(repo.root),
      base,
      head,
      scope: 'static',
      files: [
        'src/composables/usePrice.ts',
        'src/pages/direct.ts',
        'src/pages/shorthand.ts',
      ],
      removed: [],
    });
  } finally {
    await repo.cleanup();
  }
});
