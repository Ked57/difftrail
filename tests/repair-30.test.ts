import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, expect } from 'vitest';

const executable = resolve('packages/cli/dist/cli.js');

function gitWorkingDirectoryError(cwd: string): string | undefined {
  return spawnSync('git', ['--version'], { cwd, encoding: 'utf8' }).error
    ?.message;
}

for (const suffix of [' ', '\t', '\r', '\n']) {
  test(`built CLI preserves a repository root ending in ${JSON.stringify(suffix)}`, async ({
    skip,
  }) => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'difftrail-root-'));
    const root = `${temporaryRoot}${suffix}`;
    try {
      try {
        await rename(temporaryRoot, root);
      } catch (error) {
        skip(
          `Filesystem cannot create a fixture path ending in ${JSON.stringify(suffix)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const canonicalRoot = await realpath(root);
      if (!canonicalRoot.endsWith(suffix))
        skip(
          `Filesystem normalized the requested ${JSON.stringify(suffix)} suffix; canonical root is ${JSON.stringify(canonicalRoot)}`,
        );
      const gitCwdError = gitWorkingDirectoryError(root);
      if (gitCwdError !== undefined && process.platform !== 'linux')
        skip(
          `Platform cannot run git with a working directory ending in ${JSON.stringify(suffix)}: ${gitCwdError}`,
        );

      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
      git('init', '--quiet');
      git('config', 'user.email', 'fixture@example.invalid');
      git('config', 'user.name', 'Fixture');
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'leaf.js'), 'export const value=1;');
      await writeFile(
        join(root, 'src', 'consumer.js'),
        "import {value} from '../leaf.js'; export {value};",
      );
      git('add', '--all');
      git('commit', '--quiet', '-m', 'before');
      const base = git('rev-parse', 'HEAD');
      await writeFile(join(root, 'leaf.js'), 'export const value=2;');
      git('add', '--all');
      git('commit', '--quiet', '-m', 'after');
      const head = git('rev-parse', 'HEAD');
      for (const cwd of [root, join(root, 'src')]) {
        for (const endpoints of [[], ['--base', base, '--head', head]]) {
          const result = spawnSync(
            process.execPath,
            [executable, ...endpoints, '--json'],
            { cwd, encoding: 'utf8' },
          );
          expect({ status: result.status, stderr: result.stderr }).toEqual({
            status: 0,
            stderr: '',
          });
          expect(JSON.parse(result.stdout)).toEqual({
            root: canonicalRoot,
            base,
            head,
            scope: 'static',
            files: ['leaf.js', 'src/consumer.js'],
            removed: [],
          });
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
}
