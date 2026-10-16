import { expect, test } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repository } from './helpers.js';

const executable = resolve('packages/cli/dist/cli.js');
function cli(cwd: string, ...args: string[]) {
  const temporaryRoot = join(cwd, '.difftrail-test-tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  return spawnSync(process.execPath, [executable, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      TMPDIR: temporaryRoot,
      TMP: temporaryRoot,
      TEMP: temporaryRoot,
    },
  });
}

const literalConfig = [
  "import { default as ConfigureImports } from 'unplugin-auto-import';",
  "export default ConfigureImports({ dts: false, imports: [{ './composables/usePrice': ['usePrice'] }] });",
].join('\n');
const identifierConfig = [
  "import fs from 'node:fs';",
  "import { default as ConfigureImports } from 'unplugin-auto-import';",
  "const options = (fs.writeFileSync('executed', 'yes'), { dts: false, imports: [{ './composables/usePrice': ['usePrice'] }] });",
  'export default ConfigureImports(options);',
].join('\n');
const callResultConfig = [
  "import fs from 'node:fs';",
  "import { default as ConfigureImports } from 'unplugin-auto-import';",
  "export default ConfigureImports((fs.writeFileSync('executed', 'yes'), loadOptions()));",
].join('\n');
const shadowedBindingConfig = [
  literalConfig,
  "function helper(ConfigureImports: (options: unknown) => unknown) { return ConfigureImports({ dts: false, imports: [{ './decoy/usePrice': ['usePrice'] }] }); }",
  'function AutoImport(options: unknown) { return options; }',
  'void helper((options: unknown) => options);',
  "void AutoImport({ dts: false, imports: [{ './decoy/usePrice': ['usePrice'] }] });",
].join('\n');

async function configHistory(
  baseConfig: string,
  headConfig: string,
  changeIndependent = true,
) {
  const repo = await repository({
    'package.json': JSON.stringify({
      private: true,
      devDependencies: { 'unplugin-auto-import': '1.0.0' },
    }),
    'package-lock.json': JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { devDependencies: { 'unplugin-auto-import': '1.0.0' } },
        'node_modules/unplugin-auto-import': {
          version: '1.0.0',
          resolved:
            'https://registry.npmjs.org/unplugin-auto-import/-/unplugin-auto-import-1.0.0.tgz',
          integrity: 'sha512-fixture',
        },
      },
    }),
    'node_modules/.package-lock.json': JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { devDependencies: { 'unplugin-auto-import': '1.0.0' } },
        'node_modules/unplugin-auto-import': {
          version: '1.0.0',
          resolved:
            'https://registry.npmjs.org/unplugin-auto-import/-/unplugin-auto-import-1.0.0.tgz',
          integrity: 'sha512-fixture',
        },
      },
    }),
    'node_modules/unplugin-auto-import/package.json': JSON.stringify({
      name: 'unplugin-auto-import',
      version: '1.0.0',
      main: 'index.js',
    }),
    'node_modules/unplugin-auto-import/index.js':
      "module.exports = () => { throw new Error('plugin executed'); };",
    'vite.config.ts': baseConfig,
    'composables/usePrice.ts': 'export default () => 41;',
    'decoy/usePrice.ts': 'export default () => 99;',
    'pages/checkout.ts': 'export const total = usePrice();',
    'independent.ts': 'export const unchanged = true;',
  });
  const base = repo.git('rev-parse', 'HEAD');
  const head = await repo.commit({
    'vite.config.ts': headConfig,
    'composables/usePrice.ts': 'export default () => 42;',
    ...(changeIndependent
      ? { 'independent.ts': 'export const unchanged = false;' }
      : {}),
  });
  return {
    ...repo,
    base,
    head,
    invalidRevision: baseConfig === literalConfig ? head : base,
  };
}

test('built CLI rejects unsupported auto-import options atomically at either endpoint', async () => {
  const histories: Awaited<ReturnType<typeof configHistory>>[] = [];
  for (const invalidConfig of [identifierConfig, callResultConfig]) {
    histories.push(await configHistory(invalidConfig, literalConfig));
    histories.push(await configHistory(literalConfig, invalidConfig));
  }
  try {
    for (const repo of histories) {
      for (const args of [
        ['--base', repo.base, '--head', repo.head],
        ['--base', repo.base, '--head', repo.head, '--json'],
        ['--base', repo.base, '--head', repo.head, '--null'],
        [
          '--base',
          repo.base,
          '--head',
          repo.head,
          '--filter',
          'independent.ts',
        ],
      ]) {
        const result = cli(repo.root, ...args);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Analysis gap in vite.config.ts');
        expect(result.stderr).toContain(`at ${repo.invalidRevision}`);
        expect(result.stderr).toContain('unsupported static expression');
        expect(existsSync(join(repo.root, 'executed'))).toBe(false);
      }
    }
  } finally {
    await Promise.all(histories.map((repo) => repo.cleanup()));
  }
});

test('built CLI returns exactly the mapped provider and its consumer for literal options', async () => {
  const repo = await configHistory(literalConfig, literalConfig, false);
  try {
    const result = cli(repo.root, '--base', repo.base, '--head', repo.head);
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      stdout: 'composables/usePrice.ts\npages/checkout.ts\n',
      stderr: '',
    });
  } finally {
    await repo.cleanup();
  }
});

test('built CLI ignores a local shadow and an unrelated same-named helper', async () => {
  const repo = await configHistory(
    shadowedBindingConfig,
    shadowedBindingConfig,
    false,
  );
  try {
    const result = cli(repo.root, '--base', repo.base, '--head', repo.head);
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      stdout: 'composables/usePrice.ts\npages/checkout.ts\n',
      stderr: '',
    });
  } finally {
    await repo.cleanup();
  }
});
