import { access, mkdir, readFile, symlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Snapshot } from '@difftrail/git';

export interface WorkspacePackage {
  readonly name: string;
  readonly directory: string;
  readonly manifest: string;
}

export interface WorkspaceEvidence {
  readonly packages: readonly WorkspacePackage[];
  readonly membershipFiles: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPatterns(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === 'string');
  const record = isRecord(value) ? value : undefined;
  return Array.isArray(record?.packages)
    ? record.packages.filter((item): item is string => typeof item === 'string')
    : [];
}

function matches(pattern: string, directory: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const expression = escaped
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]')
    .replaceAll('\u0000', '.*');
  return new RegExp(`^${expression}$`).test(directory);
}

function isWorkspace(patterns: readonly string[], directory: string): boolean {
  const positives = patterns.filter((pattern) => !pattern.startsWith('!'));
  const negatives = patterns.filter((pattern) => pattern.startsWith('!'));
  return (
    positives.some((pattern) => matches(pattern, directory)) &&
    !negatives.some((pattern) => matches(pattern.slice(1), directory))
  );
}

async function readWorkspacePatterns(
  snapshot: Snapshot,
): Promise<{ patterns: string[]; files: string[] }> {
  const tracked = new Set(snapshot.paths);
  const rootManifest = 'package.json';
  const rootContents = tracked.has(rootManifest)
    ? await readFile(join(snapshot.directory, rootManifest), 'utf8')
    : undefined;
  const rootPackage: unknown = rootContents
    ? JSON.parse(rootContents)
    : undefined;
  const packagePatterns = asPatterns(
    isRecord(rootPackage) ? rootPackage.workspaces : undefined,
  );
  if (packagePatterns.length)
    return { patterns: packagePatterns, files: [rootManifest] };
  const pnpmWorkspace = 'pnpm-workspace.yaml';
  if (!tracked.has(pnpmWorkspace)) return { patterns: [], files: [] };
  const parsed: unknown = parseYaml(
    await readFile(join(snapshot.directory, pnpmWorkspace), 'utf8'),
  );
  const patterns = asPatterns(parsed);
  if (!patterns.length)
    throw new Error('pnpm-workspace.yaml must declare workspace packages');
  return { patterns, files: [pnpmWorkspace] };
}

async function createWorkspaceLink(
  snapshot: Snapshot,
  workspace: WorkspacePackage,
): Promise<void> {
  const destination = join(
    snapshot.directory,
    'node_modules',
    ...workspace.name.split('/'),
  );
  try {
    await access(destination);
    return;
  } catch {
    await mkdir(dirname(destination), { recursive: true });
    await symlink(
      resolve(snapshot.directory, workspace.directory),
      destination,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
}

/** Builds only workspace links established by the selected snapshot's manifests. */
export async function prepareWorkspaces(
  snapshot: Snapshot,
): Promise<WorkspaceEvidence> {
  const { patterns, files } = await readWorkspacePatterns(snapshot);
  const packages: WorkspacePackage[] = [];
  for (const manifest of snapshot.paths.filter((path) =>
    path.endsWith('/package.json'),
  )) {
    const directory = dirname(manifest).split('\\').join('/');
    if (!isWorkspace(patterns, directory)) continue;
    const parsed: unknown = JSON.parse(
      await readFile(join(snapshot.directory, manifest), 'utf8'),
    );
    const name = isRecord(parsed) ? parsed.name : undefined;
    if (typeof name !== 'string' || !name)
      throw new Error(`Workspace package ${manifest} needs a package name`);
    if (packages.some((workspace) => workspace.name === name))
      throw new Error(`Workspace package name ${name} is ambiguous`);
    packages.push({ name, directory, manifest });
  }
  for (const workspace of packages)
    await createWorkspaceLink(snapshot, workspace);
  return { packages, membershipFiles: files };
}

export function workspaceForSpecifier(
  packages: readonly WorkspacePackage[],
  specifier: string,
): WorkspacePackage | undefined {
  const name = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
  return packages.find((workspace) => workspace.name === name);
}

/** Requires a real dependency declaration from the importing package manifest. */
export function workspaceConsumerManifest(
  snapshot: Snapshot,
  importer: string,
  workspace: WorkspacePackage,
): string {
  const parts = dirname(importer).split('/');
  let manifest: string | undefined;
  while (parts.length) {
    const candidate = [...parts, 'package.json'].join('/');
    if (snapshot.paths.includes(candidate)) {
      manifest = candidate;
      break;
    }
    parts.pop();
  }
  manifest ??= snapshot.paths.includes('package.json')
    ? 'package.json'
    : undefined;
  if (!manifest)
    throw new Error(`source ${importer} has no committed package manifest`);
  const parsed: unknown = JSON.parse(
    readFileSync(join(snapshot.directory, manifest), 'utf8'),
  );
  const record = isRecord(parsed) ? parsed : {};
  const declared = [
    record.dependencies,
    record.devDependencies,
    record.optionalDependencies,
    record.peerDependencies,
  ].some(
    (field) => isRecord(field) && typeof field[workspace.name] === 'string',
  );
  if (!declared)
    throw new Error(
      `${manifest} does not declare workspace dependency ${workspace.name}`,
    );
  return manifest;
}
