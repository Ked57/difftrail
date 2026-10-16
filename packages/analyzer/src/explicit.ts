import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  ElementTypes,
  NodeTypes,
  baseParse as parseTemplate,
  type ElementNode,
  type TemplateChildNode,
} from '@vue/compiler-dom';
import { parse as parseSfc } from '@vue/compiler-sfc';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import ts from 'typescript';
import type { Snapshot } from '@difftrail/git';
import type { SourceRelationship } from './source.js';
import { commonJsLoader } from './require.js';

export interface ExplicitInspection {
  readonly moduleRelationships: readonly SourceRelationship[];
  readonly localReferences: readonly SourceRelationship[];
}

const assetAttributes = new Set([
  'img:src',
  'source:src',
  'video:src',
  'video:poster',
  'audio:src',
  'track:src',
  'image:href',
  'image:xlink:href',
]);

export async function inspectExplicitSource(
  snapshot: Snapshot,
  file: string,
): Promise<ExplicitInspection> {
  const source = await readFile(join(snapshot.directory, file), 'utf8');
  if (file.endsWith('.vue')) return inspectVue(source, file);
  if (/\.(?:css|scss|sass|less)$/.test(file))
    return { moduleRelationships: [], localReferences: inspectCss(source) };
  return { moduleRelationships: [], localReferences: [] };
}

function inspectVue(source: string, file: string): ExplicitInspection {
  const parsed = parseSfc(source, { filename: file });
  if (parsed.errors.length)
    throw new Error(parsed.errors.map(errorMessage).join('; '));

  const moduleRelationships: SourceRelationship[] = [];
  const localReferences: SourceRelationship[] = [];
  const descriptor = parsed.descriptor;
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block) continue;
    if (block.src) {
      localReferences.push({ specifier: block.src, kind: 'script-src' });
      continue;
    }
    if (block.lang && !['js', 'jsx', 'ts', 'tsx'].includes(block.lang))
      throw new Error(`unsupported Vue script language ${block.lang}`);
    moduleRelationships.push(...scriptRelationships(block.content, block.lang));
  }
  if (descriptor.template?.src)
    localReferences.push({
      specifier: descriptor.template.src,
      kind: 'template-src',
    });
  if (descriptor.template && !descriptor.template.src)
    localReferences.push(...templateReferences(descriptor.template.content));
  for (const style of descriptor.styles) {
    if (style.src) {
      localReferences.push({ specifier: style.src, kind: 'style-src' });
      continue;
    }
    localReferences.push(...inspectCss(style.content));
  }
  return { moduleRelationships, localReferences };
}

function scriptRelationships(
  source: string,
  language: string | undefined,
): SourceRelationship[] {
  const typed = language === 'ts' || language === 'tsx';
  const jsx = language === 'jsx' || language === 'tsx';
  const filename = resolve(`__difftrail_component__.${typed ? 'ts' : 'js'}`);
  const options: ts.CompilerOptions = {
    allowJs: true,
    noResolve: true,
    noEmit: true,
    noLib: true,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (path, target, onError, shouldCreateNewSourceFile) =>
    resolve(path) === filename
      ? ts.createSourceFile(
          path,
          source,
          target,
          true,
          typed
            ? jsx
              ? ts.ScriptKind.TSX
              : ts.ScriptKind.TS
            : jsx
              ? ts.ScriptKind.JSX
              : ts.ScriptKind.JS,
        )
      : getSourceFile(path, target, onError, shouldCreateNewSourceFile);
  host.fileExists = (path) => resolve(path) === filename;
  host.readFile = (path) => (resolve(path) === filename ? source : undefined);
  const program = ts.createProgram([filename], options, host);
  const file = program.getSourceFile(filename);
  if (!file) throw new Error('TypeScript parser did not return a script block');
  const diagnostics = program.getSyntacticDiagnostics(file);
  if (diagnostics.length)
    throw new Error(
      diagnostics
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
        )
        .join('; '),
    );
  return collectScriptRelationships(file, program.getTypeChecker());
}

function collectScriptRelationships(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
): SourceRelationship[] {
  const relationships: SourceRelationship[] = [];
  function visit(node: ts.Node): void {
    relationships.push(...scriptNodeRelationships(node, checker));
    ts.forEachChild(node, visit);
  }
  visit(file);
  return relationships;
}

function scriptNodeRelationships(
  node: ts.Node,
  checker: ts.TypeChecker,
): SourceRelationship[] {
  if (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  )
    return [
      {
        specifier: node.moduleSpecifier.text,
        kind: node.importClause?.isTypeOnly ? 'type-import' : 'import',
      },
    ];
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  )
    return [
      {
        specifier: node.moduleReference.expression.text,
        kind: 'import-equals',
      },
    ];
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  )
    return exportRelationships(node);
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteralLike(node.argument.literal)
  )
    return [{ specifier: node.argument.literal.text, kind: 'type-import' }];
  if (ts.isCallExpression(node)) return callRelationships(node, checker);
  return [];
}

function exportRelationships(node: ts.ExportDeclaration): SourceRelationship[] {
  if (!node.moduleSpecifier || !ts.isStringLiteralLike(node.moduleSpecifier))
    return [];
  const specifier = node.moduleSpecifier.text;
  if (!node.exportClause || !ts.isNamedExports(node.exportClause))
    return [
      { specifier, kind: node.isTypeOnly ? 'type-re-export' : 're-export' },
    ];
  return node.exportClause.elements.map((item) => ({
    specifier,
    kind: node.isTypeOnly || item.isTypeOnly ? 'type-re-export' : 're-export',
  }));
}

function callRelationships(
  node: ts.CallExpression,
  checker: ts.TypeChecker,
): SourceRelationship[] {
  const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  if (!dynamic && !commonJsLoader(node.expression, checker)) return [];
  const argument = node.arguments[0];
  if (!argument || !ts.isStringLiteralLike(argument))
    throw new Error('non-literal dependency requires static resolution');
  return [
    {
      specifier: argument.text,
      kind: dynamic ? 'dynamic-import' : 'require',
    },
  ];
}

export function templateReferences(source: string): SourceRelationship[] {
  return templateElements(source).flatMap((node) =>
    node.props
      .map((prop) => templateAssetReference(node, prop))
      .filter((reference) => reference !== undefined),
  );
}

export function templateComponentNames(source: string): string[] {
  return templateElements(source)
    .filter((node) => node.tagType !== ElementTypes.SLOT)
    .map((node) => node.tag);
}

function templateElements(source: string): ElementNode[] {
  const errors: unknown[] = [];
  const ast = parseTemplate(source, {
    comments: false,
    onError: (error) => errors.push(error),
  });
  if (errors.length) throw new Error(errors.map(errorMessage).join('; '));
  const elements: ElementNode[] = [];
  const pending: TemplateChildNode[] = [...ast.children];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    if (node.type === NodeTypes.ELEMENT) elements.push(node);
    pending.push(...templateChildren(node));
  }
  return elements;
}

function templateAssetReference(
  node: ElementNode,
  prop: ElementNode['props'][number],
): SourceRelationship | undefined {
  if (prop.type === NodeTypes.DIRECTIVE && prop.name === 'bind') {
    const name =
      prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION && prop.arg.isStatic
        ? prop.arg.content.toLowerCase()
        : undefined;
    if (
      (name && isAssetAttribute(node.tag, name)) ||
      (!name && hasAssetTag(node.tag))
    )
      throw new Error('dynamic template asset requires static resolution');
    return undefined;
  }
  if (
    prop.type !== NodeTypes.ATTRIBUTE ||
    !prop.value ||
    !isAssetAttribute(node.tag, prop.name)
  )
    return undefined;
  return { specifier: prop.value.content, kind: 'template-asset' };
}

function isAssetAttribute(tag: string, name: string): boolean {
  return assetAttributes.has(`${tag.toLowerCase()}:${name.toLowerCase()}`);
}

function hasAssetTag(tag: string): boolean {
  const prefix = `${tag.toLowerCase()}:`;
  return [...assetAttributes].some((attribute) => attribute.startsWith(prefix));
}

function templateChildren(node: TemplateChildNode): TemplateChildNode[] {
  if (node.type === NodeTypes.ELEMENT || node.type === NodeTypes.FOR)
    return node.children;
  if (node.type === NodeTypes.IF)
    return node.branches.flatMap((branch) => branch.children);
  return [];
}

function inspectCss(source: string): SourceRelationship[] {
  const root = postcss.parse(source);
  const relationships: SourceRelationship[] = [];
  root.walkAtRules('import', (rule) => {
    const specifier = cssImportSpecifier(rule.params);
    if (specifier)
      relationships.push({
        specifier,
        kind: 'css-import',
      });
  });
  root.walkDecls((declaration) => {
    valueParser(declaration.value).walk((node) => {
      if (node.type !== 'function' || node.value.toLowerCase() !== 'url')
        return;
      const specifier = cssUrlSpecifier(node.nodes);
      if (specifier) relationships.push({ specifier, kind: 'css-url' });
    });
  });
  return relationships;
}

function cssImportSpecifier(params: string): string | undefined {
  const target = valueParser(params).nodes.find(
    (node) => node.type !== 'space' && node.type !== 'comment',
  );
  if (!target) return undefined;
  if (target.type === 'string') return target.value || undefined;
  if (target.type === 'function' && target.value.toLowerCase() === 'url')
    return cssUrlSpecifier(target.nodes);
  return undefined;
}

function cssUrlSpecifier(
  nodes: readonly valueParser.Node[],
): string | undefined {
  const argument = nodes.filter(
    (node) => node.type !== 'space' && node.type !== 'comment',
  );
  if (argument.length === 0) return undefined;
  if (
    argument.length !== 1 ||
    (argument[0]?.type !== 'string' && argument[0]?.type !== 'word')
  )
    throw new Error('CSS url() requires a static URL');
  return argument[0].value || undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
