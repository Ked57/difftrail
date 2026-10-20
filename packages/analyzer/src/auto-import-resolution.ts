import { dirname, relative, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import enhancedResolve from 'enhanced-resolve';
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
import { customIconEdges } from './icon-collections.js';

export async function resolveMappedDependencies(
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
  for (const edge of unresolved)
    await appendMappedEdge(
      snapshot,
      edge,
      workspaces,
      workspaceEdges,
      external,
    );
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

async function appendMappedEdge(
  snapshot: Snapshot,
  edge: DependencyEdge,
  workspaces: Awaited<ReturnType<typeof prepareWorkspaces>>,
  workspaceEdges: DependencyEdge[],
  external: DependencyEdge[],
): Promise<void> {
  const customIcon = customIconEdges(
    snapshot,
    edge.importer,
    edge.dependency,
    'auto-import',
  );
  if (customIcon) {
    workspaceEdges.push(...customIcon);
    return;
  }
  const workspace = workspaceForSpecifier(workspaces.packages, edge.dependency);
  if (workspace) {
    workspaceEdges.push(
      ...(await resolveWorkspaceMapping(snapshot, edge, workspace, workspaces)),
    );
    return;
  }
  const aliased = await resolveAliasMapping(snapshot, edge);
  if (aliased) workspaceEdges.push(...aliased);
  else external.push(edge);
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
    const consumer = workspaceConsumerManifest(
      snapshot,
      edge.importer,
      workspace,
    );
    const resolved = resolveWorkspaceEntry(
      snapshot,
      resolve(snapshot.directory, edge.importer),
      edge.dependency,
      workspaceCondition(snapshot, edge.importer, consumer),
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

function resolveWorkspaceEntry(
  snapshot: Snapshot,
  importer: string,
  specifier: string,
  condition: 'import' | 'require',
): string {
  try {
    const resolveFrom = enhancedResolve.create.sync({
      conditionNames: [condition, 'node', 'default'],
      exportsFields: ['exports'],
      extensions: [
        '.mjs',
        '.js',
        '.cjs',
        '.mts',
        '.ts',
        '.cts',
        '.json',
        '.vue',
      ],
    });
    const resolved = resolveFrom(
      resolve(snapshot.directory, dirname(importer)),
      specifier,
    );
    return resolved || '';
  } catch {
    return '';
  }
}

function workspaceCondition(
  snapshot: Snapshot,
  importer: string,
  consumerManifest: string,
): 'import' | 'require' {
  if (/\.(?:mjs|mts)$/.test(importer)) return 'import';
  if (/\.(?:cjs|cts)$/.test(importer)) return 'require';
  if (/\.(?:vue|jsx|tsx)$/.test(importer)) return 'import';
  const manifest: unknown = JSON.parse(
    readFileSync(resolve(snapshot.directory, consumerManifest), 'utf8'),
  );
  const type =
    typeof manifest === 'object' && manifest !== null && 'type' in manifest
      ? manifest.type
      : undefined;
  if (type === 'module') return 'import';
  if (type === 'commonjs') return 'require';
  return importer.endsWith('.js') && hasNodeEsmSyntax(snapshot, importer)
    ? 'import'
    : 'require';
}

function hasNodeEsmSyntax(snapshot: Snapshot, importer: string): boolean {
  const file = ts.createSourceFile(
    importer,
    readFileSync(resolve(snapshot.directory, importer), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (file.statements.some(redeclaresCommonJsBinding)) return true;
  return containsModuleOnlySyntax(file, false);
}

function redeclaresCommonJsBinding(statement: ts.Statement): boolean {
  const bindings = new Set([
    'require',
    'module',
    'exports',
    '__dirname',
    '__filename',
  ]);
  if (ts.isClassDeclaration(statement))
    return statement.name !== undefined && bindings.has(statement.name.text);
  if (
    !ts.isVariableStatement(statement) ||
    (statement.declarationList.flags &
      (ts.NodeFlags.Let | ts.NodeFlags.Const)) ===
      0
  )
    return false;
  return statement.declarationList.declarations.some((declaration) =>
    bindingNameMatches(declaration.name, bindings),
  );
}

function bindingNameMatches(
  name: ts.BindingName | ts.OmittedExpression,
  bindings: ReadonlySet<string>,
): boolean {
  if (ts.isOmittedExpression(name)) return false;
  if (ts.isIdentifier(name)) return bindings.has(name.text);
  return name.elements.some(
    (element) =>
      ts.isBindingElement(element) &&
      bindingNameMatches(element.name, bindings),
  );
}

function containsModuleOnlySyntax(
  node: ts.Node,
  insideFunction: boolean,
): boolean {
  if (
    ts.isImportDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isExportAssignment(node) ||
    (ts.canHaveModifiers(node) &&
      ts
        .getModifiers(node)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) ||
    (ts.isMetaProperty(node) &&
      node.keywordToken === ts.SyntaxKind.ImportKeyword &&
      node.name.text === 'meta')
  )
    return true;
  if (
    !insideFunction &&
    (ts.isAwaitExpression(node) ||
      (ts.isForOfStatement(node) && node.awaitModifier !== undefined))
  )
    return true;
  const nestedFunction = insideFunction || ts.isFunctionLike(node);
  let found = false;
  node.forEachChild((child) => {
    if (!found) found = containsModuleOnlySyntax(child, nestedFunction);
  });
  return found;
}
