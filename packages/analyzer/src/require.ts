import ts from 'typescript';

function nodeModuleName(node: ts.Node | undefined): boolean {
  return (
    !!node &&
    ts.isStringLiteralLike(node) &&
    (node.text === 'module' || node.text === 'node:module')
  );
}
function nodeModuleImport(declaration: ts.Node): boolean {
  let owner: ts.Node | undefined = declaration;
  while (owner && !ts.isImportDeclaration(owner)) owner = owner.parent;
  return (
    !!owner &&
    ts.isImportDeclaration(owner) &&
    nodeModuleName(owner.moduleSpecifier)
  );
}
function nodeModuleRequire(
  expression: ts.Expression | undefined,
  checker: ts.TypeChecker,
): boolean {
  return (
    !!expression &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'require' &&
    !checker.getSymbolAtLocation(expression.expression)?.declarations?.length &&
    expression.arguments.length === 1 &&
    nodeModuleName(expression.arguments[0])
  );
}
function nodeModuleObject(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): boolean {
  if (nodeModuleRequire(expression, checker)) return true;
  if (!ts.isIdentifier(expression)) return false;
  return (checker.getSymbolAtLocation(expression)?.declarations ?? []).some(
    (declaration) => {
      if (ts.isNamespaceImport(declaration) || ts.isImportClause(declaration))
        return nodeModuleImport(declaration);
      return (
        ts.isVariableDeclaration(declaration) &&
        nodeModuleRequire(declaration.initializer, checker)
      );
    },
  );
}
function nodeFactoryDeclaration(
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
): boolean {
  if (ts.isImportSpecifier(declaration))
    return (
      (declaration.propertyName ?? declaration.name).text === 'createRequire' &&
      nodeModuleImport(declaration)
    );
  if (!ts.isBindingElement(declaration) || !ts.isIdentifier(declaration.name))
    return false;
  const name = declaration.propertyName ?? declaration.name;
  const owner = declaration.parent.parent;
  return (
    ts.isIdentifier(name) &&
    name.text === 'createRequire' &&
    ts.isObjectBindingPattern(declaration.parent) &&
    ts.isVariableDeclaration(owner) &&
    nodeModuleRequire(owner.initializer, checker)
  );
}
function nodeFactory(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): boolean {
  if (ts.isIdentifier(expression))
    return (checker.getSymbolAtLocation(expression)?.declarations ?? []).some(
      (declaration) => nodeFactoryDeclaration(declaration, checker),
    );
  if (ts.isPropertyAccessExpression(expression))
    return (
      expression.name.text === 'createRequire' &&
      nodeModuleObject(expression.expression, checker)
    );
  return (
    ts.isElementAccessExpression(expression) &&
    !!expression.argumentExpression &&
    ts.isStringLiteralLike(expression.argumentExpression) &&
    expression.argumentExpression.text === 'createRequire' &&
    nodeModuleObject(expression.expression, checker)
  );
}
function ownerUrl(expression: ts.Expression | undefined): boolean {
  while (expression && ts.isParenthesizedExpression(expression))
    expression = expression.expression;
  return (
    !!expression &&
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'url' &&
    ts.isMetaProperty(expression.expression) &&
    expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    expression.expression.name.text === 'meta'
  );
}
function hasRuntimeDeclaration(
  declarations: readonly ts.Declaration[],
): boolean {
  return declarations.some(
    (declaration) =>
      !declaration.getSourceFile().isDeclarationFile &&
      (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Ambient) ===
        0,
  );
}
/** Known Node factory uses need a direct binding and the original source file as base. */
export function factoryGap(
  node: ts.Node,
  checker: ts.TypeChecker,
): string | undefined {
  if (
    !(
      ts.isIdentifier(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) ||
    !nodeFactory(node, checker)
  )
    return;
  const parent = node.parent;
  if (ts.isImportSpecifier(parent) || ts.isBindingElement(parent)) return;
  if (!ts.isCallExpression(parent) || parent.expression !== node)
    return 'Node createRequire passed as a value is not supported; use a direct binding with import.meta.url';
  if (parent.arguments.length !== 1 || !ownerUrl(parent.arguments[0]))
    return 'Node createRequire base must be the owning import.meta.url; other bases require unsupported resolution';
  if (
    !ts.isVariableDeclaration(parent.parent) ||
    parent.parent.initializer !== parent ||
    !ts.isIdentifier(parent.parent.name)
  )
    return 'Node createRequire result must be assigned directly to a named binding';
}
/** Explicit helper declarations shadow require; known Node factory results remain loaders. */
export function commonJsLoader(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): boolean {
  if (!ts.isIdentifier(expression)) return false;
  const declarations =
    checker.getSymbolAtLocation(expression)?.declarations ?? [];
  if (expression.text === 'require' && !hasRuntimeDeclaration(declarations))
    return true;
  return declarations.some(
    (declaration) =>
      ts.isVariableDeclaration(declaration) &&
      !!declaration.initializer &&
      ts.isCallExpression(declaration.initializer) &&
      nodeFactory(declaration.initializer.expression, checker),
  );
}
