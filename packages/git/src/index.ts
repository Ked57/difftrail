import { spawn } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  realpath,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  dirname,
  join,
  resolve,
  relative,
  isAbsolute,
  sep,
  posix,
} from 'node:path';

export interface Snapshot {
  readonly revision: string | null;
  readonly directory: string;
  readonly repositoryRoot: string;
  readonly paths: readonly string[];
  readonly symlinkTargets: ReadonlyMap<string, string>;
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
interface TrackedEntry {
  readonly mode: string;
  readonly oid: string;
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
  if (revision === null)
    return {
      revision,
      directory,
      repositoryRoot: root,
      paths: [],
      symlinkTargets: new Map(),
    };
  const entries = (
    await git(root, ['ls-tree', '-r', '-z', '--full-tree', revision])
  )
    .toString()
    .split('\0')
    .filter(Boolean);
  const tracked = trackedEntries(entries, revision);
  const paths: string[] = [];
  await materializeFiles(root, directory, tracked, paths);
  const symlinkTargets = await materializeLinks(
    root,
    revision,
    directory,
    tracked,
    paths,
  );
  return { revision, directory, repositoryRoot: root, paths, symlinkTargets };
}

function trackedEntries(
  entries: readonly string[],
  revision: string,
): Map<string, TrackedEntry> {
  const tracked = new Map<string, TrackedEntry>();
  for (const entry of entries) {
    const tab = entry.indexOf('\t');
    const [mode, kind, oid] = entry.slice(0, tab).split(' ');
    const path = entry.slice(tab + 1);
    if (kind === 'commit' && mode === '160000')
      throw new Error(
        `Snapshot ${revision}: unsupported Git submodule entry ${path}`,
      );
    if (!mode || !oid || kind !== 'blob')
      throw new Error(
        `Snapshot ${revision}: unsupported tracked entry ${path}`,
      );
    tracked.set(path, { mode, oid });
  }
  return tracked;
}

async function materializeFiles(
  root: string,
  directory: string,
  tracked: ReadonlyMap<string, TrackedEntry>,
  paths: string[],
): Promise<void> {
  for (const [path, entry] of tracked) {
    const destination = resolve(directory, ...path.split('/'));
    const local = relative(directory, destination);
    if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local))
      throw new Error(`Unsafe snapshot path: ${path}`);
    await mkdir(dirname(destination), { recursive: true });
    if (entry.mode === '120000') continue;
    await writeFile(
      destination,
      await git(root, ['cat-file', 'blob', entry.oid]),
    );
    paths.push(path);
  }
}

async function materializeLinks(
  root: string,
  revision: string,
  directory: string,
  tracked: ReadonlyMap<string, TrackedEntry>,
  paths: string[],
): Promise<ReadonlyMap<string, string>> {
  const symlinkTargets = new Map<string, string>();
  for (const [path, entry] of tracked) {
    if (entry.mode !== '120000') continue;
    const target = (
      await git(root, ['cat-file', 'blob', entry.oid])
    ).toString();
    const trackedTarget = containedTrackedTarget(path, target, tracked);
    const destination = resolve(directory, ...path.split('/'));
    if (supportedSourcePath(path)) {
      const resolvedTarget = await safeSourceTarget(
        root,
        path,
        target,
        tracked,
        revision,
      );
      const relativeTarget = posix.relative(
        posix.dirname(path),
        resolvedTarget,
      );
      await symlink(
        relativeTarget.startsWith('.') ? relativeTarget : `./${relativeTarget}`,
        destination,
      );
      if (trackedTarget) symlinkTargets.set(path, trackedTarget);
    } else {
      // Opaque links remain tracked terminal paths; their payload is never followed.
      await writeFile(destination, target);
      if (trackedTarget) symlinkTargets.set(path, trackedTarget);
    }
    paths.push(path);
  }
  return symlinkTargets;
}

function containedTrackedTarget(
  alias: string,
  target: string,
  tracked: ReadonlyMap<string, TrackedEntry>,
): string | undefined {
  const targetPath = posix.normalize(posix.join(posix.dirname(alias), target));
  if (
    posix.isAbsolute(target) ||
    /^[a-zA-Z]:/.test(target) ||
    targetPath === '..' ||
    targetPath.startsWith('../') ||
    !tracked.has(targetPath)
  )
    return undefined;
  return targetPath;
}

function supportedSourcePath(path: string): boolean {
  return /\.(?:[cm]?[jt]s|jsx|tsx|vue|css|scss|sass|less|json)$/.test(path);
}

async function safeSourceTarget(
  root: string,
  alias: string,
  target: string,
  tracked: ReadonlyMap<string, TrackedEntry>,
  revision: string,
): Promise<string> {
  const resolveLink = async (
    linkPath: string,
    linkTarget: string,
    seen: Set<string>,
  ): Promise<string> => {
    const targetPath = posix.normalize(
      posix.join(posix.dirname(linkPath), linkTarget),
    );
    if (
      posix.isAbsolute(linkTarget) ||
      /^[a-zA-Z]:/.test(linkTarget) ||
      targetPath === '..' ||
      targetPath.startsWith('../')
    )
      throw new Error(
        `Snapshot ${revision}: linked source ${alias} has an unsafe target ${JSON.stringify(linkTarget)}`,
      );
    const entry = tracked.get(targetPath);
    if (!entry)
      throw new Error(
        `Snapshot ${revision}: linked source ${alias} has no tracked target ${targetPath}`,
      );
    if (entry.mode !== '120000') return targetPath;
    if (seen.has(targetPath))
      throw new Error(
        `Snapshot ${revision}: linked source ${alias} contains a symlink cycle at ${targetPath}`,
      );
    seen.add(targetPath);
    return resolveLink(
      targetPath,
      (await git(root, ['cat-file', 'blob', entry.oid])).toString(),
      seen,
    );
  };
  return resolveLink(alias, target, new Set([alias]));
}
async function resolveCommit(
  root: string,
  revision: string,
  purpose: string,
): Promise<string> {
  try {
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
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot resolve ${purpose} revision ${JSON.stringify(revision)}: ${cause}. Check that it names an available commit and required history is present.`,
      { cause: error },
    );
  }
}
async function firstParent(root: string, head: string): Promise<string | null> {
  const commit = (await git(root, ['cat-file', '-p', head])).toString();
  const parent = /^parent ([0-9a-f]+)$/m.exec(commit)?.[1];
  if (!parent) return null;
  return resolveCommit(root, parent, 'first parent');
}
async function selectEndpoints(
  root: string,
  options: ComparisonOptions,
): Promise<{ base: string | null; head: string }> {
  if (options.base === undefined) {
    const head = await resolveCommit(root, 'HEAD', 'HEAD');
    return { base: await firstParent(root, head), head };
  }
  const head = await resolveCommit(root, options.head ?? 'HEAD', 'head');
  const requestedBase = await resolveCommit(root, options.base, 'base');
  const base = options.mergeBase
    ? (await git(root, ['merge-base', requestedBase, head])).toString().trim()
    : requestedBase;
  return { base: await resolveCommit(root, base, 'merge-base'), head };
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
  const gitRoot = (await git(cwd, ['rev-parse', '--show-toplevel']))
    .toString()
    .trimEnd();
  const root = await realpath(gitRoot);
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
