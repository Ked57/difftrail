import { relative, resolve } from 'node:path';
import { createRequire as createWorkspaceRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import ts from 'typescript';
import { analysisGap as gap } from './errors.js';
import { aliasMatches, parseSnapshotConfig } from './config.js';
import { groupSourcesByConfig } from './contexts.js';
import { externalEvidenceFor, prepareExternalEvidence } from './external.js';
import {
  prepareWorkspaces,
  workspaceConsumerManifest,
  workspaceForSpecifier,
} from './workspaces.js';

export async function resolveMappedDependencies(
  snapshot: Snapshot,
  edges: readonly DependencyEdge[],
): Promise<DependencyEdge[]> {
  return resolveExternalMappings(snapshot, edges);
}

async function resolveExternalMappings(
  snapshot: Snapshot,
  edges: readonly DependencyEdge[],
): Promise<DependencyEdge[]> {
  const unresolved = edges.filter(
    (edge) =>
      edge.kind === 'auto-import' && !snapshot.paths.includes(edge.dependency),
  );
  if (!unresolved.length) return [...edges];
  const workspaces = await prepareWorkspaces(snapshot);
  const workspaceEdges: DependencyEdge[] = [];
  const external: DependencyEdge[] = [];
  for (const edge of unresolved) {
    const workspace = workspaceForSpecifier(
      workspaces.packages,
      edge.dependency,
    );
    if (workspace)
      workspaceEdges.push(
        ...(await resolveWorkspaceMapping(
          snapshot,
          edge,
          workspace,
          workspaces,
        )),
      );
    else {
      const aliased = await resolveAliasMapping(snapshot, edge);
      if (aliased) workspaceEdges.push(...aliased);
      else external.push(edge);
    }
  }
  const resolvedEdges = edges.filter((edge) => !unresolved.includes(edge));
  resolvedEdges.push(...workspaceEdges);
  if (!external.length) return resolvedEdges;
  const specifiers = externalSpecifiers(external);
  try {
    const evidence = await prepareExternalEvidence(
      snapshot,
      [...specifiers.keys()],
      specifiers,
    );
    const resolved = resolvedEdges.filter((edge) => !external.includes(edge));
    for (const edge of external) {
      const identity = externalEvidenceFor(
        evidence,
        edge.importer,
        edge.dependency,
      );
      if (!identity)
        throw gap(
          snapshot,
          edge.importer,
          `auto-import mapping target ${edge.dependency} has no validated external package identity`,
        );
      for (const dependency of [identity.manifest, identity.lockfile])
        resolved.push({
          importer: edge.importer,
          dependency,
          specifier: edge.dependency,
          kind: 'metadata',
        });
    }
    return resolved;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Analysis gap'))
      throw error;
    const edge = external[0];
    throw gap(
      snapshot,
      edge?.importer ?? '<auto-import>',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function externalSpecifiers(
  edges: readonly DependencyEdge[],
): Map<string, string[]> {
  const byImporter = new Map<string, Set<string>>();
  for (const edge of edges) {
    const names = byImporter.get(edge.importer) ?? new Set<string>();
    names.add(edge.dependency);
    byImporter.set(edge.importer, names);
  }
  return new Map(
    [...byImporter].map(([importer, names]) => [importer, [...names]]),
  );
}

async function resolveAliasMapping(
  snapshot: Snapshot,
  edge: DependencyEdge,
): Promise<DependencyEdge[] | undefined> {
  const group = groupSourcesByConfig(snapshot, [edge.importer])[0];
  if (!group?.configPath) return undefined;
  const config = parseSnapshotConfig(snapshot, group.configPath);
  const paths = config.parsed.options.paths ?? {};
  if (
    !Object.keys(paths).some((pattern) =>
      aliasMatches(pattern, edge.dependency),
    )
  )
    return undefined;
  const resolved = ts.resolveModuleName(
    edge.dependency,
    resolve(snapshot.directory, edge.importer),
    config.parsed.options,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (!resolved)
    throw gap(
      snapshot,
      edge.importer,
      `auto-import alias ${edge.dependency} from ${group.configPath} has no resolved committed target`,
    );
  const target = relative(snapshot.directory, resolve(resolved))
    .split('\\')
    .join('/');
  if (!snapshot.paths.includes(target))
    throw gap(
      snapshot,
      edge.importer,
      `auto-import alias ${edge.dependency} from ${group.configPath} resolves outside the committed snapshot`,
    );
  return [
    { ...edge, dependency: target },
    ...config.files.map((dependency) => ({
      importer: edge.importer,
      dependency,
      specifier: edge.dependency,
      kind: 'configuration',
    })),
  ];
}

async function resolveWorkspaceMapping(
  snapshot: Snapshot,
  edge: DependencyEdge,
  workspace: Awaited<ReturnType<typeof prepareWorkspaces>>['packages'][number],
  evidence: Awaited<ReturnType<typeof prepareWorkspaces>>,
): Promise<DependencyEdge[]> {
  try {
    const resolved = resolveWorkspaceEntry(
      resolve(snapshot.directory, edge.importer),
      edge.dependency,
    );
    if (!resolved)
      throw new Error(
        `cannot resolve workspace auto-import ${edge.dependency}`,
      );
    const target = relative(snapshot.directory, resolve(resolved))
      .split('\\')
      .join('/');
    if (!snapshot.paths.includes(target))
      throw new Error(
        `workspace auto-import ${edge.dependency} resolves outside the committed snapshot`,
      );
    const consumer = workspaceConsumerManifest(
      snapshot,
      edge.importer,
      workspace,
    );
    return [
      { ...edge, dependency: target },
      ...[...evidence.membershipFiles, workspace.manifest, consumer].map(
        (dependency) => ({
          importer: edge.importer,
          dependency,
          specifier: edge.dependency,
          kind: 'metadata',
        }),
      ),
    ];
  } catch (error) {
    throw gap(
      snapshot,
      edge.importer,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function resolveWorkspaceEntry(importer: string, specifier: string): string {
  if (/\.[cm]?js$/.test(importer)) {
    try {
      return createWorkspaceRequire(importer).resolve(specifier);
    } catch {
      return '';
    }
  }
  try {
    const resolveFrom = import.meta.resolve as unknown as (
      request: string,
      parentUrl: string,
    ) => string;
    return fileURLToPath(resolveFrom(specifier, pathToFileURL(importer).href));
  } catch {
    return '';
  }
}
