import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

const surfaces = [
  {
    name: 'create content',
    files: [
      'client/views/experimentSetup/contentUpload.css',
      'client/views/experimentSetup/contentUpload.html',
      'client/views/experimentSetup/contentEdit.css',
      'client/views/experimentSetup/contentEdit.html',
      'client/views/experimentSetup/contentGeneration.css',
      'client/views/experimentSetup/manualContentCreator.html',
      'client/views/experimentSetup/draftEditorWorkspace.html',
      'client/views/experimentSetup/apkgWizard.html',
      'client/views/experimentSetup/imsccWizard.html',
      'client/views/experimentSetup/tdfEdit.html',
      'client/views/experimentSetup/tdfAssignmentEdit.css',
      'client/views/experimentSetup/tdfAssignmentEdit.html',
    ],
  },
  {
    name: 'detailed data',
    files: [
      'client/views/experimentReporting/instructorReporting.css',
      'client/views/experimentReporting/instructorReporting.html',
      'client/views/experimentReporting/dataDownload.css',
      'client/views/experimentReporting/dataDownload.html',
    ],
  },
  {
    name: 'admin control panel',
    files: [
      'client/views/adminControls.html',
    ],
  },
  {
    name: 'user admin',
    files: [
      'client/views/userAdmin.html',
    ],
  },
  {
    name: 'mechanical turk',
    files: [
      'client/views/turkWorkflow.html',
    ],
  },
  {
    name: 'theme',
    files: [
      'client/views/theme.html',
    ],
  },
  {
    name: 'admin tests',
    files: [
      'client/views/testRunner.html',
    ],
  },
  {
    name: 'audio settings',
    files: [
      'client/views/audioSettings.html',
    ],
  },
  {
    name: 'teacher select',
    files: [
      'client/views/home/classSelection.html',
    ],
  },
  {
    name: 'help',
    files: [
      'client/views/help.html',
    ],
  },
  {
    name: 'shared menu/theme styles',
    files: [
      'public/styles/classic.css',
      'client/views/home/home.css',
    ],
    selectorFilter: /(?:^|[\s,{])(?:\.admin-|\.theme-|\.user-admin|\.data-download|\.instructor-|\.manual-|\.content-|\.audio-|\.turk|\.help|\.class-selection|\.table|\.card|\.page-header-title|thead|tbody|tfoot|\.btn|\.dropdown|\.modal|\.alert|\.container)\b/,
  },
];

const colorProperties = new Set([
  'accent-color',
  'background',
  'background-color',
  'border',
  'border-color',
  'border-top',
  'border-top-color',
  'border-right',
  'border-right-color',
  'border-bottom',
  'border-bottom-color',
  'border-left',
  'border-left-color',
  'box-shadow',
  'caret-color',
  'color',
  'fill',
  'outline',
  'outline-color',
  'stroke',
  'text-shadow',
]);

const basicTextTokens = [
  '--app-text-color',
  '--app-secondary-text-color',
  '--app-page-header-text-color',
  '--app-primary-action-text-color',
  '--app-secondary-action-text-color',
  '--learning-card-primary-action-text-color',
  '--navigation-text-color',
  'currentColor',
  'inherit',
];

const themeBackgroundTokens = [
  '--app-background-color',
  '--learning-card-surface-color',
  '--learning-card-stimulus-surface-color',
  '--navigation-surface-color',
  '--app-secondary-surface-color',
  '--app-primary-action-surface-color',
  '--learning-card-primary-action-surface-color',
];

const rawColorPattern = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blue|brown|coral|cyan|darkblue|darkgray|darkgrey|gold|gray|grey|green|indigo|ivory|lavender|lime|magenta|maroon|navy|olive|orange|pink|purple|red|silver|tan|teal|violet|white|yellow)\b)/;
const declarationPattern = /(?<property>[a-zA-Z-]+)\s*:\s*(?<value>[^;{}]+?)\s*(?:;|$)/g;
const rulePattern = /(?<selector>[^{}]+)\{(?<body>[^{}]*)\}/g;
const styleAttributePattern = /style\s*=\s*(["'`])(?<body>[\s\S]*?)\1/g;

function toPosix(file) {
  return file.replace(/\\/g, '/');
}

function lineNumberFor(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function themeTokenValue(value) {
  return /var\(\s*--/.test(value) || /\b(?:currentColor|inherit|transparent)\b/.test(value);
}

function containsAny(value, tokens) {
  return tokens.some((token) => value.includes(token));
}

function parseDeclarations(body) {
  const declarations = [];
  for (const match of body.matchAll(declarationPattern)) {
    const property = match.groups.property.trim().toLowerCase();
    if (!colorProperties.has(property)) continue;
    declarations.push({
      property,
      value: match.groups.value.trim(),
      offset: match.index || 0,
    });
  }
  return declarations;
}

function auditDeclarations({ text, file, surface, selector, selectorOffset, body, bodyOffset, findings }) {
  const declarations = parseDeclarations(body);
  const hasThemedBackground = declarations.some((decl) => (
    decl.property === 'background' ||
    decl.property === 'background-color'
  ) && containsAny(decl.value, themeBackgroundTokens));
  const hasThemedText = declarations.some((decl) => decl.property === 'color' && containsAny(decl.value, basicTextTokens));

  for (const declaration of declarations) {
    const line = lineNumberFor(text, bodyOffset + declaration.offset);
    const isRawColor = rawColorPattern.test(declaration.value);
    const isThemeBacked = themeTokenValue(declaration.value);

    if (isRawColor && !isThemeBacked) {
      findings.push({
        severity: 'error',
        surface,
        file,
        line,
        selector,
        property: declaration.property,
        value: declaration.value,
        message: 'Hard-coded color in a themed menu surface. Use a semantic theme custom property instead.',
      });
    }
  }

  if (hasThemedBackground && !hasThemedText) {
    findings.push({
      severity: 'warning',
      surface,
      file,
      line: lineNumberFor(text, selectorOffset),
      selector,
      property: 'color',
      value: '(missing)',
      message: 'Selector applies a themed menu background without declaring a basic themed text color.',
    });
  }
}

async function readSurfaceFiles() {
  const entries = [];
  const missing = [];

  for (const surface of surfaces) {
    for (const file of surface.files) {
      const absolute = path.join(root, file);
      try {
        const text = await fs.readFile(absolute, 'utf8');
        entries.push({ surface, file: toPosix(file), text });
      } catch (error) {
        if (error.code === 'ENOENT') {
          missing.push({ surface: surface.name, file: toPosix(file) });
          continue;
        }
        throw error;
      }
    }
  }

  if (missing.length) {
    const details = missing.map(({ surface, file }) => `- ${surface}: ${file}`).join('\n');
    throw new Error(`Menu theme audit expected files that do not exist:\n${details}`);
  }

  return entries;
}

function auditFile({ surface, file, text }) {
  const findings = [];

  for (const match of text.matchAll(rulePattern)) {
    const selector = match.groups.selector.trim().replace(/\s+/g, ' ');
    if (surface.selectorFilter && !surface.selectorFilter.test(selector)) continue;
    if (selector.startsWith(':root') || selector.includes('@keyframes')) continue;

    auditDeclarations({
      text,
      file,
      surface: surface.name,
      selector,
      selectorOffset: match.index || 0,
      body: match.groups.body,
      bodyOffset: (match.index || 0) + match[0].indexOf('{') + 1,
      findings,
    });
  }

  for (const match of text.matchAll(styleAttributePattern)) {
    auditDeclarations({
      text,
      file,
      surface: surface.name,
      selector: '[style attribute]',
      selectorOffset: match.index || 0,
      body: match.groups.body,
      bodyOffset: match.index || 0,
      findings,
    });
  }

  return findings;
}

function groupBySurface(findings) {
  return findings.reduce((acc, finding) => {
    acc[finding.surface] ||= { errors: 0, warnings: 0 };
    if (finding.severity === 'error') acc[finding.surface].errors += 1;
    if (finding.severity === 'warning') acc[finding.surface].warnings += 1;
    return acc;
  }, {});
}

const entries = await readSurfaceFiles();
const findings = entries.flatMap(auditFile);
const errors = findings.filter((finding) => finding.severity === 'error');
const warnings = findings.filter((finding) => finding.severity === 'warning');

const report = {
  generatedAt: new Date().toISOString(),
  invariant: 'Menu surfaces must use semantic MoFaCTS theme tokens for text and backgrounds so app text remains readable against themed backgrounds.',
  scannedSurfaces: surfaces.map(({ name }) => name),
  totals: {
    scannedFiles: entries.length,
    errors: errors.length,
    warnings: warnings.length,
  },
  bySurface: groupBySurface(findings),
  findings,
};

console.log(JSON.stringify(report, null, 2));

if (errors.length || warnings.length) {
  process.exitCode = 1;
}
