import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import ts from 'typescript';
import { analysisGap as gap } from './errors.js';
import { isRouterAuto } from './virtual-modules.js';

interface RouterConfig {
  readonly config: string;
  readonly folders: readonly string[];
  readonly dynamic: boolean;
}

const indexes = new WeakMap<Snapshot, RouterConfig[]>();
const routeExtensions = ['.vue', '.ts', '.tsx', '.js', '.jsx'];

export function routerAutoEdges(
  snapshot: Snapshot,
  importer: string,
  specifier: string,
): DependencyEdge[] | undefined {
  if (!isRouterAuto(specifier)) return undefined;
  const applicable = routerIndex(snapshot).filter((config) =>
    configApplies(importer, config.config),
  );
  const config = applicable[0];
  if (!config)
    throw gap(
      snapshot,
      importer,
      `${specifier} has no static unplugin-vue-router configuration`,
    );
  if (config.dynamic)
    throw gap(
      snapshot,
      importer,
      `${config.config} routesFolder is not a static path`,
    );
  const files = routeFiles(snapshot, config.folders);
  return [
    ...files.map((dependency) => ({
      importer,
      dependency,
      specifier,
      kind: 'import',
    })),
    {
      importer,
      dependency: config.config,
      specifier,
      kind: 'configuration',
    },
  ];
}

function routerIndex(snapshot: Snapshot): RouterConfig[] {
  const cached = indexes.get(snapshot);
  if (cached) return cached;
  const index = snapshot.paths
    .filter((path) => /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/.test(path))
    .flatMap((path) => configsInFile(snapshot, path));
  indexes.set(snapshot, index);
  return index;
}

function configsInFile(snapshot: Snapshot, path: string): RouterConfig[] {
  const absolutePath = resolve(snapshot.directory, path);
  const program = ts.createProgram([absolutePath], {
    allowJs: true,
    noLib: true,
    noResolve: true,
  });
  const file = program.getSourceFile(absolutePath);
  if (!file) return [];
  const bindings = routerBindings(file, program.getTypeChecker());
  const checker = program.getTypeChecker();
  const found: RouterConfig[] = [];
  for (const node of nodes(file)) {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression))
      continue;
    const symbol = checker.getSymbolAtLocation(node.expression);
    if (!symbol || !bindings.has(symbol)) continue;
    found.push(routerConfig(snapshot, path, node.arguments[0]));
  }
  return found;
}

function routerConfig(
  snapshot: Snapshot,
  config: string,
  options: ts.Expression | undefined,
): RouterConfig {
  const folder = routesFolder(options);
  if (folder === 'dynamic') return { config, folders: [], dynamic: true };
  const folders = (folder ?? ['src/pages']).flatMap((directory) => {
    const resolved = staticDirectory(snapshot, config, directory);
    return resolved ? [resolved] : [];
  });
  if ((folder ?? ['src/pages']).length !== folders.length)
    return { config, folders: [], dynamic: true };
  return { config, folders, dynamic: false };
}

function routesFolder(
  options: ts.Expression | undefined,
): string[] | 'dynamic' | undefined {
  if (!options) return undefined;
  if (!ts.isObjectLiteralExpression(options)) return 'dynamic';
  const member = options.properties.find(
    (item) =>
      ts.isPropertyAssignment(item) &&
      propertyText(item.name) === 'routesFolder',
  );
  if (!member || !ts.isPropertyAssignment(member)) return undefined;
  return folderList(member.initializer);
}

function folderList(value: ts.Expression): string[] | 'dynamic' {
  if (ts.isStringLiteralLike(value)) return [value.text];
  if (!ts.isArrayLiteralExpression(value)) return 'dynamic';
  const folders: string[] = [];
  for (const entry of value.elements) {
    if (!ts.isStringLiteralLike(entry)) return 'dynamic';
    folders.push(entry.text);
  }
  return folders;
}

function staticDirectory(
  snapshot: Snapshot,
  config: string,
  directory: string,
): string | undefined {
  const absolute = resolve(snapshot.directory, dirname(config), directory);
  const local = relative(snapshot.directory, absolute);
  if (
    isAbsolute(directory) ||
    local === '..' ||
    local.startsWith(`..${sep}`) ||
    local.startsWith('/')
  )
    return undefined;
  return local.split(sep).join('/');
}

function routeFiles(snapshot: Snapshot, folders: readonly string[]): string[] {
  return snapshot.paths.filter((path) =>
    folders.some(
      (folder) =>
        path.startsWith(`${folder}/`) &&
        routeExtensions.some((extension) => path.endsWith(extension)) &&
        !path.endsWith('.d.ts'),
    ),
  );
}

function configApplies(importer: string, config: string): boolean {
  const directory = dirname(config);
  return directory === '.' || importer.startsWith(`${directory}/`);
}

function routerBindings(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
): Map<ts.Symbol, true> {
  const bindings = new Map<ts.Symbol, true>();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause
    )
      continue;
    const source = statement.moduleSpecifier.text;
    if (
      source !== 'unplugin-vue-router' &&
      source !== 'unplugin-vue-router/vite'
    )
      continue;
    const names = statement.importClause.name
      ? [statement.importClause.name]
      : [];
    if (
      statement.importClause.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    )
      names.push(
        ...statement.importClause.namedBindings.elements.map(
          (item) => item.name,
        ),
      );
    for (const name of names) {
      const symbol = checker.getSymbolAtLocation(name);
      if (symbol) bindings.set(symbol, true);
    }
  }
  return bindings;
}

function propertyText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return undefined;
}

function* nodes(file: ts.SourceFile): Generator<ts.Node> {
  const pending: ts.Node[] = [file];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    yield node;
    pending.push(...node.getChildren(file));
  }
}
