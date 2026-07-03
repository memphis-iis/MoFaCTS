const fs = require('node:fs');
const path = require('node:path');
const { createJiti } = require('jiti');

const CANONICAL_CONFIG_REPO = 'C:\\dev\\mofacts_config';
const configuredRepo = process.env.MOFACTS_CONFIG_REPO || CANONICAL_CONFIG_REPO;
const resolvedConfigRepo = path.resolve(configuredRepo);

if (path.resolve(CANONICAL_CONFIG_REPO) !== resolvedConfigRepo) {
  console.error(
    `MOFACTS_CONFIG_REPO must resolve to ${CANONICAL_CONFIG_REPO}; got ${configuredRepo}`,
  );
  process.exit(1);
}

if (!fs.existsSync(resolvedConfigRepo)) {
  console.error(`Config repository not found: ${resolvedConfigRepo}`);
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, '..', '..');
const appRoot = path.resolve(__dirname, '..');
const jiti = createJiti(`${appRoot}${path.sep}`);
const {
  createSparcSessionUnitEngine,
} = jiti(path.join(repoRoot, 'learning-components/units/sparcsession/SparcSessionUnitEngine.ts'));

const forbiddenKeys = new Set([
  'sourceId',
  'sourceAutoTutor',
  'stimulusKC',
  'KCId',
  'KCDefault',
  'KCCluster',
  'repair',
  'repairQuestion',
  'repairCriteria',
]);
const forbiddenFactTypes = new Set([
  'learningTarget.source',
  'diagnostic.misconceptionSource',
  'dialogue.moveContent',
]);
const forbiddenExpectationIds = new Set(['E1', 'E2', 'E3']);

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walkForForbiddenFields(value, context, issues) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkForForbiddenFields(entry, `${context}[${index}]`, issues));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  if (forbiddenFactTypes.has(value.factType)) {
    issues.push(`${context}: forbidden factType ${value.factType}`);
  }
  if (typeof value.id === 'string' && forbiddenExpectationIds.has(value.id)) {
    issues.push(`${context}: forbidden duplicate expectation id ${value.id}`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      issues.push(`${context}.${key}: forbidden key`);
    }
    walkForForbiddenFields(child, `${context}.${key}`, issues);
  }
}

function normalizeStimulusClusters(stimFile) {
  return stimFile.setspec.clusters.map((cluster) => ({
    clusterKC: cluster.clusterKC,
    stims: cluster.stims.map((stimulus, stimIndex) => ({
      ...stimulus,
      stimuliSetId: 'sparc-autotutor-runtime-check',
      stimulusKC: stimulus.stimulusKC || `${cluster.clusterKC}:stim-${stimIndex}`,
      responseKC: stimIndex + 1,
      correctResponse: stimulus.response?.correctResponse || '__SPARC_AUTOTUTOR_TARGET__',
      params: stimulus.params || '0,.7',
      textStimulus: stimulus.text,
    })),
  }));
}

function createRuntimeDeps(tdfFile, stimFile) {
  const unit = tdfFile.tutor.unit.find((candidate) => candidate.sparcsession);
  const clusters = normalizeStimulusClusters(stimFile);
  return {
    getSessionValue(key) {
      if (key === 'currentTdfUnit') return unit;
      if (key === 'currentTdfId') return 'sparc-autotutor-runtime-check-tdf';
      if (key === 'currentStimuliSetId') return 'sparc-autotutor-runtime-check';
      if (key === 'curStudentPerformance') return { totalTime: 0 };
      return undefined;
    },
    setSessionValue() {},
    getDeliverySettings: () => ({}),
    getStimCount: () => clusters.length,
    getStimCluster: (index) => clusters[index],
    getTestType: () => 'd',
    getHiddenItems: () => [],
    setNumVisibleCards() {},
    setQuestionIndex() {},
    getDisplayAnswerText: (answer) => String(answer || ''),
    updateCurStudentPerformance() {},
    updateCurStudedentPracticeTime() {},
    serverMethods: {
      getResponseKCMapForTdf: async () => ({}),
      getStimulusCrowdStatsForDeck: async () => [],
      getLearningHistoryForUnit: async () => [],
    },
    getCurrentUserId: () => 'sparc-autotutor-runtime-check-user',
    reconstructLearningStateFromHistory: () => ({}),
    extractDelimFields(source, fields) {
      fields.push(...String(source).split(/[,\s]+/).map((field) => field.trim()).filter(Boolean));
    },
    rangeVal(source) {
      const match = String(source).match(/^(\d+)-(\d+)$/);
      if (!match) return [Number(source)];
      const start = Number(match[1]);
      const end = Number(match[2]);
      const values = [];
      for (let index = start; index <= end; index += 1) {
        values.push(index);
      }
      return values;
    },
    legacyFloat: (source) => Number(source),
    legacyInt: (source) => Number(source),
    currentUserHasRole: () => false,
    displayify: (value) => value,
    unitIsFinished() {},
    alertUser() {},
    log() {},
    findTdfById: () => ({ rawStimuliFile: stimFile }),
  };
}

function createLegacySparcRuntimeDeps() {
  const tdfFile = {
    tutor: {
      unit: [{
        unitname: 'Legacy SPARC Practice',
        sparcsession: {
          node: [{
            type: 'prompt',
            clusterIndex: 0,
            display: 'legacy-sparc-page',
          }],
        },
      }],
    },
  };
  const stimFile = {
    setspec: {
      sparcPages: [{
        pageId: 'legacy-sparc-page',
        id: 'legacy-sparc-page',
        display: {
          type: 'sparc',
          prompt: 'Explain the concept.',
          clusterTargets: [{
            clusterIndex: 0,
          }],
        },
      }],
      clusters: [{
        clusterKC: 'legacy-kc',
        stims: [{
          stimuliSetId: 'legacy-sparc-runtime-check',
          stimulusKC: 'legacy-stimulus-kc',
          responseKC: 42,
          correctResponse: 'Legacy answer',
          textStimulus: 'Legacy target text',
          params: '0,.7',
        }],
      }],
    },
  };
  return createRuntimeDeps(tdfFile, stimFile);
}

async function assertLegacySparcCompatibility() {
  const engine = await createSparcSessionUnitEngine(createLegacySparcRuntimeDeps());
  const prepared = await engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]);
  const target = prepared.currentDisplay.clusterTargets?.[0];
  if (!target) {
    throw new Error('legacy SPARC compatibility: missing runtime clusterTarget');
  }
  if (target.clusterKC !== 'legacy-kc') {
    throw new Error('legacy SPARC compatibility: clusterKC mismatch');
  }
  if (target.stimulusKC !== 'legacy-stimulus-kc') {
    throw new Error('legacy SPARC compatibility: stimulusKC was not preserved');
  }
  if (
    target.KCId !== 'legacy-stimulus-kc' ||
    target.KCDefault !== 'legacy-stimulus-kc' ||
    target.KCCluster !== 'legacy-kc'
  ) {
    throw new Error('legacy SPARC compatibility: legacy KC identity fields changed');
  }
  if (prepared.currentAnswer !== '__SPARC_COMPLETED__') {
    throw new Error('legacy SPARC compatibility: answer changed');
  }
  return {
    pageId: prepared.currentDisplay.pageId,
    clusterKC: target.clusterKC,
    stimulusKC: target.stimulusKC,
  };
}

function assertCleanConvertedPackage({ dirName, tdfFile, stimFile, issues }) {
  const units = tdfFile.tutor?.unit || [];
  const sparcUnit = units.find((unit) => unit.sparcsession);
  const pages = stimFile.setspec?.sparcPages || [];
  const clusters = stimFile.setspec?.clusters || [];
  if (!sparcUnit) issues.push(`${dirName}: missing sparcsession unit`);
  if (pages.length !== 1) issues.push(`${dirName}: expected one sparcPage, got ${pages.length}`);
  const display = pages[0]?.display;
  if (display?.unitType !== 'sparc-autotutor-dialogue') {
    issues.push(`${dirName}: sparcPage unitType is ${String(display?.unitType)}`);
  }
  const targets = display?.clusterTargets || [];
  const explicitExpectations = display?.autoTutorTargets?.expectations || [];
  if (explicitExpectations.length > 0) {
    issues.push(`${dirName}: authored autoTutorTargets.expectations should be omitted; cluster cases are the expectation source`);
  }
  if (targets.length !== clusters.length) {
    issues.push(`${dirName}: clusterTargets ${targets.length} != clusters ${clusters.length}`);
  }
  clusters.forEach((cluster, index) => {
    const stim = cluster.stims?.[0];
    if (typeof cluster.clusterKC !== 'string' || !cluster.clusterKC.trim()) {
      issues.push(`${dirName}: clusters[${index}] missing clusterKC`);
    }
    if (stim?.clusterKC !== cluster.clusterKC) {
      issues.push(`${dirName}: clusters[${index}].stims[0].clusterKC mismatch`);
    }
    if (typeof stim?.text !== 'string' || !stim.text.trim()) {
      issues.push(`${dirName}: clusters[${index}].stims[0] missing expectation text`);
    }
  });
  targets.forEach((target, index) => {
    const extraKeys = Object.keys(target).filter((key) => !['clusterIndex', 'clusterKC'].includes(key));
    if (extraKeys.length > 0) {
      issues.push(`${dirName}: clusterTargets[${index}] extra keys ${extraKeys.join(',')}`);
    }
    if (target.clusterIndex !== index) {
      issues.push(`${dirName}: clusterTargets[${index}].clusterIndex=${String(target.clusterIndex)}`);
    }
    if (target.clusterKC !== clusters[index]?.clusterKC) {
      issues.push(`${dirName}: clusterTargets[${index}].clusterKC mismatch`);
    }
  });
  const misconceptions = display?.autoTutorTargets?.misconceptions ||
    display?.misconceptionTable?.misconceptions ||
    [];
  misconceptions.forEach((misconception, index) => {
    const extraKeys = Object.keys(misconception || {}).filter((key) => !['id', 'text'].includes(key));
    if (typeof misconception?.id !== 'string' || !misconception.id.trim()) {
      issues.push(`${dirName}: misconception[${index}] missing id`);
    }
    if (typeof misconception?.text !== 'string' || !misconception.text.trim()) {
      issues.push(`${dirName}: misconception[${index}] missing text`);
    }
    if (extraKeys.length > 0) {
      issues.push(`${dirName}: misconception[${index}] extra keys ${extraKeys.join(',')}`);
    }
  });
}

async function assertRuntimeLoads({ dirName, tdfFile, stimFile }) {
  const engine = await createSparcSessionUnitEngine(createRuntimeDeps(tdfFile, stimFile));
  const prepared = await engine.buildPreparedCardQuestionAndAnswerGlobals(0, 0, [0, 0.8]);
  const display = prepared.currentDisplay;
  const clusters = stimFile.setspec.clusters;
  if (display.unitType !== 'sparc-autotutor-dialogue') {
    throw new Error(`${dirName}: runtime display unitType is ${String(display.unitType)}`);
  }
  if (prepared.currentAnswer !== '__SPARC_COMPLETED__') {
    throw new Error(`${dirName}: runtime answer sentinel mismatch`);
  }
  if (display.clusterTargets.length !== clusters.length) {
    throw new Error(`${dirName}: runtime clusterTargets length mismatch`);
  }
  if (display.autoTutorTargets.expectations.length !== clusters.length) {
    throw new Error(`${dirName}: runtime expectations length mismatch`);
  }
  display.clusterTargets.forEach((target, index) => {
    const extraKeys = Object.keys(target).filter((key) => !['clusterIndex', 'clusterKC'].includes(key));
    if (extraKeys.length > 0) {
      throw new Error(`${dirName}: runtime clusterTargets[${index}] has legacy identity keys ${extraKeys.join(',')}`);
    }
    if (target.clusterKC !== clusters[index].clusterKC) {
      throw new Error(`${dirName}: runtime clusterTargets[${index}].clusterKC mismatch`);
    }
  });
  display.autoTutorTargets.expectations.forEach((expectation, index) => {
    if (expectation.clusterKC !== clusters[index].clusterKC) {
      throw new Error(`${dirName}: runtime expectation[${index}].clusterKC mismatch`);
    }
    if (expectation.text !== clusters[index].stims[0].text) {
      throw new Error(`${dirName}: runtime expectation[${index}].text mismatch`);
    }
  });
  return {
    dir: dirName,
    pageId: display.pageId,
    expectations: display.autoTutorTargets.expectations.length,
    misconceptions: display.autoTutorTargets.misconceptions.length,
  };
}

async function main() {
  const dirs = fs.readdirSync(resolvedConfigRepo, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name.startsWith('AutoTutor '))
    .map((dirent) => path.join(resolvedConfigRepo, dirent.name))
    .sort();
  const issues = [];
  const runtimeSummary = [];
  for (const dir of dirs) {
    const dirName = path.basename(dir);
    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
    const tdfPath = files.find((file) => file.endsWith('_TDF.json'));
    const stimPath = files.find((file) => file.endsWith('_stims.json'));
    if (!tdfPath || !stimPath) {
      issues.push(`${dirName}: missing paired TDF/stim JSON files`);
      continue;
    }
    const tdfFile = loadJson(path.join(dir, tdfPath));
    const stimFile = loadJson(path.join(dir, stimPath));
    walkForForbiddenFields(tdfFile, `${dirName}.${tdfPath}`, issues);
    walkForForbiddenFields(stimFile, `${dirName}.${stimPath}`, issues);
    assertCleanConvertedPackage({ dirName, tdfFile, stimFile, issues });
    if (issues.length === 0) {
      runtimeSummary.push(await assertRuntimeLoads({ dirName, tdfFile, stimFile }));
    }
  }
  if (dirs.length !== 10) {
    issues.push(`expected 10 AutoTutor directories, found ${dirs.length}`);
  }
  if (issues.length > 0) {
    console.error(JSON.stringify({ issueCount: issues.length, issues }, null, 2));
    process.exit(1);
  }
  const legacySparcCompatibility = await assertLegacySparcCompatibility();
  console.log(JSON.stringify({
    checkedConfigRepo: resolvedConfigRepo,
    loaded: runtimeSummary.length,
    legacySparcCompatibility,
    runtimeSummary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
