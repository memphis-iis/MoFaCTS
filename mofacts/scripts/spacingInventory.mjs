import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['client', 'public/styles'];
const extensions = new Set(['.css', '.html', '.svelte', '.ts', '.tsx', '.js', '.jsx']);
const spacingPropertyPattern = /(?<![\w-])((?:margin|padding)(?:-(?:top|right|bottom|left|block|block-start|block-end|inline|inline-start|inline-end))?)\s*:\s*([^;!"'`}]+?)\s*(!important)?(?=;|["'`}])/g;
const styleAttributePattern = /style\s*=\s*(["'`])([\s\S]*?)\1/g;
const classAttributePattern = /class(?:Name)?\s*=\s*(["'`])([\s\S]*?)\1/g;
const bootstrapSpacingClassPattern = /(?:^|\s)(-?(?:m|p)(?:[trblxyse]?)-(?:auto|0|1|2|3|4|5))(?:\s|$)/g;
const hardCodedValuePattern = /(?:^|\s|,|\()(-?(?:\d*\.)?\d+(?:px|rem|em|%|vh|vw|svh|dvh|vmin|vmax))(?:\s|,|\)|$)/;
const negativeNumericValuePattern = /(?:^|\s|,|\()-(?:\d*\.)?\d/;

function surfaceForFile(file) {
  const normalized = file.replace(/\\/g, '/');
  if (normalized.includes('/views/home/')) return 'home/practice menu';
  if (normalized.includes('/views/experiment/svelte/') || normalized.includes('/views/experiment/')) return 'experiment/card/instructions';
  if (normalized.includes('/views/experimentSetup/')) return 'content upload/edit/TDF editor';
  if (normalized.includes('/views/theme') || normalized.includes('/views/admin') || normalized.includes('/views/userAdmin') || normalized.includes('/views/turkWorkflow') || normalized.includes('/views/audioSettings')) return 'theme/admin/tools';
  if (normalized.endsWith('/client/index.html') || normalized.endsWith('/client/index.ts') || normalized.startsWith('public/styles/')) return 'app chrome/global';
  return 'other UI';
}

async function collectFiles(dir) {
  const absolute = path.join(root, dir);
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(absolute, entry.name);
    const relative = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.meteor') continue;
      files.push(...await collectFiles(relative));
      continue;
    }
    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(relative);
    }
  }
  return files;
}

function lineNumberFor(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

const declarations = [];
const inlineDeclarations = [];
const utilityClasses = [];
const byProperty = new Map();
const byValue = new Map();
const byFile = new Map();
const bySurface = new Map();
const hardCoded = [];
const negative = [];
const important = [];

for (const scanRoot of scanRoots) {
  for (const file of await collectFiles(scanRoot)) {
    const text = await fs.readFile(path.join(root, file), 'utf8');
    const surface = surfaceForFile(file);

    for (const match of text.matchAll(spacingPropertyPattern)) {
      const [, property, rawValue, importantFlag] = match;
      const value = rawValue.trim();
      const entry = {
        kind: 'css-declaration',
        file,
        line: lineNumberFor(text, match.index || 0),
        surface,
        property,
        value,
        important: Boolean(importantFlag),
        hardCoded: hardCodedValuePattern.test(value),
        negative: negativeNumericValuePattern.test(value),
      };
      declarations.push(entry);
      increment(byProperty, property);
      increment(byValue, value);
      increment(byFile, file);
      increment(bySurface, surface);
      if (entry.hardCoded) hardCoded.push(entry);
      if (entry.negative) negative.push(entry);
      if (entry.important) important.push(entry);
    }

    for (const styleMatch of text.matchAll(styleAttributePattern)) {
      const styleText = styleMatch[2];
      for (const declMatch of styleText.matchAll(spacingPropertyPattern)) {
        const [, property, rawValue, importantFlag] = declMatch;
        const value = rawValue.trim();
        const entry = {
          kind: 'inline-style',
          file,
          line: lineNumberFor(text, styleMatch.index || 0),
          surface,
          property,
          value,
          important: Boolean(importantFlag),
          hardCoded: hardCodedValuePattern.test(value),
          negative: negativeNumericValuePattern.test(value),
        };
        inlineDeclarations.push(entry);
        increment(byProperty, property);
        increment(byValue, value);
        increment(byFile, file);
        increment(bySurface, surface);
        if (entry.hardCoded) hardCoded.push(entry);
        if (entry.negative) negative.push(entry);
        if (entry.important) important.push(entry);
      }
    }

    for (const classMatch of text.matchAll(classAttributePattern)) {
      const classText = classMatch[2];
      for (const utilityMatch of classText.matchAll(bootstrapSpacingClassPattern)) {
        const utilityClass = utilityMatch[1];
        const entry = {
          kind: 'bootstrap-spacing-class',
          file,
          line: lineNumberFor(text, classMatch.index || 0),
          surface,
          className: utilityClass,
        };
        utilityClasses.push(entry);
        increment(byValue, utilityClass);
        increment(byFile, file);
        increment(bySurface, surface);
      }
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    spacingDeclarations: declarations.length,
    inlineSpacingDeclarations: inlineDeclarations.length,
    bootstrapSpacingUtilities: utilityClasses.length,
    hardCodedSpacingValues: hardCoded.length,
    negativeSpacingValues: negative.length,
    importantSpacingDeclarations: important.length,
  },
  distribution: {
    byProperty: sortedObject(byProperty),
    byValue: sortedObject(byValue),
    byFile: sortedObject(byFile),
    bySurface: sortedObject(bySurface),
  },
  hotspots: [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([file, count]) => ({ file, surface: surfaceForFile(file), count })),
  hardCoded,
  negative,
  important,
  inlineDeclarations,
  utilityClasses,
};

console.log(JSON.stringify(report, null, 2));
