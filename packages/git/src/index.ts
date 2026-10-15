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
export interface ComparisonOptions {
  readonly base?: string;
  readonly head?: string;
  readonly mergeBase?: boolean;
}
async function git(cwd: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((accept, reject) => {
    const child = spawn('git', [...args], {
      cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
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
async function resolveCommit(root: string, revision: string): Promise<string> {
  return (
    await git(root, [
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${revision}^{commit}`,
    ])
  )
    .toString()
    .trim();
}
async function firstParent(root: string, head: string): Promise<string | null> {
  const commit = (await git(root, ['cat-file', '-p', head])).toString();
  const parent = /^parent ([0-9a-f]+)$/m.exec(commit)?.[1];
  if (!parent) return null;
  try {
    return await resolveCommit(root, parent);
  } catch {
    throw new Error(
      `Cannot resolve required first parent ${parent} of ${head}.`,
    );
  }
}
async function selectEndpoints(
  root: string,
  options: ComparisonOptions,
): Promise<{ base: string | null; head: string }> {
  if (options.base === undefined) {
    const head = await resolveCommit(root, 'HEAD');
    return { base: await firstParent(root, head), head };
  }
  const head = await resolveCommit(root, options.head ?? 'HEAD');
  const requestedBase = await resolveCommit(root, options.base);
  const base = options.mergeBase
    ? (await git(root, ['merge-base', requestedBase, head])).toString().trim()
    : requestedBase;
  return { base: await resolveCommit(root, base), head };
}
async function changedPaths(
  root: string,
  base: string | null,
  head: string,
  headPaths: readonly string[],
): Promise<string[]> {
  if (base === null) return [...headPaths];
  return (
    await git(root, [
      'diff',
      '--no-renames',
      '--no-ext-diff',
      '--no-textconv',
      '--name-only',
      '-z',
      base,
      head,
    ])
  )
    .toString()
    .split('\0')
    .filter(Boolean);
}
/** Materialize committed endpoints; always removes only tool-owned temporary storage. */
export async function withComparison<T>(
  cwd: string,
  run: (comparison: Comparison) => Promise<T>,
  options: ComparisonOptions = {},
): Promise<T> {
  const root = (await git(cwd, ['rev-parse', '--show-toplevel']))
    .toString()
    .trimEnd();
  const { base, head } = await selectEndpoints(root, options);
  const temporaryPath = await mkdtemp(join(tmpdir(), 'difftrail-snapshots-'));
  try {
    const temporary = await realpath(temporaryPath);
    const baseSnapshot = await materialize(root, base, join(temporary, 'base'));
    const headSnapshot = await materialize(root, head, join(temporary, 'head'));
    const seeds = await changedPaths(root, base, head, headSnapshot.paths);
    return await run({ root, base, head, seeds, baseSnapshot, headSnapshot });
  } finally {
    await rm(temporaryPath, { recursive: true, force: true });
  }
}
