import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from '../../../tests/helpers.js';
import { withComparison } from '@difftrail/git';
import { extractGraph } from './index.js';

test.each([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const)(
  'uses an ordinary npm %s install only when package and endpoint lock identities agree',
  async (section) => {
    const declaration = { [section]: { 'external-leaf': '1.2.3' } };
    const manifest = { name: 'npm-fixture', ...declaration };
    const packageRecord = {
      version: '1.2.3',
      resolved:
        'https://registry.npmjs.org/external-leaf/-/external-leaf-1.2.3.tgz',
      integrity: 'sha512-fixture',
    };
    const lock = {
      name: 'npm-fixture',
      lockfileVersion: 3,
      packages: {
        '': { name: 'npm-fixture', ...declaration },
        'node_modules/external-leaf': packageRecord,
      },
    };
    const repo = await repository({
      'package.json': JSON.stringify(manifest),
      'package-lock.json': JSON.stringify(lock),
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
      await writeFile(
        join(installedRoot, 'index.js'),
        'export const value = 1;',
      );
      await mkdir(join(repo.root, 'node_modules'), { recursive: true });
      await writeFile(
        join(repo.root, 'node_modules/.package-lock.json'),
        JSON.stringify({ lockfileVersion: 3, packages: lock.packages }),
      );
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
            dependency: 'package-lock.json',
            specifier: 'external-leaf',
            kind: 'metadata',
          },
        ]);
      });

      await writeFile(
        join(repo.root, 'node_modules/.package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            ...lock.packages,
            'node_modules/external-leaf': {
              ...packageRecord,
              integrity: 'sha512-changed',
            },
          },
        }),
      );
      await withComparison(repo.root, async (comparison) =>
        expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
          'installed npm package metadata for external-leaf differs from package-lock.json',
        ),
      );
      await unlink(join(repo.root, 'node_modules/.package-lock.json'));
      await withComparison(repo.root, async (comparison) =>
        expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
          'required installed dependency evidence',
        ),
      );
    } finally {
      await repo.cleanup();
    }
  },
);
