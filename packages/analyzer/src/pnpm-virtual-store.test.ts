import { mkdir, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from '../../../tests/helpers.js';
import { withComparison } from '@difftrail/git';
import { extractGraph } from './index.js';

const lock = [
  'lockfileVersion: 9.0',
  'settings: {}',
  'importers:',
  '  .:',
  '    devDependencies:',
  '      external-leaf:',
  '        specifier: 1.0.0',
  '        version: 1.0.0',
  '  apps/first: {}',
  'packages:',
  '  external-leaf@1.0.0:',
  '    resolution: {integrity: sha512-one}',
  'snapshots:',
  '  external-leaf@1.0.0: {}',
].join('\n');

async function pnpmRepository(
  virtualStoreDir: (nodeModules: string) => string = () => '.pnpm',
) {
  const repo = await repository({
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({
      name: 'pnpm-workspace',
      private: true,
      devDependencies: { 'external-leaf': '1.0.0' },
    }),
    'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
    'pnpm-lock.yaml': lock,
    'apps/first/package.json': JSON.stringify({ name: 'first-app' }),
    'apps/first/consumer.js': "import 'external-leaf';",
  });
  const nodeModules = join(repo.root, 'node_modules');
  const packageRoot = join(
    nodeModules,
    '.pnpm/external-leaf@1.0.0/node_modules/external-leaf',
  );
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'external-leaf', version: '1.0.0' }),
  );
  await writeFile(join(packageRoot, 'index.js'), 'export const value = 1;');
  await symlink(packageRoot, join(nodeModules, 'external-leaf'), 'dir');
  await writeFile(
    join(nodeModules, '.modules.yaml'),
    `virtualStoreDir: ${JSON.stringify(virtualStoreDir(nodeModules))}\n`,
  );
  await writeFile(join(nodeModules, '.pnpm/lock.yaml'), lock);
  return { repo, nodeModules };
}

test('resolves an absolute pnpm virtual store within node_modules', async () => {
  const { repo } = await pnpmRepository((nodeModules) =>
    join(nodeModules, '.pnpm'),
  );
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges.some((edge) => edge.dependency === 'pnpm-lock.yaml'),
      ).toBe(true);
    });
  } finally {
    await repo.cleanup();
  }
});

test('rejects an absolute pnpm virtual store outside node_modules', async () => {
  const { repo } = await pnpmRepository((root) =>
    join(root, '..', 'outside-store'),
  );
  try {
    await mkdir(join(repo.root, 'outside-store'), { recursive: true });
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /pnpm virtualStoreDir must resolve within node_modules/,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});

test('rejects a pnpm virtual store symlink that escapes node_modules', async () => {
  const { repo, nodeModules } = await pnpmRepository();
  try {
    const outsideStore = join(repo.root, 'outside-store');
    await rename(join(nodeModules, '.pnpm'), outsideStore);
    await symlink(
      outsideStore,
      join(nodeModules, '.pnpm'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /pnpm virtualStoreDir must resolve within node_modules/,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});
