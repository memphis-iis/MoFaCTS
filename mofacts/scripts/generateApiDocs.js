const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const methodsFile = path.join(appRoot, 'server', 'methods.js');
const publicationsFile = path.join(appRoot, 'server', 'publications.js');
const outputFile = path.join(appRoot, '..', 'docs', 'API_REFERENCE_METHODS_PUBLICATIONS.md');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractBlock(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const searchFrom = start === -1 ? 0 : start + startMarker.length;
  const end = text.indexOf(endMarker, searchFrom);
  if (start === -1 || end === -1 || end <= start) {
    return '';
  }
  return text.slice(start + startMarker.length, end);
}

function extractExplicitFunctionKeys(blockText) {
  const names = [];
  const seen = new Set();
  const regex = /^\s*([A-Za-z0-9_]+)\s*:\s*(?:async\s+)?function\b/gm;
  let match = regex.exec(blockText);
  while (match) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
    match = regex.exec(blockText);
  }
  return names;
}

function extractShorthandKeys(blockText) {
  const firstExplicitIndex = blockText.search(/^\s*[A-Za-z0-9_]+\s*:\s*(?:async\s+)?function\b/m);
  if (firstExplicitIndex <= 0) {
    return [];
  }
  const prelude = blockText.slice(0, firstExplicitIndex)
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, ' ');

  return prelude
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^[A-Za-z0-9_]+$/.test(part));
}

function dedupePreserveOrder(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function extractMethods(methodsSource) {
  const methodsBlock = extractBlock(methodsSource, 'export const methods = {', 'const asyncMethods = {');
  const asyncBlock = extractBlock(methodsSource, 'const asyncMethods = {', '// Server-side startup logic');

  const synchronousMethods = extractExplicitFunctionKeys(methodsBlock);
  const asyncShorthand = extractShorthandKeys(asyncBlock);
  const asyncExplicit = extractExplicitFunctionKeys(asyncBlock);
  const asynchronousMethods = dedupePreserveOrder([...asyncShorthand, ...asyncExplicit]);

  return { synchronousMethods, asynchronousMethods };
}

function extractPublications(source) {
  const names = [];
  const seen = new Set();
  const regex = /Meteor\.publish\(\s*['"]([^'"]+)['"]/g;
  let match = regex.exec(source);
  while (match) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
    match = regex.exec(source);
  }
  return names;
}

function toMarkdown(methods, publications) {
  const today = new Date().toISOString().slice(0, 10);
  const syncLines = methods.synchronousMethods.map((name) => `- \`${name}\``).join('\n');
  const asyncLines = methods.asynchronousMethods.map((name) => `- \`${name}\``).join('\n');
  const publicationLines = publications.map((name) => `- \`${name}\``).join('\n');

  return `# API Reference: Meteor Methods and Publications

Generated on ${today} by \`mofacts/scripts/generateApiDocs.js\`.

## Meteor Methods

### Synchronous (${methods.synchronousMethods.length})
${syncLines}

### Asynchronous (${methods.asynchronousMethods.length})
${asyncLines}

## Meteor Publications (${publications.length})
${publicationLines}

## HTTP Endpoints
- \`GET /health\` - Basic process health payload.
`;
}

function main() {
  const methodsSource = read(methodsFile);
  const publicationsSource = read(publicationsFile);

  const methods = extractMethods(methodsSource);
  const publications = dedupePreserveOrder([
    ...extractPublications(methodsSource),
    ...extractPublications(publicationsSource)
  ]);

  fs.writeFileSync(outputFile, toMarkdown(methods, publications), 'utf8');
  process.stdout.write(`Wrote ${outputFile}\n`);
}

main();
