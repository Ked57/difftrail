import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
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
