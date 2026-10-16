import { isAbsolute, posix, relative, resolve } from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { type IModule } from 'dependency-cruiser';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import { externalEvidenceFor, type ExternalEvidence } from './external.js';
import { analysisGap as gap } from './errors.js';
import { isCommonJsRelationship, type SourceInspection } from './source.js';
import {
  workspaceConsumerManifest,
  workspaceForSpecifier,
} from './workspaces.js';

interface ResolvedModule {
  readonly module: IModule;
  readonly condition: 'import' | 'require';
}

export interface ResolvedEdgeEvidence {
  readonly workspaces: {
    readonly packages: Awaited<
      ReturnType<typeof import('./workspaces.js').prepareWorkspaces>
    >['packages'];
    readonly membershipFiles: readonly string[];
  };
  readonly external: ExternalEvidence;
}

export async function resolvedEdges(
  snapshot: Snapshot,
  modules: readonly ResolvedModule[],
  inspections: ReadonlyMap<string, SourceInspection>,
  resolution: ResolvedEdgeEvidence,
): Promise<DependencyEdge[]> {
  const tracked = new Set(snapshot.paths);
  const edges: DependencyEdge[] = [];
  for (const resolvedModule of modules) {
    const importer = repositoryPath(snapshot, resolvedModule.module.source);
    if (!tracked.has(importer)) continue;
    const dependencies = resolvedRelationships(
      resolvedModule,
      importer,
      inspections,
    );
    for (const dependency of dependencies)
      edges.push(
        ...(await dependencyEdges(
          snapshot,
          importer,
          dependency,
          inspections,
          resolution,
          tracked,
        )),
      );
  }
  return edges;
}

function repositoryPath(snapshot: Snapshot, path: string): string {
  return relative(
    snapshot.directory,
    isAbsolute(path) ? path : resolve(snapshot.directory, path),
  )
    .split('\\')
    .join('/');
}

function resolvedRelationships(
  resolved: ResolvedModule,
  importer: string,
  inspections: ReadonlyMap<string, SourceInspection>,
): IModule['dependencies'] {
  return resolved.module.dependencies.filter((dependency) =>
    inspections
      .get(importer)
      ?.relationships.some(
        (relationship) =>
          relationship.specifier === dependency.module &&
          (isCommonJsRelationship(relationship.kind) ? 'cjs' : 'es6') ===
            dependency.moduleSystem &&
          resolved.condition ===
            (dependency.moduleSystem === 'cjs' ? 'require' : 'import'),
      ),
  );
}

async function dependencyEdges(
  snapshot: Snapshot,
  importer: string,
  dependency: IModule['dependencies'][number],
  inspections: ReadonlyMap<string, SourceInspection>,
  resolution: ResolvedEdgeEvidence,
  tracked: ReadonlySet<string>,
): Promise<DependencyEdge[]> {
  if (dependency.couldNotResolve)
    throw gap(snapshot, importer, `cannot resolve ${dependency.module}`);
  if (dependency.coreModule || dependency.dependencyTypes.includes('core'))
    return [];
  const external = externalEvidenceFor(
    resolution.external,
    importer,
    dependency.module,
  );
  const target =
    (await trackedSymlinkAlias(snapshot, importer, dependency)) ??
    repositoryPath(snapshot, dependency.resolved);
  if (!tracked.has(target) && external)
    return externalMetadataEdges(
      snapshot,
      importer,
      dependency.module,
      dependency.resolved,
      external,
      inspections,
    );
  if (!tracked.has(target))
    throw gap(
      snapshot,
      importer,
      `required dependency ${dependency.module} is absent from committed snapshot`,
    );
  return localDependencyEdges(
    snapshot,
    importer,
    dependency,
    target,
    inspections,
    resolution.workspaces,
  );
}

async function trackedSymlinkAlias(
  snapshot: Snapshot,
  importer: string,
  dependency: IModule['dependencies'][number],
): Promise<string | undefined> {
  if (!dependency.module.startsWith('.')) return undefined;
  const candidate = posix.normalize(
    posix.join(posix.dirname(importer), dependency.module),
  );
  const candidates = [
    candidate,
    ...['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue'].map(
      (extension) => `${candidate}${extension}`,
    ),
    ...['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue'].map((extension) =>
      posix.join(candidate, `index${extension}`),
    ),
  ];
  const resolved = resolve(snapshot.directory, dependency.resolved);
  for (const path of candidates) {
    if (!snapshot.paths.includes(path)) continue;
    const local = resolve(snapshot.directory, ...path.split('/'));
    try {
      if (!(await lstat(local)).isSymbolicLink()) continue;
      if ((await realpath(local)) === (await realpath(resolved))) return path;
    } catch {
      continue;
    }
  }
  return undefined;
}

async function externalMetadataEdges(
  snapshot: Snapshot,
  importer: string,
  specifier: string,
  resolvedPath: string,
  external: NonNullable<ReturnType<typeof externalEvidenceFor>>,
  inspections: ReadonlyMap<string, SourceInspection>,
): Promise<DependencyEdge[]> {
  await assertInstalledTarget(
    snapshot,
    importer,
    specifier,
    resolvedPath,
    external,
  );
  return (inspections.get(importer)?.relationships ?? [])
    .filter((item) => item.specifier === specifier)
    .flatMap((relationship) =>
      [external.manifest, external.lockfile].map((metadata) => ({
        importer,
        dependency: metadata,
        specifier: relationship.specifier,
        kind: 'metadata',
      })),
    );
}

async function assertInstalledTarget(
  snapshot: Snapshot,
  importer: string,
  specifier: string,
  resolvedPath: string,
  external: NonNullable<ReturnType<typeof externalEvidenceFor>>,
): Promise<void> {
  const installedPackage = await realpath(external.packageRoot);
  const resolvedFile = await realpath(
    isAbsolute(resolvedPath)
      ? resolvedPath
      : resolve(snapshot.directory, resolvedPath),
  );
  if (!isWithin(installedPackage, resolvedFile))
    throw gap(
      snapshot,
      importer,
      `resolved ${specifier} outside its proven installed package`,
    );
}

function isWithin(parent: string, target: string): boolean {
  const local = relative(parent, target);
  return (
    local !== '..' &&
    !local.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
    !isAbsolute(local)
  );
}

async function localDependencyEdges(
  snapshot: Snapshot,
  importer: string,
  dependency: IModule['dependencies'][number],
  target: string,
  inspections: ReadonlyMap<string, SourceInspection>,
  workspaces: ResolvedEdgeEvidence['workspaces'],
): Promise<DependencyEdge[]> {
  const relationships =
    inspections
      .get(importer)
      ?.relationships.filter(
        (item) =>
          item.specifier === dependency.module &&
          (isCommonJsRelationship(item.kind) ? 'cjs' : 'es6') ===
            dependency.moduleSystem,
      ) ?? [];
  if (!relationships.length)
    throw gap(
      snapshot,
      importer,
      `extractor relationship ${dependency.module} has no supported source syntax`,
    );
  const edges = relationships.map((relationship) => ({
    importer,
    dependency: target,
    specifier: relationship.specifier,
    kind: relationship.kind,
  }));
  const workspace = workspaceForSpecifier(
    workspaces.packages,
    dependency.module,
  );
  if (!workspace || !target.startsWith(`${workspace.directory}/`)) return edges;
  const consumer = await checkedWorkspaceConsumer(
    snapshot,
    importer,
    workspace,
  );
  const metadata = [
    ...workspaces.membershipFiles,
    workspace.manifest,
    consumer,
  ];
  return [
    ...edges,
    ...metadata.map((dependencyPath) => ({
      importer,
      dependency: dependencyPath,
      specifier: dependency.module,
      kind: 'metadata',
    })),
  ];
}

async function checkedWorkspaceConsumer(
  snapshot: Snapshot,
  importer: string,
  workspace: Parameters<typeof workspaceConsumerManifest>[2],
): Promise<string> {
  try {
    return workspaceConsumerManifest(snapshot, importer, workspace);
  } catch (error) {
    throw gap(
      snapshot,
      importer,
      error instanceof Error ? error.message : String(error),
    );
  }
}
