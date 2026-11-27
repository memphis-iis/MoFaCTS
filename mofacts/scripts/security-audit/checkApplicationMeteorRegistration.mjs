import path from 'node:path';
import { compile, parse } from 'svelte/compiler';
import ts from 'typescript';

const CLIENT_ACCOUNT_NOTIFICATIONS = new Set(['onLogin', 'onLoginFailure', 'onLogout']);
const ACCOUNT_HOOKS = new Set(['onLogin', 'onLoginFailure', 'onLogout', 'onCreateUser', 'validateLoginAttempt', 'registerLoginHandler']);
const HTTP_STACKS = new Set(['connectHandlers', 'rawConnectHandlers', 'handlers']);

// A reference to a registration function can be retained and called later.
export function directFrameworkRegistrationReferences(source, acceptsRegistration = () => false, { clientOnly = false, collectionModule } = {}) {
  let checker;
  function declarationOf(identifier) {
    if (!checker) {
      // Bind this source's local symbols without searching for ambient package types.
      const options = { noLib: true, noResolve: true, allowJs: true, types: [] };
      const host = ts.createCompilerHost(options);
      host.getSourceFile = file => file.replaceAll('\\', '/') === source.fileName.replaceAll('\\', '/') ? source : undefined;
      checker = ts.createProgram([source.fileName], options, host).getTypeChecker();
    }
    return checker.getSymbolAtLocation(identifier)?.declarations?.[0];
  }
  function frameworkImport(node, moduleName) {
    while (node && !ts.isImportDeclaration(node)) node = node.parent;
    return node?.moduleSpecifier.text === moduleName && !node.importClause?.isTypeOnly;
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
  function frameworkModule(name) {
    if (name === 'Meteor') return 'meteor/meteor';
    if (name === 'WebApp') return 'meteor/webapp';
    if (name === 'Accounts') return 'meteor/accounts-base';
    if (name === 'OAuth') return 'meteor/oauth';
    if (name === 'Mongo') return 'meteor/mongo';
    return undefined;
  }
  function bindingName(element) {
    const name = element.propertyName ?? element.name;
    if (!ts.isComputedPropertyName(name)) return name.text;
    return ts.isStringLiteralLike(name.expression) ? name.expression.text : '[unresolved property]';
  }
  function importsApplicationCollections(node) {
    if (!collectionModule) return false;
    while (node && !ts.isImportDeclaration(node)) node = node.parent;
    if (!node || node.importClause?.isTypeOnly || !node.moduleSpecifier.text.startsWith('.')) return false;
    const target = path.resolve(path.dirname(source.fileName), node.moduleSpecifier.text).replace(/\.ts$/, '');
    return target === collectionModule.replace(/\.ts$/, '');
  }
  function registrationOwner(node, visited = new Set()) {
    node = unwrap(node);
    if (ts.isNewExpression(node)) {
      return registrationOwner(node.expression, visited) === 'Mongo.Collection' ? 'collection' : undefined;
    }
    if (ts.isIdentifier(node)) {
      const decl = declarationOf(node);
      if (!decl) return frameworkModule(node.text) ? node.text : undefined;
      if (visited.has(decl)) return undefined;
      visited.add(decl);
      if (ts.isImportSpecifier(decl) && !decl.isTypeOnly) {
        if (importsApplicationCollections(decl)) return 'collection';
        const name = (decl.propertyName ?? decl.name).text;
        return frameworkModule(name) && frameworkImport(decl, frameworkModule(name)) ? name : undefined;
      }
      if (ts.isVariableDeclaration(decl) && decl.initializer) return registrationOwner(decl.initializer, visited);
      if (ts.isBindingElement(decl) && ts.isVariableDeclaration(decl.parent.parent)) {
        const initializer = decl.parent.parent.initializer;
        const member = bindingName(decl);
        if (!initializer) return undefined;
        const owner = registrationOwner(initializer, visited);
        if (HTTP_STACKS.has(member) && owner === 'WebApp') return member;
        if (member === 'oauth' && owner === 'Accounts') return 'Accounts.oauth';
        if (member === 'Collection' && owner === 'Mongo') return 'Mongo.Collection';
        if (member === 'users' && owner === 'Meteor') return 'collection';
      }
      return undefined;
    }
    const name = property(node);
    if (!name) return undefined;
    const receiver = unwrap(node.expression);
    if (HTTP_STACKS.has(name) && registrationOwner(receiver, visited) === 'WebApp') return name;
    if (name === 'oauth' && registrationOwner(receiver, visited) === 'Accounts') return 'Accounts.oauth';
    if (name === 'Collection' && registrationOwner(receiver, visited) === 'Mongo') return 'Mongo.Collection';
    if (name === 'users' && registrationOwner(receiver, visited) === 'Meteor') return 'collection';
    const decl = ts.isIdentifier(receiver) && declarationOf(receiver);
    if (decl && ts.isNamespaceImport(decl) && importsApplicationCollections(decl)) return 'collection';
    if (decl && ts.isNamespaceImport(decl) && frameworkModule(name) && frameworkImport(decl, frameworkModule(name))) return name;
    return undefined;
  }
  function registrationMember(owner, member) {
    if (owner === 'Meteor' && (member === 'methods' || member === 'publish' || member === '[unresolved property]')) return member;
    if (owner === 'WebApp' && member === '[unresolved property]') return 'WebApp.[unresolved property]';
    if (HTTP_STACKS.has(owner) && (member === 'use' || member === '[unresolved property]')) return 'WebApp.' + owner + '.' + member;
    // Client notification hooks coordinate presentation and cannot admit or create accounts.
    if (owner === 'Accounts' && clientOnly && CLIENT_ACCOUNT_NOTIFICATIONS.has(member)) return undefined;
    if (owner === 'Accounts' && (ACCOUNT_HOOKS.has(member) || member === '[unresolved property]')) return 'Accounts.' + member;
    if (owner === 'collection' && (member === 'allow' || member === 'deny' || member === '[unresolved property]')) return 'Mongo.Collection.' + member;
    if ((owner === 'OAuth' || owner === 'Accounts.oauth') && (member === 'registerService' || member === '[unresolved property]')) return owner + '.' + member;
    return undefined;
  }
  const findings = [];
  function addFinding(node, member) {
    findings.push({ member, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
  }
  function checkBindings(pattern, owner) {
    for (const element of pattern.elements) {
      const member = element.dotDotDotToken ? '[unresolved property]' : bindingName(element);
      const finding = registrationMember(owner, member);
      if (finding) addFinding(element, finding);
      if (owner === 'WebApp' && HTTP_STACKS.has(member) && ts.isObjectBindingPattern(element.name)) {
        checkBindings(element.name, member);
      }
      if (owner === 'Accounts' && member === 'oauth' && ts.isObjectBindingPattern(element.name)) {
        checkBindings(element.name, 'Accounts.oauth');
      }
      if (owner === 'Meteor' && member === 'users' && ts.isObjectBindingPattern(element.name)) {
        checkBindings(element.name, 'collection');
      }
    }
  }
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const name = property(node);
      if (name === 'methods' || name === 'publish' || name === 'use' || name === 'registerService' ||
          name === 'allow' || name === 'deny' || ACCOUNT_HOOKS.has(name) || name === undefined) {
        const member = registrationMember(registrationOwner(node.expression), name ?? '[unresolved property]');
        if (member && !acceptsRegistration(node, member)) addFinding(node, member);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
      checkBindings(node.name, registrationOwner(node.initializer));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

export function componentRegistrationReferences(filename, text, options) {
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
    for (const row of directFrameworkRegistrationReferences(source, undefined, options)) {
      if (row.line > prefixLines) findings.push({ ...row, line: row.line - prefixLines + offset });
    }
  }
  if (findings.length) return findings;
  // Compilation resolves template expressions and references across script scopes.
  const { js } = compile(text, { filename, generate: 'client' });
  const emitted = ts.createSourceFile(filename + '.js', js.code, ts.ScriptTarget.Latest, true);
  return directFrameworkRegistrationReferences(emitted, undefined, options).map(row => ({ ...row, line: 'generated line ' + row.line }));
}

export function packageRegistrationReferences(source, isUploadOwner, microsoftOwner) {
  let methodCalls = 0;
  let httpCalls = 0;
  let microsoftCalls = 0;
  const findings = directFrameworkRegistrationReferences(source, (node, member) => {
    const call = node.parent;
    const statement = call.parent;
    const body = statement.parent;
    if (microsoftOwner && ts.isCallExpression(call) && call.expression === node &&
        ts.isExpressionStatement(statement) && ts.isSourceFile(body)) {
      const [serviceName, version, options, callback] = call.arguments;
      if (microsoftOwner === 'accounts' && member === 'Accounts.oauth.registerService' && call.arguments.length === 1 &&
          ts.isStringLiteral(serviceName) && serviceName.text === 'microsoft') {
        microsoftCalls++;
        return true;
      }
      if (microsoftOwner === 'provider' && member === 'OAuth.registerService' && call.arguments.length === 4 &&
          ts.isPropertyAccessExpression(serviceName) && serviceName.expression.getText(source) === 'Microsoft' &&
          serviceName.name.text === 'serviceName' && ts.isNumericLiteral(version) && version.text === '2' &&
          options.kind === ts.SyntaxKind.NullKeyword && ts.isArrowFunction(callback)) {
        microsoftCalls++;
        return true;
      }
    }
    if (!isUploadOwner || !ts.isPropertyAccessExpression(node) ||
        !ts.isCallExpression(call) || call.expression !== node || call.arguments.length !== 1 ||
        !ts.isExpressionStatement(statement) || !ts.isBlock(body) ||
        body.parent.parent.name?.text !== 'FilesCollection') return false;
    if (member === 'methods' && ts.isConstructorDeclaration(body.parent) &&
        ts.isIdentifier(call.arguments[0]) && call.arguments[0].text === '_methods') {
      methodCalls++;
      return true;
    }
    if (member === 'WebApp.connectHandlers.use' && ts.isMethodDeclaration(body.parent) &&
        body.parent.name.getText(source) === '_registerHttpHandlers' &&
        ts.isArrowFunction(call.arguments[0])) {
      httpCalls++;
      return true;
    }
    return false;
  });
  if (isUploadOwner && methodCalls !== 1) throw new Error('Expected exactly one FilesCollection constructor upload registration');
  if (isUploadOwner && httpCalls !== 1) throw new Error('Expected exactly one FilesCollection HTTP registration in its owner method');
  if (microsoftOwner && microsoftCalls !== 1) throw new Error('Expected exactly one Microsoft ' + microsoftOwner + ' service registration');
  return findings;
}
