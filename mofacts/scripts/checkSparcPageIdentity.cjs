const fs = require('node:fs');
const path = require('node:path');

const configuredRepo = process.env.MOFACTS_CONFIG_REPO;
const expectedRepo = 'C:\\dev\\mofacts_config';
if (configuredRepo && path.resolve(configuredRepo) !== path.resolve(expectedRepo)) {
  throw new Error(`MOFACTS_CONFIG_REPO must resolve to ${expectedRepo}; received ${configuredRepo}`);
}
if (!fs.existsSync(expectedRepo)) {
  throw new Error(`Required MoFaCTS config repository does not exist: ${expectedRepo}`);
}

function listJsonFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && ['.git', 'node_modules', 'tmp', 'outputs'].includes(entry.name)) {
      continue;
    }
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files;
}

function walk(value, visit, location = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, visit, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    visit(key, nested, `${location}.${key}`);
    walk(nested, visit, `${location}.${key}`);
  }
}

const issues = [];
const pageIdsByDirectory = new Map();
const selectedPageIdsByDirectory = new Map();
let stimulusFileCount = 0;
let pageCount = 0;

for (const file of listJsonFiles(expectedRepo)) {
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.includes('documentId')) {
    issues.push(`${file}: contains removed documentId`);
  }
  const parsed = JSON.parse(raw);
  const directory = path.dirname(file);
  const pages = parsed?.setspec?.sparcPages;
  if (Array.isArray(pages)) {
    stimulusFileCount += 1;
    const seen = new Set();
    for (const [index, page] of pages.entries()) {
      pageCount += 1;
      const pageId = typeof page?.pageId === 'string' ? page.pageId.trim() : '';
      if (!pageId) {
        issues.push(`${file}: sparcPages[${index}] missing pageId`);
        continue;
      }
      if (seen.has(pageId)) {
        issues.push(`${file}: duplicate pageId ${pageId}`);
      }
      seen.add(pageId);
      if (page?.display && Object.prototype.hasOwnProperty.call(page.display, 'pageKey')) {
        issues.push(`${file}: sparcPages[${index}].display must not author pageKey`);
      }
      walk(page?.display, (key, value, location) => {
        if (key === 'pageKey' && typeof value === 'string' && value !== pageId) {
          issues.push(`${file}: ${location} pageKey ${value} does not equal pageId ${pageId}`);
        }
      });
    }
    pageIdsByDirectory.set(directory, new Set([
      ...(pageIdsByDirectory.get(directory) ?? []),
      ...seen,
    ]));
  }

  const units = parsed?.tutor?.unit;
  if (Array.isArray(units)) {
    for (const [index, unit] of units.entries()) {
      if (!unit?.sparcsession) {
        continue;
      }
      const pageId = typeof unit.sparcsession.pageId === 'string' ? unit.sparcsession.pageId.trim() : '';
      if (!pageId) {
        issues.push(`${file}: tutor.unit[${index}].sparcsession missing pageId`);
        continue;
      }
      const selected = selectedPageIdsByDirectory.get(directory) ?? new Set();
      selected.add(pageId);
      selectedPageIdsByDirectory.set(directory, selected);
    }
  }
}

for (const [directory, selectedPageIds] of selectedPageIdsByDirectory) {
  const authoredPageIds = pageIdsByDirectory.get(directory) ?? new Set();
  for (const pageId of selectedPageIds) {
    if (!authoredPageIds.has(pageId)) {
      issues.push(`${directory}: TDF selects missing SPARC pageId ${pageId}`);
    }
  }
}

if (issues.length > 0) {
  console.error(JSON.stringify({ sparcPageIdentityCheck: false, issueCount: issues.length, issues }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    sparcPageIdentityCheck: true,
    stimulusFileCount,
    pageCount,
  }));
}
