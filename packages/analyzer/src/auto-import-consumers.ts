import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import { isCoreComponent, parserOptions } from '@vue/compiler-dom';
import { parse as parseSfc } from '@vue/compiler-sfc';
import ts from 'typescript';
import { localComponentBindings } from './auto-import-vue-bindings.js';
import { analysisGap as gap } from './errors.js';
import { templateComponentNames } from './explicit.js';
import type { AutoImportMapping, MappingCollection } from './auto-imports.js';
import { resolveMappedDependencies } from './auto-import-resolution.js';

export async function consumerEdges(
  snapshot: Snapshot,
  collection: MappingCollection,
  templateEdges: readonly DependencyEdge[],
): Promise<DependencyEdge[]> {
  const edges = await componentEdges(snapshot, collection, templateEdges);
  edges.push(...(await scriptEdges(snapshot, collection)));
  return resolveMappedDependencies(snapshot, deduplicate(edges));
}

async function componentEdges(
  snapshot: Snapshot,
  collection: MappingCollection,
  templateEdges: readonly DependencyEdge[],
): Promise<DependencyEdge[]> {
  const edges: DependencyEdge[] = [];
  for (const path of snapshot.paths.filter((item) => item.endsWith('.vue'))) {
    const source = await readFile(resolve(snapshot.directory, path), 'utf8');
    const parsed = parseSfc(source, { filename: path });
    if (parsed.errors.length) continue;
    const template = parsed.descriptor.template;
    if (!template) continue;
    let content = template.content;
    if (template.src) {
      if (template.lang && template.lang !== 'html') continue;
      const externalTemplate = templateEdges.find(
        (edge) => edge.importer === path && edge.kind === 'template-src',
      );
      if (
        !externalTemplate ||
        !snapshot.paths.includes(externalTemplate.dependency)
      )
        continue;
      content = await readFile(
        resolve(snapshot.directory, externalTemplate.dependency),
        'utf8',
      );
    }
    const localComponents = localComponentBindings(parsed.descriptor);
    const localNames = new Set(localComponents.names.map(normalizeName));
    const setupBindings = new Set(
      localComponents.setupBindings.map(normalizeName),
    );
    for (const tag of templateComponentNames(content))
      edges.push(
        ...componentTagEdges(
          snapshot,
          path,
          tag,
          localNames,
          setupBindings,
          collection,
        ),
      );
  }
  return edges;
}

function componentTagEdges(
  snapshot: Snapshot,
  path: string,
  tag: string,
  localNames: ReadonlySet<string>,
  setupBindings: ReadonlySet<string>,
  collection: MappingCollection,
): DependencyEdge[] {
  const name = normalizeName(tag);
  const separator = tag.indexOf('.');
  if (
    localNames.has(name) ||
    (separator > 0 && setupBindings.has(normalizeName(tag.slice(0, separator))))
  )
    return [];
  const mapped = mappedEdges(snapshot, path, tag, collection);
  const reason = missingComponentMapping(path, tag, mapped, collection);
  if (reason) throw gap(snapshot, path, reason);
  return mapped;
}

function missingComponentMapping(
  path: string,
  tag: string,
  mapped: readonly DependencyEdge[],
  collection: MappingCollection,
): string | undefined {
  if (
    mapped.length ||
    isNativeOrBuiltInTag(tag) ||
    !configApplies(path, collection.runtimeComponentConfigs)
  )
    return undefined;
  const missing = [...collection.missingMetadata].find(([config]) =>
    configApplies(path, [config]),
  );
  return missing
    ? `component ${tag} requires generated metadata ${missing[1]} configured by ${missing[0]}, but that committed file is missing`
    : `component ${tag} has no committed static auto-import mapping`;
}

function isNativeOrBuiltInTag(tag: string): boolean {
  return Boolean(
    parserOptions.isNativeTag?.(tag) ||
    parserOptions.isBuiltInComponent?.(tag) ||
    isCoreComponent(tag) ||
    tag.toLowerCase() === 'component',
  );
}

function mappedEdges(
  snapshot: Snapshot,
  importer: string,
  tag: string,
  collection: MappingCollection,
  suppliedMappings?: readonly AutoImportMapping[],
): DependencyEdge[] {
  const name = normalizeName(tag);
  const found = (suppliedMappings ?? collection.mappings).filter(
    (mapping) => normalizeName(mapping.name) === name,
  );
  const targets = new Set(
    found.map((mapping) => resolveMapping(snapshot, importer, mapping)),
  );
  if (targets.size > 1)
    throw gap(
      snapshot,
      importer,
      `auto-import mapping for ${tag} is ambiguous`,
    );
  const target = targets.values().next().value as string | undefined;
  if (found.length === 0) return [];
  const provenance = [
    ...found.map((mapping) => ({
      importer,
      dependency: mapping.metadata,
      specifier: mapping.name,
      kind: mapping.metadataKind,
    })),
    ...(collection.configsByMetadata.get(found[0]?.metadata ?? '') ?? []).map(
      (config) => ({
        importer,
        dependency: config,
        specifier: config,
        kind: 'configuration',
      }),
    ),
  ];
  if (!target) return provenance;
  return [
    {
      importer,
      dependency: target,
      specifier: found[0]?.specifier ?? tag,
      kind: 'auto-import',
    },
    ...provenance,
  ];
}

function configApplies(importer: string, configs: readonly string[]): boolean {
  return configs.some((config) => {
    const directory = dirname(config);
    return directory === '.' || importer.startsWith(`${directory}/`);
  });
}

function resolveMapping(
  snapshot: Snapshot,
  importer: string,
  mapping: AutoImportMapping,
): string {
  if (!mapping.specifier.startsWith('.')) return mapping.specifier;
  const base = relative(
    snapshot.directory,
    resolve(snapshot.directory, dirname(mapping.metadata), mapping.specifier),
  )
    .split('\\')
    .join('/');
  if (base === '..' || base.startsWith('../') || base.startsWith('/'))
    throw gap(
      snapshot,
      importer,
      `auto-import mapping ${mapping.name} in ${mapping.metadata} escapes the committed snapshot`,
    );
  const candidates = snapshot.paths.filter((path) =>
    [
      base,
      ...sourceExtensions.map((extension) => `${base}${extension}`),
      ...sourceExtensions.map((extension) => `${base}/index${extension}`),
    ].includes(path),
  );
  if (candidates.length !== 1)
    throw gap(
      snapshot,
      importer,
      candidates.length > 1
        ? `auto-import mapping ${mapping.name} in ${mapping.metadata} resolves ambiguously to ${candidates.join(', ')}`
        : `auto-import mapping ${mapping.name} in ${mapping.metadata} targets missing tracked file ${mapping.specifier}`,
    );
  return candidates[0] ?? '';
}

const sourceExtensions = ['.vue', '.tsx', '.ts', '.jsx', '.js'] as const;

interface VirtualScript {
  readonly importer: string;
  readonly path: string;
  readonly source: ts.SourceFile;
}

async function scriptEdges(
  snapshot: Snapshot,
  collection: MappingCollection,
): Promise<DependencyEdge[]> {
  if (!collection.mappings.length) return [];
  const codePaths = snapshot.paths.filter((path) =>
    /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/.test(path),
  );
  const virtualScripts = await vueScripts(snapshot);
  const virtualByPath = new Map(
    virtualScripts.map((item) => [
      compilerFileName(resolve(snapshot.directory, item.path)),
      item.source,
    ]),
  );
  const options: ts.CompilerOptions = {
    allowJs: true,
    checkJs: true,
    noResolve: true,
    noEmit: true,
    noLib: true,
  };
  const host = ts.createCompilerHost(options);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (filename) =>
    virtualByPath.has(compilerFileName(resolve(filename))) ||
    fileExists(filename);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (filename, languageVersion, onError, fresh) =>
    virtualByPath.get(compilerFileName(resolve(filename))) ??
    getSourceFile(filename, languageVersion, onError, fresh);
  const program = ts.createProgram(
    [
      ...codePaths,
      ...collection.metadataFiles,
      ...collection.mappings.map((mapping) => mapping.metadata),
      ...virtualScripts.map((item) => item.path),
    ].map((path) => resolve(snapshot.directory, path)),
    options,
    host,
  );
  const checker = program.getTypeChecker();
  const byDeclaration = new Map(
    collection.mappings.map((mapping) => [
      `${compilerFileName(resolve(snapshot.directory, mapping.metadata))}\0${mapping.name}`,
      mapping,
    ]),
  );
  const edges: DependencyEdge[] = [];
  for (const path of codePaths) {
    const source = program.getSourceFile(resolve(snapshot.directory, path));
    if (source)
      edges.push(
        ...scriptEdgesForFile(
          snapshot,
          path,
          source,
          checker,
          byDeclaration,
          collection,
        ),
      );
  }
  for (const item of virtualScripts) {
    const source = program.getSourceFile(
      resolve(snapshot.directory, item.path),
    );
    if (source)
      edges.push(
        ...scriptEdgesForFile(
          snapshot,
          item.importer,
          source,
          checker,
          byDeclaration,
          collection,
        ),
      );
  }
  return edges;
}

async function vueScripts(snapshot: Snapshot): Promise<VirtualScript[]> {
  const scripts: VirtualScript[] = [];
  for (const path of snapshot.paths.filter((item) => item.endsWith('.vue'))) {
    const content = await readFile(resolve(snapshot.directory, path), 'utf8');
    const descriptor = parseSfc(content, { filename: path }).descriptor;
    for (const [index, block] of [
      descriptor.script,
      descriptor.scriptSetup,
    ].entries()) {
      if (!block || block.src) continue;
      scripts.push(virtualScript(snapshot, path, index, block));
    }
  }
  return scripts;
}

function virtualScript(
  snapshot: Snapshot,
  importer: string,
  index: number,
  block: NonNullable<ReturnType<typeof parseSfc>['descriptor']['script']>,
): VirtualScript {
  const typed = block.lang === 'ts' || block.lang === 'tsx';
  const jsx = block.lang === 'jsx' || block.lang === 'tsx';
  const extension = typed ? (jsx ? 'tsx' : 'ts') : jsx ? 'jsx' : 'js';
  const virtual = `${importer}.__difftrail_${index}.${extension}`;
  const moduleContent = `${block.content}\nexport {};`;
  return {
    importer,
    path: virtual,
    source: ts.createSourceFile(
      resolve(snapshot.directory, virtual),
      moduleContent,
      ts.ScriptTarget.Latest,
      true,
      typed
        ? jsx
          ? ts.ScriptKind.TSX
          : ts.ScriptKind.TS
        : jsx
          ? ts.ScriptKind.JSX
          : ts.ScriptKind.JS,
    ),
  };
}

function scriptEdgesForFile(
  snapshot: Snapshot,
  importer: string,
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  byDeclaration: ReadonlyMap<string, AutoImportMapping>,
  collection: MappingCollection,
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && isReference(node))
      edges.push(
        ...autoImportReferenceEdges(
          snapshot,
          importer,
          node,
          checker,
          byDeclaration,
          collection,
        ),
      );
    ts.forEachChild(node, visit);
  }
  visit(source);
  return edges;
}

function autoImportReferenceEdges(
  snapshot: Snapshot,
  importer: string,
  node: ts.Identifier,
  checker: ts.TypeChecker,
  byDeclaration: ReadonlyMap<string, AutoImportMapping>,
  collection: MappingCollection,
): DependencyEdge[] {
  const symbol = ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent)
    : checker.getSymbolAtLocation(node);
  const declaration = symbol?.declarations?.find(ts.isVariableDeclaration);
  if (declaration) {
    const metadata = declaration.getSourceFile().fileName;
    const mapping = byDeclaration.get(
      `${compilerFileName(metadata)}\0${node.text}`,
    );
    return mapping
      ? mappedEdges(snapshot, importer, mapping.name, collection, [mapping])
      : [];
  }
  if (symbol) return [];
  const configured = collection.mappings.filter(
    (mapping) =>
      mapping.metadataKind === 'configuration' && mapping.name === node.text,
  );
  return configured.length
    ? mappedEdges(snapshot, importer, node.text, collection, configured)
    : [];
}

function compilerFileName(path: string): string {
  if (ts.sys.useCaseSensitiveFileNames) return path;
  return path.replace(/\\/g, '/').toLowerCase();
}

function isReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node) ||
    (ts.isFunctionDeclaration(parent) && parent.name === node) ||
    ts.isImportClause(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent)
  )
    return false;
  return true;
}

function normalizeName(name: string): string {
  return name
    .replace(
      /[-_]+(.)?/g,
      (_match, next: string | undefined) => next?.toUpperCase() ?? '',
    )
    .replace(/^./, (first) => first.toUpperCase());
}

function deduplicate(edges: readonly DependencyEdge[]): DependencyEdge[] {
  const found = new Map<string, DependencyEdge>();
  for (const edge of edges)
    found.set(`${edge.importer}\0${edge.dependency}\0${edge.kind}`, edge);
  return [...found.values()];
}
