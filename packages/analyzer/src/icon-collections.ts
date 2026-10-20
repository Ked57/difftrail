import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';
import ts from 'typescript';
import { analysisGap as gap } from './errors.js';
import { iconSpecifier } from './virtual-modules.js';

interface CustomCollection {
  readonly directory: string;
  readonly config: string;
  readonly dynamic: boolean;
}

type CustomIcon =
  | { readonly kind: 'unconfigured' }
  | { readonly kind: 'dynamic'; readonly config: string }
  | { readonly kind: 'missing'; readonly config: string }
  | {
      readonly kind: 'file';
      readonly file: string;
      readonly config: string;
    };

const indexes = new WeakMap<Snapshot, Map<string, CustomCollection>>();

export function classifyCustomIcon(
  snapshot: Snapshot,
  collection: string,
  name: string,
): CustomIcon {
  const configured = iconIndex(snapshot).get(collection);
  if (!configured) return { kind: 'unconfigured' };
  if (configured.dynamic) return { kind: 'dynamic', config: configured.config };
  const file = `${configured.directory}/${name}.svg`;
  return snapshot.paths.includes(file)
    ? { kind: 'file', file, config: configured.config }
    : { kind: 'missing', config: configured.config };
}

export function customIconEdges(
  snapshot: Snapshot,
  importer: string,
  specifier: string,
  kind: string,
): DependencyEdge[] | undefined {
  const icon = iconSpecifier(specifier);
  if (!icon) return undefined;
  const custom = classifyCustomIcon(snapshot, icon.collection, icon.name);
  if (custom.kind === 'unconfigured') return undefined;
  if (custom.kind === 'dynamic')
    throw gap(
      snapshot,
      importer,
      `icon collection ${icon.collection} has no static file directory`,
    );
  if (custom.kind === 'missing')
    throw gap(
      snapshot,
      importer,
      `icon ${specifier} has no committed ${icon.name}.svg in its custom collection`,
    );
  return [
    {
      importer,
      dependency: custom.file,
      specifier,
      kind,
    },
    {
      importer,
      dependency: custom.config,
      specifier,
      kind: 'configuration',
    },
  ];
}

function iconIndex(snapshot: Snapshot): Map<string, CustomCollection> {
  const cached = indexes.get(snapshot);
  if (cached) return cached;
  const index = new Map<string, CustomCollection>();
  for (const path of snapshot.paths)
    if (/\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/.test(path))
      for (const collection of collectionsInFile(snapshot, path))
        index.set(collection.name, collection);
  indexes.set(snapshot, index);
  return index;
}

function collectionsInFile(
  snapshot: Snapshot,
  path: string,
): (CustomCollection & { readonly name: string })[] {
  const absolutePath = resolve(snapshot.directory, path);
  const program = ts.createProgram([absolutePath], {
    allowJs: true,
    noLib: true,
    noResolve: true,
  });
  const file = program.getSourceFile(absolutePath);
  if (!file) return [];
  const bindings = loaderBindings(file, program.getTypeChecker());
  const found: (CustomCollection & { name: string })[] = [];
  for (const node of nodes(file)) {
    const collection = collectionCall(node, bindings, program.getTypeChecker());
    if (!collection) continue;
    found.push({
      name: collection.name,
      config: path,
      ...collectionDirectory(snapshot, path, collection.directory),
    });
  }
  return found;
}

function collectionCall(
  node: ts.Node,
  bindings: ReadonlyMap<ts.Symbol, true>,
  checker: ts.TypeChecker,
): { name: string; directory: string | undefined } | undefined {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression))
    return undefined;
  const symbol = checker.getSymbolAtLocation(node.expression);
  if (!symbol || !bindings.has(symbol)) return undefined;
  const parent = node.parent;
  if (!ts.isPropertyAssignment(parent)) return undefined;
  const name = propertyText(parent.name);
  if (!name) return undefined;
  const directory = node.arguments[0];
  return {
    name,
    directory:
      directory && ts.isStringLiteralLike(directory)
        ? directory.text
        : undefined,
  };
}

function collectionDirectory(
  snapshot: Snapshot,
  config: string,
  directory: string | undefined,
): Pick<CustomCollection, 'directory' | 'dynamic'> {
  if (!directory) return { directory: '', dynamic: true };
  const absolute = resolve(snapshot.directory, dirname(config), directory);
  const local = relative(snapshot.directory, absolute);
  if (
    isAbsolute(directory) ||
    local === '..' ||
    local.startsWith(`..${sep}`) ||
    local.startsWith('/')
  )
    return { directory: '', dynamic: true };
  return {
    directory: local.split(sep).join('/'),
    dynamic: false,
  };
}

function loaderBindings(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
): Map<ts.Symbol, true> {
  const bindings = new Map<ts.Symbol, true>();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'unplugin-icons/loaders' ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    )
      continue;
    for (const item of statement.importClause.namedBindings.elements) {
      const imported = item.propertyName?.text ?? item.name.text;
      if (imported !== 'FileSystemIconLoader') continue;
      const symbol = checker.getSymbolAtLocation(item.name);
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
