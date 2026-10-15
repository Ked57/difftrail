import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from '../../../tests/helpers.js';
import { withComparison } from '@difftrail/git';
import { extractGraph } from './index.js';

const packages = [
  { app: 'first', link: 'external-leaf', version: '1.2.3' },
  { app: 'second', link: 'external-leaf', version: '2.0.0' },
  { app: 'alias', link: 'legacy-leaf', version: '1.2.3' },
] as const;

function workspaceLock(): string {
  return [
    'lockfileVersion: 9.0',
    'settings: {}',
    'importers:',
    '  .: {}',
    '  apps/first:',
    '    dependencies:',
    '      external-leaf:',
    '        specifier: 1.2.3',
    '        version: 1.2.3',
    '  apps/second:',
    '    dependencies:',
    '      external-leaf:',
    '        specifier: 2.0.0',
    '        version: 2.0.0',
    '  apps/alias:',
    '    dependencies:',
    '      legacy-leaf:',
    '        specifier: npm:external-leaf@1.2.3',
    '        version: external-leaf@1.2.3',
    'packages:',
    '  external-leaf@1.2.3:',
    '    resolution: {integrity: sha512-one}',
    '  external-leaf@2.0.0:',
    '    resolution: {integrity: sha512-two}',
    'snapshots:',
    '  external-leaf@1.2.3: {}',
    '  external-leaf@2.0.0: {}',
  ].join('\n');
}

async function writeInstalledPackage(
  root: string,
  app: string,
  link: string,
  version: string,
): Promise<void> {
  const packageRoot = join(
    root,
    'node_modules/.pnpm',
    `external-leaf@${version}/node_modules/external-leaf`,
  );
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'external-leaf', version, main: 'index.js' }),
  );
  await writeFile(join(packageRoot, 'index.js'), 'export const value = 1;');
  const importerModules = join(root, 'apps', app, 'node_modules');
  await mkdir(importerModules, { recursive: true });
  await symlink(packageRoot, join(importerModules, link), 'dir');
}

async function pnpmWorkspaceRepository() {
  const lock = workspaceLock();
  const repo = await repository({
    '.gitignore': 'node_modules/\n',
    'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
    'package.json': JSON.stringify({ name: 'pnpm-workspace', private: true }),
    'pnpm-lock.yaml': lock,
    'apps/first/package.json': JSON.stringify({
      name: 'first-app',
      dependencies: { 'external-leaf': '1.2.3' },
    }),
    'apps/first/consumer.js':
      "import {value} from 'external-leaf'; export const first = value;",
    'apps/second/package.json': JSON.stringify({
      name: 'second-app',
      dependencies: { 'external-leaf': '2.0.0' },
    }),
    'apps/second/consumer.js':
      "import {value} from 'external-leaf'; export const second = value;",
    'apps/alias/package.json': JSON.stringify({
      name: 'alias-app',
      dependencies: { 'legacy-leaf': 'npm:external-leaf@1.2.3' },
    }),
    'apps/alias/consumer.js':
      "import {value} from 'legacy-leaf'; export const alias = value;",
  });
  for (const item of packages)
    await writeInstalledPackage(repo.root, item.app, item.link, item.version);
  await mkdir(join(repo.root, 'node_modules/.pnpm'), { recursive: true });
  await writeFile(
    join(repo.root, 'node_modules/.modules.yaml'),
    'virtualStoreDir: .pnpm\n',
  );
  await writeFile(join(repo.root, 'node_modules/.pnpm/lock.yaml'), lock);
  return repo;
}

test('resolves each pnpm workspace importer and rejects missing or mismatched installs', async () => {
  const repo = await pnpmWorkspaceRepository();
  const firstAlias = join(repo.root, 'apps/first/node_modules/external-leaf');
  const firstPackage = join(
    repo.root,
    'node_modules/.pnpm/external-leaf@1.2.3/node_modules/external-leaf',
  );
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) => edge.kind === 'metadata')
          .map((edge) => [edge.importer, edge.dependency])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual([
        ['apps/alias/consumer.js', 'apps/alias/package.json'],
        ['apps/alias/consumer.js', 'pnpm-lock.yaml'],
        ['apps/first/consumer.js', 'apps/first/package.json'],
        ['apps/first/consumer.js', 'pnpm-lock.yaml'],
        ['apps/second/consumer.js', 'apps/second/package.json'],
        ['apps/second/consumer.js', 'pnpm-lock.yaml'],
      ]);
    });
    await rm(firstAlias);
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /Analysis gap in apps\/first\/consumer\.js at .*apps\/first\/package\.json.*apps\/first\/node_modules\/external-leaf\/package\.json/,
      ),
    );
    await symlink(firstPackage, firstAlias, 'dir');
    await rm(join(repo.root, 'apps/second/node_modules/external-leaf'));
    await symlink(
      firstPackage,
      join(repo.root, 'apps/second/node_modules/external-leaf'),
      'dir',
    );
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /Analysis gap in apps\/second\/consumer\.js at .*apps\/second\/package\.json.*installed package identity for external-leaf does not match pnpm-lock\.yaml/,
      ),
    );
    await writeFile(
      join(repo.root, 'apps/second/package.json'),
      JSON.stringify({
        name: 'second-app',
        dependencies: { 'external-leaf': '2.1.0' },
      }),
    );
    await repo.commit({
      'apps/second/package.json': await readFile(
        join(repo.root, 'apps/second/package.json'),
        'utf8',
      ),
    });
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /Analysis gap in apps\/second\/consumer\.js at .*apps\/second\/package\.json.*pnpm-lock\.yaml declaration for external-leaf does not match apps\/second\/package\.json/,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});
