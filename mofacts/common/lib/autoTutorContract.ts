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

function getStimClusters(stimuli: unknown): unknown[] {
  if (!isRecord(stimuli) || !isRecord(stimuli.setspec) || !Array.isArray(stimuli.setspec.clusters)) {
    return [];
  }
  return stimuli.setspec.clusters;
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
  if (autoTutorUnits.length === 0) {
    return { valid: true, errors };
  }

  const setspec = isRecord(tutor.setspec) ? tutor.setspec : {};
  if (!nonEmptyString(setspec.openRouterApiKey)) {
    errors.push('tutor.setspec.openRouterApiKey is required for AutoTutor units');
  }

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
      session.requireFinalAnswerPrompt !== undefined &&
      typeof session.requireFinalAnswerPrompt !== 'boolean'
    ) {
      errors.push(`${unitPrefix}.requireFinalAnswerPrompt must be boolean`);
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

  return { valid: errors.length === 0, errors };
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

function parseExpectationScores(value: unknown): Record<string, AutoTutorExpectationScore> {
  if (!isRecord(value)) {
    throw new Error('AutoTutor score response expectationScores must be an object');
  }
  const parsed: Record<string, AutoTutorExpectationScore> = {};
  for (const [id, score] of Object.entries(value)) {
    if (!isRecord(score) || typeof score.current !== 'boolean') {
      throw new Error(`AutoTutor score response expectationScores.${id}.current must be boolean`);
    }
    let missing: string[] | undefined;
    if (score.missing !== undefined) {
      if (!Array.isArray(score.missing) || score.missing.some((entry) => typeof entry !== 'string')) {
        throw new Error(`AutoTutor score response expectationScores.${id}.missing must be a string array`);
      }
      missing = score.missing;
    }
    parsed[id] = {
      current: score.current,
      coverage: requireScore(score.coverage, `expectationScores.${id}.coverage`),
      ...(typeof score.evidence === 'string' ? { evidence: score.evidence } : {}),
      ...(missing ? { missing } : {}),
      ...(typeof score.tutoredByAssertion === 'boolean' ? { tutoredByAssertion: score.tutoredByAssertion } : {}),
      ...(typeof score.learnerRestatedAfterAssertion === 'boolean' ? { learnerRestatedAfterAssertion: score.learnerRestatedAfterAssertion } : {}),
      frontier: requireScore(score.frontier, `expectationScores.${id}.frontier`),
      coherence: requireScore(score.coherence, `expectationScores.${id}.coherence`),
      centrality: requireScore(score.centrality, `expectationScores.${id}.centrality`),
      priority: requireScore(score.priority, `expectationScores.${id}.priority`),
    };
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

export function parseAutoTutorScoreEnvelope(value: unknown): AutoTutorScoreEnvelope {
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
  if (typeof parsed.learnerQuestion.answerableFromAuthoredContent !== 'boolean') {
    throw new Error('AutoTutor score response learnerQuestion.answerableFromAuthoredContent must be boolean');
  }

  return {
    expectationScores: parseExpectationScores(parsed.expectationScores),
    misconceptionScores: parseMisconceptionScores(parsed.misconceptionScores),
    answerQuality: answerQuality as AutoTutorScoreEnvelope['answerQuality'],
    learnerContribution: parseLearnerContribution(parsed.learnerContribution),
    learnerQuestion: {
      current: parsed.learnerQuestion.current,
      answerableFromAuthoredContent: parsed.learnerQuestion.answerableFromAuthoredContent,
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
      frontier: 'number 0..1',
      coherence: 'number 0..1',
      centrality: 'number 0..1',
      priority: 'number 0..1',
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
