import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type JsonRecord = Record<string, unknown>;

type Args = {
  readonly configDir: string;
  readonly write: boolean;
};

type PackageFiles = {
  readonly dir: string;
  readonly name: string;
  readonly tdfPath: string;
  readonly stimPath: string;
};

type FileConversion = {
  readonly changed: boolean;
  readonly data: unknown;
  readonly removedFieldCounts: Record<string, number>;
  readonly rewrittenLearnerContributionAssertions: number;
  readonly rewrittenClusterTargets: number;
  readonly rewrittenExpectations: number;
  readonly rewrittenMisconceptions: number;
};

type PackageReport = {
  readonly name: string;
  readonly tdf: string;
  readonly stim: string;
  readonly tdfId: string;
  readonly changed: boolean;
  readonly written: boolean;
  readonly expectations: number;
  readonly misconceptions: number;
  readonly rewrittenLearnerContributionAssertions: number;
  readonly rewrittenClusterTargets: number;
  readonly removedFieldCounts: Record<string, number>;
};

type ConversionReport = {
  readonly configDir: string;
  readonly write: boolean;
  readonly packageCount: number;
  readonly changedPackages: number;
  readonly writtenPackages: number;
  readonly packages: PackageReport[];
};

const DEFAULT_CONFIG_DIR = 'C:\\dev\\mofacts_config';
const PACKAGE_PREFIX = 'AutoTutor ';
const EXPECTED_PACKAGE_COUNT = 10;

const REMOVABLE_KEYS = new Set([
  'sourceAutoTutor',
  'sourceAutoTutorSparcPackage',
  'sourceAutoTutorLessonName',
  'sourceId',
  'stimulusKC',
  'KCId',
  'KCDefault',
  'KCCluster',
]);

const REMOVABLE_FACT_TYPES = new Set([
  'learningTarget.source',
  'diagnostic.misconceptionSource',
  'dialogue.moveContent',
]);

const FORBIDDEN_KEYS = new Set([
  ...REMOVABLE_KEYS,
  'repair',
  'repairQuestion',
  'repairCriteria',
]);

function usage(): string {
  return [
    'Usage:',
    '  node --experimental-strip-types scripts/convertSparcAutoTutorTargetSchema.ts [--config-dir "C:\\path\\to\\mofacts_config"] [--write]',
    '',
    'Options:',
    '  --config-dir <path>   Config/content directory. Defaults to MOFACTS_CONFIG_REPO, MOFACTS_CONFIG_DIR, then C:\\dev\\mofacts_config.',
    '  --write               Write converted JSON files. Without this, the script runs as a dry run.',
  ].join('\n');
}

function parseArgs(argv: readonly string[]): Args {
  let configDir = process.env.MOFACTS_CONFIG_REPO || process.env.MOFACTS_CONFIG_DIR || DEFAULT_CONFIG_DIR;
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--config-dir') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('--config-dir requires a path.');
      }
      configDir = next;
      index += 1;
      continue;
    }
    if (arg === '--write') {
      write = true;
      continue;
    }
    if (!arg?.startsWith('-')) {
      configDir = arg ?? configDir;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    configDir: path.resolve(configDir),
    write,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function nonBlankString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function parseJson(content: string): unknown {
  return JSON.parse(content.replace(/^\uFEFF/, '')) as unknown;
}

function increment(counts: Record<string, number>, key: string, amount = 1): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

function mergeCounts(...sets: readonly Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const set of sets) {
    for (const [key, count] of Object.entries(set)) {
      increment(merged, key, count);
    }
  }
  return Object.fromEntries(Object.entries(merged).sort(([left], [right]) => left.localeCompare(right)));
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function discoverPackages(configDir: string): Promise<PackageFiles[]> {
  const entries = await fs.readdir(configDir, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(PACKAGE_PREFIX))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (dirs.length !== EXPECTED_PACKAGE_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_PACKAGE_COUNT} "${PACKAGE_PREFIX}*" directories in ${configDir}; found ${dirs.length}.`);
  }

  const packages: PackageFiles[] = [];
  for (const name of dirs) {
    const dir = path.join(configDir, name);
    const files = await fs.readdir(dir, { withFileTypes: true });
    const jsonFiles = files.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'));
    const tdfFiles = jsonFiles.filter((entry) => /_tdf\.json$/i.test(entry.name));
    const stimFiles = jsonFiles.filter((entry) => /_stims\.json$/i.test(entry.name));
    if (tdfFiles.length !== 1 || stimFiles.length !== 1) {
      throw new Error(`${dir} must contain exactly one *_TDF.json and exactly one *_stims.json file.`);
    }
    packages.push({
      dir,
      name,
      tdfPath: path.join(dir, tdfFiles[0]!.name),
      stimPath: path.join(dir, stimFiles[0]!.name),
    });
  }
  return packages;
}

function validateTdfPackage(data: unknown, packageName: string): string {
  const root = asRecord(data, `${packageName} TDF root`);
  const tutor = asRecord(root.tutor, `${packageName} TDF tutor`);
  const setspec = asRecord(tutor.setspec, `${packageName} TDF tutor.setspec`);
  const units = asArray(tutor.unit, `${packageName} TDF tutor.unit`);
  if (!units.some((unit) => isRecord(unit) && isRecord(unit.sparcsession))) {
    throw new Error(`${packageName} TDF must contain a sparcsession unit.`);
  }
  const tags = Array.isArray(setspec.tags) ? setspec.tags : [];
  if (!tags.includes('autotutor')) {
    throw new Error(`${packageName} TDF must be tagged as AutoTutor content.`);
  }
  return typeof setspec.name === 'string' && setspec.name.trim()
    ? setspec.name
    : nonBlankString(setspec.lessonname, `${packageName} TDF tutor.setspec.lessonname`);
}

function validateStimPackage(data: unknown, packageName: string): JsonRecord {
  const root = asRecord(data, `${packageName} stimulus root`);
  const setspec = asRecord(root.setspec, `${packageName} stimulus setspec`);
  const pages = asArray(setspec.sparcPages, `${packageName} stimulus setspec.sparcPages`);
  if (pages.length !== 1) {
    throw new Error(`${packageName} stimulus must contain exactly one SPARC page.`);
  }
  const page = asRecord(pages[0], `${packageName} stimulus sparcPages[0]`);
  const display = asRecord(page.display, `${packageName} stimulus sparcPages[0].display`);
  if (display.unitType !== 'sparc-autotutor-dialogue') {
    throw new Error(`${packageName} stimulus must be SPARC-backed AutoTutor content.`);
  }
  asArray(setspec.clusters, `${packageName} stimulus setspec.clusters`);
  return display;
}

function normalizeExpectationClusters(data: unknown, packageName: string): {
  readonly data: unknown;
  readonly changed: boolean;
  readonly rewrittenExpectations: number;
  readonly removedFieldCounts: Record<string, number>;
} {
  const root = asRecord(data, `${packageName} stimulus root`);
  const setspec = asRecord(root.setspec, `${packageName} stimulus setspec`);
  const clusters = asArray(setspec.clusters, `${packageName} stimulus setspec.clusters`);
  const removedFieldCounts: Record<string, number> = {};
  let changed = false;
  let rewrittenExpectations = 0;

  const nextClusters = clusters.map((cluster, clusterIndex) => {
    const clusterRecord = asRecord(cluster, `${packageName} stimulus setspec.clusters[${clusterIndex}]`);
    const clusterKC = nonBlankString(clusterRecord.clusterKC, `${packageName} stimulus cluster ${clusterIndex} clusterKC`);
    const stims = asArray(clusterRecord.stims, `${packageName} stimulus cluster ${clusterIndex} stims`);
    if (stims.length !== 1) {
      throw new Error(`${packageName} stimulus cluster ${clusterIndex} must contain exactly one expectation stim.`);
    }
    const stim = asRecord(stims[0], `${packageName} stimulus cluster ${clusterIndex} stims[0]`);
    const stimClusterKC = nonBlankString(stim.clusterKC ?? clusterKC, `${packageName} stimulus cluster ${clusterIndex} stims[0].clusterKC`);
    if (stimClusterKC !== clusterKC) {
      throw new Error(`${packageName} stimulus cluster ${clusterIndex} clusterKC must match its expectation stim clusterKC.`);
    }
    const text = nonBlankString(stim.text, `${packageName} stimulus cluster ${clusterIndex} stims[0].text`);
    for (const key of Object.keys(stim)) {
      if (key !== 'clusterKC' && key !== 'text') {
        increment(removedFieldCounts, key);
      }
    }
    const nextCluster = {
      clusterKC,
      stims: [{
        clusterKC,
        text,
      }],
    };
    rewrittenExpectations += 1;
    if (stableJson(clusterRecord) !== stableJson(nextCluster)) {
      changed = true;
    }
    return nextCluster;
  });

  setspec.clusters = nextClusters;
  return { data, changed, rewrittenExpectations, removedFieldCounts };
}

function normalizeClusterTargets(display: JsonRecord): {
  readonly rewrittenClusterTargets: number;
  readonly removedFieldCounts: Record<string, number>;
} {
  const removedFieldCounts: Record<string, number> = {};
  const clusterTargets = asArray(display.clusterTargets, 'SPARC AutoTutor display.clusterTargets');
  display.clusterTargets = clusterTargets.map((target, index) => {
    const targetRecord = asRecord(target, `SPARC AutoTutor display.clusterTargets[${index}]`);
    const clusterIndex = Number(targetRecord.clusterIndex);
    if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
      throw new Error(`SPARC AutoTutor display.clusterTargets[${index}].clusterIndex must be a non-negative integer.`);
    }
    const clusterKC = nonBlankString(targetRecord.clusterKC, `SPARC AutoTutor display.clusterTargets[${index}].clusterKC`);
    for (const key of Object.keys(targetRecord)) {
      if (key !== 'clusterIndex' && key !== 'clusterKC') {
        increment(removedFieldCounts, key);
      }
    }
    return { clusterIndex, clusterKC };
  });
  return {
    rewrittenClusterTargets: clusterTargets.length,
    removedFieldCounts,
  };
}

function normalizeWorkingMemoryFacts(display: JsonRecord): {
  readonly rewrittenMisconceptions: number;
  readonly removedFieldCounts: Record<string, number>;
} {
  const removedFieldCounts: Record<string, number> = {};
  const facts = asArray(display.workingMemoryFacts, 'SPARC AutoTutor display.workingMemoryFacts');
  const existingTable = isRecord(display.misconceptionTable) ? display.misconceptionTable : {};
  const existingMisconceptions = Array.isArray(existingTable.misconceptions)
    ? existingTable.misconceptions.map((entry, index) => {
        const record = asRecord(entry, `SPARC AutoTutor display.misconceptionTable.misconceptions[${index}]`);
        return {
          id: nonBlankString(record.id, `SPARC AutoTutor display.misconceptionTable.misconceptions[${index}].id`),
          text: nonBlankString(record.text, `SPARC AutoTutor display.misconceptionTable.misconceptions[${index}].text`),
        };
      })
    : [];
  const misconceptions: { id: string; text: string }[] = [];
  const nextFacts: unknown[] = [];

  for (const fact of facts) {
    const factRecord = asRecord(fact, 'SPARC AutoTutor workingMemoryFacts entry');
    const factType = nonBlankString(factRecord.factType, 'SPARC AutoTutor workingMemoryFacts entry factType');
    const slots = isRecord(factRecord.slots) ? factRecord.slots : {};

    if (factType === 'diagnostic.misconceptionSource') {
      misconceptions.push({
        id: nonBlankString(slots.id, 'SPARC AutoTutor misconception id'),
        text: nonBlankString(slots.description, 'SPARC AutoTutor misconception description'),
      });
    }

    if (REMOVABLE_FACT_TYPES.has(factType)) {
      increment(removedFieldCounts, factType);
      if (factType === 'diagnostic.misconceptionSource') {
        for (const key of ['repair', 'repairQuestion', 'repairCriteria']) {
          if (Object.hasOwn(slots, key)) {
            increment(removedFieldCounts, `diagnostic.misconceptionSource.${key}`);
          }
        }
      }
      continue;
    }

    if (isRecord(factRecord.slots) && Object.hasOwn(factRecord.slots, 'sourceId')) {
      const nextSlots = { ...factRecord.slots };
      delete nextSlots.sourceId;
      increment(removedFieldCounts, 'sourceId');
      nextFacts.push({
        ...factRecord,
        slots: nextSlots,
      });
      continue;
    }

    nextFacts.push(factRecord);
  }

  const tableMisconceptions = misconceptions.length > 0 ? misconceptions : existingMisconceptions;
  if (tableMisconceptions.length === 0) {
    throw new Error('SPARC AutoTutor conversion requires at least one misconception source or existing misconception table entry.');
  }

  display.workingMemoryFacts = nextFacts;
  display.misconceptionTable = { misconceptions: tableMisconceptions };
  return {
    rewrittenMisconceptions: tableMisconceptions.length,
    removedFieldCounts,
  };
}

function normalizeLearnerContributionConditions(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((count, entry) => count + normalizeLearnerContributionConditions(entry), 0);
  }
  if (!isRecord(value)) {
    return 0;
  }

  let rewritten = 0;
  if (value.factType === 'learnerResponse.contribution' && isRecord(value.slots)) {
    const typeSlot = value.slots.type;
    if (isRecord(typeSlot) && typeSlot.type === 'literal' && typeSlot.value === 'assertion') {
      typeSlot.value = 'answer';
      rewritten += 1;
    }
  }

  for (const entry of Object.values(value)) {
    rewritten += normalizeLearnerContributionConditions(entry);
  }
  return rewritten;
}

function removeForbiddenKeys(value: unknown, removedFieldCounts: Record<string, number>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => removeForbiddenKeys(entry, removedFieldCounts));
  }
  if (!isRecord(value)) {
    return value;
  }

  for (const key of Object.keys(value)) {
    if (REMOVABLE_KEYS.has(key)) {
      delete value[key];
      increment(removedFieldCounts, key);
      continue;
    }
    value[key] = removeForbiddenKeys(value[key], removedFieldCounts);
  }
  return value;
}

function convertTdf(data: unknown): FileConversion {
  const before = stableJson(data);
  const removedFieldCounts: Record<string, number> = {};
  removeForbiddenKeys(data, removedFieldCounts);
  const after = stableJson(data);
  return {
    changed: before !== after,
    data,
    removedFieldCounts,
    rewrittenLearnerContributionAssertions: 0,
    rewrittenClusterTargets: 0,
    rewrittenExpectations: 0,
    rewrittenMisconceptions: 0,
  };
}

function convertStim(data: unknown, packageName: string): FileConversion {
  const before = stableJson(data);
  const display = validateStimPackage(data, packageName);
  const expectationConversion = normalizeExpectationClusters(data, packageName);
  const clusterTargetConversion = normalizeClusterTargets(display);
  const workingMemoryConversion = normalizeWorkingMemoryFacts(display);
  const rewrittenLearnerContributionAssertions = normalizeLearnerContributionConditions(data);
  const removedFieldCounts = mergeCounts(
    expectationConversion.removedFieldCounts,
    clusterTargetConversion.removedFieldCounts,
    workingMemoryConversion.removedFieldCounts,
  );
  removeForbiddenKeys(data, removedFieldCounts);
  const after = stableJson(data);
  return {
    changed: before !== after || expectationConversion.changed,
    data,
    removedFieldCounts,
    rewrittenLearnerContributionAssertions,
    rewrittenClusterTargets: clusterTargetConversion.rewrittenClusterTargets,
    rewrittenExpectations: expectationConversion.rewrittenExpectations,
    rewrittenMisconceptions: workingMemoryConversion.rewrittenMisconceptions,
  };
}

function validateConvertedValue(label: string, value: unknown, pathParts: readonly string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateConvertedValue(label, entry, [...pathParts, String(index)]));
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const fieldPath = [...pathParts, key].join('.');
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`${label} still contains forbidden SPARC AutoTutor target-schema field: ${fieldPath}`);
    }
    if (key === 'factType' && typeof entry === 'string' && REMOVABLE_FACT_TYPES.has(entry)) {
      throw new Error(`${label} still contains forbidden SPARC AutoTutor target-schema fact type: ${entry}`);
    }
    validateConvertedValue(label, entry, [...pathParts, key]);
  }
}

async function convertPackage(pkg: PackageFiles, configDir: string, write: boolean): Promise<PackageReport> {
  const tdfBefore = await fs.readFile(pkg.tdfPath, 'utf8');
  const stimBefore = await fs.readFile(pkg.stimPath, 'utf8');
  const tdfData = parseJson(tdfBefore);
  const stimData = parseJson(stimBefore);
  const tdfId = validateTdfPackage(tdfData, pkg.name);
  validateStimPackage(stimData, pkg.name);

  const tdf = convertTdf(tdfData);
  const stim = convertStim(stimData, pkg.name);
  const nextTdf = stableJson(tdf.data);
  const nextStim = stableJson(stim.data);
  validateConvertedValue(pkg.tdfPath, tdf.data);
  validateConvertedValue(pkg.stimPath, stim.data);

  const changed = tdf.changed || stim.changed;
  if (write && tdf.changed) {
    await fs.writeFile(pkg.tdfPath, nextTdf, 'utf8');
  }
  if (write && stim.changed) {
    await fs.writeFile(pkg.stimPath, nextStim, 'utf8');
  }

  return {
    name: pkg.name,
    tdf: path.relative(configDir, pkg.tdfPath),
    stim: path.relative(configDir, pkg.stimPath),
    tdfId,
    changed,
    written: write && changed,
    expectations: stim.rewrittenExpectations,
    misconceptions: stim.rewrittenMisconceptions,
    rewrittenLearnerContributionAssertions: stim.rewrittenLearnerContributionAssertions,
    rewrittenClusterTargets: stim.rewrittenClusterTargets,
    removedFieldCounts: mergeCounts(tdf.removedFieldCounts, stim.removedFieldCounts),
  };
}

export async function convertSparcAutoTutorTargetSchema(options: Partial<Args> = {}): Promise<ConversionReport> {
  const configDir = path.resolve(options.configDir ?? process.env.MOFACTS_CONFIG_REPO ?? process.env.MOFACTS_CONFIG_DIR ?? DEFAULT_CONFIG_DIR);
  const write = options.write === true;
  const stat = await fs.stat(configDir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Config directory does not exist: ${configDir}`);
  }

  const packages = await discoverPackages(configDir);
  const reports: PackageReport[] = [];
  for (const pkg of packages) {
    reports.push(await convertPackage(pkg, configDir, write));
  }

  return {
    configDir,
    write,
    packageCount: reports.length,
    changedPackages: reports.filter((report) => report.changed).length,
    writtenPackages: reports.filter((report) => report.written).length,
    packages: reports,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await convertSparcAutoTutorTargetSchema(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
