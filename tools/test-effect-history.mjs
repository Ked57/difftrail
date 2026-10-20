import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHistoryFixture } from './example-history-lib.mjs';

const { runGit, write, scenario, expectResult, invoke, cleanup } =
  createHistoryFixture('difftrail-effect-history-');

/** @param {string} cwd */
function expectGap(cwd) {
  const result = invoke(cwd);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /analysis gap/i);
}

try {
  scenario(
    'module-only',
    (cwd) =>
      write(
        cwd,
        'apps/effect-api/src/effects/reports.ts',
        readFileSync(
          join(cwd, 'apps/effect-api/src/effects/reports.ts'),
          'utf8',
        ).replace(
          'Formats dashboard report metrics.',
          'Formats dashboard reports metrics.',
        ),
      ),
    (cwd) => {
      const paths = [
        'apps/effect-api/src/app.ts',
        'apps/effect-api/src/effects/reports.ts',
        'apps/effect-api/src/index.ts',
        'apps/effect-api/src/routes.ts',
        'apps/effect-api/tests/e2e/health.e2e.ts',
        'apps/effect-api/tests/e2e/reports.e2e.ts',
        'apps/effect-api/tests/e2e/settings.e2e.ts',
        'apps/effect-api/tests/unit/reports.test.ts',
      ].sort();
      const base = runGit(cwd, ['rev-parse', 'HEAD^']);
      const head = runGit(cwd, ['rev-parse', 'HEAD']);
      expectResult(cwd, paths);
      expectResult(
        join(cwd, 'apps/effect-api'),
        paths,
        [],
        ['--base', base, '--head', head, '--json'],
      );
    },
  );

  scenario(
    'alias-map',
    (cwd) => {
      const tsconfigPath = join(cwd, 'apps/effect-api/tsconfig.json');
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
      tsconfig.compilerOptions.paths = {
        '@models': ['./../../packages/example-shared/src/report-types.ts'],
      };
      write(
        cwd,
        'apps/effect-api/tsconfig.json',
        `${JSON.stringify(tsconfig, null, 2)}\n`,
      );
    },
    (cwd) =>
      expectResult(
        cwd,
        [
          'apps/effect-api/scripts/affected-tests.mjs',
          'apps/effect-api/scripts/smoke.mjs',
          'apps/effect-api/src/app.ts',
          'apps/effect-api/src/effects/reports.ts',
          'apps/effect-api/src/effects/settings.ts',
          'apps/effect-api/src/effects/unused-note.ts',
          'apps/effect-api/src/index.ts',
          'apps/effect-api/src/routes.ts',
          'apps/effect-api/tests/e2e/health.e2e.ts',
          'apps/effect-api/tests/e2e/reports.e2e.ts',
          'apps/effect-api/tests/e2e/settings.e2e.ts',
          'apps/effect-api/tests/unit/reports.test.ts',
          'apps/effect-api/tests/unit/settings.test.ts',
          'apps/effect-api/tsconfig.json',
          'apps/effect-api/vitest.config.mjs',
        ].sort(),
      ),
  );

  scenario(
    'deletion',
    (cwd) => {
      write(cwd, 'apps/effect-api/retired-note.md', 'Retired example note.\n');
      runGit(cwd, ['add', '--all']);
      runGit(cwd, ['commit', '--quiet', '-m', 'fixture baseline note']);
      rmSync(join(cwd, 'apps/effect-api/retired-note.md'));
    },
    (cwd) => expectResult(cwd, [], ['apps/effect-api/retired-note.md']),
  );

  scenario(
    'rename',
    (cwd) => {
      write(cwd, 'apps/effect-api/before-note.md', 'A stable fixture note.\n');
      runGit(cwd, ['add', '--all']);
      runGit(cwd, ['commit', '--quiet', '-m', 'fixture baseline note']);
      runGit(cwd, [
        'mv',
        'apps/effect-api/before-note.md',
        'apps/effect-api/after-note.md',
      ]);
    },
    (cwd) =>
      expectResult(
        cwd,
        ['apps/effect-api/after-note.md'],
        ['apps/effect-api/before-note.md'],
      ),
  );

  scenario(
    'invalid-source',
    (cwd) =>
      write(
        cwd,
        'apps/effect-api/src/effects/reports.ts',
        'export const loadReports =\n',
      ),
    (cwd) => expectGap(cwd),
  );

  process.stdout.write(
    'Effect history acceptance passed (5 isolated Git histories).\n',
  );
} finally {
  cleanup();
}
