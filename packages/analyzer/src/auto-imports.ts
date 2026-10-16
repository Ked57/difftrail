import { readFile } from 'node:fs/promises';
import { posix, resolve, sep } from 'node:path';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import ts from 'typescript';
import { analysisGap as gap } from './errors.js';
import { consumerEdges } from './auto-import-consumers.js';

export interface AutoImportMapping {
  readonly name: string;
  readonly specifier: string;
  readonly metadata: string;
  readonly metadataKind: 'metadata' | 'configuration';
}

export interface MappingCollection {
  readonly mappings: readonly AutoImportMapping[];
  readonly metadataFiles: readonly string[];
  readonly configsByMetadata: ReadonlyMap<string, readonly string[]>;
  readonly runtimeComponentConfigs: readonly string[];
  readonly runtimeAutoImportConfigs: readonly string[];
  readonly unsupportedAutoImportConfigs: readonly string[];
  readonly nonliteralAutoImportConfigs: readonly string[];
  readonly missingMetadata: ReadonlyMap<string, string>;
}

export async function autoImportEdges(
  snapshot: Snapshot,
  templateEdges: readonly DependencyEdge[] = [],
): Promise<DependencyEdge[]> {
  const collection = await readMappings(snapshot);
  return consumerEdges(snapshot, collection, templateEdges);
}

async function readMappings(snapshot: Snapshot): Promise<MappingCollection> {
  const configs = await readAutoImportConfigs(snapshot);
  const nonliteral = configs.nonliteralAutoImportConfigs[0];
  if (nonliteral)
    throw gap(
      snapshot,
      nonliteral,
      'auto-import options use an unsupported static expression; expected a static object literal',
    );
  const unsupported = configs.unsupportedAutoImportConfigs[0];
  if (unsupported)
    throw gap(
      snapshot,
      unsupported,
      'auto-import imports option is not a static literal mapping',
    );
  const missingAutoImport = [...configs.missingMetadata].find(
    ([config]) =>
      configs.runtimeAutoImportConfigs.includes(config) &&
      !configs.configs.some(
        (candidate) => candidate.path === config && candidate.mappings.length,
      ),
  );
  if (missingAutoImport)
    throw gap(
      snapshot,
      missingAutoImport[0],
      `configured auto-import metadata ${missingAutoImport[1]} is missing from the committed snapshot`,
    );
  const mappings: AutoImportMapping[] = [];
  const metadataFiles: string[] = [];
  for (const path of configs.configsByMetadata.keys()) {
    if (!snapshot.paths.includes(path)) continue;
    const content = await readFile(resolve(snapshot.directory, path), 'utf8');
    if (
      !content.includes('GlobalComponents') &&
      !content.includes('declare global')
    )
      continue;
    const file = ts.createSourceFile(
      path,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const errors = (
      file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
    ).parseDiagnostics;
    if (errors.length)
      throw gap(
        snapshot,
        path,
        'cannot parse generated auto-import declarations',
      );
    const found = mappingsInFile(file, path, 'metadata');
    if (found.length) {
      metadataFiles.push(path);
      mappings.push(...found);
    }
  }
  for (const config of configs.configs) mappings.push(...config.mappings);
  return {
    mappings,
    metadataFiles,
    configsByMetadata: configs.configsByMetadata,
    runtimeComponentConfigs: configs.runtimeComponentConfigs,
    runtimeAutoImportConfigs: configs.runtimeAutoImportConfigs,
    unsupportedAutoImportConfigs: configs.unsupportedAutoImportConfigs,
    nonliteralAutoImportConfigs: configs.nonliteralAutoImportConfigs,
    missingMetadata: configs.missingMetadata,
  };
}

interface AutoImportConfig {
  readonly configs: readonly {
    readonly path: string;
    readonly mappings: readonly AutoImportMapping[];
  }[];
  readonly configsByMetadata: ReadonlyMap<string, readonly string[]>;
  readonly runtimeComponentConfigs: readonly string[];
  readonly runtimeAutoImportConfigs: readonly string[];
  readonly unsupportedAutoImportConfigs: readonly string[];
  readonly nonliteralAutoImportConfigs: readonly string[];
  readonly missingMetadata: ReadonlyMap<string, string>;
}

async function readAutoImportConfigs(
  snapshot: Snapshot,
): Promise<AutoImportConfig> {
  const result = {
    configs: [] as { path: string; mappings: AutoImportMapping[] }[],
    configsByMetadata: new Map<string, string[]>(),
    missingMetadata: new Map<string, string>(),
    runtimeComponentConfigs: [] as string[],
    runtimeAutoImportConfigs: [] as string[],
    unsupportedAutoImportConfigs: [] as string[],
    nonliteralAutoImportConfigs: [] as string[],
  };
  const sourcePaths = snapshot.paths.filter((path) =>
    /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/.test(path),
  );
  for (const path of sourcePaths) await readConfigFile(snapshot, path, result);
  return result;
}

interface ConfigAccumulator {
  readonly configs: { path: string; mappings: AutoImportMapping[] }[];
  readonly configsByMetadata: Map<string, string[]>;
  readonly missingMetadata: Map<string, string>;
  readonly runtimeComponentConfigs: string[];
  readonly runtimeAutoImportConfigs: string[];
  readonly unsupportedAutoImportConfigs: string[];
  readonly nonliteralAutoImportConfigs: string[];
}

async function readConfigFile(
  snapshot: Snapshot,
  path: string,
  result: ConfigAccumulator,
): Promise<void> {
  const absolutePath = resolve(snapshot.directory, path);
  const program = ts.createProgram([absolutePath], {
    allowJs: true,
    noLib: true,
    noResolve: true,
  });
  const file = program.getSourceFile(absolutePath);
  if (!file) return;
  const checker = program.getTypeChecker();
  const plugins = pluginImports(file, checker);
  for (const node of allNodes(file)) {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression))
      continue;
    const binding = checker.getSymbolAtLocation(node.expression);
    const plugin = binding && plugins.get(binding);
    if (!plugin) continue;
    recordPluginConfig(snapshot, path, plugin, node, result);
  }
}

function recordPluginConfig(
  snapshot: Snapshot,
  path: string,
  plugin: 'components' | 'auto-import',
  call: ts.CallExpression,
  result: ConfigAccumulator,
): void {
  const firstArgument = call.arguments[0];
  const options =
    firstArgument && ts.isObjectLiteralExpression(firstArgument)
      ? firstArgument
      : undefined;
  if (!options) {
    if (plugin === 'components') result.runtimeComponentConfigs.push(path);
    else if (firstArgument) result.nonliteralAutoImportConfigs.push(path);
    return;
  }
  const metadata = configuredMetadataPath(path, plugin, options);
  const mappings =
    plugin === 'auto-import' ? configuredImportMappings(options, path) : [];
  result.configs.push({ path, mappings });
  if (plugin === 'auto-import' && hasUnsupportedImportMappings(options))
    result.unsupportedAutoImportConfigs.push(path);
  if (plugin === 'auto-import') result.runtimeAutoImportConfigs.push(path);
  if (metadata) recordMetadataPath(snapshot, path, metadata, result);
  if (plugin === 'components') result.runtimeComponentConfigs.push(path);
}

function hasUnsupportedImportMappings(
  options: ts.ObjectLiteralExpression,
): boolean {
  const imports = propertyNode(options, 'imports');
  if (!imports || !ts.isArrayLiteralExpression(imports)) return !!imports;
  return imports.elements.some((entry) => {
    if (!ts.isObjectLiteralExpression(entry)) return true;
    return entry.properties.some(
      (item) =>
        !ts.isPropertyAssignment(item) ||
        !propertyName(item.name) ||
        !ts.isArrayLiteralExpression(item.initializer) ||
        item.initializer.elements.some((name) => !ts.isStringLiteralLike(name)),
    );
  });
}

function configuredMetadataPath(
  path: string,
  plugin: 'components' | 'auto-import',
  options: ts.ObjectLiteralExpression,
): string | undefined {
  const dtsNode = propertyNode(options, 'dts');
  if (dtsNode?.kind === ts.SyntaxKind.FalseKeyword) return undefined;
  const dts = property(options, 'dts');
  return normalizeConfigPath(
    path,
    dts ?? (plugin === 'components' ? 'components.d.ts' : 'auto-imports.d.ts'),
  );
}

function recordMetadataPath(
  snapshot: Snapshot,
  config: string,
  metadata: string,
  result: ConfigAccumulator,
): void {
  const usedBy = result.configsByMetadata.get(metadata) ?? [];
  usedBy.push(config);
  result.configsByMetadata.set(metadata, usedBy);
  if (!snapshot.paths.includes(metadata))
    result.missingMetadata.set(config, metadata);
}

const supportedPluginImports = new Map<string, 'components' | 'auto-import'>([
  ['unplugin-vue-components', 'components'],
  ['unplugin-vue-components/vite', 'components'],
  ['unplugin-auto-import', 'auto-import'],
  ['unplugin-auto-import/vite', 'auto-import'],
]);

function pluginImports(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
): Map<ts.Symbol, 'components' | 'auto-import'> {
  const result = new Map<ts.Symbol, 'components' | 'auto-import'>();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const plugin = supportedPluginImports.get(statement.moduleSpecifier.text);
    if (!plugin || !statement.importClause) continue;
    const addBinding = (identifier: ts.Identifier): void => {
      const symbol = checker.getSymbolAtLocation(identifier);
      if (symbol) result.set(symbol, plugin);
    };
    if (statement.importClause.name) addBinding(statement.importClause.name);
    if (
      statement.importClause.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    )
      for (const item of statement.importClause.namedBindings.elements)
        addBinding(item.name);
  }
  return result;
}

function configuredImportMappings(
  options: ts.ObjectLiteralExpression,
  config: string,
): AutoImportMapping[] {
  const imports = propertyNode(options, 'imports');
  if (!imports || !ts.isArrayLiteralExpression(imports)) return [];
  const mappings: AutoImportMapping[] = [];
  for (const entry of imports.elements) {
    if (!ts.isObjectLiteralExpression(entry)) continue;
    for (const item of entry.properties) {
      if (
        !ts.isPropertyAssignment(item) ||
        !ts.isArrayLiteralExpression(item.initializer)
      )
        continue;
      const specifier = propertyName(item.name);
      if (!specifier) continue;
      for (const name of item.initializer.elements)
        if (ts.isStringLiteralLike(name))
          mappings.push({
            name: name.text,
            specifier,
            metadata: config,
            metadataKind: 'configuration',
          });
    }
  }
  return mappings;
}

function property(
  object: ts.ObjectLiteralExpression,
  name: string,
): string | undefined {
  const value = propertyNode(object, name);
  return value && ts.isStringLiteralLike(value) ? value.text : undefined;
}

function propertyNode(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  const member = object.properties.find(
    (item) => ts.isPropertyAssignment(item) && propertyName(item.name) === name,
  );
  return member && ts.isPropertyAssignment(member)
    ? member.initializer
    : undefined;
}

function normalizeConfigPath(config: string, dts: string): string {
  const virtualDts =
    process.platform === 'win32' ? dts.split(sep).join('/') : dts;
  return posix.relative(
    '/difftrail-snapshot',
    posix.resolve('/difftrail-snapshot', posix.dirname(config), virtualDts),
  );
}

function* allNodes(file: ts.SourceFile): Generator<ts.Node> {
  const pending: ts.Node[] = [file];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    yield node;
    pending.push(...node.getChildren(file));
  }
}

function mappingsInFile(
  file: ts.SourceFile,
  metadata: string,
  metadataKind: 'metadata' | 'configuration',
): AutoImportMapping[] {
  const mappings: AutoImportMapping[] = [];
  function visit(node: ts.Node, inGlobalDeclaration: boolean): void {
    const global =
      inGlobalDeclaration ||
      (ts.isModuleDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'global');
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === 'GlobalComponents'
    )
      for (const member of node.members)
        if (ts.isPropertySignature(member) && member.name)
          addMapping(
            mappings,
            member.name,
            member.type,
            metadata,
            metadataKind,
          );
    if (global && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
      addMapping(mappings, node.name, node.type, metadata, metadataKind);
    ts.forEachChild(node, (child) => visit(child, global));
  }
  visit(file, false);
  return mappings;
}

function addMapping(
  mappings: AutoImportMapping[],
  name: ts.PropertyName | ts.BindingName,
  type: ts.TypeNode | undefined,
  metadata: string,
  metadataKind: 'metadata' | 'configuration',
): void {
  if (!type) return;
  const specifier = importedSpecifier(type);
  if (specifier)
    mappings.push({
      name: propertyName(name),
      specifier,
      metadata,
      metadataKind,
    });
}

function importedSpecifier(type: ts.TypeNode): string | undefined {
  const results = new Set<string>();
  function visit(node: ts.Node): void {
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      results.add(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(type);
  return results.size === 1 ? [...results][0] : undefined;
}

function propertyName(name: ts.PropertyName | ts.BindingName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return '';
}
