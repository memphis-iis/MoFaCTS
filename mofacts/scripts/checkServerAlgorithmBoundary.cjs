const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.svelte'];
const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function normalizePath(filePath) {
  return path.resolve(filePath).replaceAll('\\', '/');
}

function isProhibitedDependency(filePath, repositoryRoot) {
  const relativePath = path.relative(repositoryRoot, filePath).replaceAll('\\', '/');
  return relativePath.startsWith('learning-components/models/')
    || relativePath.startsWith('learning-components/units/');
}

function resolveSourceFile(importerPath, specifier) {
  if (!specifier.startsWith('.')) return null;
  const basePath = path.resolve(path.dirname(importerPath), specifier);
  const candidates = [
    basePath,
    ...SOURCE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(basePath, `index${extension}`)),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function extractRuntimeSpecifiers(source) {
  const specifiers = new Set();
  const sourceFile = ts.createSourceFile('dependency.ts', source, ts.ScriptTarget.Latest, true);
  const addModuleSpecifier = (moduleSpecifier) => {
    if (moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier)) specifiers.add(moduleSpecifier.text);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const namedBindings = clause?.namedBindings;
      const namedImportsAreTypeOnly = namedBindings && ts.isNamedImports(namedBindings)
        && namedBindings.elements.length > 0
        && namedBindings.elements.every((element) => element.isTypeOnly);
      if (!clause?.isTypeOnly && !(namedImportsAreTypeOnly && !clause.name)) addModuleSpecifier(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      const exportsAreTypeOnly = node.exportClause && ts.isNamedExports(node.exportClause)
        && node.exportClause.elements.length > 0
        && node.exportClause.elements.every((element) => element.isTypeOnly);
      if (!node.isTypeOnly && !exportsAreTypeOnly) addModuleSpecifier(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (!node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
        addModuleSpecifier(node.moduleReference.expression);
      }
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire) addModuleSpecifier(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...specifiers];
}

function listProductionServerFiles(serverRoot) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name)) && !TEST_FILE_PATTERN.test(entry.name)) files.push(entryPath);
    }
  };
  visit(serverRoot);
  return files;
}

function checkServerAlgorithmBoundary(options) {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const serverRoot = path.resolve(options.serverRoot);
  const failures = [];

  for (const entryPath of listProductionServerFiles(serverRoot)) {
    const visited = new Set();
    const visit = (filePath, trace) => {
      const normalized = normalizePath(filePath);
      if (visited.has(normalized)) return;
      visited.add(normalized);
      const source = fs.readFileSync(filePath, 'utf8');
      for (const specifier of extractRuntimeSpecifiers(source)) {
        const dependencyPath = resolveSourceFile(filePath, specifier);
        if (!dependencyPath) continue;
        const dependencyTrace = [...trace, dependencyPath];
        if (isProhibitedDependency(dependencyPath, repositoryRoot)) {
          failures.push(dependencyTrace.map((item) => path.relative(repositoryRoot, item).replaceAll('\\', '/')));
          continue;
        }
        visit(dependencyPath, dependencyTrace);
      }
    };
    visit(entryPath, [entryPath]);
  }

  return failures;
}

function runCli() {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const failures = checkServerAlgorithmBoundary({
    repositoryRoot,
    serverRoot: path.join(repositoryRoot, 'mofacts', 'server'),
  });
  if (failures.length > 0) {
    process.stderr.write('Server modules must not depend on learner-executable models or unit algorithms.\n');
    for (const trace of failures) process.stderr.write(`  ${trace.join(' -> ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Server algorithm dependency boundary passed.\n');
}

module.exports = { checkServerAlgorithmBoundary, extractRuntimeSpecifiers };

if (require.main === module) runCli();
