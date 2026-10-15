import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import { groupSourcesByConfig } from './contexts.js';
import { externalConfigExtends, type ExternalConfigExtend } from './config.js';
import { analysisGap as gap } from './errors.js';
import {
  externalEvidenceFor,
  prepareExternalEvidence,
  type ExternalEvidence,
} from './external.js';
import { packageName } from './external-manifest.js';

export interface ConfigProviderReference extends ExternalConfigExtend {
  readonly source: string;
}

export interface ConfigProviderEvidence {
  readonly references: readonly ConfigProviderReference[];
  readonly specifiers: ReadonlyMap<string, readonly string[]>;
  readonly rootsBySource: ReadonlyMap<string, readonly string[]>;
}

export async function prepareConfigProviderEvidence(
  snapshot: Snapshot,
  sources: readonly string[],
): Promise<ConfigProviderEvidence> {
  const references = groupSourcesByConfig(snapshot, sources).flatMap((group) =>
    group.configPath
      ? group.sources.flatMap((source) =>
          externalConfigExtends(snapshot, group.configPath!).map((item) => ({
            ...item,
            source,
          })),
        )
      : [],
  );
  const specifiers = configSpecifiers(references);
  if (!references.length)
    return { references, specifiers, rootsBySource: new Map() };
  const evidence = await prepareExternalEvidence(
    snapshot,
    sources,
    specifiers,
  ).catch((error: unknown) =>
    throwWithConfigContext(snapshot, references, error),
  );
  return {
    references,
    specifiers,
    rootsBySource: packageRoots(references, evidence),
  };
}

export function configRootsForSources(
  sources: readonly string[],
  rootsBySource: ReadonlyMap<string, readonly string[]>,
): string[] {
  return [
    ...new Set(sources.flatMap((source) => rootsBySource.get(source) ?? [])),
  ];
}

export function includeConfigSpecifiers(
  ordinary: ReadonlyMap<string, readonly string[]>,
  configured: ReadonlyMap<string, readonly string[]>,
): Map<string, string[]> {
  const result = new Map<string, Set<string>>();
  for (const [source, specifiers] of [...ordinary, ...configured]) {
    const values = result.get(source) ?? new Set<string>();
    for (const specifier of specifiers) values.add(specifier);
    result.set(source, values);
  }
  return new Map(
    [...result].map(([source, specifiers]) => [source, [...specifiers]]),
  );
}

export function configProviderEdges(
  evidence: ExternalEvidence,
  references: readonly ConfigProviderReference[],
): DependencyEdge[] {
  return references.flatMap((reference) => {
    const provider = externalEvidenceFor(
      evidence,
      reference.source,
      reference.specifier,
    );
    if (!provider) return [];
    return [provider.manifest, provider.lockfile].map((dependency) => ({
      importer: reference.source,
      dependency,
      specifier: reference.specifier,
      kind: 'metadata',
    }));
  });
}

function configSpecifiers(
  references: readonly ConfigProviderReference[],
): Map<string, string[]> {
  const result = new Map<string, Set<string>>();
  for (const reference of references) {
    const specifiers = result.get(reference.source) ?? new Set<string>();
    specifiers.add(reference.specifier);
    result.set(reference.source, specifiers);
  }
  return new Map(
    [...result].map(([source, specifiers]) => [source, [...specifiers]]),
  );
}

function packageRoots(
  references: readonly ConfigProviderReference[],
  evidence: ExternalEvidence,
): Map<string, string[]> {
  const result = new Map<string, Set<string>>();
  for (const reference of references) {
    const provider = externalEvidenceFor(
      evidence,
      reference.source,
      reference.specifier,
    );
    if (!provider) continue;
    const roots = result.get(reference.source) ?? new Set<string>();
    roots.add(provider.packageRoot);
    result.set(reference.source, roots);
  }
  return new Map([...result].map(([source, roots]) => [source, [...roots]]));
}

function throwWithConfigContext(
  snapshot: Snapshot,
  references: readonly ConfigProviderReference[],
  error: unknown,
): never {
  const message = error instanceof Error ? error.message : String(error);
  const reference =
    references.find((candidate) => {
      const name = packageName(candidate.specifier);
      return name !== undefined && message.includes(name);
    }) ?? references[0];
  if (!reference) throw error;
  throw gap(
    snapshot,
    reference.source,
    `${reference.configPath} extends ${reference.specifier}: ${message.replace(/^Analysis gap in [^:]+: /, '')}`,
  );
}
