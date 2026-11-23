import { compile, parse } from 'svelte/compiler';
import ts from 'typescript';

// Application adapters register on their injected server. A direct reference
// to either framework function bypasses those adapters, even if called later.
export function directMeteorRegistrationReferences(source, acceptsRegistration = () => false) {
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
    if ((member === 'methods' || member === 'publish') && isMeteor(node.expression) && !acceptsRegistration(node)) {
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

export function componentRegistrationReferences(filename, text) {
  const ast = parse(text, { filename, modern: true });
  const findings = [];
  for (const script of [ast.module, ast.instance]) {
    if (!script) continue;
    const { start, end } = script.content;
    const offset = text.slice(0, start).split('\n').length - 1;
    const body = text.slice(start, end);
    // Module declarations are in scope inside the instance, which may shadow them.
    const outer = script === ast.instance && ast.module
      ? text.slice(ast.module.content.start, ast.module.content.end) + '\n{\n' : '';
    const prefixLines = outer.split('\n').length - 1;
    const source = ts.createSourceFile(filename + '.ts', outer + body + (outer ? '\n}' : ''), ts.ScriptTarget.Latest, true);
    for (const row of directMeteorRegistrationReferences(source)) {
      if (row.line > prefixLines) findings.push({ ...row, line: row.line - prefixLines + offset });
    }
  }
  if (findings.length) return findings;
  // Compilation resolves template expressions and references across script scopes.
  const { js } = compile(text, { filename, generate: 'client' });
  const emitted = ts.createSourceFile(filename + '.js', js.code, ts.ScriptTarget.Latest, true);
  return directMeteorRegistrationReferences(emitted).map(row => ({ ...row, line: 'generated line ' + row.line }));
}

export function packageRegistrationReferences(source, isUploadOwner) {
  let accepted = 0;
  const findings = directMeteorRegistrationReferences(source, node => {
    const call = node.parent;
    const statement = call.parent;
    const body = statement.parent;
    if (!isUploadOwner || !ts.isPropertyAccessExpression(node) || node.name.text !== 'methods' ||
        !ts.isCallExpression(call) || call.expression !== node || call.arguments.length !== 1 ||
        !ts.isIdentifier(call.arguments[0]) || call.arguments[0].text !== '_methods' ||
        !ts.isExpressionStatement(statement) || !ts.isBlock(body) || !ts.isConstructorDeclaration(body.parent) ||
        body.parent.parent.name?.text !== 'FilesCollection') return false;
    accepted++;
    return true;
  });
  if (isUploadOwner && accepted !== 1) throw new Error('Expected exactly one FilesCollection constructor upload registration');
  return findings;
}
