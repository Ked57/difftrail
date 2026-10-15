import { spawnSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from './helpers.js';

const executable = resolve('packages/cli/dist/cli.js');

test('built CLI resolves workspace devDependencies from matching npm install metadata', async () => {
  const lock = {
    name: 'npm-cli-fixture',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'npm-cli-fixture',
        workspaces: ['packages/*'],
      },
      'packages/app': {
        name: 'npm-cli-app',
        devDependencies: { 'external-leaf': '1.2.3' },
      },
      'node_modules/external-leaf': {
        version: '1.2.3',
        resolved:
          'https://registry.npmjs.org/external-leaf/-/external-leaf-1.2.3.tgz',
        integrity: 'sha512-fixture',
      },
    },
  };
  const repo = await repository({
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({
      name: 'npm-cli-fixture',
      workspaces: ['packages/*'],
    }),
    'package-lock.json': JSON.stringify(lock),
    'packages/app/package.json': JSON.stringify({
      name: 'npm-cli-app',
      devDependencies: { 'external-leaf': '1.2.3' },
    }),
    'packages/app/consumer.js':
      "import {value} from 'external-leaf'; export const result = value;",
  });
  try {
    const installed = join(repo.root, 'node_modules/external-leaf');
    await mkdir(installed, { recursive: true });
    await writeFile(
      join(installed, 'package.json'),
      JSON.stringify({
        name: 'external-leaf',
        version: '1.2.3',
        main: 'index.js',
      }),
    );
    await writeFile(join(installed, 'index.js'), 'export const value = 1;');
    await mkdir(join(repo.root, 'node_modules'), { recursive: true });
    await writeFile(
      join(repo.root, 'node_modules/.package-lock.json'),
      JSON.stringify({ lockfileVersion: 3, packages: lock.packages }),
    );
    await repo.commit({
      'packages/app/consumer.js':
        "import {value} from 'external-leaf'; export const result = value + 1;",
    });
    const result = spawnSync(process.execPath, [executable], {
      cwd: repo.root,
      encoding: 'utf8',
    });
    expect(result).toMatchObject({
      status: 0,
      stdout: 'packages/app/consumer.js\n',
      stderr: '',
    });
  } finally {
    await repo.cleanup();
  }
});

async function pnpmWorkspaceFixture() {
  return repository({
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({
      name: 'pnpm-workspace-fixture',
      private: true,
      packageManager: 'pnpm@10.34.7',
    }),
    'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
    'apps/first/package.json': JSON.stringify({
      name: 'first-app',
      dependencies: { chalk: '4.1.2' },
    }),
    'apps/first/consumer.js':
      "import chalk from 'chalk'; export const color = chalk.green('first');",
    'apps/second/package.json': JSON.stringify({
      name: 'second-app',
      dependencies: { chalk: '5.6.2' },
    }),
    'apps/second/consumer.js':
      "import chalk from 'chalk'; export const color = chalk.green('second');",
    'apps/alias/package.json': JSON.stringify({
      name: 'alias-app',
      dependencies: { 'chalk-legacy': 'npm:chalk@4.1.2' },
    }),
    'apps/alias/consumer.js':
      "import chalk from 'chalk-legacy'; export const color = chalk.green('alias');",
  });
}

function pnpmCommand(root: string, args: readonly string[]) {
  return spawnSync('pnpm', [...args], { cwd: root, encoding: 'utf8' });
}

async function installPnpmWorkspace(
  repo: Awaited<ReturnType<typeof repository>>,
) {
  const lock = pnpmCommand(repo.root, [
    'install',
    '--lockfile-only',
    '--ignore-scripts',
    '--prefer-offline',
  ]);
  expect(lock.status, `${lock.stdout}\n${lock.stderr}`).toBe(0);
  await repo.commit({
    'pnpm-lock.yaml': await readFile(join(repo.root, 'pnpm-lock.yaml'), 'utf8'),
  });
  const install = pnpmCommand(repo.root, [
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
    '--prefer-offline',
  ]);
  expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);
  await expect(lstat(join(repo.root, 'node_modules/chalk'))).rejects.toThrow();
  await expect(
    lstat(join(repo.root, 'apps/first/node_modules/chalk')),
  ).resolves.toBeDefined();
  await expect(
    lstat(join(repo.root, 'apps/second/node_modules/chalk')),
  ).resolves.toBeDefined();
  await expect(
    lstat(join(repo.root, 'apps/alias/node_modules/chalk-legacy')),
  ).resolves.toBeDefined();
}

function runCli(root: string) {
  return spawnSync(process.execPath, [executable], {
    cwd: root,
    encoding: 'utf8',
  });
}

async function rootProviderFixture() {
  return repository({
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({
      name: 'pnpm-root-provider-fixture',
      private: true,
      packageManager: 'pnpm@10.34.7',
      devDependencies: { chalk: '4.1.2' },
    }),
    'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
    'apps/site/package.json': JSON.stringify({ name: 'site-app' }),
    'apps/site/consumer.js':
      "import chalk from 'chalk'; export const color = chalk.green('site');",
  });
}

async function installRootProviderWorkspace(
  repo: Awaited<ReturnType<typeof repository>>,
  changedManifests: readonly string[] = [],
): Promise<void> {
  const lock = pnpmCommand(repo.root, [
    'install',
    '--lockfile-only',
    '--ignore-scripts',
    '--prefer-offline',
  ]);
  expect(lock.status, `${lock.stdout}\n${lock.stderr}`).toBe(0);
  const paths = [...changedManifests, 'pnpm-lock.yaml'];
  const entries = await Promise.all(
    paths.map(
      async (path) =>
        [path, await readFile(join(repo.root, path), 'utf8')] as const,
    ),
  );
  await repo.commit(Object.fromEntries(entries));
  const install = pnpmCommand(repo.root, [
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
    '--prefer-offline',
  ]);
  expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0);
}

function expectCliGap(root: string, ...context: readonly string[]): void {
  const result = runCli(root);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  for (const part of context)
    expect(result.stderr, result.stderr).toContain(part);
}

async function pointAliasAtWrongVersion(root: string): Promise<void> {
  const secondPackage = join(root, 'apps/second/node_modules/chalk');
  const firstPackage = join(root, 'apps/first/node_modules/chalk');
  await rm(secondPackage);
  await symlink(await realpath(firstPackage), secondPackage, 'dir');
}

test('built CLI resolves app-only dependencies from a standard pnpm workspace install', async () => {
  const repo = await pnpmWorkspaceFixture();
  try {
    await installPnpmWorkspace(repo);
    await repo.commit({
      'apps/first/consumer.js':
        "import chalk from 'chalk'; export const color = chalk.blue('first');",
      'apps/second/consumer.js':
        "import chalk from 'chalk'; export const color = chalk.blue('second');",
      'apps/alias/consumer.js':
        "import chalk from 'chalk-legacy'; export const color = chalk.blue('alias');",
    });
    const result = runCli(repo.root);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toBe(
      'apps/alias/consumer.js\napps/first/consumer.js\napps/second/consumer.js\n',
    );
    expect(result.stderr).toBe('');

    await pointAliasAtWrongVersion(repo.root);
    const mismatch = runCli(repo.root);
    expect(mismatch.status).toBe(1);
    expect(mismatch.stdout).toBe('');
    expect(mismatch.stderr).toContain(
      'Analysis gap in apps/second/consumer.js at',
    );
    expect(mismatch.stderr).toContain('apps/second/package.json');
    expect(mismatch.stderr).toContain(
      'installed package identity for chalk does not match pnpm-lock.yaml',
    );
  } finally {
    await repo.cleanup();
  }
});

test('built CLI resolves root-only pnpm providers and rejects invalid ancestor evidence', async () => {
  const repo = await rootProviderFixture();
  const rootLink = join(repo.root, 'node_modules/chalk');
  try {
    await installRootProviderWorkspace(repo);
    await expect(lstat(rootLink)).resolves.toBeDefined();
    await expect(
      lstat(join(repo.root, 'apps/site/node_modules/chalk')),
    ).rejects.toThrow();

    await repo.commit({
      'apps/site/consumer.js':
        "import chalk from 'chalk'; export const color = chalk.blue('site');",
    });
    const result = runCli(repo.root);
    expect(result).toMatchObject({
      status: 0,
      stdout: 'apps/site/consumer.js\n',
      stderr: '',
    });

    const rootPackage = await realpath(rootLink);
    await rm(rootLink);
    expectCliGap(
      repo.root,
      'apps/site/consumer.js',
      'node_modules/chalk/package.json',
    );
    await symlink(rootPackage, rootLink, 'dir');

    await writeFile(
      join(rootPackage, 'package.json'),
      JSON.stringify({ name: 'chalk', version: '0.0.0' }),
    );
    expectCliGap(
      repo.root,
      'installed package identity for chalk does not match pnpm-lock.yaml',
    );
    await writeFile(
      join(rootPackage, 'package.json'),
      JSON.stringify({
        name: 'chalk',
        version: '4.1.2',
        main: 'source/index.js',
      }),
    );

    const localManifest = JSON.stringify({
      name: 'site-app',
      dependencies: { chalk: '5.6.2' },
    });
    await writeFile(join(repo.root, 'apps/site/package.json'), localManifest);
    await installRootProviderWorkspace(repo, ['apps/site/package.json']);
    const appLink = join(repo.root, 'apps/site/node_modules/chalk');
    await rm(appLink);
    await symlink(rootPackage, appLink, 'dir');
    await repo.commit({
      'apps/site/consumer.js':
        "import chalk from 'chalk'; export const color = chalk.red('site');",
    });
    expectCliGap(
      repo.root,
      'Analysis gap in apps/site/consumer.js at',
      'apps/site/package.json',
      'installed package identity for chalk does not match pnpm-lock.yaml',
    );
  } finally {
    await repo.cleanup();
  }
});
