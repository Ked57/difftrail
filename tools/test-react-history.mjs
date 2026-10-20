import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHistoryFixture } from './example-history-lib.mjs';

const { repository, runGit, write, scenario, expectResult, invoke, cleanup } =
  createHistoryFixture('difftrail-react-history-');

/** @param {string} cwd */
function expectGap(cwd) {
  const result = invoke(cwd);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /analysis gap/i);
}

try {
  scenario(
    'page-only',
    (cwd) =>
      write(
        cwd,
        'apps/react-app/src/utils/dashboard-summary.ts',
        "export const dashboardSummary = { files: '09' };\n",
      ),
    (cwd) => {
      const paths = [
        'apps/react-app/src/main.tsx',
        'apps/react-app/src/pages/DashboardPage.tsx',
        'apps/react-app/src/routeTree.gen.ts',
        'apps/react-app/src/router.ts',
        'apps/react-app/src/routes/index.tsx',
        'apps/react-app/src/utils/dashboard-summary.ts',
        'apps/react-app/tests/e2e/navigation.e2e.ts',
        'apps/react-app/tests/unit/dashboard-summary.test.ts',
      ].sort();
      const base = runGit(cwd, ['rev-parse', 'HEAD^']);
      const head = runGit(cwd, ['rev-parse', 'HEAD']);
      expectResult(cwd, paths);
      expectResult(
        join(cwd, 'apps/react-app'),
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
        'apps/react-app/src/assets/icons/mark.svg',
        readFileSync(
          join(cwd, 'apps/react-app/src/assets/icons/mark.svg'),
          'utf8',
        ).replace('fill="#176447"', 'fill="#315fa7"'),
      ),
    (cwd) =>
      expectResult(
        join(cwd, 'apps/react-app'),
        [
          'apps/react-app/src/assets/icons/mark.svg',
          'apps/react-app/src/components/MetricCard.tsx',
          'apps/react-app/src/main.tsx',
          'apps/react-app/src/pages/DashboardPage.tsx',
          'apps/react-app/src/pages/ReportsPage.tsx',
          'apps/react-app/src/routeTree.gen.ts',
          'apps/react-app/src/router.ts',
          'apps/react-app/src/routes/index.tsx',
          'apps/react-app/src/routes/reports.tsx',
          'apps/react-app/tests/component/MetricCard.test.ts',
          'apps/react-app/tests/e2e/navigation.e2e.ts',
        ].sort(),
      ),
  );

  scenario(
    'stylesheet',
    (cwd) =>
      write(
        cwd,
        'apps/react-app/src/styles/tokens.css',
        readFileSync(
          join(cwd, 'apps/react-app/src/styles/tokens.css'),
          'utf8',
        ).replace('--ink: #1b2838;', '--ink: #1a2736;'),
      ),
    (cwd) =>
      expectResult(
        cwd,
        [
          'apps/react-app/src/components/ScopeNote.tsx',
          'apps/react-app/src/main.tsx',
          'apps/react-app/src/pages/DashboardPage.tsx',
          'apps/react-app/src/routeTree.gen.ts',
          'apps/react-app/src/router.ts',
          'apps/react-app/src/routes/index.tsx',
          'apps/react-app/src/styles/base.css',
          'apps/react-app/src/styles/tokens.css',
          'apps/react-app/tests/e2e/navigation.e2e.ts',
        ].sort(),
      ),
  );

  scenario(
    'alias-map',
    (cwd) => {
      const tsconfigPath = join(cwd, 'apps/react-app/tsconfig.json');
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
      tsconfig.compilerOptions.paths = {
        '@models': ['./../../packages/example-shared/src/report-types.ts'],
      };
      write(
        cwd,
        'apps/react-app/tsconfig.json',
        `${JSON.stringify(tsconfig, null, 2)}\n`,
      );
    },
    (cwd) =>
      expectResult(
        cwd,
        [
          'apps/react-app/auto-imports.d.ts',
          'apps/react-app/scripts/affected-tests.mjs',
          'apps/react-app/src/components/GreetingCard.tsx',
          'apps/react-app/src/components/MetricCard.tsx',
          'apps/react-app/src/components/ReportDetails.tsx',
          'apps/react-app/src/components/ScopeNote.tsx',
          'apps/react-app/src/components/unrelated/Note.tsx',
          'apps/react-app/src/icons.d.ts',
          'apps/react-app/src/main.tsx',
          'apps/react-app/src/pages/DashboardPage.tsx',
          'apps/react-app/src/pages/ReportsPage.tsx',
          'apps/react-app/src/pages/SettingsPage.tsx',
          'apps/react-app/src/plan/plan-route.ts',
          'apps/react-app/src/routeTree.gen.ts',
          'apps/react-app/src/router.ts',
          'apps/react-app/src/routes/__root.tsx',
          'apps/react-app/src/routes/index.tsx',
          'apps/react-app/src/routes/reports.tsx',
          'apps/react-app/src/routes/settings.tsx',
          'apps/react-app/src/utils/dashboard-summary.ts',
          'apps/react-app/src/utils/settings-form.ts',
          'apps/react-app/src/vite-env.d.ts',
          'apps/react-app/tests/component/MetricCard.test.ts',
          'apps/react-app/tests/e2e/navigation.e2e.ts',
          'apps/react-app/tests/e2e/report-details.e2e.ts',
          'apps/react-app/tests/e2e/settings-journey.e2e.ts',
          'apps/react-app/tests/unit/dashboard-summary.test.ts',
          'apps/react-app/tests/unit/settings-form.test.ts',
          'apps/react-app/tsconfig.json',
          'apps/react-app/vite.config.ts',
          'apps/react-app/vitest.config.mjs',
        ].sort(),
      ),
  );

  scenario(
    'auto-import-map',
    (cwd) => {
      const configPath = join(cwd, 'apps/react-app/vite.config.ts');
      const config = readFileSync(configPath, 'utf8').replace(
        "imports: [{ 'react-hook-form': ['useForm'] }],",
        "imports: [{ 'react-hook-form': ['useForm', 'useFormContext'] }],",
      );
      write(cwd, 'apps/react-app/vite.config.ts', config);
      const vite = join(cwd, 'apps/react-app/node_modules/vite/bin/vite.js');
      execFileSync(process.execPath, [realpathSync(vite), 'build'], {
        cwd: join(cwd, 'apps/react-app'),
        stdio: 'ignore',
      });
      assert.notEqual(
        readFileSync(join(cwd, 'apps/react-app/auto-imports.d.ts'), 'utf8'),
        readFileSync(
          join(repository, 'apps/react-app/auto-imports.d.ts'),
          'utf8',
        ),
      );
    },
    (cwd) =>
      expectResult(
        cwd,
        [
          'apps/react-app/auto-imports.d.ts',
          'apps/react-app/src/components/MetricCard.tsx',
          'apps/react-app/src/main.tsx',
          'apps/react-app/src/pages/DashboardPage.tsx',
          'apps/react-app/src/pages/ReportsPage.tsx',
          'apps/react-app/src/pages/SettingsPage.tsx',
          'apps/react-app/src/routeTree.gen.ts',
          'apps/react-app/src/router.ts',
          'apps/react-app/src/routes/index.tsx',
          'apps/react-app/src/routes/reports.tsx',
          'apps/react-app/src/routes/settings.tsx',
          'apps/react-app/tests/component/MetricCard.test.ts',
          'apps/react-app/tests/e2e/navigation.e2e.ts',
          'apps/react-app/tests/e2e/settings-journey.e2e.ts',
          'apps/react-app/vite.config.ts',
          'apps/react-app/vitest.config.mjs',
        ].sort(),
      ),
  );

  scenario(
    'deletion',
    (cwd) => {
      write(cwd, 'apps/react-app/retired-note.md', 'Retired example note.\n');
      runGit(cwd, ['add', '--all']);
      runGit(cwd, ['commit', '--quiet', '-m', 'fixture baseline note']);
      rmSync(join(cwd, 'apps/react-app/retired-note.md'));
    },
    (cwd) => expectResult(cwd, [], ['apps/react-app/retired-note.md']),
  );

  scenario(
    'rename',
    (cwd) => {
      write(cwd, 'apps/react-app/before-note.md', 'A stable fixture note.\n');
      runGit(cwd, ['add', '--all']);
      runGit(cwd, ['commit', '--quiet', '-m', 'fixture baseline note']);
      runGit(cwd, [
        'mv',
        'apps/react-app/before-note.md',
        'apps/react-app/after-note.md',
      ]);
    },
    (cwd) =>
      expectResult(
        cwd,
        ['apps/react-app/after-note.md'],
        ['apps/react-app/before-note.md'],
      ),
  );

  scenario(
    'invalid-source',
    (cwd) =>
      write(
        cwd,
        'apps/react-app/src/pages/ReportsPage.tsx',
        'export function ReportsPage( {\n',
      ),
    (cwd) => expectGap(cwd),
  );

  process.stdout.write(
    'React history acceptance passed (8 isolated Git histories).\n',
  );
} finally {
  cleanup();
}
