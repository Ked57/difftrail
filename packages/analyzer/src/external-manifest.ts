import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import type { Snapshot } from '@difftrail/git';
import { withDependencyContext } from './external-errors.js';

export type ProviderRequests = Map<string, Map<string, Set<string>>>;

export interface PackageManifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly dependencies?: unknown;
  readonly devDependencies?: unknown;
  readonly optionalDependencies?: unknown;
  readonly peerDependencies?: unknown;
}

interface DependencyDeclaration {
  readonly section:
    | 'dependencies'
    | 'devDependencies'
    | 'optionalDependencies'
    | 'peerDependencies';
  readonly specifier: string;
}

export function readSnapshotJson(snapshot: Snapshot, path: string): unknown {
  if (!snapshot.paths.includes(path))
    throw new Error(`required committed file ${path} is missing`);
  return JSON.parse(
    readFileSync(resolve(snapshot.directory, path), 'utf8'),
  ) as unknown;
}

export function dependencyDeclaration(
  manifest: PackageManifest,
  name: string,
): DependencyDeclaration | undefined {
  for (const section of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'devDependencies',
  ] as const) {
    const field = manifest[section];
    if (isRecord(field) && typeof field[name] === 'string')
      return { section, specifier: field[name] };
  }
  return undefined;
}

function importerManifests(snapshot: Snapshot, importer: string): string[] {
  const result: string[] = [];
  const parts = importer.split('/');
  while (parts.length) {
    const candidate = [...parts, 'package.json'].join('/');
    if (snapshot.paths.includes(candidate)) result.push(candidate);
    parts.pop();
  }
  if (snapshot.paths.includes('package.json')) result.push('package.json');
  return result;
}

function providerManifest(
  snapshot: Snapshot,
  manifests: readonly string[],
  name: string,
): string | undefined {
  return manifests.find((manifestPath) => {
    const manifest = readSnapshotJson(snapshot, manifestPath);
    if (!isRecord(manifest)) throw new Error(`${manifestPath} is malformed`);
    return dependencyDeclaration(manifest, name) !== undefined;
  });
}

export function packageName(specifier: string): string | undefined {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('#') ||
    specifier.startsWith('node:')
  )
    return undefined;
  const name = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : (specifier.split('/')[0] ?? '');
  return builtinModules.includes(name) ||
    builtinModules.includes(`node:${name}`)
    ? undefined
    : name;
}

export async function providerRequests(
  snapshot: Snapshot,
  sources: readonly string[],
  specifiersBySource: ReadonlyMap<string, readonly string[]>,
): Promise<ProviderRequests> {
  const requests: ProviderRequests = new Map();
  for (const source of sources) {
    const names = (specifiersBySource.get(source) ?? [])
      .map(packageName)
      .filter((name): name is string => name !== undefined);
    if (!names.length) continue;
    const manifests = importerManifests(snapshot, source);
    const nearestManifest = manifests[0];
    if (!nearestManifest)
      throw new Error(`source ${source} has no committed package manifest`);
    for (const name of names) {
      let provider: string | undefined;
      await withDependencyContext(
        nearestManifest,
        new Set([source]),
        async () => {
          provider = providerManifest(snapshot, manifests, name);
          if (!provider)
            throw new Error(
              `${source} has no ancestor package manifest declaring external dependency ${name}`,
            );
        },
      );
      if (!provider) continue;
      const byName = requests.get(provider) ?? new Map<string, Set<string>>();
      const bucket = byName.get(name) ?? new Set<string>();
      bucket.add(source);
      byName.set(name, bucket);
      requests.set(provider, byName);
    }
  }
  return requests;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
