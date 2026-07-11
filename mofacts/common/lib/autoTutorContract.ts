import type {
  AutoTutorExpectationScore,
  AutoTutorLearnerContributionScore,
  AutoTutorLearnerQuestionScore,
  AutoTutorMisconceptionScore,
  AutoTutorMove,
  AutoTutorTargetType,
} from './autoTutorPlanner.ts';

export type AutoTutorValidationResult = {
  valid: boolean;
  errors: string[];
};

type AutoTutorValidationContext = {
  tdf?: unknown;
  stimuli?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function containsInternalRubricId(value: string): boolean {
  return /\b[EM]\d+\b/.test(value);
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getTutor(tdf: unknown): Record<string, unknown> | null {
  if (!isRecord(tdf)) {
    return null;
  }
  const tutor = tdf.tutor;
  return isRecord(tutor) ? tutor : null;
}

function getAutoTutorUnits(tdf: unknown): Array<{ unit: Record<string, unknown>; index: number }> {
  const tutor = getTutor(tdf);
  const units = Array.isArray(tutor?.unit) ? tutor.unit : [];
  return units
    .map((unit, index) => ({ unit, index }))
    .filter((entry): entry is { unit: Record<string, unknown>; index: number } =>
      isRecord(entry.unit) &&
      isRecord(entry.unit.autotutorsession)
    );
}

function getSparcUnits(tdf: unknown): Array<{ unit: Record<string, unknown>; index: number }> {
  const tutor = getTutor(tdf);
  const units = Array.isArray(tutor?.unit) ? tutor.unit : [];
  return units
    .map((unit, index) => ({ unit, index }))
    .filter((entry): entry is { unit: Record<string, unknown>; index: number } =>
      isRecord(entry.unit) &&
      isRecord(entry.unit.sparcsession)
    );
}

function getStimClusters(stimuli: unknown): unknown[] {
  if (!isRecord(stimuli) || !isRecord(stimuli.setspec) || !Array.isArray(stimuli.setspec.clusters)) {
    return [];
  }
  return stimuli.setspec.clusters;
}

function getSparcPages(stimuli: unknown): Array<Record<string, unknown>> {
  if (!isRecord(stimuli) || !isRecord(stimuli.setspec) || !Array.isArray(stimuli.setspec.sparcPages)) {
    return [];
  }
  return stimuli.setspec.sparcPages.filter(isRecord);
}

function getClusterFirstStim(stimuli: unknown, clusterIndex: number): Record<string, unknown> | null {
  const cluster = getStimClusters(stimuli)[clusterIndex];
  if (!isRecord(cluster) || !Array.isArray(cluster.stims)) {
    return null;
  }
  const firstStim = cluster.stims[0];
  return isRecord(firstStim) ? firstStim : null;
}

function validateAutoTutorScript(script: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(script)) {
    errors.push(`${prefix} is missing autoTutor script`);
    return;
  }

  for (const field of ['id', 'topic', 'learningGoal', 'idealAnswer', 'summary']) {
    if (!nonEmptyString(script[field])) {
      errors.push(`${prefix}.autoTutor.${field} must be a non-empty string`);
    }
  }

  const expectations = asRecordArray(script.expectations);
  if (expectations.length === 0) {
    errors.push(`${prefix}.autoTutor.expectations must contain at least one expectation`);
  }
  const expectationIds = new Set<string>();
  expectations.forEach((expectation, expectationIndex) => {
    const expectationPrefix = `${prefix}.autoTutor.expectations[${expectationIndex}]`;
    if (!nonEmptyString(expectation.id)) {
      errors.push(`${expectationPrefix}.id must be a non-empty string`);
    } else if (expectationIds.has(expectation.id)) {
      errors.push(`${expectationPrefix}.id duplicates expectation "${expectation.id}"`);
    } else {
      expectationIds.add(expectation.id);
    }
    for (const field of ['label', 'proposition', 'assertion']) {
      if (!nonEmptyString(expectation[field])) {
        errors.push(`${expectationPrefix}.${field} must be a non-empty string`);
      }
    }
  });

  if (script.expectationRelationships !== undefined) {
    if (!isRecord(script.expectationRelationships)) {
      errors.push(`${prefix}.autoTutor.expectationRelationships must be an object keyed by expectation ID`);
    } else {
      for (const [sourceId, relationships] of Object.entries(script.expectationRelationships)) {
        if (!expectationIds.has(sourceId) || !isRecord(relationships)) {
          errors.push(`${prefix}.autoTutor.expectationRelationships.${sourceId} must reference a known expectation and contain target weights`);
          continue;
        }
        for (const [targetId, relationship] of Object.entries(relationships)) {
          if (!expectationIds.has(targetId)) {
            errors.push(`${prefix}.autoTutor.expectationRelationships.${sourceId}.${targetId} references unknown expectation "${targetId}"`);
            continue;
          }
          if (
            typeof relationship !== 'number' ||
            !Number.isFinite(relationship) ||
            relationship < 0 ||
            relationship > 1
          ) {
            errors.push(`${prefix}.autoTutor.expectationRelationships.${sourceId}.${targetId} must be a number from 0 to 1`);
          }
        }
      }
    }
  }

  if (script.expectationRelationshipProvenance !== undefined) {
    const provenance = script.expectationRelationshipProvenance;
    if (!isRecord(provenance)) {
      errors.push(`${prefix}.autoTutor.expectationRelationshipProvenance must be an object`);
    } else {
      for (const field of ['graphVersion', 'generatedAt', 'model', 'metric', 'scoreTransform', 'sourceKeyType', 'cacheKey']) {
        if (!nonEmptyString(provenance[field])) {
          errors.push(`${prefix}.autoTutor.expectationRelationshipProvenance.${field} must be a non-empty string`);
        }
      }
      if (
        !Array.isArray(provenance.attemptedModels) ||
        provenance.attemptedModels.length === 0 ||
        provenance.attemptedModels.some((model) => !nonEmptyString(model))
      ) {
        errors.push(`${prefix}.autoTutor.expectationRelationshipProvenance.attemptedModels must be a non-empty string array`);
      }
      if (
        provenance.sourceKeyType !== undefined &&
        provenance.sourceKeyType !== 'tdf' &&
        provenance.sourceKeyType !== 'user' &&
        provenance.sourceKeyType !== 'admin'
      ) {
        errors.push(`${prefix}.autoTutor.expectationRelationshipProvenance.sourceKeyType must be "tdf", "user", or "admin"`);
      }
    }
  }

  const misconceptions = asRecordArray(script.misconceptions);
  const misconceptionIds = new Set<string>();
  misconceptions.forEach((misconception, misconceptionIndex) => {
    const misconceptionPrefix = `${prefix}.autoTutor.misconceptions[${misconceptionIndex}]`;
    if (!nonEmptyString(misconception.id)) {
      errors.push(`${misconceptionPrefix}.id must be a non-empty string`);
    } else if (misconceptionIds.has(misconception.id)) {
      errors.push(`${misconceptionPrefix}.id duplicates misconception "${misconception.id}"`);
    } else {
      misconceptionIds.add(misconception.id);
    }
    for (const field of ['label', 'misconception', 'correction', 'repairQuestion']) {
      if (!nonEmptyString(misconception[field])) {
        errors.push(`${misconceptionPrefix}.${field} must be a non-empty string`);
      }
    }
    if (misconception.repairCriteria !== undefined && !nonEmptyString(misconception.repairCriteria)) {
      errors.push(`${misconceptionPrefix}.repairCriteria must be a non-empty string when present`);
    }
    if (
      misconception.acceptableRepairAnswers !== undefined &&
      (
        !Array.isArray(misconception.acceptableRepairAnswers) ||
        misconception.acceptableRepairAnswers.some((answer: unknown) => !nonEmptyString(answer))
      )
    ) {
      errors.push(`${misconceptionPrefix}.acceptableRepairAnswers must be a non-empty string array when present`);
    }
    const contrastIds = Array.isArray(misconception.contrastWithExpectations)
      ? misconception.contrastWithExpectations
      : [];
    for (const contrastId of contrastIds) {
      if (!nonEmptyString(contrastId) || !expectationIds.has(contrastId)) {
        errors.push(`${misconceptionPrefix}.contrastWithExpectations references unknown expectation "${String(contrastId)}"`);
      }
    }
  });

  if (!isRecord(script.dialogPolicy)) {
    errors.push(`${prefix}.autoTutor.dialogPolicy must be an object`);
    return;
  }

  const requiredExpectations = Array.isArray(script.dialogPolicy.requiredExpectations)
    ? script.dialogPolicy.requiredExpectations
    : [];
  if (requiredExpectations.length === 0) {
    errors.push(`${prefix}.autoTutor.dialogPolicy.requiredExpectations must contain at least one expectation ID`);
  }
  for (const requiredExpectation of requiredExpectations) {
    if (!nonEmptyString(requiredExpectation) || !expectationIds.has(requiredExpectation)) {
      errors.push(`${prefix}.autoTutor.dialogPolicy.requiredExpectations references unknown expectation "${String(requiredExpectation)}"`);
    }
  }
}

function validateGraduation(
  graduation: unknown,
  prefix: string,
  errors: string[],
  script?: Record<string, unknown>,
): void {
  if (!isRecord(graduation)) {
    errors.push(`${prefix}.graduation must be an object`);
    return;
  }

  const requiredExpectationCount = graduation.requiredExpectationCount;
  if (!Number.isInteger(requiredExpectationCount) || Number(requiredExpectationCount) < 0) {
    errors.push(`${prefix}.graduation.requiredExpectationCount must be a non-negative integer`);
  }
  const maxActiveMisconceptions = graduation.maxActiveMisconceptions;
  if (!Number.isInteger(maxActiveMisconceptions) || Number(maxActiveMisconceptions) < 0) {
    errors.push(`${prefix}.graduation.maxActiveMisconceptions must be a non-negative integer`);
  }

  if (script) {
    const dialogPolicy = isRecord(script.dialogPolicy) ? script.dialogPolicy : {};
    const requiredExpectations = Array.isArray(dialogPolicy.requiredExpectations)
      ? dialogPolicy.requiredExpectations
      : [];
    const misconceptions = Array.isArray(script.misconceptions) ? script.misconceptions : [];
    if (
      Number.isInteger(requiredExpectationCount) &&
      Number(requiredExpectationCount) > requiredExpectations.length
    ) {
      errors.push(
        `${prefix}.graduation.requiredExpectationCount cannot exceed ${requiredExpectations.length} required expectations`
      );
    }
    if (
      Number.isInteger(maxActiveMisconceptions) &&
      Number(maxActiveMisconceptions) > misconceptions.length
    ) {
      errors.push(
        `${prefix}.graduation.maxActiveMisconceptions cannot exceed ${misconceptions.length} authored misconceptions`
      );
    }
  }
}

export function validateAutoTutorContent(context: AutoTutorValidationContext): AutoTutorValidationResult {
  const errors: string[] = [];
  const tutor = getTutor(context.tdf);
  if (!tutor) {
    return { valid: false, errors: ['TDF is missing tutor object'] };
  }

  const autoTutorUnits = getAutoTutorUnits(context.tdf);
  const setspec = isRecord(tutor.setspec) ? tutor.setspec : {};

  for (const { unit, index } of autoTutorUnits) {
    const session = unit.autotutorsession as Record<string, unknown>;
    const unitPrefix = `tutor.unit[${index}].autotutorsession`;
    const effectiveModel = nonEmptyString(session.openRouterModel)
      ? session.openRouterModel
      : setspec.openRouterModel;
    if (!nonEmptyString(effectiveModel)) {
      errors.push(`${unitPrefix} requires openRouterModel or tutor.setspec.openRouterModel`);
    }

    if (!Number.isInteger(session.cluster) || Number(session.cluster) < 0) {
      errors.push(`${unitPrefix}.cluster must be a non-negative integer`);
      continue;
    }
    if (!Number.isInteger(session.maxTurns) || Number(session.maxTurns) < 1) {
      errors.push(`${unitPrefix}.maxTurns must be a positive integer`);
    }

    if (
      session.utteranceTemperature !== undefined &&
      (
        typeof session.utteranceTemperature !== 'number' ||
        !Number.isFinite(session.utteranceTemperature) ||
        session.utteranceTemperature < 0 ||
        session.utteranceTemperature > 2
      )
    ) {
      errors.push(`${unitPrefix}.utteranceTemperature must be a number between 0 and 2`);
    }

    const firstStim = getClusterFirstStim(context.stimuli, Number(session.cluster));
    const stimPrefix = `setspec.clusters[${Number(session.cluster)}].stims[0]`;
    if (!firstStim) {
      errors.push(`${unitPrefix}.cluster references a missing stimulus cluster or first stim`);
      continue;
    }

    const display = isRecord(firstStim.display) ? firstStim.display : {};
    if (!nonEmptyString(display.text)) {
      errors.push(`${stimPrefix}.display.text is required for AutoTutor`);
    }
    const script = isRecord(firstStim.autoTutor) ? firstStim.autoTutor : undefined;
    validateAutoTutorScript(firstStim.autoTutor, stimPrefix, errors);
    validateGraduation(session.graduation, unitPrefix, errors, script);
  }

  validateSparcAutoTutorContent(context, errors);

  return { valid: errors.length === 0, errors };
}

const FORBIDDEN_SPARC_AUTOTUTOR_FIELDS = new Set([
  'sourceAutoTutor',
  'stimulusKC',
  'KCId',
  'KCDefault',
  'KCCluster',
]);

function validateNoForbiddenSparcAutoTutorFields(value: unknown, path: string, errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoForbiddenSparcAutoTutorFields(entry, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const fieldPath = `${path}.${key}`;
    if (FORBIDDEN_SPARC_AUTOTUTOR_FIELDS.has(key)) {
      errors.push(`${fieldPath} is not allowed in SPARC AutoTutor target data`);
    }
    validateNoForbiddenSparcAutoTutorFields(entry, fieldPath, errors);
  }
}

function validateSparcAutoTutorTargets(
  display: Record<string, unknown>,
  clusters: unknown[],
  prefix: string,
  errors: string[],
): void {
  validateNoForbiddenSparcAutoTutorFields({
    clusterTargets: display.clusterTargets,
    autoTutorTargets: display.autoTutorTargets,
  }, prefix, errors);

  const clusterTargets = Array.isArray(display.clusterTargets) ? display.clusterTargets : [];
  if (clusterTargets.length === 0) {
    errors.push(`${prefix}.clusterTargets must contain at least one clean target`);
  }
  const clusterKCs = new Set<string>();
  clusterTargets.forEach((target, index) => {
    const targetPrefix = `${prefix}.clusterTargets[${index}]`;
    if (!isRecord(target)) {
      errors.push(`${targetPrefix} must be an object`);
      return;
    }
    if (!Number.isInteger(target.clusterIndex) || Number(target.clusterIndex) < 0) {
      errors.push(`${targetPrefix}.clusterIndex must be a non-negative integer`);
      return;
    }
    if (!nonEmptyString(target.clusterKC)) {
      errors.push(`${targetPrefix}.clusterKC must be a non-empty string`);
      return;
    }
    const cluster = clusters[Number(target.clusterIndex)];
    if (!isRecord(cluster)) {
      errors.push(`${targetPrefix}.clusterIndex references a missing stimulus cluster`);
      return;
    }
    if (nonEmptyString(cluster.clusterKC) && cluster.clusterKC !== target.clusterKC) {
      errors.push(`${targetPrefix}.clusterKC must match setspec.clusters[${Number(target.clusterIndex)}].clusterKC`);
    }
    clusterKCs.add(target.clusterKC);
  });

  const autoTutorTargets = isRecord(display.autoTutorTargets) ? display.autoTutorTargets : {};
  const expectations = Array.isArray(autoTutorTargets.expectations) ? autoTutorTargets.expectations : [];
  if (expectations.length === 0) {
    errors.push(`${prefix}.autoTutorTargets.expectations must contain at least one expectation`);
  }
  expectations.forEach((expectation, index) => {
    const expectationPrefix = `${prefix}.autoTutorTargets.expectations[${index}]`;
    if (!isRecord(expectation)) {
      errors.push(`${expectationPrefix} must be an object`);
      return;
    }
    if (!nonEmptyString(expectation.clusterKC)) {
      errors.push(`${expectationPrefix}.clusterKC must be a non-empty string`);
    } else if (!clusterKCs.has(expectation.clusterKC)) {
      errors.push(`${expectationPrefix}.clusterKC must reference a clean cluster target`);
    }
    if (!nonEmptyString(expectation.text)) {
      errors.push(`${expectationPrefix}.text must be a non-empty string`);
    }
  });

  const misconceptions = Array.isArray(autoTutorTargets.misconceptions) ? autoTutorTargets.misconceptions : [];
  misconceptions.forEach((misconception, index) => {
    const misconceptionPrefix = `${prefix}.autoTutorTargets.misconceptions[${index}]`;
    if (!isRecord(misconception)) {
      errors.push(`${misconceptionPrefix} must be an object`);
      return;
    }
    if (!nonEmptyString(misconception.id)) {
      errors.push(`${misconceptionPrefix}.id must be a non-empty string`);
    }
    if (!nonEmptyString(misconception.text)) {
      errors.push(`${misconceptionPrefix}.text must be a non-empty string`);
    }
  });
}

function validateSparcAutoTutorContent(context: AutoTutorValidationContext, errors: string[]): void {
  const sparcPages = getSparcPages(context.stimuli);
  const autoTutorPages = sparcPages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => isRecord(page.display) && page.display.unitType === 'sparc-autotutor-dialogue');
  if (autoTutorPages.length === 0) {
    return;
  }

  const sparcUnits = getSparcUnits(context.tdf);
  if (sparcUnits.length === 0) {
    errors.push('SPARC AutoTutor content requires a tutor.unit sparcsession selector');
  }
  const configuredPageIds = new Set(
    sparcUnits
      .map(({ unit }) => isRecord(unit.sparcsession) ? unit.sparcsession.pageId : undefined)
      .filter(nonEmptyString),
  );
  const clusters = getStimClusters(context.stimuli);

  autoTutorPages.forEach(({ page, index }) => {
    const pagePrefix = `setspec.sparcPages[${index}]`;
    const pageId = page.pageId;
    if (!nonEmptyString(pageId)) {
      errors.push(`${pagePrefix}.pageId must be a non-empty string`);
    } else if (configuredPageIds.size > 0 && !configuredPageIds.has(pageId)) {
      errors.push(`${pagePrefix}.pageId must match a tutor.unit sparcsession.pageId`);
    }

    const display = page.display as Record<string, unknown>;
    if (display.schema !== 'tutorscript-sparc/2.0') {
      errors.push(`${pagePrefix}.display.schema must be tutorscript-sparc/2.0`);
    }
    if (!Array.isArray(display.nodes) || display.nodes.length === 0) {
      errors.push(`${pagePrefix}.display.nodes must contain the AutoTutor dialogue nodes`);
    }
    if (!Array.isArray(display.productionRules) || display.productionRules.length === 0) {
      errors.push(`${pagePrefix}.display.productionRules must contain canonical SPARC AutoTutor rules`);
    } else {
      const ruleIds = display.productionRules
        .filter(isRecord)
        .map((rule) => rule.id)
        .filter(nonEmptyString);
      const expectedRuleIds = [
        'dialogue.completion.summary',
        'dialogue.scaffold.pump',
        'dialogue.scaffold.prompt',
        'dialogue.scaffold.hint',
        'dialogue.scaffold.assertion',
      ];
      if (JSON.stringify(ruleIds) !== JSON.stringify(expectedRuleIds)) {
        errors.push(`${pagePrefix}.display.productionRules must contain exactly the canonical progressive-scaffolding-v1 rules`);
      }
    }
    const instructionalController = isRecord(display.instructionalController)
      ? display.instructionalController
      : undefined;
    if (
      !instructionalController
      || instructionalController.adapterId !== 'sparc-autotutor-v1'
      || instructionalController.policyId !== 'progressive-scaffolding-v1'
      || instructionalController.policyVersion !== 1
    ) {
      errors.push(`${pagePrefix}.display.instructionalController must select sparc-autotutor-v1 and progressive-scaffolding-v1 version 1`);
    }
    validateSparcAutoTutorTargets(display, clusters, `${pagePrefix}.display`, errors);
  });
}

export type AutoTutorScoreEnvelope = {
  expectationScores: Record<string, AutoTutorExpectationScore>;
  misconceptionScores: Record<string, AutoTutorMisconceptionScore>;
  answerQuality: 'low' | 'partial' | 'high';
  learnerContribution: AutoTutorLearnerContributionScore;
  learnerQuestion: AutoTutorLearnerQuestionScore;
};

export type AutoTutorUtteranceEnvelope = {
  targetType: AutoTutorTargetType;
  targetId?: string;
  selectedMove: AutoTutorMove;
  tutorMessage: string;
};

export type AutoTutorScoreParseOptions = {
  scoreableExpectationIds?: readonly string[];
  frozenExpectationIds?: readonly string[];
};

const ANSWER_QUALITIES = new Set(['low', 'partial', 'high']);
const LEARNER_CONTRIBUTION_TYPES = new Set([
  'assertion',
  'idk',
  'help_request',
  'uncertainty',
  'affect',
  'meta',
  'question',
  'off_task',
]);
const SELECTED_MOVES = new Set([
  'feedback',
  'pump',
  'hint',
  'prompt',
  'assertion',
  'correction',
  'answer_question',
  'question_prompt',
  'final_answer_prompt',
  'summary',
]);

const TARGET_TYPES = new Set(['expectation', 'misconception', 'learner_question', 'completion']);

function parseMaybeJsonObject(value: unknown): unknown {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    throw new Error('AutoTutor response envelope must be a JSON object string');
  }
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced?.[1] || trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error('AutoTutor response envelope is not valid JSON');
  }
}

function requireScore(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`AutoTutor score response ${fieldName} must be a number from 0 to 1`);
  }
  return value;
}

function parseExpectationScores(
  value: unknown,
  options: AutoTutorScoreParseOptions = {},
): Record<string, AutoTutorExpectationScore> {
  if (!isRecord(value)) {
    throw new Error('AutoTutor score response expectationScores must be an object');
  }
  const hasScoreScope = options.scoreableExpectationIds !== undefined;
  const scoreableIds = new Set(options.scoreableExpectationIds || []);
  const frozenIds = new Set(options.frozenExpectationIds || []);
  const parsed: Record<string, AutoTutorExpectationScore> = {};
  for (const [id, score] of Object.entries(value)) {
    if (hasScoreScope && !scoreableIds.has(id)) {
      if (frozenIds.has(id)) {
        continue;
      }
      throw new Error(`AutoTutor score response included unscoreable expectation "${id}"`);
    }
    if (!isRecord(score)) {
      throw new Error(`AutoTutor score response expectationScores.${id}.current must be boolean`);
    }
    const coverage = requireScore(score.coverage, `expectationScores.${id}.coverage`);
    const current = typeof score.current === 'boolean'
      ? score.current
      : coverage > 0;
    let missing: string[] | undefined;
    if (score.missing !== undefined) {
      if (!Array.isArray(score.missing) || score.missing.some((entry) => typeof entry !== 'string')) {
        throw new Error(`AutoTutor score response expectationScores.${id}.missing must be a string array`);
      }
      missing = score.missing;
    }
    parsed[id] = {
      current,
      coverage,
      ...(typeof score.evidence === 'string' ? { evidence: score.evidence } : {}),
      ...(missing ? { missing } : {}),
      ...(typeof score.tutoredByAssertion === 'boolean' ? { tutoredByAssertion: score.tutoredByAssertion } : {}),
      ...(typeof score.learnerRestatedAfterAssertion === 'boolean' ? { learnerRestatedAfterAssertion: score.learnerRestatedAfterAssertion } : {}),
      frontier: 0,
      coherence: 0,
      centrality: 0,
      priority: 0,
    };
  }
  if (hasScoreScope) {
    for (const id of scoreableIds) {
      if (!Object.prototype.hasOwnProperty.call(parsed, id)) {
        throw new Error(`AutoTutor score response omitted expectation "${id}"`);
      }
    }
  }
  return parsed;
}

function parseMisconceptionScores(value: unknown): Record<string, AutoTutorMisconceptionScore> {
  if (!isRecord(value)) {
    throw new Error('AutoTutor score response misconceptionScores must be an object');
  }
  const parsed: Record<string, AutoTutorMisconceptionScore> = {};
  for (const [id, score] of Object.entries(value)) {
    if (!isRecord(score) || typeof score.current !== 'boolean') {
      throw new Error(`AutoTutor score response misconceptionScores.${id}.current must be boolean`);
    }
    if (score.repaired !== undefined && typeof score.repaired !== 'boolean') {
      throw new Error(`AutoTutor score response misconceptionScores.${id}.repaired must be boolean when present`);
    }
    if (score.repaired === true && score.current !== false) {
      throw new Error(`AutoTutor score response misconceptionScores.${id} cannot be both current and repaired`);
    }
    parsed[id] = {
      current: score.current,
      confidence: requireScore(score.confidence, `misconceptionScores.${id}.confidence`),
      ...(typeof score.evidence === 'string' ? { evidence: score.evidence } : {}),
      ...(typeof score.repaired === 'boolean' ? { repaired: score.repaired } : {}),
      ...(typeof score.repairEvidence === 'string' ? { repairEvidence: score.repairEvidence } : {}),
    };
  }
  return parsed;
}

function parseLearnerContribution(value: unknown): AutoTutorLearnerContributionScore {
  if (!isRecord(value)) {
    throw new Error('AutoTutor score response learnerContribution must be an object');
  }
  if (typeof value.type !== 'string' || !LEARNER_CONTRIBUTION_TYPES.has(value.type)) {
    throw new Error('AutoTutor score response learnerContribution.type is invalid');
  }
  return {
    type: value.type as AutoTutorLearnerContributionScore['type'],
    confidence: requireScore(value.confidence, 'learnerContribution.confidence'),
    ...(typeof value.evidence === 'string' ? { evidence: value.evidence } : {}),
  };
}

export function parseAutoTutorScoreEnvelope(
  value: unknown,
  options: AutoTutorScoreParseOptions = {},
): AutoTutorScoreEnvelope {
  const parsed = parseMaybeJsonObject(value);
  if (!isRecord(parsed)) {
    throw new Error('AutoTutor score response envelope must be a JSON object');
  }
  const answerQuality = parsed.answerQuality;
  if (typeof answerQuality !== 'string' || !ANSWER_QUALITIES.has(answerQuality)) {
    throw new Error('AutoTutor score response answerQuality is invalid');
  }
  if (!isRecord(parsed.learnerQuestion) || typeof parsed.learnerQuestion.current !== 'boolean') {
    throw new Error('AutoTutor score response learnerQuestion.current must be boolean');
  }
  const answerableFromAuthoredContent = typeof parsed.learnerQuestion.answerableFromAuthoredContent === 'boolean'
    ? parsed.learnerQuestion.answerableFromAuthoredContent
    : false;
  if (
    parsed.learnerQuestion.current &&
    typeof parsed.learnerQuestion.answerableFromAuthoredContent !== 'boolean'
  ) {
    throw new Error('AutoTutor score response learnerQuestion.answerableFromAuthoredContent must be boolean');
  }

  return {
    expectationScores: parseExpectationScores(parsed.expectationScores, options),
    misconceptionScores: parseMisconceptionScores(parsed.misconceptionScores),
    answerQuality: answerQuality as AutoTutorScoreEnvelope['answerQuality'],
    learnerContribution: parseLearnerContribution(parsed.learnerContribution),
    learnerQuestion: {
      current: parsed.learnerQuestion.current,
      answerableFromAuthoredContent,
      ...(typeof parsed.learnerQuestion.evidence === 'string' ? { evidence: parsed.learnerQuestion.evidence } : {}),
    },
  };
}

export function parseAutoTutorUtteranceEnvelope(value: unknown): AutoTutorUtteranceEnvelope {
  const parsed = parseMaybeJsonObject(value);
  if (!isRecord(parsed)) {
    throw new Error('AutoTutor utterance response envelope must be a JSON object');
  }
  if (!nonEmptyString(parsed.tutorMessage)) {
    throw new Error('AutoTutor utterance response requires non-empty tutorMessage');
  }
  if (containsInternalRubricId(parsed.tutorMessage)) {
    throw new Error('AutoTutor utterance response tutorMessage must not expose internal expectation or misconception IDs');
  }
  if (typeof parsed.targetType !== 'string' || !TARGET_TYPES.has(parsed.targetType)) {
    throw new Error('AutoTutor utterance response targetType is invalid');
  }
  if (typeof parsed.selectedMove !== 'string' || !SELECTED_MOVES.has(parsed.selectedMove)) {
    throw new Error('AutoTutor utterance response selectedMove is invalid');
  }
  if (parsed.targetId !== undefined && parsed.targetId !== null && typeof parsed.targetId !== 'string') {
    throw new Error('AutoTutor utterance response targetId must be string or null when present');
  }
  return {
    targetType: parsed.targetType as AutoTutorTargetType,
    ...(typeof parsed.targetId === 'string' ? { targetId: parsed.targetId } : {}),
    selectedMove: parsed.selectedMove as AutoTutorMove,
    tutorMessage: parsed.tutorMessage,
  };
}

export const AUTO_TUTOR_SCORE_ENVELOPE_SCHEMA = Object.freeze({
  expectationScores: {
    '<expectationId>': {
      current: 'boolean',
      coverage: 'number 0..1',
      evidence: 'string optional',
      missing: 'string[] optional',
      tutoredByAssertion: 'boolean optional',
      learnerRestatedAfterAssertion: 'boolean optional',
    },
  },
  misconceptionScores: {
    '<misconceptionId>': {
      current: 'boolean',
      confidence: 'number 0..1',
      evidence: 'string optional',
      repaired: 'boolean optional; true only when the latest learner answer repaired this misconception',
      repairEvidence: 'string optional',
    },
  },
  answerQuality: 'low | partial | high',
  learnerContribution: {
    type: 'assertion | idk | help_request | uncertainty | affect | meta | question | off_task',
    confidence: 'number 0..1',
    evidence: 'string optional',
  },
  learnerQuestion: {
    current: 'boolean',
    answerableFromAuthoredContent: 'boolean',
    evidence: 'string optional',
  },
});

export const AUTO_TUTOR_UTTERANCE_ENVELOPE_SCHEMA = Object.freeze({
  targetType: 'expectation | misconception | learner_question | completion',
  targetId: 'string | null',
  selectedMove: 'feedback | pump | hint | prompt | assertion | correction | answer_question | question_prompt | final_answer_prompt | summary',
  tutorMessage: 'string',
});
