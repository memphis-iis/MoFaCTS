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

function validateGraduation(graduation: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(graduation)) {
    errors.push(`${prefix}.graduation must be an object`);
    return;
  }
  const minExpectationScore = graduation.minExpectationScore;
  if (typeof minExpectationScore !== 'number' || minExpectationScore < 0 || minExpectationScore > 1) {
    errors.push(`${prefix}.graduation.minExpectationScore must be a number from 0 to 1`);
  }
  if (typeof graduation.requireNoCurrentMisconceptions !== 'boolean') {
    errors.push(`${prefix}.graduation.requireNoCurrentMisconceptions must be boolean`);
  }
  if (!Number.isInteger(graduation.maxTurns) || Number(graduation.maxTurns) < 1) {
    errors.push(`${prefix}.graduation.maxTurns must be a positive integer`);
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

    validateGraduation(session.graduation, unitPrefix, errors);

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
    validateAutoTutorScript(firstStim.autoTutor, stimPrefix, errors);
  }

  return { valid: errors.length === 0, errors };
}

export type AutoTutorResponseEnvelope = {
  tutorMessage: string;
  stateUpdate: {
    expectations: Record<string, { current: boolean; evidence?: string }>;
    misconceptions: Record<string, { current: boolean; evidence?: string }>;
    answerQuality: 'low' | 'partial' | 'high';
    studentAskedQuestion: boolean;
    selectedMove: 'feedback' | 'pump' | 'hint' | 'prompt' | 'assertion' | 'correction' | 'answer_question' | 'summary';
  };
};

const ANSWER_QUALITIES = new Set(['low', 'partial', 'high']);
const SELECTED_MOVES = new Set([
  'feedback',
  'pump',
  'hint',
  'prompt',
  'assertion',
  'correction',
  'answer_question',
  'summary',
]);

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

function parseStateMap(value: unknown, fieldName: string): Record<string, { current: boolean; evidence?: string }> {
  if (!isRecord(value)) {
    throw new Error(`AutoTutor response stateUpdate.${fieldName} must be an object`);
  }
  const parsed: Record<string, { current: boolean; evidence?: string }> = {};
  for (const [id, state] of Object.entries(value)) {
    if (!isRecord(state) || typeof state.current !== 'boolean') {
      throw new Error(`AutoTutor response stateUpdate.${fieldName}.${id}.current must be boolean`);
    }
    parsed[id] = {
      current: state.current,
      ...(typeof state.evidence === 'string' ? { evidence: state.evidence } : {}),
    };
  }
  return parsed;
}

export function parseAutoTutorResponseEnvelope(value: unknown): AutoTutorResponseEnvelope {
  const parsed = parseMaybeJsonObject(value);
  if (!isRecord(parsed)) {
    throw new Error('AutoTutor response envelope must be a JSON object');
  }
  if (!nonEmptyString(parsed.tutorMessage)) {
    throw new Error('AutoTutor response envelope requires non-empty tutorMessage');
  }
  if (!isRecord(parsed.stateUpdate)) {
    throw new Error('AutoTutor response envelope requires stateUpdate object');
  }
  const answerQuality = parsed.stateUpdate.answerQuality;
  if (typeof answerQuality !== 'string' || !ANSWER_QUALITIES.has(answerQuality)) {
    throw new Error('AutoTutor response stateUpdate.answerQuality is invalid');
  }
  const selectedMove = parsed.stateUpdate.selectedMove;
  if (typeof selectedMove !== 'string' || !SELECTED_MOVES.has(selectedMove)) {
    throw new Error('AutoTutor response stateUpdate.selectedMove is invalid');
  }
  if (typeof parsed.stateUpdate.studentAskedQuestion !== 'boolean') {
    throw new Error('AutoTutor response stateUpdate.studentAskedQuestion must be boolean');
  }

  return {
    tutorMessage: parsed.tutorMessage,
    stateUpdate: {
      expectations: parseStateMap(parsed.stateUpdate.expectations, 'expectations'),
      misconceptions: parseStateMap(parsed.stateUpdate.misconceptions, 'misconceptions'),
      answerQuality: answerQuality as AutoTutorResponseEnvelope['stateUpdate']['answerQuality'],
      studentAskedQuestion: parsed.stateUpdate.studentAskedQuestion,
      selectedMove: selectedMove as AutoTutorResponseEnvelope['stateUpdate']['selectedMove'],
    },
  };
}

export const AUTO_TUTOR_RESPONSE_ENVELOPE_SCHEMA = Object.freeze({
  tutorMessage: 'string',
  stateUpdate: {
    expectations: {
      '<expectationId>': { current: 'boolean', evidence: 'string optional' },
    },
    misconceptions: {
      '<misconceptionId>': { current: 'boolean', evidence: 'string optional' },
    },
    answerQuality: 'low | partial | high',
    studentAskedQuestion: 'boolean',
    selectedMove: 'feedback | pump | hint | prompt | assertion | correction | answer_question | summary',
  },
});
