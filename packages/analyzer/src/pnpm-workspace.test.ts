import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from '../../../tests/helpers.js';
import { withComparison } from '@difftrail/git';
import { extractGraph } from './index.js';

test('does not require package manifests for sources without external requests', async () => {
  const repo = await repository({
    'leaf.js': 'export const leaf = 1;',
    'consumer.js':
      "import {readFile} from 'node:fs'; import {leaf} from './leaf.js'; export const value = readFile && leaf;",
  });
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(graph.edges.map((edge) => edge.dependency)).toEqual(['leaf.js']);
    });
  } finally {
    await repo.cleanup();
  }
});

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

// Windows CI exceeds Vitest's 5s default for this multi-analysis fixture.
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
}, 30_000);

test('attributes dependency evidence gaps to a source that imports that dependency', async () => {
  const lock = [
    'lockfileVersion: 9.0',
    'settings: {}',
    'importers:',
    '  .: {}',
    '  apps/first:',
    '    dependencies:',
    '      good-leaf:',
    '        specifier: 1.0.0',
    '        version: 1.0.0',
    '      bad-leaf:',
    '        specifier: 2.0.0',
    '        version: 2.0.0',
    'packages:',
    '  good-leaf@1.0.0:',
    '    resolution: {integrity: sha512-good}',
    '  bad-leaf@2.0.0:',
    '    resolution: {integrity: sha512-bad}',
    'snapshots:',
    '  good-leaf@1.0.0: {}',
    '  bad-leaf@2.0.0: {}',
  ].join('\n');
  const repo = await repository({
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({ name: 'pnpm-workspace', private: true }),
    'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
    'pnpm-lock.yaml': lock,
    'apps/first/package.json': JSON.stringify({
      name: 'first-app',
      dependencies: { 'good-leaf': '1.0.0', 'bad-leaf': '2.0.0' },
    }),
    'apps/first/a-good.js': "import 'good-leaf';",
    'apps/first/z-bad.js': "import 'bad-leaf';",
  });
  try {
    for (const [name, installedVersion] of [
      ['good-leaf', '1.0.0'],
      ['bad-leaf', '1.0.0'],
    ] as const) {
      const packageRoot = join(
        repo.root,
        'node_modules/.pnpm',
        `${name}@${installedVersion}/node_modules/${name}`,
      );
      await mkdir(packageRoot, { recursive: true });
      await writeFile(
        join(packageRoot, 'package.json'),
        JSON.stringify({ name, version: installedVersion, main: 'index.js' }),
      );
      await writeFile(join(packageRoot, 'index.js'), 'export const value = 1;');
      const modules = join(repo.root, 'apps/first/node_modules');
      await mkdir(modules, { recursive: true });
      await symlink(packageRoot, join(modules, name), 'dir');
    }
    await mkdir(join(repo.root, 'node_modules/.pnpm'), { recursive: true });
    await writeFile(
      join(repo.root, 'node_modules/.modules.yaml'),
      'virtualStoreDir: .pnpm\n',
    );
    await writeFile(join(repo.root, 'node_modules/.pnpm/lock.yaml'), lock);
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /Analysis gap in apps\/first\/z-bad\.js at .*apps\/first\/package\.json: installed package identity for bad-leaf does not match pnpm-lock\.yaml/,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});

function rootProviderLock(localProvider = false): string {
  const lines = [
    'lockfileVersion: 9.0',
    'settings: {}',
    'importers:',
    '  .:',
    '    devDependencies:',
    '      external-leaf:',
    '        specifier: 1.0.0',
    '        version: 1.0.0',
    ...(localProvider
      ? [
          '  apps/first:',
          '    dependencies:',
          '      external-leaf:',
          '        specifier: 2.0.0',
          '        version: 2.0.0',
        ]
      : ['  apps/first: {}']),
    'packages:',
    '  external-leaf@1.0.0:',
    '    resolution: {integrity: sha512-one}',
    ...(localProvider
      ? ['  external-leaf@2.0.0:', '    resolution: {integrity: sha512-two}']
      : []),
    'snapshots:',
    '  external-leaf@1.0.0: {}',
    ...(localProvider ? ['  external-leaf@2.0.0: {}'] : []),
  ];
  return lines.join('\n');
}

async function rootProviderRepository() {
  const lock = rootProviderLock();
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
  const packageRoot = join(
    repo.root,
    'node_modules/.pnpm/external-leaf@1.0.0/node_modules/external-leaf',
  );
  const rootModules = join(repo.root, 'node_modules');
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'external-leaf', version: '1.0.0' }),
  );
  await writeFile(join(packageRoot, 'index.js'), 'export const value = 1;');
  await mkdir(rootModules, { recursive: true });
  await symlink(packageRoot, join(rootModules, 'external-leaf'), 'dir');
  await mkdir(join(rootModules, '.pnpm'), { recursive: true });
  await writeFile(
    join(rootModules, '.modules.yaml'),
    'virtualStoreDir: .pnpm\n',
  );
  await writeFile(join(rootModules, '.pnpm/lock.yaml'), lock);
  return { repo, packageRoot, rootModules };
}

test('resolves and validates an ancestor pnpm provider for an undeclared consumer', async () => {
  const { repo, packageRoot, rootModules } = await rootProviderRepository();
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) => edge.kind === 'metadata')
          .map((edge) => [edge.importer, edge.dependency]),
      ).toEqual([
        ['apps/first/consumer.js', 'package.json'],
        ['apps/first/consumer.js', 'pnpm-lock.yaml'],
      ]);
    });
    await writeFile(
      join(packageRoot, 'package.json'),
      JSON.stringify({ name: 'external-leaf', version: '2.0.0' }),
    );
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /Analysis gap in apps\/first\/consumer\.js at .*package\.json: installed package identity for external-leaf does not match pnpm-lock\.yaml/,
      ),
    );
    await writeFile(
      join(packageRoot, 'package.json'),
      JSON.stringify({ name: 'external-leaf', version: '1.0.0' }),
    );
    await rm(join(rootModules, 'external-leaf'));
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /Analysis gap in apps\/first\/consumer\.js at .*package\.json.*node_modules\/external-leaf\/package\.json/,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});

test('does not borrow a pnpm ancestor version when the consumer declares the dependency', async () => {
  const { repo, packageRoot, rootModules } = await rootProviderRepository();
  try {
    const manifest = JSON.stringify({
      name: 'first-app',
      dependencies: { 'external-leaf': '2.0.0' },
    });
    const lock = rootProviderLock(true);
    await repo.commit({
      'apps/first/package.json': manifest,
      'pnpm-lock.yaml': lock,
    });
    await mkdir(join(repo.root, 'apps/first/node_modules'), {
      recursive: true,
    });
    await symlink(
      packageRoot,
      join(repo.root, 'apps/first/node_modules/external-leaf'),
      'dir',
    );
    await writeFile(join(rootModules, '.pnpm/lock.yaml'), lock);
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /Analysis gap in apps\/first\/consumer\.js at .*apps\/first\/package\.json: installed package identity for external-leaf does not match pnpm-lock\.yaml/,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});

async function inheritedConfigProviderRepository() {
  const lock = [
    'lockfileVersion: 9.0',
    'settings: {}',
    'importers:',
    '  .:',
    '    devDependencies:',
    '      "@tsconfig/node22":',
    '        specifier: 22.0.2',
    '        version: 22.0.2',
    '  apps/first: {}',
    'packages:',
    '  "@tsconfig/node22@22.0.2":',
    '    resolution: {integrity: sha512-config}',
    'snapshots:',
    '  "@tsconfig/node22@22.0.2": {}',
  ].join('\n');
  const repo = await repository({
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({
      name: 'pnpm-config-provider',
      private: true,
      devDependencies: { '@tsconfig/node22': '22.0.2' },
    }),
    'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
    'pnpm-lock.yaml': lock,
    'tsconfig.base.json': JSON.stringify({
      extends: '@tsconfig/node22/tsconfig.json',
      compilerOptions: { moduleResolution: 'NodeNext', strict: true },
    }),
    'apps/first/package.json': JSON.stringify({ name: 'first-app' }),
    'apps/first/tsconfig.json': JSON.stringify({
      extends: '../../tsconfig.base.json',
      include: ['src/**/*.ts'],
    }),
    'apps/first/src/leaf.ts': 'export const leaf = 1;',
    'apps/first/src/consumer.ts':
      "import {readFile} from 'node:fs'; import {leaf} from './leaf'; export const value = readFile && leaf;",
  });
  const packageRoot = join(
    repo.root,
    'node_modules/.pnpm/@tsconfig+node22@22.0.2/node_modules/@tsconfig/node22',
  );
  const packageLink = join(repo.root, 'node_modules/@tsconfig/node22');
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: '@tsconfig/node22', version: '22.0.2' }),
  );
  await writeFile(
    join(packageRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2022', strict: true } }),
  );
  await mkdir(join(repo.root, 'node_modules/.pnpm'), { recursive: true });
  await mkdir(join(repo.root, 'node_modules/@tsconfig'), {
    recursive: true,
  });
  await symlink(packageRoot, packageLink, 'dir');
  await writeFile(
    join(repo.root, 'node_modules/.modules.yaml'),
    'virtualStoreDir: .pnpm\n',
  );
  await writeFile(join(repo.root, 'node_modules/.pnpm/lock.yaml'), lock);
  return { repo, packageRoot, packageLink };
}

test('resolves inherited package tsconfig through validated ancestor evidence', async () => {
  const { repo, packageRoot, packageLink } =
    await inheritedConfigProviderRepository();
  try {
    await withComparison(repo.root, async (comparison) => {
      const graph = await extractGraph(comparison.headSnapshot);
      expect(
        graph.edges
          .filter((edge) => edge.importer === 'apps/first/src/consumer.ts')
          .map((edge) => [edge.kind, edge.dependency])
          .sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      ).toEqual(
        [
          ['configuration', 'apps/first/tsconfig.json'],
          ['configuration', 'package.json'],
          ['configuration', 'tsconfig.base.json'],
          ['import', 'apps/first/src/leaf.ts'],
          ['metadata', 'package.json'],
          ['metadata', 'pnpm-lock.yaml'],
        ].sort((left, right) => left.join('/').localeCompare(right.join('/'))),
      );
    });
    await rm(packageLink);
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /Analysis gap in apps\/first\/src\/consumer\.ts at .*tsconfig\.base\.json extends @tsconfig\/node22\/tsconfig\.json: .*package\.json.*node_modules\/@tsconfig\/node22\/package\.json/,
      ),
    );
    await symlink(packageRoot, packageLink, 'dir');
    await writeFile(
      join(packageRoot, 'package.json'),
      JSON.stringify({ name: '@tsconfig/node22', version: '99.0.0' }),
    );
    await withComparison(repo.root, async (comparison) =>
      expect(extractGraph(comparison.headSnapshot)).rejects.toThrow(
        /Analysis gap in apps\/first\/src\/consumer\.ts at .*tsconfig\.base\.json extends @tsconfig\/node22\/tsconfig\.json: .*installed package identity for @tsconfig\/node22 does not match pnpm-lock\.yaml/,
      ),
    );
  } finally {
    await repo.cleanup();
  }
});
