import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
export async function repository(files: Readonly<Record<string, string>>) {
  const root = await mkdtemp(join(tmpdir(), 'difftrail-test-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  async function commit(next: Readonly<Record<string, string>>) {
    for (const [path, content] of Object.entries(next)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }
    git('add', '--all');
    git('commit', '--quiet', '--allow-empty', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  }
  await commit(files);
  return {
    root,
    git,
    commit,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
