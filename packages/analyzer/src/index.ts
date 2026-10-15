import { isAbsolute, relative, resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { cruise, type IModule } from 'dependency-cruiser';
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin';
import ts from 'typescript';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import { groupSourcesByConfig } from './contexts.js';
import { parseSnapshotConfig } from './config.js';
import {
  prepareWorkspaces,
  workspaceConsumerManifest,
  workspaceForSpecifier,
} from './workspaces.js';
import { externalEvidenceFor, prepareExternalEvidence } from './external.js';
import {
  inspectSources,
  supportedSourcePattern,
  type SourceInspection,
} from './source.js';

interface ResolvedModule {
  readonly module: IModule;
  readonly condition: 'import' | 'require';
}

export interface SnapshotGraph {
  readonly revision: string | null;
  readonly edges: readonly DependencyEdge[];
}

async function extractModules(
  snapshot: Snapshot,
  sources: readonly string[],
  requiredSpecifiers: ReadonlyMap<string, SourceInspection>,
): Promise<{
  modules: ResolvedModule[];
  configurationEdges: DependencyEdge[];
}> {
  const extracted: ResolvedModule[] = [];
  const configurationEdges: DependencyEdge[] = [];
  for (const group of groupSourcesByConfig(snapshot, sources)) {
    try {
      const result = await extractGroup(snapshot, group, requiredSpecifiers);
      extracted.push(...result.modules);
      configurationEdges.push(...result.configurationEdges);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Analysis gap'))
        throw error;
      throw gap(
        snapshot,
        group.sources.join(', '),
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return { modules: extracted, configurationEdges };
}

async function extractGroup(
  snapshot: Snapshot,
  group: ReturnType<typeof groupSourcesByConfig>[number],
  requiredSpecifiers: ReadonlyMap<string, SourceInspection>,
): Promise<{
  modules: ResolvedModule[];
  configurationEdges: DependencyEdge[];
}> {
  const configFile = group.configPath
    ? resolve(snapshot.directory, group.configPath)
    : undefined;
  const config = group.configPath
    ? parseSnapshotConfig(snapshot, group.configPath)
    : undefined;
  const plugin =
    configFile && config
      ? createPathsPlugin(configFile, config.parsed)
      : undefined;
  const configurationEdges = group.sources.flatMap((source) =>
    (config?.files ?? []).map((usedConfig) => ({
      importer: source,
      dependency: usedConfig,
      specifier: usedConfig,
      kind: 'configuration',
    })),
  );
  const conditions = ['import', 'require'] as const;
  const modules = (
    await Promise.all(
      conditions.map((condition) =>
        cruiseCondition(
          snapshot,
          group.sources,
          requiredSpecifiers,
          config,
          configFile,
          plugin,
          condition,
        ),
      ),
    )
  ).flat();
  return { modules, configurationEdges };
}

function createPathsPlugin(
  configFile: string,
  config: ts.ParsedCommandLine,
): TsconfigPathsPlugin {
  return new TsconfigPathsPlugin({
    configFile,
    baseUrl:
      typeof config.options.pathsBasePath === 'string'
        ? config.options.pathsBasePath
        : undefined,
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    silent: true,
  });
}

async function cruiseCondition(
  snapshot: Snapshot,
  sources: readonly string[],
  requiredSpecifiers: ReadonlyMap<string, SourceInspection>,
  config: ReturnType<typeof parseSnapshotConfig> | undefined,
  configFile: string | undefined,
  plugin: TsconfigPathsPlugin | undefined,
  condition: 'import' | 'require',
): Promise<ResolvedModule[]> {
  const output = await cruise(
    [...sources],
    {
      baseDir: snapshot.directory,
      tsPreCompilationDeps: true,
      exoticRequireStrings: [
        ...new Set(
          sources.flatMap((source) => [
            ...(requiredSpecifiers.get(source)?.loaderNames ?? []),
          ]),
        ),
      ],
      exclude: [],
      doNotFollow: { path: '.*' },
      ...(configFile ? { tsConfig: { fileName: configFile } } : {}),
    },
    {
      exportsFields: ['exports'],
      conditionNames: [condition, 'node', 'default'],
      bustTheCache: true,
      ...(plugin ? { plugins: [plugin] } : {}),
    },
    config ? { tsConfig: config.parsed } : undefined,
  );
  if (typeof output.output === 'string')
    throw gap(snapshot, '<graph>', 'extractor returned an unexpected report');
  return output.output.modules.map((module) => ({ module, condition }));
}
function gap(snapshot: Snapshot, file: string, reason: string): Error {
  return new Error(
    `Analysis gap in ${file} at ${snapshot.revision ?? 'empty base'}: ${reason}`,
  );
}
function aliasMatches(pattern: string, specifier: string): boolean {
  const wildcard = pattern.indexOf('*');
  if (wildcard < 0) return pattern === specifier;
  const prefix = pattern.slice(0, wildcard);
  const suffix = pattern.slice(wildcard + 1);
  return specifier.startsWith(prefix) && specifier.endsWith(suffix);
}
/** Extract each snapshot independently with tool-owned parsers; never executes project configuration. */
export async function extractGraph(snapshot: Snapshot): Promise<SnapshotGraph> {
  const requiredSpecifiers = await inspectSources(snapshot);
  const sources = snapshot.paths.filter((file) =>
    supportedSourcePattern.test(file),
  );
  if (sources.length === 0) return { revision: snapshot.revision, edges: [] };
  const resolution = await prepareResolution(
    snapshot,
    sources,
    requiredSpecifiers,
  );
  const extracted = await extractModules(snapshot, sources, requiredSpecifiers);
  const edges = await resolvedEdges(
    snapshot,
    extracted.modules,
    requiredSpecifiers,
    resolution,
  );
  edges.push(...extracted.configurationEdges);
  return { revision: snapshot.revision, edges };
}

interface ResolutionEvidence {
  readonly workspaces: Awaited<ReturnType<typeof prepareWorkspaces>>;
  readonly external: Awaited<ReturnType<typeof prepareExternalEvidence>>;
}

async function prepareResolution(
  snapshot: Snapshot,
  sources: readonly string[],
  requiredSpecifiers: ReadonlyMap<string, SourceInspection>,
): Promise<ResolutionEvidence> {
  const workspaces = await prepareWorkspaceEvidence(snapshot);
  const external = await prepareInstalledEvidence(
    snapshot,
    sources,
    requiredSpecifiers,
    workspaces,
  );
  return { workspaces, external };
}

async function prepareWorkspaceEvidence(
  snapshot: Snapshot,
): Promise<Awaited<ReturnType<typeof prepareWorkspaces>>> {
  try {
    return await prepareWorkspaces(snapshot);
  } catch (error) {
    throw gap(
      snapshot,
      '<workspace metadata>',
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function prepareInstalledEvidence(
  snapshot: Snapshot,
  sources: readonly string[],
  requiredSpecifiers: ReadonlyMap<string, SourceInspection>,
  workspaces: Awaited<ReturnType<typeof prepareWorkspaces>>,
): Promise<Awaited<ReturnType<typeof prepareExternalEvidence>>> {
  try {
    const aliases = configuredAliases(snapshot, sources);
    const specifiers = externalSpecifiers(
      sources,
      requiredSpecifiers,
      workspaces,
      aliases,
    );
    return await prepareExternalEvidence(snapshot, sources, specifiers);
  } catch (error) {
    throw gap(
      snapshot,
      '<external dependency evidence>',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function configuredAliases(
  snapshot: Snapshot,
  sources: readonly string[],
): Map<string, readonly string[]> {
  const result = new Map<string, readonly string[]>();
  for (const group of groupSourcesByConfig(snapshot, sources)) {
    if (!group.configPath) continue;
    const aliases = Object.keys(
      parseSnapshotConfig(snapshot, group.configPath).parsed.options.paths ??
        {},
    );
    for (const source of group.sources) result.set(source, aliases);
  }
  return result;
}

function externalSpecifiers(
  sources: readonly string[],
  inspections: ReadonlyMap<string, SourceInspection>,
  workspaces: Awaited<ReturnType<typeof prepareWorkspaces>>,
  aliases: ReadonlyMap<string, readonly string[]>,
): Map<string, string[]> {
  return new Map(
    sources.map((source) => [
      source,
      (inspections.get(source)?.relationships ?? [])
        .map((relationship) => relationship.specifier)
        .filter(
          (specifier) =>
            !workspaceForSpecifier(workspaces.packages, specifier) &&
            !aliases
              .get(source)
              ?.some((pattern) => aliasMatches(pattern, specifier)),
        ),
    ]),
  );
}

async function resolvedEdges(
  snapshot: Snapshot,
  modules: readonly ResolvedModule[],
  inspections: ReadonlyMap<string, SourceInspection>,
  resolution: ResolutionEvidence,
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
          (relationship.kind === 'require' ? 'cjs' : 'es6') ===
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
  resolution: ResolutionEvidence,
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
  const target = repositoryPath(snapshot, dependency.resolved);
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
  workspaces: Awaited<ReturnType<typeof prepareWorkspaces>>,
): Promise<DependencyEdge[]> {
  const relationships =
    inspections
      .get(importer)
      ?.relationships.filter(
        (item) =>
          item.specifier === dependency.module &&
          (item.kind === 'require' ? 'cjs' : 'es6') === dependency.moduleSystem,
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
