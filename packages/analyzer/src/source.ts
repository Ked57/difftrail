import { resolve } from 'node:path';
import ts from 'typescript';
import type { Snapshot } from '@difftrail/git';
import { commonJsLoader, factoryGap } from './require.js';

export interface SourceInspection {
  readonly specifiers: ReadonlySet<string>;
  readonly loaderNames: ReadonlySet<string>;
  readonly relationships: readonly SourceRelationship[];
}

interface SourceRelationship {
  readonly specifier: string;
  readonly kind: string;
}

export const supportedSourcePattern = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/;

export async function inspectSources(
  snapshot: Snapshot,
): Promise<Map<string, SourceInspection>> {
  const inspections = new Map<string, SourceInspection>();
  for (const file of snapshot.paths)
    inspections.set(file, await inspectSource(snapshot, file));
  return inspections;
}

async function inspectSource(
  snapshot: Snapshot,
  file: string,
): Promise<SourceInspection> {
  if (/\.(?:vue|css|scss|sass|less)$/.test(file))
    throw gap(
      snapshot,
      file,
      'required syntax is not supported by this release yet',
    );
  if (!supportedSourcePattern.test(file))
    return { specifiers: new Set(), loaderNames: new Set(), relationships: [] };
  const filename = resolve(snapshot.directory, file);
  const program = ts.createProgram([filename], {
    allowJs: true,
    noResolve: true,
    noEmit: true,
    noLib: true,
  });
  const source = program.getSourceFile(filename);
  if (!source) throw gap(snapshot, file, 'source parser did not return a file');
  const diagnostics = program.getSyntacticDiagnostics(source);
  if (diagnostics.length)
    throw gap(
      snapshot,
      file,
      diagnostics
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
        )
        .join('; '),
    );
  const checker = program.getTypeChecker();
  const requiredSpecifiers = new Set<string>();
  const loaderNames = new Set<string>();
  const relationships: SourceRelationship[] = [];
  function visit(node: ts.Node): void {
    const unsupportedFactory = factoryGap(node, checker);
    if (unsupportedFactory) throw gap(snapshot, file, unsupportedFactory);
    recordRelationship(
      node,
      checker,
      snapshot,
      file,
      relationships,
      requiredSpecifiers,
      loaderNames,
    );
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { specifiers: requiredSpecifiers, loaderNames, relationships };
}

function recordRelationship(
  node: ts.Node,
  checker: ts.TypeChecker,
  snapshot: Snapshot,
  file: string,
  relationships: SourceRelationship[],
  requiredSpecifiers: Set<string>,
  loaderNames: Set<string>,
): void {
  if (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    relationships.push({
      specifier: node.moduleSpecifier.text,
      kind: node.importClause?.isTypeOnly ? 'type-import' : 'import',
    });
    return;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    relationships.push({
      specifier: node.moduleReference.expression.text,
      kind: 'import-equals',
    });
    return;
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteralLike(node.argument.literal)
  ) {
    relationships.push({
      specifier: node.argument.literal.text,
      kind: 'type-import',
    });
    return;
  }
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    relationships.push({
      specifier: node.moduleSpecifier.text,
      kind: node.isTypeOnly ? 'type-re-export' : 're-export',
    });
    return;
  }
  if (ts.isCallExpression(node))
    recordCallRelationship(
      node,
      checker,
      snapshot,
      file,
      relationships,
      requiredSpecifiers,
      loaderNames,
    );
}

function recordCallRelationship(
  node: ts.CallExpression,
  checker: ts.TypeChecker,
  snapshot: Snapshot,
  file: string,
  relationships: SourceRelationship[],
  requiredSpecifiers: Set<string>,
  loaderNames: Set<string>,
): void {
  const expression = node.expression;
  const commonJsRequire = commonJsLoader(expression, checker);
  if (expression.kind !== ts.SyntaxKind.ImportKeyword && !commonJsRequire)
    return;
  const first = node.arguments[0];
  if (!first || !ts.isStringLiteralLike(first))
    throw gap(
      snapshot,
      file,
      'non-literal dependency requires static resolution',
    );
  relationships.push({
    specifier: first.text,
    kind: commonJsRequire ? 'require' : 'dynamic-import',
  });
  if (commonJsRequire && ts.isIdentifier(expression)) {
    requiredSpecifiers.add(first.text);
    if (expression.text !== 'require') loaderNames.add(expression.text);
  }
}

function gap(snapshot: Snapshot, file: string, reason: string): Error {
  return new Error(
    `Analysis gap in ${file} at ${snapshot.revision ?? 'empty base'}: ${reason}`,
  );
}
