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

/**
 * @param {string} prefix
 * @returns {{
 *   repository: string,
 *   runGit: typeof runGit,
 *   write: typeof write,
 *   scenario: (name: string, edit: (cwd: string) => void, verify: (cwd: string) => void) => void,
 *   expectResult: (cwd: string, files: readonly string[], removed?: readonly string[], args?: readonly string[]) => void,
 *   invoke: (cwd: string, args?: readonly string[]) => import('node:child_process').SpawnSyncReturns<string>,
 *   cleanup: () => void,
 * }}
 */
export function createHistoryFixture(prefix) {
  const temporary = mkdtempSync(join(tmpdir(), prefix));

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

  /** @param {string} cwd @param {readonly string[]} [args] */
  function invoke(cwd, args = ['--json']) {
    return spawnSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: 'utf8',
    });
  }

  /**
   * @param {string} cwd
   * @param {readonly string[]} files
   * @param {readonly string[]} [removed]
   * @param {readonly string[]} [args]
   */
  function expectResult(cwd, files, removed = [], args = ['--json']) {
    const result = invoke(cwd, args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const output = JSON.parse(result.stdout);
    assert.equal(
      realpathSync(output.root),
      realpathSync(runGit(cwd, ['rev-parse', '--show-toplevel'])),
    );
    assert.deepEqual(output.files, files);
    assert.deepEqual(output.removed, removed);
  }

  /**
   * @param {string} name
   * @param {(cwd: string) => void} edit
   * @param {(cwd: string) => void} verify
   */
  function scenario(name, edit, verify) {
    const cwd = copyWorkspace(name);
    edit(cwd);
    commit(cwd, `${name} follow-up`);
    verify(cwd);
  }

  function cleanup() {
    rmSync(temporary, { recursive: true, force: true });
  }

  assert.ok(
    readFileSync(cli, 'utf8').startsWith('#!/usr/bin/env node'),
    'build the CLI before running this fixture',
  );

  return {
    repository,
    runGit,
    write,
    scenario,
    expectResult,
    invoke,
    cleanup,
  };
}
