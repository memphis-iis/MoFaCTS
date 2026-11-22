import ts from 'typescript';

// Application adapters register on their injected server. A direct reference
// to either framework function bypasses those adapters, even if called later.
export function directMeteorRegistrationReferences(source) {
  let checker;
  function declarationOf(identifier) {
    if (!checker) {
      // Bind local symbols without loading dependencies or the application's type graph.
      const options = { noLib: true, noResolve: true, allowJs: true };
      const host = ts.createCompilerHost(options);
      host.getSourceFile = file => file.replaceAll('\\', '/') === source.fileName.replaceAll('\\', '/') ? source : undefined;
      checker = ts.createProgram([source.fileName], options, host).getTypeChecker();
    }
    return checker.getSymbolAtLocation(identifier)?.declarations?.[0];
  }
  function meteorImport(node) {
    while (node && !ts.isImportDeclaration(node)) node = node.parent;
    return node?.moduleSpecifier.text === 'meteor/meteor' && !node.importClause?.isTypeOnly;
  }
  function unwrap(node) {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
           ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
    return node;
  }
  function property(node) {
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) return node.argumentExpression.text;
    return undefined;
  }
  function isMeteor(node, visited = new Set()) {
    node = unwrap(node);
    if (ts.isIdentifier(node)) {
      const decl = declarationOf(node);
      if (!decl) return node.text === 'Meteor';
      if (ts.isImportSpecifier(decl)) {
        return !decl.isTypeOnly && (decl.propertyName ?? decl.name).text === 'Meteor' && meteorImport(decl);
      }
      if (ts.isVariableDeclaration(decl) && decl.initializer && !visited.has(decl)) {
        visited.add(decl);
        return isMeteor(decl.initializer, visited);
      }
      return false;
    }
    if (property(node) !== 'Meteor') return false;
    const receiver = unwrap(node.expression);
    const decl = ts.isIdentifier(receiver) && declarationOf(receiver);
    return decl && ts.isNamespaceImport(decl) && meteorImport(decl);
  }
  const findings = [];
  function visit(node) {
    const member = property(node);
    if (ts.isElementAccessExpression(node) && member === undefined && isMeteor(node.expression)) {
      findings.push({ member: '[unresolved property]', line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    if ((member === 'methods' || member === 'publish') && isMeteor(node.expression)) {
      findings.push({ member, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && isMeteor(node.initializer)) {
      for (const element of node.name.elements) {
        const name = element.propertyName ?? element.name;
        const member = ts.isComputedPropertyName(name)
          ? (ts.isStringLiteralLike(name.expression) ? name.expression.text : '[unresolved property]')
          : name.text;
        if (member === 'methods' || member === 'publish' || member === '[unresolved property]') {
          findings.push({ member, line: source.getLineAndCharacterOfPosition(element.getStart(source)).line + 1 });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}
