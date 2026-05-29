import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_ARG = process.argv.indexOf('--out');
const OUT_PATH = OUT_ARG >= 0 ? path.resolve(ROOT, process.argv[OUT_ARG + 1]) : null;

const SOURCE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.svelte',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
]);

const SKIP_DIRS = new Set([
  '.git',
  '.meteor',
  'node_modules',
  '_build',
]);

const paddingDeclarationPattern = /(?<property>padding(?:-(?:top|right|bottom|left|inline|inline-start|inline-end|block|block-start|block-end))?)\s*:\s*(?<value>[^;}\n]+)(?<important>\s*!important)?/gi;
const inlineStylePattern = /style\s*=\s*(?:"(?<double>[^"]*padding[^"]*)"|'(?<single>[^']*padding[^']*)'|\{(?<brace>[^}]*padding[^}]*)\})/gi;
const classPattern = /class(?:Name)?\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|\{`(?<template>[^`]*)`\})/gi;
const bootstrapPaddingUtilityPattern = /\bp(?:[trblxyse])?-(?:0|1|2|3|4|5|auto)\b/g;
const hardCodedUnitPattern = /(?:^|\s|calc\(|,)(?<value>-?\d*\.?\d+(?:px|rem|em|%))/g;

const surfaceRules = [
  ['chrome/sidebar/header/footer', /client[\\/](?:index|views[\\/]footer)|classic\.css$/],
  ['home/practice cards', /client[\\/]views[\\/]home/],
  ['auth/help/error/access-denied', /client[\\/]views[\\/](?:login|help|experimentError|accessDenied)/],
  ['admin/theme/tools', /client[\\/]views[\\/](?:adminControls|theme|userAdmin|testRunner|turkWorkflow)|client[\\/]views[\\/]audioSettings/],
  ['upload/edit/TDF editors', /client[\\/]views[\\/]experimentSetup[\\/](?:contentUpload|contentEdit|tdfEdit|tdfAssignmentEdit|classEdit)/],
  ['APKG/IMSCC/manual/draft editor', /client[\\/]views[\\/]experimentSetup[\\/](?:apkgWizard|imsccWizard|manualContentCreator|draftEditorWorkspace|contentDraftEditor|tdfDraftEditor)/],
  ['experiment/card/instructions', /client[\\/]views[\\/]experiment[\\/](?:card|instructions|multiTdfSelect)/],
  ['Svelte learning components', /client[\\/]views[\\/]experiment[\\/]svelte/],
  ['JSON editor/generated controls', /jsoneditor|schemaApplicabilityEditor|validatorUI|contentEdit|tdfEdit/i],
  ['mobile/table surfaces', /Reporting|reporting|table|mobile/i],
  ['third-party override boundary', /public[\\/]h5p-standalone|packages[\\/]/],
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...walk(path.join(dir, entry.name)));
      }
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, '/');
}

function addCount(bucket, key, amount = 1) {
  bucket[key] = (bucket[key] || 0) + amount;
}

function inferSurface(relativePath) {
  const match = surfaceRules.find(([, pattern]) => pattern.test(relativePath));
  return match ? match[0] : 'other app UI';
}

function lineNumber(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function collectHardCodedValues(value) {
  return Array.from(value.matchAll(hardCodedUnitPattern), (match) => match.groups.value);
}

const inventory = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  totals: {
    filesScanned: 0,
    paddingDeclarations: 0,
    inlinePaddingStyles: 0,
    bootstrapPaddingUtilities: 0,
    hardCodedPaddingValues: 0,
    importantPaddingDeclarations: 0,
    thirdPartyBoundaryDeclarations: 0,
  },
  distribution: {
    byProperty: {},
    byValue: {},
    byFile: {},
    bySurface: {},
    byHardCodedValue: {},
    byBootstrapUtility: {},
  },
  declarations: [],
  inlineStyles: [],
  bootstrapUtilities: [],
  importantDeclarations: [],
  hardCodedValues: [],
  thirdPartyBoundary: [],
};

for (const file of walk(ROOT)) {
  const relativePath = rel(file);
  const text = fs.readFileSync(file, 'utf8');
  const surface = inferSurface(relativePath);
  inventory.totals.filesScanned += 1;

  for (const match of text.matchAll(paddingDeclarationPattern)) {
    const property = match.groups.property.toLowerCase();
    const value = match.groups.value.trim();
    const important = Boolean(match.groups.important) || /!important/i.test(value);
    const line = lineNumber(text, match.index);
    const hardCodedValues = collectHardCodedValues(value);
    const record = {
      file: relativePath,
      line,
      surface,
      property,
      value,
      hardCodedValues,
      important,
    };

    inventory.declarations.push(record);
    inventory.totals.paddingDeclarations += 1;
    addCount(inventory.distribution.byProperty, property);
    addCount(inventory.distribution.byValue, value);
    addCount(inventory.distribution.byFile, relativePath);
    addCount(inventory.distribution.bySurface, surface);

    if (important) {
      inventory.totals.importantPaddingDeclarations += 1;
      inventory.importantDeclarations.push(record);
    }

    if (hardCodedValues.length > 0) {
      for (const hardCodedValue of hardCodedValues) {
        addCount(inventory.distribution.byHardCodedValue, hardCodedValue);
        inventory.hardCodedValues.push({ ...record, hardCodedValue });
        inventory.totals.hardCodedPaddingValues += 1;
      }
    }

    if (surface === 'third-party override boundary') {
      inventory.totals.thirdPartyBoundaryDeclarations += 1;
      inventory.thirdPartyBoundary.push(record);
    }
  }

  for (const match of text.matchAll(inlineStylePattern)) {
    inventory.totals.inlinePaddingStyles += 1;
    inventory.inlineStyles.push({
      file: relativePath,
      line: lineNumber(text, match.index),
      surface,
      value: (match.groups.double || match.groups.single || match.groups.brace || '').trim(),
    });
  }

  for (const match of text.matchAll(classPattern)) {
    const classValue = match.groups.double || match.groups.single || match.groups.template || '';
    for (const utility of classValue.matchAll(bootstrapPaddingUtilityPattern)) {
      inventory.totals.bootstrapPaddingUtilities += 1;
      addCount(inventory.distribution.byBootstrapUtility, utility[0]);
      inventory.bootstrapUtilities.push({
        file: relativePath,
        line: lineNumber(text, match.index),
        surface,
        utility: utility[0],
        classValue: classValue.trim(),
      });
    }
  }
}

const output = `${JSON.stringify(inventory, null, 2)}\n`;
if (OUT_PATH) {
  fs.writeFileSync(OUT_PATH, output);
}
process.stdout.write(output);
