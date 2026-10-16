import { spawnSync } from 'node:child_process';
import { rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { repository } from './helpers.js';

const executable = resolve('packages/cli/dist/cli.js');

function cli(cwd: string, base: string, head: string) {
  return spawnSync(
    process.execPath,
    [executable, '--base', base, '--head', head, '--json', '--explain'],
    { cwd, encoding: 'utf8' },
  );
}

async function retarget(
  repo: Awaited<ReturnType<typeof repository>>,
  path: string,
  target: string,
  message: string,
): Promise<string> {
  await rm(join(repo.root, path));
  await symlink(target, join(repo.root, path));
  repo.git('add', '--all');
  repo.git('commit', '--quiet', '-m', message);
  return repo.git('rev-parse', 'HEAD');
}

function expectImpact(
  cwd: string,
  base: string,
  head: string,
  files: readonly string[],
  chain?: readonly string[],
): void {
  const result = cli(cwd, base, head);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  const output = JSON.parse(result.stdout);
  expect(output.files).toEqual(files);
  if (chain)
    expect(
      output.explanations.find(
        (item: { file: string }) => item.file === 'consumer.ts',
      ).chain,
    ).toEqual(chain);
}

test('built CLI keeps aliased source-link impact on the imported link', async () => {
  const repo = await repository({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '@/*': ['*'] } },
    }),
    'first.ts': 'export const value = 1;',
    'second.ts': 'export const value = 2;',
    'selected.ts': 'placeholder',
    'sibling.ts': 'placeholder',
    'consumer.ts': "import {value} from '@/selected'; export {value};",
    'unrelated.ts': 'export const unrelated = 1;',
  });
  try {
    await retarget(repo, 'selected.ts', 'first.ts', 'track selected link');
    const base = await retarget(
      repo,
      'sibling.ts',
      'first.ts',
      'track sibling link',
    );
    const siblingRetarget = await retarget(
      repo,
      'sibling.ts',
      'second.ts',
      'retarget unimported sibling',
    );
    expectImpact(repo.root, base, siblingRetarget, ['sibling.ts']);
    const sameTargetBase = await retarget(
      repo,
      'sibling.ts',
      'first.ts',
      'restore sibling target',
    );
    const retargeted = await retarget(
      repo,
      'selected.ts',
      'second.ts',
      'retarget imported link',
    );
    expectImpact(
      repo.root,
      sameTargetBase,
      retargeted,
      ['consumer.ts', 'selected.ts'],
      ['selected.ts', 'consumer.ts'],
    );
    await writeFile(join(repo.root, 'second.ts'), 'export const value = 3;');
    repo.git('add', 'second.ts');
    repo.git('commit', '--quiet', '-m', 'change imported referent');
    const changedReferent = repo.git('rev-parse', 'HEAD');
    expectImpact(
      repo.root,
      retargeted,
      changedReferent,
      ['consumer.ts', 'second.ts', 'selected.ts'],
      ['second.ts', 'selected.ts', 'consumer.ts'],
    );
  } finally {
    await repo.cleanup();
  }
});
