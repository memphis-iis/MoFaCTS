#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const { createJiti } = require('jiti');

const jiti = createJiti(__filename, { interopDefault: true });
const moveRuleTemplate = jiti(path.join(__dirname, 'autotutorSparcMoveRuleTemplate.ts'));
const clusterKcRelationships = jiti(path.join(__dirname, '../../learning-components/runtime/clusterKcRelationshipEngine.ts'));

const CANONICAL_CONFIG_DIR = path.resolve('C:/dev/mofacts_config');
const GENERATED_PREFIX = 'SPARC Session';

function parseArgs(argv) {
  const options = {
    configDir: process.env.MOFACTS_CONFIG_REPO || '',
    packageFilter: '',
    write: false,
    overwriteGenerated: false,
    generateRelationships: false,
    openRouterApiKey: '',
    embeddingModels: [],
    json: false,
    reportFile: '',
    overwriteReport: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') {
      options.write = true;
    } else if (arg === '--overwrite-generated') {
      options.overwriteGenerated = true;
    } else if (arg === '--generate-relationships') {
      options.generateRelationships = true;
    } else if (arg === '--openrouter-api-key') {
      options.openRouterApiKey = argv[++index] || '';
    } else if (arg === '--embedding-model') {
      options.embeddingModels.push(argv[++index] || '');
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--report-file') {
      options.reportFile = argv[++index] || '';
    } else if (arg === '--overwrite-report') {
      options.overwriteReport = true;
    } else if (arg === '--config-dir') {
      options.configDir = argv[++index] || '';
    } else if (arg === '--package') {
      options.packageFilter = argv[++index] || '';
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log([
    'Usage: node scripts/convertAutoTutorToSparc.cjs --config-dir C:\\dev\\mofacts_config [options]',
    '',
    'Options:',
    '  --package <name>          Convert one package directory by exact name.',
    '  --write                   Replace the source package JSON files with converted SPARC content. Dry-run is the default.',
    '  --overwrite-generated     Reserved for repeat conversion tooling; current write mode requires an AutoTutor source package.',
    '  --generate-relationships  Deprecated compatibility flag; upload/load generates missing KC graph relationships.',
    '  --openrouter-api-key <key> Deprecated compatibility flag; the converter does not call OpenRouter.',
    '  --embedding-model <model>  Deprecated compatibility flag; upload/load chooses embedding models.',
    '  --json                    Print the conversion report as JSON.',
    '  --report-file <path>       Write the conversion report JSON to an explicit path.',
    '  --overwrite-report         Allow replacing an existing --report-file output.',
    '  --help                    Show this help.',
  ].join('\n'));
}

function normalizeForCompare(value) {
  return path.resolve(value).toLowerCase();
}

function resolveConfigDir(input) {
  if (!input) {
    throw new Error('MOFACTS_CONFIG_REPO is missing. Pass --config-dir C:\\dev\\mofacts_config or set MOFACTS_CONFIG_REPO to that exact canonical repository.');
  }
  const resolved = path.resolve(input);
  if (normalizeForCompare(resolved) !== normalizeForCompare(CANONICAL_CONFIG_DIR)) {
    throw new Error(`Config directory must resolve to ${CANONICAL_CONFIG_DIR}; got ${resolved}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Config directory does not exist: ${resolved}`);
  }
  return resolved;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read JSON ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeReportFile(reportFile, report, options = {}) {
  const resolvedReportFile = path.resolve(reportFile || '');
  if (!reportFile) {
    throw new Error('--report-file requires a non-empty path');
  }
  if (fs.existsSync(resolvedReportFile) && !options.overwriteReport) {
    throw new Error(`Conversion report already exists: ${resolvedReportFile}. Pass --overwrite-report to replace it.`);
  }
  writeJson(resolvedReportFile, report);
  return resolvedReportFile;
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireNonBlank(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function sanitizeId(value, fallback) {
  const text = String(value || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text || fallback;
}

function sanitizeFileBase(value, fallback) {
  const text = String(value || fallback || '')
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return text || fallback;
}

function generatedLessonName(sourceLessonName) {
  const lesson = requireNonBlank(sourceLessonName, 'source tutor.setspec.lessonname');
  return lesson.replace(/^AutoTutor\b/i, GENERATED_PREFIX).replace(/^\s*/, '');
}

function generatedPackageName(sourceLessonName) {
  const lesson = generatedLessonName(sourceLessonName);
  return lesson.startsWith(GENERATED_PREFIX) ? lesson : `${GENERATED_PREFIX} ${lesson}`;
}

function findTdfPath(packageDir) {
  const candidates = fs.readdirSync(packageDir)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .map((name) => path.join(packageDir, name))
    .filter((filePath) => {
      const value = readJson(filePath);
      return isRecord(value?.tutor?.setspec) && Array.isArray(value?.tutor?.unit);
    });
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one TDF JSON in ${packageDir}; found ${candidates.length}`);
  }
  return candidates[0];
}

function findAutoTutorUnit(tdf) {
  const units = Array.isArray(tdf?.tutor?.unit) ? tdf.tutor.unit : [];
  const matches = units.filter((unit) => isRecord(unit?.autotutorsession));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one autotutorsession unit; found ${matches.length}`);
  }
  return matches[0];
}

function requireSourceStimulus(packageDir, tdf) {
  const stimulusFile = requireNonBlank(tdf?.tutor?.setspec?.stimulusfile, 'source tutor.setspec.stimulusfile');
  const stimulusPath = path.join(packageDir, stimulusFile);
  if (!fs.existsSync(stimulusPath)) {
    throw new Error(`Source stimulus file does not exist: ${stimulusPath}`);
  }
  return { stimulusPath, stimulus: readJson(stimulusPath) };
}

function requireAutoTutorScript(sourceStimulus, autoTutorUnit) {
  const clusterIndex = Number(autoTutorUnit.autotutorsession.cluster ?? 0);
  if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
    throw new Error(`autotutorsession.cluster must be a non-negative integer; got ${String(autoTutorUnit.autotutorsession.cluster)}`);
  }
  const clusters = sourceStimulus?.setspec?.clusters;
  if (!Array.isArray(clusters)) {
    throw new Error('source stimulus setspec.clusters must be an array');
  }
  const cluster = clusters[clusterIndex];
  const firstStim = Array.isArray(cluster?.stims) ? cluster.stims[0] : null;
  if (!isRecord(firstStim)) {
    throw new Error(`source cluster ${clusterIndex} must have a first stimulus`);
  }
  if (!isRecord(firstStim.autoTutor)) {
    throw new Error(`source cluster ${clusterIndex} first stimulus is missing autoTutor`);
  }
  return {
    clusterIndex,
    firstStim,
    script: firstStim.autoTutor,
  };
}

function validateAutoTutorScript(script) {
  requireNonBlank(script.id, 'autoTutor.id');
  requireNonBlank(script.topic, 'autoTutor.topic');
  if (!Array.isArray(script.expectations) || script.expectations.length === 0) {
    throw new Error('autoTutor.expectations must be a non-empty array');
  }
  const expectationIds = new Set();
  for (const [index, expectation] of script.expectations.entries()) {
    const id = requireNonBlank(expectation?.id, `autoTutor.expectations[${index}].id`);
    requireNonBlank(expectation?.proposition || expectation?.assertion, `autoTutor.expectations[${index}].proposition`);
    if (expectationIds.has(id)) {
      throw new Error(`autoTutor.expectations contains duplicate id ${id}`);
    }
    expectationIds.add(id);
  }
  const relationships = normalizeExpectationRelationships(script.expectationRelationships, (sourceId) => sourceId);
  for (const [index, relationship] of relationships.entries()) {
    const sourceId = requireNonBlank(relationship.sourceClusterKC, `autoTutor.expectationRelationships[${index}].sourceId`);
    const targetId = requireNonBlank(relationship.targetClusterKC, `autoTutor.expectationRelationships[${index}].targetId`);
    if (!Number.isFinite(relationship.strength) || relationship.strength < 0 || relationship.strength > 1) {
      throw new Error(`autoTutor.expectationRelationships[${index}].strength must be a number from 0 to 1`);
    }
    if (!expectationIds.has(sourceId) || !expectationIds.has(targetId)) {
      throw new Error(`autoTutor.expectationRelationships[${index}] references an unknown expectation id`);
    }
  }
}

function normalizeExpectationRelationships(value, resolveClusterKC = (sourceId) => sourceId) {
  if (Array.isArray(value)) {
    return value.map((relationship) => ({
      sourceClusterKC: resolveClusterKC(String(relationship?.sourceId ?? relationship?.source ?? '')),
      targetClusterKC: resolveClusterKC(String(relationship?.targetId ?? relationship?.target ?? '')),
      strength: Number.isFinite(Number(relationship?.strength)) ? Number(relationship.strength) : 1,
      relation: relationship?.relation || relationship?.type || 'related',
    }));
  }
  return clusterKcRelationships.normalizeClusterKcRelationshipMatrix(value, resolveClusterKC);
}

function deriveIds(sourceTdf, script) {
  const sourceLessonName = sourceTdf.tutor.setspec.lessonname;
  const lessonName = generatedPackageName(sourceLessonName);
  const lessonSlug = sanitizeId(lessonName, 'sparc-session-autotutor');
  const fileBase = sanitizeFileBase(lessonName, 'SPARC_Session_AutoTutor');
  return {
    lessonName,
    lessonSlug,
    fileBase,
    tdfFileName: `${fileBase}_TDF.json`,
    stimulusFileName: `${fileBase}_stims.json`,
    pageId: lessonSlug,
    documentId: `sparc-autotutor-${sanitizeId(script.id, lessonSlug)}`,
  };
}

function generatedClusterForExpectation(params) {
  const { scriptId, expectation, index } = params;
  const expectationId = requireNonBlank(expectation.id, `expectation ${index} id`);
  const suffix = sanitizeId(expectationId, `target-${index + 1}`);
  const clusterKC = `autotutor.${sanitizeId(scriptId, 'script')}.kc.${suffix}`;
  const text = String(expectation.proposition || expectation.assertion || expectation.label || expectationId).trim();
  return {
    clusterKC,
    stims: [{
      stimulusKC: `${clusterKC}.stim`,
      clusterKC,
      responseKC: `${clusterKC}.response`,
      text,
      textStimulus: text,
      display: {
        type: 'text',
        text,
      },
      response: {
        correctResponse: String(expectation.assertion || expectation.proposition || expectation.label || expectationId),
      },
      parameter: '0,0.8',
      sourceAutoTutor: {
        scriptId,
        expectationId,
      },
    }],
  };
}

function fact(factType, slots) {
  return { factType, slots };
}

function addMoveContent(facts, slots) {
  const text = String(slots.text || '').trim();
  if (!text) {
    return;
  }
  facts.push(fact('dialogue.moveContent', {
    ...slots,
    text,
  }));
}

function ruleLiteral(value) {
  return { type: 'literal', value };
}

function moveContentTextForExpectation(expectation, action) {
  const proposition = String(expectation.proposition || expectation.assertion || '').trim();
  const assertion = String(expectation.assertion || proposition).trim();
  const label = String(expectation.label || expectation.id || 'this idea').trim();
  switch (action) {
    case 'pump':
      return `Say more about ${label}.`;
    case 'positive_pump':
      return `Good start. Add more detail about ${label}.`;
    case 'elaborate':
      return assertion || proposition;
    case 'positive_feedback':
      return `That supports ${label}.`;
    case 'negative_feedback':
      return `That does not yet address ${label}.`;
    case 'positive_neutral_feedback':
      return `You are partly addressing ${label}; keep going.`;
    case 'negative_neutral_feedback':
      return `Let's redirect toward ${label}.`;
    case 'neutral_feedback':
      return `Focus on ${label}: ${proposition || assertion}`;
    case 'summary':
      return assertion || proposition;
    default:
      return proposition || assertion;
  }
}

const GENERATED_DIALOGUE_POLICY_VERSION = 'generated-dialogue-policy-v1';

function buildGeneratedDialoguePolicyProductionRules() {
  return [{
    id: 'dialogue.move.generated-completion-summary',
    module: 'dialogue.move-selection',
    salience: 110,
    when: [{
      factType: 'dialogue.completionSelected',
    }, {
      factType: 'controller.completionState',
      slots: {
        completed: ruleLiteral(true),
      },
    }],
    then: [{
      type: 'assert-fact',
      persist: true,
      fact: {
        factType: 'controller.selectedAction',
        slots: {
          targetType: ruleLiteral('completion'),
          action: ruleLiteral('summary'),
          sourceRuleId: ruleLiteral('generated-completion-summary'),
          templateVersion: ruleLiteral(GENERATED_DIALOGUE_POLICY_VERSION),
        },
      },
    }, {
      type: 'terminate-production-phase',
      reason: 'move-selected',
    }],
  }];
}

function createScriptFacts(params) {
  const { sourceTdf, script, clustersByExpectationId, autoTutorUnit } = params;
  const resolveClusterKC = (sourceId) => clustersByExpectationId.get(sourceId)?.clusterKC;
  const relationships = normalizeExpectationRelationships(script.expectationRelationships, resolveClusterKC);
  const graphNodes = script.expectations.map((expectation) => ({
    clusterKC: clustersByExpectationId.get(expectation.id).clusterKC,
    sourceId: expectation.id,
    description: expectation.proposition || expectation.assertion,
  }));
  clusterKcRelationships.validateClusterKcRelationships({
    relationships,
    clusterKCs: new Set(graphNodes.map((node) => node.clusterKC)),
    label: 'autoTutor.expectationRelationships',
  });
  const facts = [
    fact('dialogue.source', {
      sourceKind: 'autotutor-converter',
      sourceScriptId: script.id,
      topic: script.topic,
      sourceLessonName: sourceTdf.tutor.setspec.lessonname,
      sourceUnitName: autoTutorUnit.unitname || 'AutoTutor',
    }),
    fact('dialogue.thresholds', {
      lowCoverageMax: 0.33,
      mediumCoverageMax: 0.67,
      highCoverageMin: 0.67,
      coverageThreshold: 0.8,
    }),
    fact('controller.targetSelectionPolicy', {
      policy: 'kc-graph-priority',
      coverageThreshold: 0.8,
      frontierWeight: 0.5,
      coherenceWeight: 0.3,
      centralityWeight: 0.2,
    }),
    fact('dialogue.graduation', {
      requiredTargetCount: autoTutorUnit.autotutorsession.graduation?.requiredExpectationCount ?? script.expectations.length,
      maxActiveMisconceptions: autoTutorUnit.autotutorsession.graduation?.maxActiveMisconceptions ?? 0,
      maxTurns: autoTutorUnit.autotutorsession.maxTurns ?? null,
    }),
  ];

  for (const expectation of script.expectations) {
    const clusterKC = clustersByExpectationId.get(expectation.id).clusterKC;
    facts.push(fact('learningTarget.source', {
      clusterKC,
      sourceScriptId: script.id,
      sourceId: expectation.id,
      label: expectation.label || expectation.id,
      assertion: expectation.assertion || expectation.proposition,
      proposition: expectation.proposition || expectation.assertion,
    }));
    for (const hint of Array.isArray(expectation.hints) ? expectation.hints : []) {
      addMoveContent(facts, {
        targetType: 'learningTarget',
        clusterKC,
        action: 'hint',
        text: String(hint),
      });
    }
    for (const prompt of Array.isArray(expectation.prompts) ? expectation.prompts : []) {
      addMoveContent(facts, {
        targetType: 'learningTarget',
        clusterKC,
        action: 'prompt',
        text: String(prompt?.stem || prompt?.target || ''),
      });
    }
    for (const action of moveRuleTemplate.AUTOTUTOR_SPARC_MOVE_ACTIONS) {
      if (action === 'hint' || action === 'prompt' || action === 'splice') {
        continue;
      }
      addMoveContent(facts, {
        targetType: 'learningTarget',
        clusterKC,
        action,
        text: moveContentTextForExpectation(expectation, action),
      });
    }
  }

  facts.push(...clusterKcRelationships.createClusterKcGraphFacts({
    nodes: graphNodes,
    relationships,
  }));

  for (const misconception of Array.isArray(script.misconceptions) ? script.misconceptions : []) {
    const id = String(misconception?.id || '').trim();
    if (!id) continue;
    facts.push(fact('diagnostic.misconceptionSource', {
      id,
      label: misconception.label || id,
      description: misconception.description || misconception.misconception || misconception.text || '',
      repair: misconception.repair || misconception.correction || misconception.feedback || '',
      repairQuestion: misconception.repairQuestion || '',
      repairCriteria: misconception.repairCriteria || '',
    }));
    if (misconception.repair || misconception.feedback) {
      addMoveContent(facts, {
        targetType: 'misconception',
        id,
        action: 'splice',
        text: misconception.repair || misconception.feedback,
      });
      addMoveContent(facts, {
        targetType: 'misconception',
        id,
        action: 'negative_feedback',
        text: misconception.repair || misconception.feedback,
      });
      addMoveContent(facts, {
        targetType: 'misconception',
        id,
        action: 'negative_neutral_feedback',
        text: misconception.repair || misconception.feedback,
      });
    }
  }

  addMoveContent(facts, {
    targetType: 'completion',
    action: 'summary',
    text: script.summary || script.idealAnswer || script.learningGoal || script.topic,
  });

  return facts;
}

function buildSparcDialogueDisplay(params) {
  const { ids, sourceStim, clusters, scriptFacts } = params;
  const openingText = String(sourceStim.display?.text || `Let's discuss ${params.script.topic}.`);
  return {
    type: 'sparc',
    schema: 'tutorscript-sparc/1.0',
    documentId: ids.documentId,
    unitType: 'sparc-autotutor-dialogue',
    layout: {
      layoutMode: 'document',
      scrollAxis: 'vertical',
      visualPreset: 'practice-panel',
      density: 'comfortable',
    },
    nodes: [
      {
        id: 'dialogue-thread',
        nodeType: 'group',
        groupType: 'dialogue-thread',
        children: [
          {
            id: 'opening-tutor-message',
            nodeType: 'atomic',
            atomType: 'dialogue-utterance',
            speaker: 'tutor',
            value: openingText,
            clusterIndices: clusters.map((_, index) => index),
          },
        ],
      },
      {
        id: 'learner-response-input',
        nodeType: 'atomic',
        atomType: 'text-input',
        label: 'Response',
      },
      {
        id: 'learner-response-submit',
        nodeType: 'atomic',
        atomType: 'button',
        label: 'Submit',
        value: 'submit',
      },
    ],
    clusterTargets: clusters.map((cluster, index) => ({
      clusterIndex: index,
      label: String(cluster.stims[0].text || cluster.clusterKC),
      stimulusKC: cluster.stims[0].stimulusKC,
      clusterKC: cluster.clusterKC,
      KCId: cluster.stims[0].stimulusKC,
      KCDefault: cluster.stims[0].stimulusKC,
      KCCluster: cluster.clusterKC,
    })),
    workingMemoryFacts: scriptFacts,
    productionRules: [
      ...moveRuleTemplate.buildAutoTutorSparcMoveProductionRules(),
      ...buildGeneratedDialoguePolicyProductionRules(),
    ],
  };
}

function buildGeneratedTdf(params) {
  const { sourceTdf, sourceUnit, ids } = params;
  const tags = Array.isArray(sourceTdf.tutor.setspec.tags) ? sourceTdf.tutor.setspec.tags : [];
  return {
    tutor: {
      setspec: {
        ...sourceTdf.tutor.setspec,
        lessonname: ids.lessonName,
        name: ids.lessonSlug,
        stimulusfile: ids.stimulusFileName,
        userselect: 'false',
        tags: Array.from(new Set([...tags, 'sparc-session', 'autotutor-converted'])),
        sourceAutoTutorLessonName: sourceTdf.tutor.setspec.lessonname,
      },
      unit: [
        {
          unitname: `${String(sourceUnit.unitname || sourceTdf.tutor.setspec.lessonname).replace(/\bAutoTutor\b/i, 'SPARC Session')}`,
          sparcsession: {
            unitMode: 'distance',
            pageId: ids.pageId,
          },
        },
      ],
    },
  };
}

function buildGeneratedStimulus(params) {
  const { ids, clusters, display, sourcePackageName, sourceTdfPath, sourceStimulusPath, script, relationshipValidation } = params;
  return {
    setspec: {
      sourceAutoTutorConversion: {
        converter: 'convertAutoTutorToSparc.cjs',
        sourcePackageName,
        sourceTdfFile: path.basename(sourceTdfPath),
        sourceStimulusFile: path.basename(sourceStimulusPath),
        sourceScriptId: script.id,
        moveRuleTemplateVersion: moveRuleTemplate.AUTOTUTOR_SPARC_MOVE_RULE_TEMPLATE_VERSION,
        expectationRelationshipProvenance: script.expectationRelationshipProvenance ?? null,
        relationshipValidation,
      },
      clusters,
      sparcPages: [
        {
          pageId: ids.pageId,
          display,
        },
      ],
    },
  };
}

function validateGeneratedPackage(generated) {
  const unit = generated.tdf.tutor.unit[0];
  if (!unit.sparcsession || unit.autotutorsession) {
    throw new Error('generated TDF must use sparcsession and must not contain autotutorsession');
  }
  const generatedPageId = String(unit.sparcsession.pageId || '').trim();
  if (!generatedPageId) {
    throw new Error('generated TDF sparcsession.pageId is required');
  }
  const sparcPages = generated.stimulus.setspec.sparcPages;
  if (!Array.isArray(sparcPages) || sparcPages.length !== 1) {
    throw new Error('generated stimulus must contain exactly one setspec.sparcPages entry');
  }
  if (sparcPages[0].pageId !== generatedPageId) {
    throw new Error(`generated sparcsession.pageId "${generatedPageId}" must resolve to exactly one setspec.sparcPages[].pageId`);
  }
  const display = sparcPages[0].display;
  if (!Array.isArray(display.productionRules)) {
    throw new Error('generated SPARC display must include authored move-selection production rules');
  }
  const ruleIds = new Set(display.productionRules.map((rule) => String(rule.id || '').trim()).filter(Boolean));
  const missingAddedRuleIds = moveRuleTemplate.buildAutoTutorSparcMoveProductionRules()
    .map((rule) => rule.id)
    .filter((ruleId) => !ruleIds.has(ruleId));
  if (missingAddedRuleIds.length > 0) {
    throw new Error(`generated SPARC display is missing added AutoTutor move-selection rules: ${missingAddedRuleIds.join(', ')}`);
  }
  if (!display.productionRules.some((rule) => rule.id === 'dialogue.move.generated-completion-summary')) {
    throw new Error('generated SPARC display must include a completion-summary move-selection production rule');
  }
  const clusters = generated.stimulus.setspec.clusters;
  const clusterCount = clusters.length;
  const clusterKCs = clusters.map((cluster, index) => {
    const clusterKC = String(cluster?.clusterKC || '').trim();
    if (!clusterKC) {
      throw new Error(`generated cluster ${index} must define clusterKC`);
    }
    const stimulusKC = String(cluster?.stims?.[0]?.stimulusKC || '').trim();
    if (!stimulusKC) {
      throw new Error(`generated cluster ${index} must define first-stimulus stimulusKC`);
    }
    return clusterKC;
  });
  if (new Set(clusterKCs).size !== clusterKCs.length) {
    throw new Error('generated clusters must define unique clusterKC values');
  }
  const referenced = new Set();
  for (const node of display.nodes) {
    collectClusterIndices(node, referenced);
  }
  for (const target of display.clusterTargets) {
    referenced.add(Number(target.clusterIndex));
  }
  for (let index = 0; index < clusterCount; index += 1) {
    if (!referenced.has(index)) {
      throw new Error(`generated SPARC page does not reference cluster index ${index}`);
    }
  }
  const targetClusterKCs = new Set((display.clusterTargets || []).map((target) => target.clusterKC));
  for (const clusterKC of clusterKCs) {
    if (!targetClusterKCs.has(clusterKC)) {
      throw new Error(`generated SPARC page clusterTargets do not include clusterKC "${clusterKC}"`);
    }
  }
  const graphNodeClusterKCs = new Set();
  const relationshipPairs = new Set();
  for (const fact of display.workingMemoryFacts || []) {
    if (fact.factType === 'kcGraph.node') {
      graphNodeClusterKCs.add(fact.slots?.clusterKC);
    }
    if (fact.factType === 'kcGraph.relationship') {
      relationshipPairs.add(`${fact.slots?.sourceClusterKC}\u0000${fact.slots?.targetClusterKC}`);
    }
  }
  for (const clusterKC of clusterKCs) {
    if (!graphNodeClusterKCs.has(clusterKC)) {
      throw new Error(`generated SPARC graph facts are missing kcGraph.node for clusterKC "${clusterKC}"`);
    }
  }
  if (generated.stimulus?.setspec?.sourceAutoTutorConversion?.relationshipValidation?.relationshipGenerationRequired) {
    return;
  }
  for (const sourceClusterKC of clusterKCs) {
    for (const targetClusterKC of clusterKCs) {
      if (sourceClusterKC === targetClusterKC) {
        continue;
      }
      if (!relationshipPairs.has(`${sourceClusterKC}\u0000${targetClusterKC}`)) {
        throw new Error(`generated SPARC graph facts are missing kcGraph.relationship from "${sourceClusterKC}" to "${targetClusterKC}"`);
      }
    }
  }
}

function collectClusterIndices(node, output) {
  if (!isRecord(node)) return;
  if (Array.isArray(node.clusterIndices)) {
    for (const value of node.clusterIndices) output.add(Number(value));
  }
  if (node.clusterIndex !== undefined) output.add(Number(node.clusterIndex));
  for (const child of Array.isArray(node.children) ? node.children : []) {
    collectClusterIndices(child, output);
  }
}

async function translatePackage(configDir, sourcePackageName) {
  const sourcePackageDir = path.join(configDir, sourcePackageName);
  const sourceTdfPath = findTdfPath(sourcePackageDir);
  const sourceTdf = readJson(sourceTdfPath);
  const sourceUnit = findAutoTutorUnit(sourceTdf);
  const { stimulusPath: sourceStimulusPath, stimulus } = requireSourceStimulus(sourcePackageDir, sourceTdf);
  const { firstStim, script: rawScript } = requireAutoTutorScript(stimulus, sourceUnit);
  validateAutoTutorScript(rawScript);
  const script = rawScript;

  const ids = deriveIds(sourceTdf, script);
  const clusters = script.expectations.map((expectation, index) =>
    generatedClusterForExpectation({ scriptId: script.id, expectation, index }),
  );
  const clustersByExpectationId = new Map(script.expectations.map((expectation, index) => [expectation.id, clusters[index]]));
  const expectationClusterMappings = script.expectations.map((expectation, index) => ({
    sourceExpectationId: expectation.id,
    clusterIndex: index,
    clusterKC: clusters[index].clusterKC,
    stimulusKC: clusters[index].stims[0].stimulusKC,
  }));
  const resolvedRelationships = normalizeExpectationRelationships(
    script.expectationRelationships,
    (sourceId) => clustersByExpectationId.get(sourceId)?.clusterKC,
  );
  const relationshipGenerationRequired = resolvedRelationships.length === 0 && clusters.length > 1;
  const relationshipValidation = {
    valid: true,
    sourceShape: relationshipGenerationRequired
      ? 'generated-at-upload'
      : (Array.isArray(script.expectationRelationships) ? 'list' : 'matrix'),
    sourceRelationshipCount: normalizeExpectationRelationships(script.expectationRelationships, (sourceId) => sourceId).length,
    resolvedRelationshipCount: resolvedRelationships.length,
    generatedClusterCount: clusters.length,
    relationshipProvenance: script.expectationRelationshipProvenance ?? null,
    generatedRelationships: false,
    relationshipGenerationRequired,
  };
  const scriptFacts = createScriptFacts({
    sourceTdf,
    script,
    clustersByExpectationId,
    autoTutorUnit: sourceUnit,
  });
  const display = buildSparcDialogueDisplay({
    ids,
    sourceStim: firstStim,
    script,
    clusters,
    scriptFacts,
  });
  const convertedPackageDir = sourcePackageDir;
  const convertedTdfPath = sourceTdfPath;
  const convertedStimulusPath = sourceStimulusPath;
  const convertedIds = {
    ...ids,
    tdfFileName: path.basename(sourceTdfPath),
    stimulusFileName: path.basename(sourceStimulusPath),
  };
  const generated = {
    tdf: buildGeneratedTdf({ sourceTdf, sourceUnit, ids: convertedIds }),
    stimulus: buildGeneratedStimulus({
      ids: convertedIds,
      clusters,
      display,
      sourcePackageName,
      sourceTdfPath,
      sourceStimulusPath,
      script,
      relationshipValidation,
    }),
  };
  validateGeneratedPackage(generated);
  return {
    status: 'converted',
    sourcePackageName,
    convertedPackageName: sourcePackageName,
    generatedLessonName: ids.lessonName,
    sourceTdfPath,
    sourceStimulusPath,
    convertedPackageDir,
    convertedTdfPath,
    convertedStimulusPath,
    expectationCount: script.expectations.length,
    relationshipCount: resolvedRelationships.length,
    expectationClusterMappings,
    relationshipValidation,
    moveRuleCount: display.productionRules.length,
    warnings: [],
    generated,
  };
}

function inventoryAutoTutorPackages(configDir, packageFilter) {
  const packageNames = fs.readdirSync(configDir)
    .filter((name) => {
      const packageDir = path.join(configDir, name);
      return fs.statSync(packageDir).isDirectory() && name !== '.git';
    })
    .filter((name) => !packageFilter || name === packageFilter);
  if (packageFilter && packageNames.length === 0) {
    throw new Error(`Package not found: ${packageFilter}`);
  }
  const autoTutorPackages = [];
  const skipped = [];
  for (const packageName of packageNames) {
    try {
      const tdfPath = findTdfPath(path.join(configDir, packageName));
      const tdf = readJson(tdfPath);
      findAutoTutorUnit(tdf);
      autoTutorPackages.push(packageName);
    } catch (error) {
      if (packageFilter) throw error;
      skipped.push({
        sourcePackageName: packageName,
        status: 'skipped',
        reason: error.message,
      });
    }
  }
  return {
    packageNames: autoTutorPackages,
    skipped,
  };
}

function writeGenerated(result) {
  if (normalizeForCompare(result.convertedTdfPath) !== normalizeForCompare(result.sourceTdfPath)) {
    throw new Error('Converted TDF path must be the source TDF path for in-place conversion');
  }
  if (normalizeForCompare(result.convertedStimulusPath) !== normalizeForCompare(result.sourceStimulusPath)) {
    throw new Error('Converted stimulus path must be the source stimulus path for in-place conversion');
  }
  writeJson(result.convertedTdfPath, result.generated.tdf);
  writeJson(result.convertedStimulusPath, result.generated.stimulus);
}

async function buildConversionReport(configDir, options = {}) {
  options = {
    packageFilter: '',
    write: false,
    overwriteGenerated: false,
    openRouterApiKey: '',
    embeddingModels: [],
    reportFile: '',
    overwriteReport: false,
    ...options,
  };
  options.embeddingModels = options.embeddingModels.map((model) => String(model || '').trim()).filter(Boolean);
  const inventory = inventoryAutoTutorPackages(configDir, options.packageFilter);
  const packageNames = inventory.packageNames;
  const converted = [];
  const failures = [];
  const warnings = [];

  for (const packageName of packageNames) {
    try {
      const result = await translatePackage(configDir, packageName, options);
      if (options.write) writeGenerated(result, options);
      for (const warning of result.warnings || []) {
        warnings.push({
          sourcePackageName: packageName,
          status: 'warning',
          warning,
        });
      }
      converted.push({
        status: result.status,
        sourcePackageName: result.sourcePackageName,
        sourceTdfPath: result.sourceTdfPath,
        sourceStimulusPath: result.sourceStimulusPath,
        sourceScriptId: result.generated.stimulus.setspec.sourceAutoTutorConversion.sourceScriptId,
        sourceProvenance: {
          sourcePackageName: result.sourcePackageName,
          sourceTdfPath: result.sourceTdfPath,
          sourceStimulusPath: result.sourceStimulusPath,
          sourceScriptId: result.generated.stimulus.setspec.sourceAutoTutorConversion.sourceScriptId,
        },
        convertedPackageName: result.convertedPackageName,
        generatedLessonName: result.generatedLessonName,
        convertedTdfPath: result.convertedTdfPath,
        convertedStimulusPath: result.convertedStimulusPath,
        generatedSparcPageId: result.generated.tdf.tutor.unit[0].sparcsession.pageId,
        generatedSparcDocumentId: result.generated.stimulus.setspec.sparcPages[0].display.documentId,
        expectationCount: result.expectationCount,
        relationshipCount: result.relationshipCount,
        relationshipValidation: result.relationshipValidation,
        relationshipProvenance: result.relationshipValidation.relationshipProvenance,
        expectationClusterMappings: result.expectationClusterMappings,
        moveRuleCount: result.moveRuleCount,
        warnings: result.warnings || [],
        wroteFiles: options.write,
      });
    } catch (error) {
      failures.push({
        sourcePackageName: packageName,
        status: 'failed',
        error: error.message,
      });
    }
  }

  const report = {
    converter: 'convertAutoTutorToSparc.cjs',
    mode: options.write ? 'write' : 'dry-run',
    configDir,
    packageCount: packageNames.length,
    skippedCount: inventory.skipped.length,
    convertedCount: converted.length,
    warningCount: warnings.length,
    failureCount: failures.length,
    skipped: inventory.skipped,
    warnings,
    converted,
    failures,
  };
  if (options.reportFile) {
    report.reportFile = path.resolve(options.reportFile);
    writeReportFile(options.reportFile, report, options);
  }
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const configDir = resolveConfigDir(options.configDir);
  const report = await buildConversionReport(configDir, options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`${report.converter}: ${report.mode}`);
    console.log(`AutoTutor packages: ${report.packageCount}; skipped: ${report.skippedCount}; converted: ${report.convertedCount}; warnings: ${report.warningCount}; failures: ${report.failureCount}`);
    for (const item of report.converted) {
      console.log(`converted ${item.sourcePackageName} in place (${item.expectationCount} targets, ${item.moveRuleCount} move rules)`);
    }
    for (const item of report.warnings) {
      console.log(`warning ${item.sourcePackageName}: ${item.warning}`);
    }
    for (const item of report.failures) {
      console.log(`failed ${item.sourcePackageName}: ${item.error}`);
    }
  }
  if (report.failures.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  buildConversionReport,
  normalizeExpectationRelationships,
  translatePackage,
};
