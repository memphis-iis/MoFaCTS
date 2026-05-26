import {
  validatePlannerState,
  type AutoTutorLearnerContributionScore,
  type AutoTutorMove,
  type AutoTutorPlannerState,
} from '../../../mofacts/common/lib/autoTutorPlanner';
import { isAutoTutorEndReason, type AutoTutorEndReason } from './AutoTutorEndState';

export const AUTO_TUTOR_LEARNER_CONTRIBUTION_TYPES = new Set([
  'assertion',
  'idk',
  'help_request',
  'uncertainty',
  'affect',
  'meta',
  'question',
  'off_task',
]);

export type AutoTutorSavedStateShape = {
  expectations: AutoTutorPlannerState['expectationScores'];
  misconceptions: AutoTutorPlannerState['misconceptionScores'];
  planner: AutoTutorPlannerState;
  answerQuality: 'low' | 'partial' | 'high' | 'none';
  learnerContribution: AutoTutorLearnerContributionScore | null;
  studentAskedQuestion: boolean;
  selectedMove: AutoTutorMove | '';
  turnCount: number;
  costUsd: number;
  completed: boolean;
  mastered: boolean;
  endReason: AutoTutorEndReason;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredScore(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`AutoTutor saved history ${field} must be a number from 0 to 1`);
  }
  return value;
}

function validateSavedExpectationScores(
  value: unknown,
  expectedIds: string[],
): AutoTutorSavedStateShape['expectations'] {
  const fieldName = 'expectations';
  if (!isRecord(value)) {
    throw new Error(`AutoTutor saved history state.${fieldName} must be an object`);
  }
  const returnedIds = Object.keys(value);
  for (const id of expectedIds) {
    if (!returnedIds.includes(id)) {
      throw new Error(`AutoTutor saved history omitted ${fieldName.slice(0, -1)} "${id}"`);
    }
  }
  for (const id of returnedIds) {
    if (!expectedIds.includes(id)) {
      throw new Error(`AutoTutor saved history included unknown ${fieldName.slice(0, -1)} "${id}"`);
    }
  }

  const parsed: AutoTutorSavedStateShape['expectations'] = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry) || typeof entry.current !== 'boolean') {
      throw new Error(`AutoTutor saved history state.${fieldName}.${id}.current must be boolean`);
    }
    let missing: string[] | undefined;
    if (entry.missing !== undefined) {
      if (!Array.isArray(entry.missing) || entry.missing.some((item) => typeof item !== 'string')) {
        throw new Error(`AutoTutor saved history state.${fieldName}.${id}.missing must be a string array`);
      }
      missing = entry.missing;
    }
    parsed[id] = {
      current: entry.current,
      coverage: requiredScore(entry.coverage, `state.${fieldName}.${id}.coverage`),
      ...(typeof entry.evidence === 'string' ? { evidence: entry.evidence } : {}),
      ...(missing ? { missing } : {}),
      ...(typeof entry.tutoredByAssertion === 'boolean' ? { tutoredByAssertion: entry.tutoredByAssertion } : {}),
      ...(typeof entry.learnerRestatedAfterAssertion === 'boolean' ? { learnerRestatedAfterAssertion: entry.learnerRestatedAfterAssertion } : {}),
      frontier: requiredScore(entry.frontier, `state.${fieldName}.${id}.frontier`),
      coherence: requiredScore(entry.coherence, `state.${fieldName}.${id}.coherence`),
      centrality: requiredScore(entry.centrality, `state.${fieldName}.${id}.centrality`),
      priority: requiredScore(entry.priority, `state.${fieldName}.${id}.priority`),
    };
  }
  return parsed;
}

function validateSavedMisconceptionScores(
  value: unknown,
  expectedIds: string[],
): AutoTutorSavedStateShape['misconceptions'] {
  const fieldName = 'misconceptions';
  if (!isRecord(value)) {
    throw new Error(`AutoTutor saved history state.${fieldName} must be an object`);
  }
  const returnedIds = Object.keys(value);
  for (const id of expectedIds) {
    if (!returnedIds.includes(id)) {
      throw new Error(`AutoTutor saved history omitted ${fieldName.slice(0, -1)} "${id}"`);
    }
  }
  for (const id of returnedIds) {
    if (!expectedIds.includes(id)) {
      throw new Error(`AutoTutor saved history included unknown ${fieldName.slice(0, -1)} "${id}"`);
    }
  }

  const parsed: AutoTutorSavedStateShape['misconceptions'] = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry) || typeof entry.current !== 'boolean') {
      throw new Error(`AutoTutor saved history state.${fieldName}.${id}.current must be boolean`);
    }
    parsed[id] = {
      current: entry.current,
      confidence: requiredScore(entry.confidence, `state.${fieldName}.${id}.confidence`),
      ...(typeof entry.evidence === 'string' ? { evidence: entry.evidence } : {}),
      ...(typeof entry.repaired === 'boolean' ? { repaired: entry.repaired } : {}),
      ...(typeof entry.repairEvidence === 'string' ? { repairEvidence: entry.repairEvidence } : {}),
    };
  }
  return parsed;
}

function validateSavedLearnerContribution(value: unknown): AutoTutorLearnerContributionScore | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error('AutoTutor saved history state.learnerContribution must be an object when present');
  }
  if (typeof value.type !== 'string' || !AUTO_TUTOR_LEARNER_CONTRIBUTION_TYPES.has(value.type)) {
    throw new Error('AutoTutor saved history state.learnerContribution.type is invalid');
  }
  return {
    type: value.type as AutoTutorLearnerContributionScore['type'],
    confidence: requiredScore(value.confidence, 'state.learnerContribution.confidence'),
    ...(typeof value.evidence === 'string' ? { evidence: value.evidence } : {}),
  };
}

function validateSavedPlannerState(
  value: unknown,
  expectedState: Pick<AutoTutorSavedStateShape, 'expectations' | 'misconceptions'>,
): AutoTutorPlannerState {
  if (!isRecord(value)) {
    throw new Error('AutoTutor saved history state.planner must be an object');
  }
  const planner = value as AutoTutorPlannerState;
  validatePlannerState({
    expectations: Object.keys(expectedState.expectations).map((id) => ({ id, proposition: id, assertion: id })),
    misconceptions: Object.keys(expectedState.misconceptions).map((id) => ({ id, correction: id, repairQuestion: id })),
    dialogPolicy: { requiredExpectations: Object.keys(expectedState.expectations) },
    summary: '',
  }, planner);
  return planner;
}

export function validateAutoTutorSavedState(
  state: AutoTutorSavedStateShape,
  expectedState: Pick<AutoTutorSavedStateShape, 'expectations' | 'misconceptions'>,
): AutoTutorSavedStateShape {
  const answerQuality = state.answerQuality;
  if (!['low', 'partial', 'high', 'none'].includes(answerQuality)) {
    throw new Error('AutoTutor saved history state.answerQuality is invalid');
  }
  if (typeof state.studentAskedQuestion !== 'boolean') {
    throw new Error('AutoTutor saved history state.studentAskedQuestion must be boolean');
  }
  if (typeof state.selectedMove !== 'string') {
    throw new Error('AutoTutor saved history state.selectedMove must be string');
  }
  if (!Number.isInteger(state.turnCount) || state.turnCount < 0) {
    throw new Error('AutoTutor saved history state.turnCount must be a non-negative integer');
  }
  if (typeof state.costUsd !== 'number' || !Number.isFinite(state.costUsd) || state.costUsd < 0) {
    throw new Error('AutoTutor saved history state.costUsd must be a non-negative number');
  }
  if (typeof state.completed !== 'boolean') {
    throw new Error('AutoTutor saved history state.completed must be boolean');
  }
  if (typeof state.mastered !== 'boolean') {
    throw new Error('AutoTutor saved history state.mastered must be boolean');
  }
  if (!isAutoTutorEndReason(state.endReason)) {
    throw new Error('AutoTutor saved history state.endReason is invalid');
  }
  const expectations = validateSavedExpectationScores(state.expectations, Object.keys(expectedState.expectations));
  const misconceptions = validateSavedMisconceptionScores(state.misconceptions, Object.keys(expectedState.misconceptions));
  const learnerContribution = validateSavedLearnerContribution(state.learnerContribution);
  const planner = validateSavedPlannerState(state.planner, expectedState);

  return {
    expectations,
    misconceptions,
    planner,
    answerQuality,
    learnerContribution,
    studentAskedQuestion: state.studentAskedQuestion,
    selectedMove: state.selectedMove as AutoTutorMove | '',
    turnCount: state.turnCount,
    costUsd: state.costUsd,
    completed: state.completed,
    mastered: state.mastered,
    endReason: state.endReason,
  };
}
