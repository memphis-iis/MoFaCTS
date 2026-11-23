import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { componentRegistrationReferences, directMeteorRegistrationReferences } from './checkApplicationMeteorRegistration.mjs';
import { uploadMethodNames } from '../../packages/ostrio-files/upload-policy.js';

const toolAppRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..', '..');
const sourceRepoRoot = path.resolve(toolAppRoot, '..');
const appRoot = path.join(sourceRepoRoot, 'mofacts');
const manifestPath = path.join(appRoot, 'security-surface-contract.json');

async function filesUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(full));
    else if (entry.isFile() && /\.(?:[cm]?[jt]s|svelte)$/.test(entry.name) && !/\.test\.[cm]?[jt]s$/.test(entry.name)) files.push(full);
  }
  return files;
}

function propertyName(property) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) {
    return property.name.text;
  }
  return null;
}

function methodNamesFromObject(object) {
  return object.properties
    .filter((property) => ts.isMethodDeclaration(property) || ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
    .map(propertyName)
    .filter(Boolean);
}

function discoverMethods(sourceFile) {
  const names = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text.match(/^create.*Methods$/) && node.body) {
      for (const statement of node.body.statements) {
        if (ts.isReturnStatement(statement) && statement.expression && ts.isObjectLiteralExpression(statement.expression)) {
          names.push(...methodNamesFromObject(statement.expression));
        }
      }
    }
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && ['methods', 'asyncMethods', 'publicExperimentMethods'].includes(node.name.text)
      && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      names.push(...methodNamesFromObject(node.initializer));
    }
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(sourceFile) === 'Meteor'
      && node.expression.name.text === 'methods'
      && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      names.push(...methodNamesFromObject(node.arguments[0]));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function regexMatches(text, pattern, mapper) {
  return [...text.matchAll(pattern)].map(mapper);
}

async function checkedApplicationSource(file) {
  const text = await fs.readFile(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const bypasses = file.endsWith('.svelte') ? componentRegistrationReferences(file, text) : directMeteorRegistrationReferences(source);
  if (bypasses.length) {
    throw new Error(bypasses.map(({ member, line }) =>
      path.relative(sourceRepoRoot, file) + ':' + line + ' references Meteor.' + member + ' outside the application adapter.'
    ).join('\n'));
  }
  return source;
}

export async function discoverSecuritySurfaces() {
  for (const root of [path.join(appRoot, 'common'), path.join(appRoot, 'client'), path.join(sourceRepoRoot, 'learning-components')]) {
    for (const file of await filesUnder(root)) await checkedApplicationSource(file);
  }
  const serverFiles = await filesUnder(path.join(appRoot, 'server'));
  const methods = [];
  const publications = [];
  const httpRoutes = [];
  const httpMiddleware = [];
  for (const file of serverFiles) {
    const source = await checkedApplicationSource(file);
    if (file.endsWith('.svelte')) continue;
    const text = source.text;
    methods.push(...discoverMethods(source));
    httpMiddleware.push(...regexMatches(text, /registerHttpMiddleware\(\s*\w+,\s*'(?:handlers|connectHandlers)',\s*\{\s*surfaceId:\s*'(middleware:[^']+)'/g, (match) => match[1]));
    publications.push(...regexMatches(text, /Meteor\.publish\(\s*(?:'([^']+)'|null)/g,
      (match) => match[1] || '<default>'));
    publications.push(...regexMatches(text, /registerDefaultPublication\(\s*Meteor,\s*'(publication:default:[^']+)'/g, (match) => match[1]));
    publications.push(...regexMatches(text, /registerNamedPublication\(\s*Meteor,\s*'([^']+)'/g, (match) => match[1]));
    httpRoutes.push(...regexMatches(text, /(?:connectHandlers|rawConnectHandlers)\.use\(\s*'([^']+)'/g, (match) => match[1]));
    httpRoutes.push(...regexMatches(text, /registerPublicHttpMount\(\s*WebApp\.connectHandlers,\s*'([^']+)'/g, (match) => match[1]));
    httpRoutes.push(...regexMatches(text, /registerProtocolHttpMount\(\s*WebApp,\s*'(?:rawConnectHandlers|connectHandlers)',\s*'([^']+)'/g, (match) => match[1]));
  }
  const routePolicyText = await fs.readFile(
    path.join(appRoot, 'client', 'lib', 'adminUi', 'managementRoutePresentationPolicies.ts'), 'utf8',
  );
  const managementRoutes = regexMatches(
    routePolicyText,
    /routeName:\s*'([^']+)'\s*,\s*path:\s*'([^']+)'/g,
    (match) => `${match[1]}|${match[2]}`,
  );
  // One explicit application binding for the maintained package, not a runtime
  // registry redesign. Fail clearly if that binding or its policy changes.
  const collections = await fs.readFile(path.join(appRoot, 'common', 'Collections.ts'), 'utf8');
  const ownership = await fs.readFile(path.join(appRoot, 'common', 'collectionOwnership.ts'), 'utf8');
  const assetName = ownership.match(/DynamicAssets:\s*\{\s*mongoName:\s*'([^']+)'/)?.[1];
  if (!assetName || !collections.includes("collectionName: collectionMongoName('DynamicAssets')")
      || !collections.includes('allowClientCode: false') || !collections.includes('disableSetTokenCookie: true')
      || !collections.includes('disableDownload: true')) {
    throw new Error('Review the DynamicAssets package binding before classifying its DDP-only surface.');
  }
  methods.push(...Object.values(uploadMethodNames(assetName)));
  const uniqueMethods = [...new Set(methods)].sort();
  const uniqueHttpRoutes = [...new Set(httpRoutes)].sort();
  const exports = [
    ...uniqueMethods.filter((name) => /(?:download|export|package)/i.test(name)).map((name) => `method:${name}`),
    ...uniqueHttpRoutes.filter((name) => /(?:download|backup)/i.test(name)).map((name) => `http:${name}`),
  ].sort();
  return {
    methods: uniqueMethods,
    publications: [...new Set(publications)].sort(),
    httpRoutes: uniqueHttpRoutes,
    httpMiddleware: [...new Set(httpMiddleware)].sort(),
    exports,
    managementRoutes: [...new Set(managementRoutes)].sort(),
  };
}

function names(entries) {
  return entries.map((entry) => entry.name).sort();
}

function compare(kind, actual, expected) {
  const missing = actual.filter((name) => !expected.includes(name));
  const removed = expected.filter((name) => !actual.includes(name));
  return { kind, missing, removed };
}

if (process.argv.includes('--discover')) {
  const actual = await discoverSecuritySurfaces();
  process.stdout.write(`${JSON.stringify(actual, null, 2)}\n`);
} else {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const actual = await discoverSecuritySurfaces();
  const comparisons = [
    compare('methods', actual.methods, names(manifest.methods)),
    compare('publications', actual.publications, names(manifest.publications)),
    compare('httpRoutes', actual.httpRoutes, names(manifest.httpRoutes)),
    compare('httpMiddleware', actual.httpMiddleware, names(manifest.httpMiddleware)),
    compare('exports', actual.exports, names(manifest.exports)),
    compare('managementRoutes', actual.managementRoutes, names(manifest.managementRoutes)),
  ];
  const invalidPolicies = Object.entries(manifest)
    .filter(([, entries]) => Array.isArray(entries))
    .flatMap(([kind, entries]) => entries.filter((entry) =>
      !['disabled', 'public', 'public-rate-limited', 'authenticated', 'authenticated-self', 'role-checked', 'admin-only', 'signed-ingestion', 'single-use-download', 'saml-protocol', 'response-headers'].includes(entry.access))
      .map((entry) => ({ kind, name: entry.name, access: entry.access })));
  const failures = comparisons.filter((comparison) => comparison.missing.length || comparison.removed.length);
  if (failures.length || invalidPolicies.length) {
    process.stderr.write('Security surface contract is out of date or contains an invalid access classification.\n');
    for (const { kind, missing, removed } of failures) {
      for (const [label, entries] of [['Missing classifications', missing], ['Removed surfaces', removed]]) {
        if (!entries.length) continue;
        process.stderr.write(`${kind}: ${label} (${entries.length}): ${JSON.stringify(entries.slice(0, 20).map((name) => name.slice(0, 200)))}\n`);
        if (entries.length > 20) process.stderr.write(`  ${entries.length - 20} additional entries omitted.\n`);
      }
    }
    for (const { kind, name, access } of invalidPolicies.slice(0, 20)) {
      process.stderr.write(`Invalid access classification: ${JSON.stringify({ kind, name: String(name).slice(0, 200), access: String(access).slice(0, 200) })}\n`);
    }
    if (invalidPolicies.length > 20) process.stderr.write(`${invalidPolicies.length - 20} additional invalid classifications omitted.\n`);
    process.exitCode = 1;
  } else {
    if (process.argv.includes('--coverage')) {
      const { AUDIT_VERIFICATIONS, FILES_DDP_VERIFICATIONS } = await import('../../common/securityAudit/verificationCatalog.ts');
      const { collectionMongoName } = await import('../../common/collectionOwnership.ts');
      const tests = AUDIT_VERIFICATIONS.filter(entry => entry.kind === 'integrationTest');
      const applicationMethods = new Set(tests.filter(entry =>
        entry.method && entry.surfaceId === 'method:' + entry.method).map(entry => entry.method));
      const generated = uploadMethodNames(collectionMongoName('DynamicAssets'));
      const packageMethods = new Set(Object.entries(generated)
        .filter(([operation]) => tests.includes(FILES_DDP_VERIFICATIONS[operation]))
        .map(([, name]) => name));
      const publications = new Set(tests.map(entry => entry.surfaceId));
      const methodsForReview = actual.methods.filter(name => !applicationMethods.has(name) && !packageMethods.has(name));
      process.stdout.write(JSON.stringify({
        methodNamesInSourceContract: actual.methods.length,
        matchedApplicationMethods: actual.methods.filter(name => applicationMethods.has(name)).length,
        matchedPackageMethods: actual.methods.filter(name => packageMethods.has(name)).length,
        methodNamesForReconciliation: methodsForReview,
        publicationNamesInSourceContract: actual.publications.length,
        matchedPublications: actual.publications.filter(name => publications.has(
          name.startsWith('publication:default:') ? name : 'publication:' + name)).length,
      }, null, 2) + '\n');
    } else {
      process.stdout.write(`Security surface contract covers ${Object.values(actual).flat().length} surfaces.\n`);
    }
  }
}
