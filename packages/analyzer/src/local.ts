import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import { parseSnapshotConfig, type ValidatedConfigRoot } from './config.js';
import { groupSourcesByConfig } from './contexts.js';
import type { SourceInspection } from './source.js';
import { templateReferences } from './explicit.js';
import { analysisGap as gap } from './errors.js';

interface AliasRule {
  readonly pattern: string;
  readonly targets: readonly string[];
  readonly base: string;
  readonly configFiles: readonly string[];
}

export async function localReferenceEdges(
  snapshot: Snapshot,
  sources: readonly string[],
  inspections: ReadonlyMap<string, SourceInspection>,
  configRootsBySource: ReadonlyMap<
    string,
    readonly ValidatedConfigRoot[]
  > = new Map(),
): Promise<DependencyEdge[]> {
  const tracked = new Set(snapshot.paths);
  const aliasSources = [
    ...sources,
    ...[...inspections]
      .filter(([, inspection]) => inspection.localReferences.length > 0)
      .map(([file]) => file),
  ];
  const aliases = aliasRules(snapshot, aliasSources, configRootsBySource);
  const edges: DependencyEdge[] = [];
  const configurationEdges = new Set<string>();
  for (const [importer, inspection] of inspections) {
    for (const reference of inspection.localReferences) {
      const resolved = await edgesForReference(
        snapshot,
        importer,
        reference,
        aliases.get(importer) ?? [],
        tracked,
      );
      edges.push(...resolved);
      for (const edge of configurationEdgesForReference(
        importer,
        reference.specifier,
        sources,
        aliases,
      ))
        configurationEdges.add(`${edge.importer}\0${edge.dependency}`);
    }
  }
  for (const edge of configurationEdges) {
    const [importer, dependency] = edge.split('\0');
    if (!importer || !dependency) continue;
    edges.push({
      importer,
      dependency,
      specifier: dependency,
      kind: 'configuration',
    });
  }
  return edges;
}

async function edgesForReference(
  snapshot: Snapshot,
  importer: string,
  reference: SourceInspection['localReferences'][number],
  aliases: readonly AliasRule[],
  tracked: ReadonlySet<string>,
): Promise<DependencyEdge[]> {
  if (isTerminal(reference.specifier)) return [];
  const target = resolveReference(
    snapshot,
    importer,
    reference.specifier,
    aliases,
  );
  if (!target || !tracked.has(target))
    throw gap(
      snapshot,
      importer,
      `cannot resolve required local reference ${reference.specifier}`,
    );
  const edge: DependencyEdge = {
    importer,
    dependency: target,
    specifier: reference.specifier,
    kind: reference.kind,
  };
  const templateEdges =
    reference.kind === 'template-src'
      ? await externalTemplateEdges(snapshot, target, aliases, tracked)
      : [];
  return [edge, ...templateEdges];
}

function configurationEdgesForReference(
  importer: string,
  specifier: string,
  sources: readonly string[],
  aliases: ReadonlyMap<string, readonly AliasRule[]>,
): DependencyEdge[] {
  if (sources.includes(importer)) return [];
  const dependencies = (aliases.get(importer) ?? [])
    .filter((rule) => aliasCandidatesFor(rule, specifier).length > 0)
    .flatMap((rule) => rule.configFiles);
  return [...new Set(dependencies)].map((dependency) => ({
    importer,
    dependency,
    specifier: dependency,
    kind: 'configuration',
  }));
}

async function externalTemplateEdges(
  snapshot: Snapshot,
  importer: string,
  aliases: readonly AliasRule[],
  tracked: ReadonlySet<string>,
): Promise<DependencyEdge[]> {
  const source = await readFile(resolve(snapshot.directory, importer), 'utf8');
  return templateReferences(source)
    .filter((reference) => !isTerminal(reference.specifier))
    .map((reference) => {
      const dependency = resolveReference(
        snapshot,
        importer,
        reference.specifier,
        aliases,
      );
      if (!dependency || !tracked.has(dependency))
        throw gap(
          snapshot,
          importer,
          `cannot resolve required local reference ${reference.specifier}`,
        );
      return {
        importer,
        dependency,
        specifier: reference.specifier,
        kind: reference.kind,
      };
    });
}

function aliasRules(
  snapshot: Snapshot,
  sources: readonly string[],
  configRootsBySource: ReadonlyMap<string, readonly ValidatedConfigRoot[]>,
): Map<string, AliasRule[]> {
  const result = new Map<string, AliasRule[]>();
  for (const group of groupSourcesByConfig(snapshot, sources)) {
    if (!group.configPath) continue;
    const externalPackageRoots = [
      ...new Set(
        group.sources.flatMap(
          (source) => configRootsBySource.get(source) ?? [],
        ),
      ),
    ];
    const config = parseSnapshotConfig(
      snapshot,
      group.configPath,
      externalPackageRoots,
    );
    const configuredBase = config.parsed.options.pathsBasePath;
    const base =
      typeof configuredBase === 'string'
        ? configuredBase
        : resolve(snapshot.directory, dirname(group.configPath));
    const rules = Object.entries(config.parsed.options.paths ?? {}).map(
      ([pattern, targets]) => ({
        pattern,
        targets,
        base,
        configFiles: config.files,
      }),
    );
    for (const source of group.sources) result.set(source, rules);
  }
  return result;
}

function resolveReference(
  snapshot: Snapshot,
  importer: string,
  specifier: string,
  aliases: readonly AliasRule[],
): string | undefined {
  const resource = specifier.split(/[?#]/, 1)[0];
  if (!resource) return undefined;
  const aliasCandidates = aliases.flatMap((rule) =>
    aliasCandidatesFor(rule, resource),
  );
  const candidates = resource.startsWith('/')
    ? [resolve(snapshot.directory, resource.slice(1)), ...aliasCandidates]
    : resource.startsWith('.')
      ? [
          resolve(snapshot.directory, dirname(importer), resource),
          ...aliasCandidates,
        ]
      : aliasCandidates.length
        ? aliasCandidates
        : [resolve(snapshot.directory, dirname(importer), resource)];
  for (const candidate of candidates) {
    const repositoryPath = relative(snapshot.directory, candidate)
      .split('\\')
      .join('/');
    if (
      repositoryPath !== '..' &&
      !repositoryPath.startsWith('../') &&
      !isAbsolute(repositoryPath) &&
      snapshot.paths.includes(repositoryPath)
    )
      return repositoryPath;
  }
  return undefined;
}

function aliasCandidatesFor(rule: AliasRule, specifier: string): string[] {
  const wildcard = rule.pattern.indexOf('*');
  if (wildcard < 0)
    return rule.pattern === specifier
      ? rule.targets.map((target) => resolve(rule.base, target))
      : [];
  const prefix = rule.pattern.slice(0, wildcard);
  const suffix = rule.pattern.slice(wildcard + 1);
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return [];
  const match = specifier.slice(
    prefix.length,
    specifier.length - suffix.length,
  );
  return rule.targets.map((target) =>
    resolve(rule.base, target.replace('*', match)),
  );
}

function isTerminal(specifier: string): boolean {
  return (
    specifier.startsWith('#') ||
    specifier.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/i.test(specifier)
  );
}
