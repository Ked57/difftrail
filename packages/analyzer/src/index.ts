import { resolve } from 'node:path';
import { cruise, type IModule } from 'dependency-cruiser';
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin';
import ts from 'typescript';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import { groupSourcesByConfig } from './contexts.js';
import { aliasMatches, parseSnapshotConfig } from './config.js';
import { prepareWorkspaces, workspaceForSpecifier } from './workspaces.js';
import { prepareExternalEvidence, type ExternalEvidence } from './external.js';
import { packageName } from './external-manifest.js';
import { externalEvidenceGap } from './external-errors.js';
import {
  configProviderEdges,
  configRootsForSources,
  includeConfigSpecifiers,
  prepareConfigProviderEvidence,
  type ConfigProviderReference,
} from './external-config.js';
import type { ValidatedConfigRoot } from './config.js';
import { autoImportEdges } from './auto-imports.js';
import { configuredSymlinkEdges, localReferenceEdges } from './local.js';
import { analysisGap as gap } from './errors.js';
import { resolvedEdges } from './resolved-edges.js';
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
  configRootsBySource: ReadonlyMap<string, readonly ValidatedConfigRoot[]>,
): Promise<{
  modules: ResolvedModule[];
  configurationEdges: DependencyEdge[];
}> {
  const extracted: ResolvedModule[] = [];
  const configurationEdges: DependencyEdge[] = [];
  for (const group of groupSourcesByConfig(snapshot, sources)) {
    try {
      const result = await extractGroup(
        snapshot,
        group,
        requiredSpecifiers,
        configRootsForSources(group.sources, configRootsBySource),
      );
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
  externalPackageRoots: readonly ValidatedConfigRoot[],
): Promise<{
  modules: ResolvedModule[];
  configurationEdges: DependencyEdge[];
}> {
  const configFile = group.configPath
    ? resolve(snapshot.directory, group.configPath)
    : undefined;
  const config = group.configPath
    ? parseSnapshotConfig(snapshot, group.configPath, externalPackageRoots)
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
      typeof config.options.baseUrl === 'string'
        ? config.options.baseUrl
        : typeof config.options.pathsBasePath === 'string'
          ? config.options.pathsBasePath
          : undefined,
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue'],
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
/** Extract each snapshot independently with tool-owned parsers; never executes project configuration. */
export async function extractGraph(snapshot: Snapshot): Promise<SnapshotGraph> {
  const requiredSpecifiers = await inspectSources(snapshot);
  const sources = snapshot.paths.filter((file) =>
    supportedSourcePattern.test(file),
  );
  if (sources.length === 0) {
    const localEdges = await localReferenceEdges(
      snapshot,
      sources,
      requiredSpecifiers,
    );
    const autoImports = await autoImportEdges(snapshot, localEdges);
    return {
      revision: snapshot.revision,
      edges: [...localEdges, ...autoImports, ...symlinkEdges(snapshot)],
    };
  }
  const resolution = await prepareResolution(
    snapshot,
    sources,
    requiredSpecifiers,
  );
  const localEdges = await localReferenceEdges(
    snapshot,
    sources,
    requiredSpecifiers,
    resolution.configRootsBySource,
    resolution.external,
  );
  const configuredLinks = configuredSymlinkEdges(
    snapshot,
    sources,
    requiredSpecifiers,
    resolution.configRootsBySource,
  );
  const autoImports = await autoImportEdges(snapshot, localEdges);
  const extracted = await extractModules(
    snapshot,
    sources,
    requiredSpecifiers,
    resolution.configRootsBySource,
  );
  const edges = await resolvedEdges(
    snapshot,
    extracted.modules,
    requiredSpecifiers,
    resolution,
    configuredLinks,
  );
  edges.push(...extracted.configurationEdges, ...localEdges);
  edges.push(
    ...configProviderEdges(resolution.external, resolution.configExtends),
  );
  edges.push(...autoImports);
  edges.push(...symlinkEdges(snapshot));
  return { revision: snapshot.revision, edges };
}

function symlinkEdges(snapshot: Snapshot): DependencyEdge[] {
  return [...snapshot.symlinkTargets].map(([importer, dependency]) => ({
    importer,
    dependency,
    specifier: dependency,
    kind: 'symlink',
  }));
}

interface ResolutionEvidence {
  readonly workspaces: Awaited<ReturnType<typeof prepareWorkspaces>>;
  readonly external: ExternalEvidence;
  readonly configRootsBySource: ReadonlyMap<
    string,
    readonly ValidatedConfigRoot[]
  >;
  readonly configExtends: readonly ConfigProviderReference[];
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
  return { workspaces, ...external };
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
): Promise<
  Pick<ResolutionEvidence, 'external' | 'configRootsBySource' | 'configExtends'>
> {
  try {
    const configEvidence = await prepareConfigProviderEvidence(
      snapshot,
      sources,
    );
    const evidenceSources = styleImporters(sources, requiredSpecifiers);
    const aliases = configuredAliases(
      snapshot,
      evidenceSources,
      configEvidence.rootsBySource,
    );
    const specifiers = includeConfigSpecifiers(
      externalSpecifiers(
        evidenceSources,
        requiredSpecifiers,
        workspaces,
        aliases,
      ),
      configEvidence.specifiers,
    );
    const external = await prepareExternalEvidence(
      snapshot,
      evidenceSources,
      specifiers,
    );
    return {
      external,
      configRootsBySource: configEvidence.rootsBySource,
      configExtends: configEvidence.references,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Analysis gap'))
      throw error;
    throw externalEvidenceGap(snapshot, error);
  }
}

function configuredAliases(
  snapshot: Snapshot,
  sources: readonly string[],
  configRootsBySource: ReadonlyMap<string, readonly ValidatedConfigRoot[]>,
): Map<string, readonly string[]> {
  const result = new Map<string, readonly string[]>();
  for (const group of groupSourcesByConfig(snapshot, sources)) {
    if (!group.configPath) continue;
    let aliases: string[];
    try {
      aliases = Object.keys(
        parseSnapshotConfig(
          snapshot,
          group.configPath,
          configRootsForSources(group.sources, configRootsBySource),
        ).parsed.options.paths ?? {},
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Analysis gap'))
        throw error;
      throw gap(
        snapshot,
        group.sources.join(', '),
        `${group.configPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    for (const source of group.sources) result.set(source, aliases);
  }
  return result;
}

function styleImporters(
  sources: readonly string[],
  inspections: ReadonlyMap<string, SourceInspection>,
): string[] {
  const styles = [...inspections]
    .filter(([, inspection]) =>
      inspection.localReferences.some(
        (reference) =>
          reference.kind === 'css-import' &&
          packageName(reference.specifier) !== undefined,
      ),
    )
    .map(([file]) => file);
  return [...new Set([...sources, ...styles])];
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
      [
        ...(inspections.get(source)?.relationships ?? []),
        ...(inspections.get(source)?.localReferences ?? []).filter(
          (reference) => reference.kind === 'css-import',
        ),
      ]
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
