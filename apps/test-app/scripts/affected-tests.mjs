import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const testPattern = /(?:^|\/)[^/]*\.(?:test|e2e)\.ts$/;

function git(args) {
  const result = spawnSync('git', ['-C', appDir, ...args], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function defaultDifftrailArgs() {
  return ['--json', '--filter', '**/*.test.ts', '--filter', '**/*.e2e.ts'];
}

function splitArgs(argv) {
  const marker = argv.indexOf('--');
  return {
    execute: argv.includes('--execute'),
    difftrailArgs:
      marker === -1 ? defaultDifftrailArgs() : argv.slice(marker + 1),
  };
}

function cliPath(repoRoot) {
  if (process.env.DIFFTRAIL_CLI) return process.env.DIFFTRAIL_CLI;
  const local = join(repoRoot, 'packages/cli/dist/cli.js');
  if (!existsSync(local)) {
    process.stderr.write(
      'difftrail: build packages/cli or set DIFFTRAIL_CLI before selecting affected tests.\n',
    );
    process.exit(1);
  }
  return local;
}

function readImpact(repoRoot, difftrailArgs) {
  const result = spawnSync(
    process.execPath,
    [cliPath(repoRoot), ...difftrailArgs],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }
  const output = JSON.parse(result.stdout);
  return output.files.filter((file) => testPattern.test(file)).sort();
}

function appRelative(file) {
  const prefix = 'apps/test-app/';
  if (!file.startsWith(prefix)) {
    process.stderr.write(
      `difftrail: affected test is outside the test app: ${file}\n`,
    );
    process.exit(1);
  }
  return file.slice(prefix.length);
}

function runnerArgs(files) {
  return [
    'run',
    '--config',
    'vitest.config.mjs',
    ...files.map((file) => appRelative(file)),
  ];
}

function executeRunner(repoRoot, args) {
  const vitest = join(repoRoot, 'node_modules/vitest/vitest.mjs');
  return spawnSync(process.execPath, [vitest, ...args], {
    cwd: appDir,
    encoding: 'utf8',
  });
}

function report(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const repoRoot = git(['rev-parse', '--show-toplevel']);
const { execute, difftrailArgs } = splitArgs(process.argv.slice(2));
const files = readImpact(repoRoot, difftrailArgs);
const args = runnerArgs(files);
if (!execute || files.length === 0) {
  report({
    command: 'vitest',
    cwd: 'apps/test-app',
    args,
    files,
    executed: false,
  });
} else {
  const result = executeRunner(repoRoot, args);
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
  }
  report({
    command: 'vitest',
    cwd: 'apps/test-app',
    args,
    files,
    executed: true,
    status: result.status,
  });
  process.exitCode = result.status ?? 1;
}
