import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';

export interface Snapshot {
  readonly revision: string | null;
  readonly directory: string;
  readonly paths: readonly string[];
}
export interface Comparison {
  readonly root: string;
  readonly base: string | null;
  readonly head: string;
  readonly seeds: readonly string[];
  readonly baseSnapshot: Snapshot;
  readonly headSnapshot: Snapshot;
}
async function git(cwd: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((accept, reject) => {
    const process = spawn('git', [...args], {
      cwd,
      shell: false,
      windowsHide: true,
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    process.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    process.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    process.on('error', reject);
    process.on('close', (code) => {
      if (code !== 0)
        reject(
          new Error(
            `Git ${args[0]} failed: ${Buffer.concat(errors).toString().trim()}`,
          ),
        );
      else accept(Buffer.concat(output));
    });
  });
}
async function materialize(
  root: string,
  revision: string | null,
  directory: string,
): Promise<Snapshot> {
  await mkdir(directory);
  if (revision === null) return { revision, directory, paths: [] };
  const entries = (
    await git(root, ['ls-tree', '-r', '-z', '--full-tree', revision])
  )
    .toString()
    .split('\0')
    .filter(Boolean);
  const paths: string[] = [];
  for (const entry of entries) {
    const tab = entry.indexOf('\t');
    const [mode, kind, oid] = entry.slice(0, tab).split(' ');
    const path = entry.slice(tab + 1);
    if (!oid || kind !== 'blob' || mode === '120000')
      throw new Error(
        `Snapshot ${revision}: unsupported tracked entry ${path}`,
      );
    const destination = resolve(directory, path);
    const local = relative(directory, destination);
    if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local))
      throw new Error(`Unsafe snapshot path: ${path}`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await git(root, ['cat-file', 'blob', oid]));
    paths.push(path);
  }
  return { revision, directory, paths };
}
/** Materialize committed endpoints; always removes only tool-owned temporary storage. */
export async function withComparison<T>(
  cwd: string,
  run: (comparison: Comparison) => Promise<T>,
): Promise<T> {
  const root = (await git(cwd, ['rev-parse', '--show-toplevel']))
    .toString()
    .trimEnd();
  const head = (
    await git(root, [
      'rev-parse',
      '--verify',
      '--end-of-options',
      'HEAD^{commit}',
    ])
  )
    .toString()
    .trim();
  const commit = (await git(root, ['cat-file', '-p', head])).toString();
  const base = /^parent ([0-9a-f]+)$/m.exec(commit)?.[1] ?? null;
  const temporary = await realpath(
    await mkdtemp(join(tmpdir(), 'difftrail-snapshots-')),
  );
  try {
    const baseSnapshot = await materialize(root, base, join(temporary, 'base'));
    const headSnapshot = await materialize(root, head, join(temporary, 'head'));
    const seeds =
      base === null
        ? [...headSnapshot.paths]
        : (
            await git(root, [
              'diff-tree',
              '--no-commit-id',
              '--name-only',
              '-r',
              '-z',
              '--no-renames',
              base,
              head,
            ])
          )
            .toString()
            .split('\0')
            .filter(Boolean);
    return await run({ root, base, head, seeds, baseSnapshot, headSnapshot });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
