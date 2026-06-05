import {
  validatePlannerState,
  type AutoTutorLearnerContributionScore,
  type AutoTutorMove,
  type AutoTutorPlannerState,
} from './AutoTutorPlanner';
import { isAutoTutorEndReason, type AutoTutorEndReason } from './AutoTutorEndState';
import type {
  AutoTutorOperationalPhase,
  AutoTutorPedagogicalState,
  AutoTutorTransition,
} from './AutoTutorStateMachine';

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
  operationalPhase: AutoTutorOperationalPhase;
  pedagogicalState: AutoTutorPedagogicalState;
  transitions: AutoTutorTransition[];
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
  stoppedByCost: boolean;
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

const AUTO_TUTOR_OPERATIONAL_PHASES = new Set([
  'initializing',
  'awaiting_learner',
  'scoring_learner',
  'planning_next_move',
  'generating_tutor_response',
  'writing_history',
  'publishing_state',
  'completed_mastery',
  'completed_max_turns',
  'completed_cost_cap',
  'errored',
]);

const AUTO_TUTOR_PEDAGOGICAL_TARGET_TYPES = new Set([
  'expectation',
  'misconception',
  'learner_question',
  'completion',
]);

const AUTO_TUTOR_RESUMABLE_OPERATIONAL_PHASES = new Set([
  'awaiting_learner',
  'completed_mastery',
  'completed_max_turns',
  'completed_cost_cap',
]);

const AUTO_TUTOR_TRANSIENT_OPERATIONAL_PHASES = new Set([
  'initializing',
  'scoring_learner',
  'planning_next_move',
  'generating_tutor_response',
  'writing_history',
  'publishing_state',
]);

const AUTO_TUTOR_LEARNER_QUESTION_SCOPES = new Set([
  'in_scope',
  'out_of_scope',
  'not_question',
]);

const AUTO_TUTOR_COMPLETION_STAGES = new Set([
  'not_ready',
  'ready_for_final_answer',
  'requesting_final_answer',
  'summarizing',
  'mastered',
]);

function validateSavedOperationalPhase(value: unknown, field = 'state.operationalPhase'): AutoTutorOperationalPhase {
  if (typeof value !== 'string' || !AUTO_TUTOR_OPERATIONAL_PHASES.has(value)) {
    throw new Error(`AutoTutor saved history ${field} is invalid`);
  }
  return value as AutoTutorOperationalPhase;
}

function validateSavedPedagogicalState(
  value: unknown,
  expectedState: Pick<AutoTutorSavedStateShape, 'expectations' | 'misconceptions'>,
): AutoTutorPedagogicalState {
  if (!isRecord(value) || typeof value.targetType !== 'string' || !AUTO_TUTOR_PEDAGOGICAL_TARGET_TYPES.has(value.targetType)) {
    throw new Error('AutoTutor saved history state.pedagogicalState is invalid');
  }
  if (typeof value.selectedMove !== 'string') {
    throw new Error('AutoTutor saved history state.pedagogicalState.selectedMove must be string');
  }
  if (value.targetId !== undefined && typeof value.targetId !== 'string') {
    throw new Error('AutoTutor saved history state.pedagogicalState.targetId must be string when present');
  }
  if (value.targetType === 'expectation') {
    if (!['pump', 'hint', 'prompt', 'assertion'].includes(value.selectedMove)) {
      throw new Error('AutoTutor saved history state.pedagogicalState.selectedMove is invalid for expectation');
    }
    if (value.targetId !== undefined && !Object.keys(expectedState.expectations).includes(value.targetId)) {
      throw new Error(`AutoTutor saved history state.pedagogicalState.targetId references unknown expectation "${value.targetId}"`);
    }
    if (typeof value.focusTurnCount !== 'number' || !Number.isInteger(value.focusTurnCount) || value.focusTurnCount < 0) {
      throw new Error('AutoTutor saved history state.pedagogicalState.focusTurnCount must be a non-negative integer');
    }
    if (typeof value.moveCycleIndex !== 'number' || !Number.isInteger(value.moveCycleIndex) || value.moveCycleIndex < 0) {
      throw new Error('AutoTutor saved history state.pedagogicalState.moveCycleIndex must be a non-negative integer');
    }
    return value as AutoTutorPedagogicalState;
  }
  if (value.targetType === 'misconception') {
    if (typeof value.targetId !== 'string' || !Object.keys(expectedState.misconceptions).includes(value.targetId)) {
      throw new Error('AutoTutor saved history state.pedagogicalState misconception requires a valid targetId');
    }
    if (value.selectedMove !== 'correction') {
      throw new Error('AutoTutor saved history state.pedagogicalState.selectedMove is invalid for misconception');
    }
    if (!['hint', 'prompt', 'assertion'].includes(String(value.correctionStage))) {
      throw new Error('AutoTutor saved history state.pedagogicalState.correctionStage is invalid');
    }
    return value as AutoTutorPedagogicalState;
  }
  if (value.targetType === 'learner_question') {
    if (value.selectedMove !== 'answer_question') {
      throw new Error('AutoTutor saved history state.pedagogicalState.selectedMove is invalid for learner question');
    }
    if (typeof value.questionScope !== 'string' || !AUTO_TUTOR_LEARNER_QUESTION_SCOPES.has(value.questionScope)) {
      throw new Error('AutoTutor saved history state.pedagogicalState.questionScope is invalid');
    }
    if (typeof value.answerableFromAuthoredContent !== 'boolean') {
      throw new Error('AutoTutor saved history state.pedagogicalState.answerableFromAuthoredContent must be boolean');
    }
    return value as AutoTutorPedagogicalState;
  }
  if (!['', 'final_answer_prompt', 'summary'].includes(value.selectedMove)) {
    throw new Error('AutoTutor saved history state.pedagogicalState.selectedMove is invalid for completion');
  }
  if (typeof value.completionStage !== 'string' || !AUTO_TUTOR_COMPLETION_STAGES.has(value.completionStage)) {
    throw new Error('AutoTutor saved history state.pedagogicalState.completionStage is invalid');
  }
  return value as AutoTutorPedagogicalState;
}

function validateSavedTransitions(value: unknown): AutoTutorTransition[] {
  if (!Array.isArray(value)) {
    throw new Error('AutoTutor saved history state.transitions must be an array');
  }
  return value.map((transition, index) => {
    if (!isRecord(transition)) {
      throw new Error(`AutoTutor saved history state.transitions[${index}] must be an object`);
    }
    const from = validateSavedOperationalPhase(transition.from, `state.transitions[${index}].from`);
    const to = validateSavedOperationalPhase(transition.to, `state.transitions[${index}].to`);
    if (typeof transition.reason !== 'string') {
      throw new Error(`AutoTutor saved history state.transitions[${index}].reason must be string`);
    }
    if (typeof transition.at !== 'number' || !Number.isFinite(transition.at)) {
      throw new Error(`AutoTutor saved history state.transitions[${index}].at must be a finite number`);
    }
    return {
      from,
      to,
      reason: transition.reason,
      at: transition.at,
    };
  });
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

function expectedOperationalPhase(endReason: AutoTutorEndReason): AutoTutorOperationalPhase {
  if (endReason === 'mastery') {
    return 'completed_mastery';
  }
  if (endReason === 'max_turns') {
    return 'completed_max_turns';
  }
  if (endReason === 'cost_cap') {
    return 'completed_cost_cap';
  }
  return 'awaiting_learner';
}

function validateSavedEndStateInvariants(state: AutoTutorSavedStateShape, operationalPhase: AutoTutorOperationalPhase): void {
  if (!AUTO_TUTOR_RESUMABLE_OPERATIONAL_PHASES.has(operationalPhase)) {
    if (AUTO_TUTOR_TRANSIENT_OPERATIONAL_PHASES.has(operationalPhase)) {
      throw new Error(`AutoTutor saved history state.operationalPhase cannot resume from transient phase "${operationalPhase}"`);
    }
    throw new Error(`AutoTutor saved history state.operationalPhase is not resumable: ${operationalPhase}`);
  }
  const expectedPhase = expectedOperationalPhase(state.endReason);
  if (operationalPhase !== expectedPhase) {
    throw new Error(`AutoTutor saved history state.operationalPhase "${operationalPhase}" does not match endReason "${state.endReason}"`);
  }
  if (state.endReason === 'in_progress') {
    if (state.completed || state.mastered || state.stoppedByCost) {
      throw new Error('AutoTutor saved history in-progress flags must all be false');
    }
    return;
  }
  if (!state.completed) {
    throw new Error('AutoTutor saved history terminal state must be completed');
  }
  if (state.endReason === 'mastery') {
    if (!state.mastered || state.stoppedByCost) {
      throw new Error('AutoTutor saved history mastery flags are contradictory');
    }
    return;
  }
  if (state.endReason === 'cost_cap') {
    if (state.mastered || !state.stoppedByCost) {
      throw new Error('AutoTutor saved history cost-cap flags are contradictory');
    }
    return;
  }
  if (state.mastered || state.stoppedByCost) {
    throw new Error('AutoTutor saved history max-turn flags are contradictory');
  }
}

function validateSelectedMoveForPedagogicalState(
  selectedMove: string,
  pedagogicalState: AutoTutorPedagogicalState,
): AutoTutorMove | '' {
  if (selectedMove !== pedagogicalState.selectedMove) {
    throw new Error('AutoTutor saved history state.selectedMove does not match pedagogicalState.selectedMove');
  }
  return selectedMove as AutoTutorMove | '';
}

export function validateAutoTutorSavedState(
  state: AutoTutorSavedStateShape,
  expectedState: Pick<AutoTutorSavedStateShape, 'expectations' | 'misconceptions'>,
): AutoTutorSavedStateShape {
  const operationalPhase = validateSavedOperationalPhase(state.operationalPhase);
  const pedagogicalState = validateSavedPedagogicalState(state.pedagogicalState, expectedState);
  const transitions = validateSavedTransitions(state.transitions);
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
  if (typeof state.stoppedByCost !== 'boolean') {
    throw new Error('AutoTutor saved history state.stoppedByCost must be boolean');
  }
  validateSavedEndStateInvariants(state, operationalPhase);
  const expectations = validateSavedExpectationScores(state.expectations, Object.keys(expectedState.expectations));
  const misconceptions = validateSavedMisconceptionScores(state.misconceptions, Object.keys(expectedState.misconceptions));
  const learnerContribution = validateSavedLearnerContribution(state.learnerContribution);
  const planner = validateSavedPlannerState(state.planner, expectedState);
  const selectedMove = validateSelectedMoveForPedagogicalState(state.selectedMove, pedagogicalState);

  return {
    operationalPhase,
    pedagogicalState,
    transitions,
    expectations,
    misconceptions,
    planner,
    answerQuality,
    learnerContribution,
    studentAskedQuestion: state.studentAskedQuestion,
    selectedMove,
    turnCount: state.turnCount,
    costUsd: state.costUsd,
    completed: state.completed,
    mastered: state.mastered,
    endReason: state.endReason,
    stoppedByCost: state.stoppedByCost,
  };
}
