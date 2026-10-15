import { isAbsolute, relative, resolve } from 'node:path';
import { cruise } from 'dependency-cruiser';
import ts from 'typescript';
import type { DependencyEdge } from '@difftrail/core';
import type { Snapshot } from '@difftrail/git';

export interface SnapshotGraph {
  readonly revision: string | null;
  readonly edges: readonly DependencyEdge[];
}
function gap(snapshot: Snapshot, file: string, reason: string): Error {
  return new Error(
    `Analysis gap in ${file} at ${snapshot.revision ?? 'empty base'}: ${reason}`,
  );
}
async function inspectSource(
  snapshot: Snapshot,
  file: string,
): Promise<ReadonlySet<string>> {
  if (/\.(?:[cm]?tsx?|jsx|vue|css|scss|sass|less)$/.test(file))
    throw gap(
      snapshot,
      file,
      'required syntax is not supported by this release yet',
    );
  if (!/\.(?:c|m)?js$/.test(file)) return new Set();
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
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      // TypeScript synthesizes an unbound CommonJS symbol without source declarations.
      const commonJsRequire =
        ts.isIdentifier(expression) &&
        expression.text === 'require' &&
        !checker.getSymbolAtLocation(expression)?.declarations?.length;
      if (expression.kind === ts.SyntaxKind.ImportKeyword || commonJsRequire) {
        const first = node.arguments[0];
        if (!first || !ts.isStringLiteralLike(first))
          throw gap(
            snapshot,
            file,
            'non-literal dependency requires static resolution',
          );
        if (commonJsRequire) requiredSpecifiers.add(first.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return requiredSpecifiers;
}
/** Extract each snapshot independently with tool-owned parsers; never executes project configuration. */
export async function extractGraph(snapshot: Snapshot): Promise<SnapshotGraph> {
  const requiredSpecifiers = new Map<string, ReadonlySet<string>>();
  for (const file of snapshot.paths)
    requiredSpecifiers.set(file, await inspectSource(snapshot, file));
  const sources = snapshot.paths.filter((file) => /\.(?:c|m)?js$/.test(file));
  if (sources.length === 0) return { revision: snapshot.revision, edges: [] };
  let output;
  try {
    output = (
      await cruise(sources, {
        baseDir: snapshot.directory,
        tsPreCompilationDeps: true,
        exclude: [],
        doNotFollow: { path: '.*' },
      })
    ).output;
  } catch (error) {
    throw gap(
      snapshot,
      sources.join(', '),
      error instanceof Error ? error.message : String(error),
    );
  }
  if (typeof output === 'string')
    throw gap(snapshot, '<graph>', 'extractor returned an unexpected report');
  const tracked = new Set(snapshot.paths);
  const normalize = (path: string) =>
    relative(
      snapshot.directory,
      isAbsolute(path) ? path : resolve(snapshot.directory, path),
    )
      .split('\\')
      .join('/');
  const edges: DependencyEdge[] = [];
  for (const module of output.modules) {
    const importer = normalize(module.source);
    if (!tracked.has(importer)) continue;
    // Cruiser recognizes call spelling; lexical declarations identify actual CommonJS calls.
    const dependencies = module.dependencies.filter(
      (dependency) =>
        dependency.moduleSystem !== 'cjs' ||
        dependency.exoticallyRequired ||
        requiredSpecifiers.get(importer)?.has(dependency.module),
    );
    for (const dependency of dependencies) {
      if (dependency.couldNotResolve)
        throw gap(snapshot, importer, `cannot resolve ${dependency.module}`);
      if (dependency.coreModule || dependency.dependencyTypes.includes('core'))
        continue;
      const target = normalize(dependency.resolved);
      if (!tracked.has(target))
        throw gap(
          snapshot,
          importer,
          `required dependency ${dependency.module} is absent from committed snapshot`,
        );
      edges.push({
        importer,
        dependency: target,
        specifier: dependency.module,
        kind: 'import',
      });
    }
  }
  return { revision: snapshot.revision, edges };
}
