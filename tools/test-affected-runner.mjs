import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
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
const temporary = mkdtempSync(join(tmpdir(), 'difftrail-affected-runner-'));
const appTests = [
  'apps/test-app/tests/component/MetricCard.test.ts',
  'apps/test-app/tests/e2e/navigation.e2e.ts',
  'apps/test-app/tests/e2e/report-details.e2e.ts',
  'apps/test-app/tests/e2e/settings-journey.e2e.ts',
  'apps/test-app/tests/unit/dashboard-summary.test.ts',
  'apps/test-app/tests/unit/settings-mode.test.ts',
];

/**
 * @typedef {{
 *   name: string;
 *   edit: (cwd: string) => void;
 *   files: readonly string[];
 * }} Scenario
 */

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
  writeFileSync(join(cwd, path), content);
}

/** @returns {string} */
function copyWorkspace() {
  const cwd = join(temporary, 'fixture');
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

/** @param {string} cwd @param {string} path @param {string} from @param {string} to */
function replace(cwd, path, from, to) {
  const target = join(cwd, path);
  write(cwd, path, readFileSync(target, 'utf8').replace(from, to));
}

/** @param {readonly string[]} files @returns {string[]} */
function runnerArgs(files) {
  return [
    'run',
    '--config',
    'vitest.config.mjs',
    ...files.map((file) => file.slice('apps/test-app/'.length)),
  ];
}

/** @param {string} cwd @returns {import('node:child_process').SpawnSyncReturns<string>} */
function select(cwd) {
  return spawnSync(
    process.execPath,
    [
      join(cwd, 'apps/test-app/scripts/affected-tests.mjs'),
      '--execute',
      '--',
      '--json',
      '--filter',
      '**/*.test.ts',
      '--filter',
      '**/*.e2e.ts',
    ],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, DIFFTRAIL_CLI: cli },
    },
  );
}

/** @param {string} cwd @param {readonly string[]} files */
function expectSelection(cwd, files, name) {
  const result = select(cwd);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.command, 'vitest');
  assert.equal(output.cwd, 'apps/test-app');
  assert.deepEqual(output.files, files, name);
  assert.deepEqual(output.args, runnerArgs(files));
  for (const testFile of appTests) {
    const selected = files.includes(testFile);
    assert.equal(output.files.includes(testFile), selected);
  }
  assert.equal(output.executed, files.length > 0);
  if (files.length > 0) assert.equal(output.status, 0);
}

/** @type {readonly Scenario[]} */
const navigation = 'apps/test-app/tests/e2e/navigation.e2e.ts';
const scenarios = [
  {
    name: 'unit-source',
    edit: (cwd) =>
      replace(
        cwd,
        'apps/test-app/src/utils/dashboard-summary.ts',
        'two-digit count',
        'two digit count',
      ),
    files: [navigation, 'apps/test-app/tests/unit/dashboard-summary.test.ts'],
  },
  {
    name: 'component',
    edit: (cwd) =>
      replace(
        cwd,
        'apps/test-app/src/components/MetricCard.vue',
        'font-size: 1.8rem;',
        'font-size: 1.85rem;',
      ),
    files: ['apps/test-app/tests/component/MetricCard.test.ts', navigation],
  },
  {
    name: 'custom-icon',
    edit: (cwd) =>
      replace(
        cwd,
        'apps/test-app/src/assets/icons/mark.svg',
        'fill="#176447"',
        'fill="#315fa7"',
      ),
    files: ['apps/test-app/tests/component/MetricCard.test.ts', navigation],
  },
  {
    name: 'e2e',
    edit: (cwd) =>
      replace(
        cwd,
        'apps/test-app/src/components/ReportDetails.vue',
        'weekly report',
        'monthly report',
      ),
    files: [navigation, 'apps/test-app/tests/e2e/report-details.e2e.ts'],
  },
  {
    name: 'shared-token',
    edit: (cwd) =>
      replace(
        cwd,
        'apps/test-app/src/styles/tokens.css',
        '--ink: #1b2838;',
        '--ink: #1a2736;',
      ),
    files: [navigation],
  },
  {
    name: 'unrelated',
    edit: (cwd) =>
      replace(
        cwd,
        'apps/test-app/src/components/auto-alternate/AutoBadge.vue',
        'background: #e3f3ed;',
        'background: #e7f6f0;',
      ),
    files: [],
  },
  {
    name: 'tailwind',
    edit: (cwd) =>
      replace(
        cwd,
        'apps/test-app/src/styles/tailwind.css',
        "@import 'tailwindcss';",
        "@import 'tailwindcss';\n",
      ),
    files: [],
  },
  {
    name: 'unit-and-e2e',
    edit: (cwd) =>
      replace(
        cwd,
        'apps/test-app/src/utils/settings-mode.ts',
        'strict-analysis preference',
        'strict analysis preference',
      ),
    files: [
      navigation,
      'apps/test-app/tests/e2e/settings-journey.e2e.ts',
      'apps/test-app/tests/unit/settings-mode.test.ts',
    ],
  },
  {
    name: 'settings-form',
    edit: (cwd) =>
      replace(
        cwd,
        'apps/test-app/src/utils/settings-form.ts',
        'before vee-validate submits it',
        'before vee-validate stores it',
      ),
    files: [
      navigation,
      'apps/test-app/tests/e2e/settings-journey.e2e.ts',
      'apps/test-app/tests/unit/settings-mode.test.ts',
    ],
  },
];

try {
  assert.ok(
    readFileSync(cli, 'utf8').startsWith('#!/usr/bin/env node'),
    'build the CLI before running this fixture',
  );
  const cwd = copyWorkspace();
  for (const scenario of scenarios) {
    scenario.edit(cwd);
    commit(cwd, `${scenario.name} follow-up`);
    expectSelection(cwd, scenario.files, scenario.name);
    runGit(cwd, ['reset', '--hard', baseline]);
    runGit(cwd, ['clean', '-fd']);
  }
  process.stdout.write(
    'Affected test runner acceptance passed (9 committed selections).\n',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
