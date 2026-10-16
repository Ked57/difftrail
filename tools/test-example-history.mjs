import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = realpathSync(
  join(dirname(fileURLToPath(import.meta.url)), '..'),
);
const cli = join(repository, 'packages/cli/dist/cli.js');
const baseline = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repository,
  encoding: 'utf8',
}).trim();
const temporary = mkdtempSync(join(tmpdir(), 'difftrail-example-history-'));

/** @param {string} cwd @param {string[]} args @returns {string} */
function runGit(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** @param {string} cwd @param {string} message */
function commit(cwd, message) {
  runGit(cwd, ['add', '--all']);
  runGit(cwd, ['commit', '--quiet', '-m', message]);
}

/** @param {string} cwd @param {string} path @param {string} content */
function write(cwd, path, content) {
  const destination = join(cwd, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

/** @param {string} name @returns {string} */
function copyWorkspace(name) {
  const cwd = join(temporary, name);
  execFileSync(
    'git',
    [
      'clone',
      '--quiet',
      '--local',
      '--no-hardlinks',
      '--no-checkout',
      repository,
      cwd,
    ],
    { stdio: 'ignore' },
  );
  runGit(cwd, ['checkout', '--quiet', '--detach', baseline]);
  runGit(cwd, ['config', 'user.name', 'Difftrail fixture']);
  runGit(cwd, ['config', 'user.email', 'fixture@example.invalid']);
  execFileSync('pnpm', ['install', '--frozen-lockfile'], {
    cwd,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return cwd;
}

/** @param {string} cwd @param {string[]} [args] @returns {import('node:child_process').SpawnSyncReturns<string>} */
function invoke(cwd, args = ['--json']) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

/** @param {string} cwd @param {string[]} files @param {string[]} [removed] @param {string[]} [args] */
function expectResult(cwd, files, removed = [], args = ['--json']) {
  const result = invoke(cwd, args);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.root, runGit(cwd, ['rev-parse', '--show-toplevel']));
  assert.deepEqual(output.files, files);
  assert.deepEqual(output.removed, removed);
}

/** @param {string} name @param {(cwd: string) => void} edit @param {(cwd: string) => void} verify */
function scenario(name, edit, verify) {
  const cwd = copyWorkspace(name);
  edit(cwd);
  commit(cwd, `${name} follow-up`);
  verify(cwd);
}

try {
  assert.ok(
    readFileSync(cli, 'utf8').startsWith('#!/usr/bin/env node'),
    'build the CLI before running this fixture',
  );

  scenario(
    'shared-utility',
    (cwd) =>
      write(
        cwd,
        'packages/example-shared/src/index.ts',
        readFileSync(
          join(cwd, 'packages/example-shared/src/index.ts'),
          'utf8',
        ).replace('Welcome back,', 'Good to see you,'),
      ),
    (cwd) =>
      expectResult(
        cwd,
        [
          'apps/test-app/src/App.vue',
          'apps/test-app/src/external/greeting-card.js',
          'apps/test-app/src/main.ts',
          'apps/test-app/src/composables/useGreeting.ts',
          'apps/test-app/src/pages/DashboardPage.vue',
          'apps/test-app/src/pages/ReportsPage.vue',
          'apps/test-app/src/components/GreetingCard.vue',
          'packages/example-shared/src/index.ts',
        ].sort(),
      ),
  );

  scenario(
    'page-only',
    (cwd) =>
      write(
        cwd,
        'apps/test-app/src/utils/dashboard-summary.ts',
        "export const dashboardSummary = { files: '09' };\n",
      ),
    (cwd) => {
      const paths = [
        'apps/test-app/src/App.vue',
        'apps/test-app/src/main.ts',
        'apps/test-app/src/pages/DashboardPage.vue',
        'apps/test-app/src/utils/dashboard-summary.ts',
      ].sort();
      const base = runGit(cwd, ['rev-parse', 'HEAD^']);
      const head = runGit(cwd, ['rev-parse', 'HEAD']);
      expectResult(cwd, paths);
      expectResult(
        join(cwd, 'apps/test-app'),
        paths,
        [],
        ['--base', base, '--head', head, '--json'],
      );
    },
  );

  scenario(
    'asset',
    (cwd) =>
      write(
        cwd,
        'apps/test-app/src/assets/dashboard.svg',
        readFileSync(
          join(cwd, 'apps/test-app/src/assets/dashboard.svg'),
          'utf8',
        ).replace('fill="#176447"', 'fill="#315fa7"'),
      ),
    (cwd) =>
      expectResult(
        join(cwd, 'apps/test-app'),
        [
          'apps/test-app/src/App.vue',
          'apps/test-app/src/assets/dashboard.svg',
          'apps/test-app/src/main.ts',
          'apps/test-app/src/pages/DashboardPage.vue',
          'apps/test-app/src/pages/ReportsPage.vue',
        ].sort(),
      ),
  );

  scenario(
    'stylesheet-asset',
    (cwd) =>
      write(
        cwd,
        'apps/test-app/src/assets/card-texture.svg',
        readFileSync(
          join(cwd, 'apps/test-app/src/assets/card-texture.svg'),
          'utf8',
        ).replace('fill="#eff8f4"', 'fill="#d9e8f1"'),
      ),
    (cwd) =>
      expectResult(
        cwd,
        [
          'apps/test-app/src/App.vue',
          'apps/test-app/src/assets/card-texture.svg',
          'apps/test-app/src/components/GreetingCard.vue',
          'apps/test-app/src/external/greeting-card.css',
          'apps/test-app/src/main.ts',
          'apps/test-app/src/pages/DashboardPage.vue',
        ].sort(),
      ),
  );

  scenario(
    'alias-map',
    (cwd) => {
      const tsconfigPath = join(cwd, 'apps/test-app/tsconfig.json');
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
      tsconfig.compilerOptions.paths['@models'] = [
        './../../packages/example-shared/src/report-types.ts',
      ];
      write(
        cwd,
        'apps/test-app/tsconfig.json',
        `${JSON.stringify(tsconfig, null, 2)}\n`,
      );
    },
    (cwd) =>
      expectResult(
        cwd,
        [
          'apps/test-app/components.d.ts',
          'apps/test-app/src/App.vue',
          'apps/test-app/src/components/GreetingCard.vue',
          'apps/test-app/src/components/MetricCard.vue',
          'apps/test-app/src/components/ReportDetails.vue',
          'apps/test-app/src/components/auto-alternate/AutoBadge.vue',
          'apps/test-app/src/components/auto-primary/AutoBadge.vue',
          'apps/test-app/src/composables/useGreeting.ts',
          'apps/test-app/src/external/greeting-card.js',
          'apps/test-app/src/main.ts',
          'apps/test-app/src/pages/DashboardPage.vue',
          'apps/test-app/src/pages/ReportsPage.vue',
          'apps/test-app/src/pages/SettingsPage.vue',
          'apps/test-app/src/types/index.ts',
          'apps/test-app/src/utils/dashboard-summary.ts',
          'apps/test-app/src/utils/settings-mode.ts',
          'apps/test-app/src/vite-env.d.ts',
          'apps/test-app/tsconfig.json',
          'apps/test-app/vite.config.ts',
        ].sort(),
        [],
        ['--json'],
      ),
  );

  scenario(
    'component-map',
    (cwd) => {
      const configPath = join(cwd, 'apps/test-app/vite.config.ts');
      const config = readFileSync(configPath, 'utf8').replace(
        "dirs: ['./src/components/auto-primary']",
        "dirs: ['./src/components/auto-alternate']",
      );
      write(cwd, 'apps/test-app/vite.config.ts', config);
      const vite = join(cwd, 'apps/test-app/node_modules/vite/bin/vite.js');
      execFileSync(process.execPath, [realpathSync(vite), 'build'], {
        cwd: join(cwd, 'apps/test-app'),
        stdio: 'ignore',
      });
      assert.notEqual(
        readFileSync(join(cwd, 'apps/test-app/components.d.ts'), 'utf8'),
        readFileSync(join(repository, 'apps/test-app/components.d.ts'), 'utf8'),
      );
    },
    (cwd) =>
      expectResult(
        cwd,
        [
          'apps/test-app/components.d.ts',
          'apps/test-app/src/App.vue',
          'apps/test-app/src/main.ts',
          'apps/test-app/src/pages/ReportsPage.vue',
          'apps/test-app/vite.config.ts',
        ].sort(),
        [],
        ['--json'],
      ),
  );

  scenario(
    'deletion',
    (cwd) => {
      write(cwd, 'apps/test-app/retired-note.md', 'Retired example note.\n');
      commit(cwd, 'fixture baseline note');
      rmSync(join(cwd, 'apps/test-app/retired-note.md'));
    },
    (cwd) => expectResult(cwd, [], ['apps/test-app/retired-note.md']),
  );

  scenario(
    'rename',
    (cwd) => {
      write(cwd, 'apps/test-app/before-note.md', 'A stable fixture note.\n');
      commit(cwd, 'fixture baseline note');
      runGit(cwd, [
        'mv',
        'apps/test-app/before-note.md',
        'apps/test-app/after-note.md',
      ]);
    },
    (cwd) =>
      expectResult(
        cwd,
        ['apps/test-app/after-note.md'],
        ['apps/test-app/before-note.md'],
      ),
  );

  scenario(
    'invalid-vue',
    (cwd) =>
      write(
        cwd,
        'apps/test-app/src/pages/ReportsPage.vue',
        '<template><main></template>\n',
      ),
    (cwd) => {
      const result = invoke(cwd);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /analysis gap/i);
    },
  );

  process.stdout.write(
    'Example history acceptance passed (9 isolated Git histories).\n',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
