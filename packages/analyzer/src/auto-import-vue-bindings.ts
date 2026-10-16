import type { SFCDescriptor } from '@vue/compiler-sfc';
import ts from 'typescript';

export function localComponentNames(descriptor: SFCDescriptor): string[] {
  return [
    ...(descriptor.scriptSetup && !descriptor.scriptSetup.src
      ? setupBindings(descriptor.scriptSetup.content)
      : []),
    ...(descriptor.script && !descriptor.script.src
      ? registeredComponentNames(descriptor.script.content)
      : []),
  ];
}

function setupBindings(content: string): string[] {
  const file = ts.createSourceFile(
    'component.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  return file.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement))
      return importBindings(statement.importClause);
    if (ts.isVariableStatement(statement))
      return statement.declarationList.declarations.flatMap((declaration) =>
        bindingNames(declaration.name),
      );
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    )
      return [statement.name.text];
    return [];
  });
}

function importBindings(clause: ts.ImportClause | undefined): string[] {
  if (!clause || clause.isTypeOnly) return [];
  const names = clause.name ? [clause.name.text] : [];
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
    names.push(
      ...clause.namedBindings.elements
        .filter((item) => !item.isTypeOnly)
        .map((item) => item.name.text),
    );
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
    names.push(clause.namedBindings.name.text);
  return names;
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
  );
}

function registeredComponentNames(content: string): string[] {
  const file = ts.createSourceFile(
    'component.js',
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const exported = file.statements.find(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && !statement.isExportEquals,
  );
  if (!exported) return [];
  const root = exported.expression;
  const options = ts.isObjectLiteralExpression(root)
    ? root
    : ts.isCallExpression(root) && isVueDefineComponent(file, root)
      ? root.arguments[0]
      : undefined;
  if (!options || !ts.isObjectLiteralExpression(options)) return [];
  const components = options.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      propertyName(property.name) === 'components',
  );
  if (!components || !ts.isPropertyAssignment(components)) return [];
  if (!ts.isObjectLiteralExpression(components.initializer)) return [];
  return components.initializer.properties.flatMap((property) => {
    if (ts.isShorthandPropertyAssignment(property)) return [property.name.text];
    if (ts.isPropertyAssignment(property)) {
      const name = propertyName(property.name);
      return name ? [name] : [];
    }
    return [];
  });
}

function isVueDefineComponent(
  file: ts.SourceFile,
  call: ts.CallExpression,
): boolean {
  if (!ts.isIdentifier(call.expression)) return false;
  const localName = call.expression.text;
  return file.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'vue' &&
      !statement.importClause?.isTypeOnly &&
      namedVueDefineComponent(statement.importClause, localName),
  );
}

function namedVueDefineComponent(
  clause: ts.ImportClause | undefined,
  localName: string,
): boolean {
  if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings))
    return false;
  return clause.namedBindings.elements.some(
    (element) =>
      !element.isTypeOnly &&
      element.name.text === localName &&
      (element.propertyName?.text ?? element.name.text) === 'defineComponent',
  );
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}
