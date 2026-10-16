import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from './helpers.js';

const executable = resolve('packages/cli/dist/cli.js');

function cli(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function config(provider: string): string {
  return [
    "import AutoImport from 'unplugin-auto-import';",
    `export default AutoImport({ dts: false, imports: [{ './${provider}': ['useValue'] }] });`,
  ].join('\n');
}

async function appRepository() {
  const lockEntry = {
    version: '0.0.0',
    resolved:
      'https://registry.npmjs.org/unplugin-auto-import/-/unplugin-auto-import-0.0.0.tgz',
    integrity: 'sha512-fixture',
  };
  const repo = await repository({
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({
      name: 'repair-28-fixture',
      version: '1.0.0',
    }),
    'package-lock.json': JSON.stringify({
      name: 'repair-28-fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': { name: 'repair-28-fixture', version: '1.0.0' },
        'apps/a': {
          name: 'app-a',
          dependencies: { 'unplugin-auto-import': '0.0.0' },
        },
        'apps/b': {
          name: 'app-b',
          dependencies: { 'unplugin-auto-import': '0.0.0' },
        },
        'node_modules/unplugin-auto-import': lockEntry,
      },
    }),
    'apps/a/package.json': JSON.stringify({
      name: 'app-a',
      dependencies: { 'unplugin-auto-import': '0.0.0' },
    }),
    'apps/a/vite.config.ts': config('useValue'),
    'apps/a/useValue.ts': 'export default () => "a";',
    'apps/a/page.ts': 'export const value = useValue();',
    'apps/b/package.json': JSON.stringify({
      name: 'app-b',
      dependencies: { 'unplugin-auto-import': '0.0.0' },
    }),
    'apps/b/vite.config.ts': config('useValue'),
    'apps/b/useValue.ts': 'export default () => "b";',
    'apps/b/page.ts': 'export const value = useValue();',
  });
  await mkdir(join(repo.root, 'node_modules/unplugin-auto-import'), {
    recursive: true,
  });
  await writeFile(
    join(repo.root, 'node_modules/unplugin-auto-import/package.json'),
    JSON.stringify({
      name: 'unplugin-auto-import',
      version: '0.0.0',
      main: 'index.js',
    }),
  );
  await writeFile(
    join(repo.root, 'node_modules/unplugin-auto-import/index.js'),
    'module.exports = options => options;',
  );
  await mkdir(join(repo.root, 'node_modules'), { recursive: true });
  await writeFile(
    join(repo.root, 'node_modules/.package-lock.json'),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'repair-28-fixture', version: '1.0.0' },
        'node_modules/unplugin-auto-import': lockEntry,
      },
    }),
  );
  return repo;
}

test.each([
  { app: 'a', sibling: 'b' },
  { app: 'b', sibling: 'a' },
])(
  'built CLI isolates the changed app $app from sibling auto-import evidence',
  async ({ app, sibling }) => {
    const repo = await appRepository();
    try {
      const base = repo.git('rev-parse', 'HEAD');
      const head = await repo.commit({
        [`apps/${app}/useValue.ts`]: `export default () => "${app}-changed";`,
      });
      const result = cli(repo.root, '--base', base, '--head', head, '--json');
      expect({
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      }).toEqual({
        status: 0,
        stdout:
          JSON.stringify({
            root: repo.root,
            base,
            head,
            scope: 'static',
            files: [`apps/${app}/page.ts`, `apps/${app}/useValue.ts`],
            removed: [],
          }) + '\n',
        stderr: '',
      });
      expect(result.stdout).not.toContain(`apps/${sibling}/`);
      const configHead = await repo.commit({
        [`apps/${app}/vite.config.ts`]: `${config('useValue')}\n// app-only configuration update\n`,
      });
      const configResult = cli(
        repo.root,
        '--base',
        head,
        '--head',
        configHead,
        '--json',
      );
      expect(JSON.parse(configResult.stdout)).toEqual({
        root: repo.root,
        base: head,
        head: configHead,
        scope: 'static',
        files: [`apps/${app}/page.ts`, `apps/${app}/vite.config.ts`],
        removed: [],
      });
      expect(configResult.stderr).toBe('');
    } finally {
      await repo.cleanup();
    }
  },
);
