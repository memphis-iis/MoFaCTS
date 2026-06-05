import {
  AUTO_TUTOR_DEFAULT_THRESHOLDS,
  createInitialAutoTutorPlannerState,
  getScoreableExpectationIds,
  mergeScoreableExpectationScores,
  planAutoTutorTurn,
  preserveRepairedMisconceptionState,
  recomputeExpectationPriorities,
  type AutoTutorLearnerContributionScore,
  type AutoTutorLearnerQuestionScore,
  type AutoTutorMisconceptionScore,
  type AutoTutorMove,
  type AutoTutorPlan,
  type AutoTutorPlannerState,
} from './AutoTutorPlanner';
import type { AutoTutorConfig, AutoTutorScript } from './AutoTutorRuntimeConfig';
import { getRequiredExpectationIds } from './AutoTutorRuntimeConfig';
import {
  applyAutoTutorEndReason,
  type AutoTutorEndReason,
} from './AutoTutorEndState';
import {
  readAutoTutorHistoryNote,
  validateAutoTutorSavedEndState,
  type AutoTutorHistoryNote,
  type AutoTutorHistoryRow,
} from './AutoTutorSavedHistory';
import {
  validateAutoTutorSavedState,
  type AutoTutorSavedStateShape,
} from './AutoTutorSavedState';

export type AutoTutorOperationalPhase =
  | 'initializing'
  | 'awaiting_learner'
  | 'scoring_learner'
  | 'planning_next_move'
  | 'generating_tutor_response'
  | 'writing_history'
  | 'publishing_state'
  | 'completed_mastery'
  | 'completed_max_turns'
  | 'completed_cost_cap'
  | 'errored';

export type AutoTutorLearnerQuestionScope = 'in_scope' | 'out_of_scope' | 'not_question';

export type AutoTutorCompletionStage =
  | 'not_ready'
  | 'ready_for_final_answer'
  | 'requesting_final_answer'
  | 'summarizing'
  | 'mastered';

export type AutoTutorPedagogicalState =
  | {
      targetType: 'expectation';
      targetId?: string;
      selectedMove: Extract<AutoTutorMove, 'pump' | 'hint' | 'prompt' | 'assertion'> | '';
      focusTurnCount: number;
      moveCycleIndex: number;
    }
  | {
      targetType: 'misconception';
      targetId: string;
      selectedMove: 'correction';
      correctionStage: 'hint' | 'prompt' | 'assertion';
    }
  | {
      targetType: 'learner_question';
      selectedMove: 'answer_question';
      questionScope: AutoTutorLearnerQuestionScope;
      answerableFromAuthoredContent: boolean;
    }
  | {
      targetType: 'completion';
      selectedMove: Extract<AutoTutorMove, 'final_answer_prompt' | 'summary'> | '';
      completionStage: AutoTutorCompletionStage;
    };

export type AutoTutorTransition = {
  from: AutoTutorOperationalPhase;
  to: AutoTutorOperationalPhase;
  reason: string;
  at: number;
};

export type AutoTutorDialogueTurn = {
  role: 'student' | 'tutor';
  text: string;
};

export type AutoTutorState = {
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
  dialogue: AutoTutorDialogueTurn[];
};

export type AutoTutorScoreEnvelopeLike = {
  expectationScores: AutoTutorPlannerState['expectationScores'];
  misconceptionScores: Record<string, AutoTutorMisconceptionScore>;
  answerQuality: 'low' | 'partial' | 'high';
  learnerContribution: AutoTutorLearnerContributionScore;
  learnerQuestion: AutoTutorLearnerQuestionScore;
};

export type AutoTutorProgressCounts = {
  coveredExpectations: number;
  requiredExpectations: number;
  neededExpectations: number;
  activeMisconceptions: number;
  totalMisconceptions: number;
  maxActiveMisconceptions: number;
};

export type AutoTutorTurnContext = {
  config: AutoTutorConfig;
  state: AutoTutorState;
  studentAnswer: string;
};

export type AutoTutorPlannedTurn = {
  stateForUtterancePlan: AutoTutorState;
  nextState: AutoTutorState;
  plan: AutoTutorPlan;
  scoreableExpectationIds: string[];
};

export type AutoTutorTurnResult = {
  message: string;
  completed: boolean;
  mastered: boolean;
  endReason: AutoTutorEndReason;
  stoppedByCost: boolean;
};

export const AUTO_TUTOR_COST_CAP_USD = 0.20;
export const AUTO_TUTOR_COST_CAP_MESSAGE = 'This AutoTutor session has reached its cost limit, so I need to stop here.';

export type AutoTutorPublishState = ReturnType<typeof buildAutoTutorPublishState>;
export type AutoTutorSavedHistoryNote = AutoTutorHistoryNote<ReturnType<typeof summarizeAutoTutorState>>;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function completedPhaseForEndReason(endReason: AutoTutorEndReason): AutoTutorOperationalPhase {
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

function pushTransition(
  state: AutoTutorState,
  to: AutoTutorOperationalPhase,
  reason: string,
  at: number = Date.now(),
): void {
  const from = state.operationalPhase;
  if (from === to) {
    return;
  }
  state.transitions.push({ from, to, reason, at });
  state.operationalPhase = to;
}

export function transitionAutoTutorOperationalPhase(
  state: AutoTutorState,
  to: AutoTutorOperationalPhase,
  reason: string,
  at?: number,
): AutoTutorState {
  const nextState = cloneJson(state);
  pushTransition(nextState, to, reason, at);
  return nextState;
}

function initialPedagogicalState(): AutoTutorPedagogicalState {
  return {
    targetType: 'expectation',
    selectedMove: '',
    focusTurnCount: 0,
    moveCycleIndex: 0,
  };
}

function learnerQuestionScope(learnerQuestion: AutoTutorLearnerQuestionScore): AutoTutorLearnerQuestionScope {
  if (!learnerQuestion.current) {
    return 'not_question';
  }
  return learnerQuestion.answerableFromAuthoredContent ? 'in_scope' : 'out_of_scope';
}

function completionStageForPlan(
  plan: AutoTutorPlan,
  requireFinalAnswerPrompt: boolean,
  endReason: AutoTutorEndReason,
): AutoTutorCompletionStage {
  if (endReason === 'mastery') {
    return 'mastered';
  }
  if (plan.target.type !== 'completion') {
    return 'not_ready';
  }
  if (plan.selectedMove === 'summary') {
    return 'summarizing';
  }
  if (plan.selectedMove === 'final_answer_prompt') {
    return 'requesting_final_answer';
  }
  return requireFinalAnswerPrompt ? 'ready_for_final_answer' : 'summarizing';
}

export function createPedagogicalStateFromPlan(
  plan: AutoTutorPlan,
  plannerState: AutoTutorPlannerState,
  learnerQuestion: AutoTutorLearnerQuestionScore,
  requireFinalAnswerPrompt: boolean,
  endReason: AutoTutorEndReason = 'in_progress',
): AutoTutorPedagogicalState {
  if (plan.target.type === 'expectation') {
    return {
      targetType: 'expectation',
      ...(plan.target.id ? { targetId: plan.target.id } : {}),
      selectedMove: plan.selectedMove as Extract<AutoTutorMove, 'pump' | 'hint' | 'prompt' | 'assertion'>,
      focusTurnCount: plannerState.focusTurnCount,
      moveCycleIndex: plannerState.moveCycleIndex,
    };
  }
  if (plan.target.type === 'misconception') {
    if (!plan.target.id || !plan.correctionStage) {
      throw new Error('AutoTutor pedagogical misconception state requires target ID and correction stage');
    }
    return {
      targetType: 'misconception',
      targetId: plan.target.id,
      selectedMove: 'correction',
      correctionStage: plan.correctionStage,
    };
  }
  if (plan.target.type === 'learner_question') {
    return {
      targetType: 'learner_question',
      selectedMove: 'answer_question',
      questionScope: learnerQuestionScope(learnerQuestion),
      answerableFromAuthoredContent: learnerQuestion.answerableFromAuthoredContent,
    };
  }
  return {
    targetType: 'completion',
    selectedMove: plan.selectedMove as Extract<AutoTutorMove, 'final_answer_prompt' | 'summary'>,
    completionStage: completionStageForPlan(plan, requireFinalAnswerPrompt, endReason),
  };
}

export function createInitialAutoTutorState(script: AutoTutorScript): AutoTutorState {
  const planner = createInitialAutoTutorPlannerState(script);
  const state: AutoTutorState = {
    operationalPhase: 'initializing',
    pedagogicalState: initialPedagogicalState(),
    transitions: [],
    expectations: planner.expectationScores,
    misconceptions: planner.misconceptionScores,
    planner,
    answerQuality: 'none',
    learnerContribution: null,
    studentAskedQuestion: false,
    selectedMove: '',
    turnCount: 0,
    costUsd: 0,
    completed: false,
    mastered: false,
    endReason: 'in_progress',
    stoppedByCost: false,
    dialogue: [],
  };
  pushTransition(state, 'awaiting_learner', 'runtime initialized');
  return state;
}

export function summarizeAutoTutorState(state: AutoTutorState) {
  return {
    operationalPhase: state.operationalPhase,
    pedagogicalState: state.pedagogicalState,
    transitions: state.transitions,
    expectations: state.expectations,
    misconceptions: state.misconceptions,
    planner: state.planner,
    answerQuality: state.answerQuality,
    learnerContribution: state.learnerContribution,
    studentAskedQuestion: state.studentAskedQuestion,
    selectedMove: state.selectedMove,
    turnCount: state.turnCount,
    costUsd: state.costUsd,
    completed: state.completed,
    mastered: state.mastered,
    endReason: state.endReason,
    stoppedByCost: state.stoppedByCost,
  };
}

export function summarizeAutoTutorResumableState(state: AutoTutorState) {
  return {
    ...summarizeAutoTutorState(state),
    operationalPhase: completedPhaseForEndReason(state.endReason),
  };
}

export function validateAutoTutorLearnerInput(state: AutoTutorState, studentAnswer: string): string {
  if (typeof studentAnswer !== 'string' || studentAnswer.trim().length === 0) {
    throw new Error('AutoTutor runtime requires student answer');
  }
  if (state.completed) {
    throw new Error('AutoTutor session is already complete');
  }
  return studentAnswer.trim();
}

export function getAutoTutorScoreableExpectationIds(config: AutoTutorConfig, state: AutoTutorState): string[] {
  return getScoreableExpectationIds(config.script, state.expectations);
}

export function validateAutoTutorScoreEnvelopeIds(
  envelope: AutoTutorScoreEnvelopeLike,
  state: AutoTutorState,
  scoreableExpectationIds: string[],
): void {
  const expectationIds = scoreableExpectationIds;
  const misconceptionIds = Object.keys(state.misconceptions);
  const returnedExpectationIds = Object.keys(envelope.expectationScores);
  const returnedMisconceptionIds = Object.keys(envelope.misconceptionScores);

  for (const id of expectationIds) {
    if (!returnedExpectationIds.includes(id)) {
      throw new Error(`AutoTutor response omitted expectation "${id}"`);
    }
  }
  for (const id of returnedExpectationIds) {
    if (!expectationIds.includes(id)) {
      throw new Error(`AutoTutor response included unknown expectation "${id}"`);
    }
  }
  for (const id of misconceptionIds) {
    if (!returnedMisconceptionIds.includes(id)) {
      throw new Error(`AutoTutor response omitted misconception "${id}"`);
    }
  }
  for (const id of returnedMisconceptionIds) {
    if (!misconceptionIds.includes(id)) {
      throw new Error(`AutoTutor response included unknown misconception "${id}"`);
    }
  }
}

export function scoreAndPlanAutoTutorTurn(
  context: AutoTutorTurnContext,
  scoreEnvelope: AutoTutorScoreEnvelopeLike,
  scoreCostUsd: number = 0,
): AutoTutorPlannedTurn {
  const scoringState = transitionAutoTutorOperationalPhase(context.state, 'scoring_learner', 'learner answer submitted');
  const scoreableExpectationIds = getAutoTutorScoreableExpectationIds(context.config, scoringState);
  validateAutoTutorScoreEnvelopeIds(scoreEnvelope, scoringState, scoreableExpectationIds);

  const nextState = transitionAutoTutorOperationalPhase(scoringState, 'planning_next_move', 'score envelope accepted');
  nextState.costUsd += scoreCostUsd || 0;
  const durableExpectationScores = mergeScoreableExpectationScores(
    context.config.script,
    scoringState.expectations,
    scoreEnvelope.expectationScores,
    scoreableExpectationIds,
  );
  const relationshipAnchorId = scoringState.planner.focusedExpectationId || scoringState.planner.lastCoveredExpectationId;
  const scoredExpectations = recomputeExpectationPriorities(
    context.config.script,
    durableExpectationScores,
    undefined,
    relationshipAnchorId,
  );
  const scoredMisconceptions = preserveRepairedMisconceptionState(
    context.config.script,
    scoringState.misconceptions,
    scoreEnvelope.misconceptionScores,
  );
  nextState.expectations = scoredExpectations;
  nextState.misconceptions = scoredMisconceptions;
  nextState.planner.expectationScores = scoredExpectations;
  nextState.planner.misconceptionScores = scoredMisconceptions;
  nextState.answerQuality = scoreEnvelope.answerQuality;
  nextState.learnerContribution = scoreEnvelope.learnerContribution;
  nextState.studentAskedQuestion = scoreEnvelope.learnerQuestion.current;

  const plan = planAutoTutorTurn({
    script: context.config.script,
    plannerState: nextState.planner,
    learnerQuestion: scoreEnvelope.learnerQuestion,
    learnerContribution: scoreEnvelope.learnerContribution,
    answerQuality: scoreEnvelope.answerQuality,
    requireFinalAnswerPrompt: context.config.requireFinalAnswerPrompt,
  });
  nextState.planner = plan.nextPlannerState;
  nextState.selectedMove = plan.selectedMove;
  nextState.pedagogicalState = createPedagogicalStateFromPlan(
    plan,
    nextState.planner,
    scoreEnvelope.learnerQuestion,
    context.config.requireFinalAnswerPrompt,
  );
  nextState.turnCount += 1;
  nextState.dialogue.push({ role: 'student', text: context.studentAnswer });

  applyAutoTutorTurnEndState(nextState, context.config, plan);
  if (nextState.pedagogicalState.targetType === 'completion') {
    nextState.pedagogicalState = {
      ...nextState.pedagogicalState,
      completionStage: completionStageForPlan(plan, context.config.requireFinalAnswerPrompt, nextState.endReason),
    };
  }
  pushTransition(nextState, 'generating_tutor_response', 'app-selected plan ready');
  const stateForUtterancePlan = cloneJson(nextState);

  return {
    stateForUtterancePlan,
    nextState,
    plan,
    scoreableExpectationIds,
  };
}

export function addAutoTutorUtteranceToTurn(
  state: AutoTutorState,
  tutorMessage: string,
  utteranceCostUsd: number = 0,
): AutoTutorState {
  const nextState = cloneJson(state);
  nextState.costUsd += utteranceCostUsd || 0;
  nextState.dialogue.push({ role: 'tutor', text: tutorMessage });
  pushTransition(nextState, 'writing_history', 'tutor response generated');
  return nextState;
}

export function markAutoTutorHistoryWritten(state: AutoTutorState): AutoTutorState {
  return transitionAutoTutorOperationalPhase(state, 'publishing_state', 'canonical history written');
}

export function markAutoTutorStatePublished(state: AutoTutorState): AutoTutorState {
  const nextState = cloneJson(state);
  pushTransition(nextState, completedPhaseForEndReason(nextState.endReason), 'state published');
  return nextState;
}

export function markAutoTutorErrored(state: AutoTutorState, reason = 'turn failed'): AutoTutorState {
  return transitionAutoTutorOperationalPhase(state, 'errored', reason);
}

export function computeAutoTutorProgress(state: AutoTutorState): number {
  const expectationCount = Object.keys(state.expectations).length;
  if (expectationCount === 0) {
    throw new Error('AutoTutor state has no expectations');
  }
  const coverageSum = Object.values(state.expectations).reduce((sum, entry) => sum + entry.coverage, 0);
  const activeMisconceptionPenalty = Object.values(state.misconceptions)
    .filter((entry) =>
      !entry.repaired &&
      entry.current &&
      entry.confidence >= AUTO_TUTOR_DEFAULT_THRESHOLDS.misconceptionThreshold
    )
    .length;
  return Math.max(0, coverageSum - activeMisconceptionPenalty) / expectationCount;
}

export function countAutoTutorCoveredRequiredExpectations(state: AutoTutorState, config: AutoTutorConfig): number {
  return getRequiredExpectationIds(config.script).filter((id) => {
    const score = state.expectations[id];
    return Boolean(score && score.coverage >= AUTO_TUTOR_DEFAULT_THRESHOLDS.coverageThreshold);
  }).length;
}

export function countAutoTutorActiveMisconceptions(state: AutoTutorState): number {
  return Object.values(state.misconceptions)
    .filter((entry) =>
      !entry.repaired &&
      entry.current &&
      entry.confidence >= AUTO_TUTOR_DEFAULT_THRESHOLDS.misconceptionThreshold
    )
    .length;
}

export function computeAutoTutorProgressCounts(
  state: AutoTutorState,
  config: AutoTutorConfig,
): AutoTutorProgressCounts {
  return {
    coveredExpectations: countAutoTutorCoveredRequiredExpectations(state, config),
    requiredExpectations: getRequiredExpectationIds(config.script).length,
    neededExpectations: config.graduation.requiredExpectationCount,
    activeMisconceptions: countAutoTutorActiveMisconceptions(state),
    totalMisconceptions: Object.keys(state.misconceptions).length,
    maxActiveMisconceptions: config.graduation.maxActiveMisconceptions,
  };
}

export function computeAutoTutorGraduationMet(state: AutoTutorState, config: AutoTutorConfig): boolean {
  const progressCounts = computeAutoTutorProgressCounts(state, config);
  return progressCounts.coveredExpectations >= config.graduation.requiredExpectationCount &&
    progressCounts.activeMisconceptions <= config.graduation.maxActiveMisconceptions;
}

export function applyAutoTutorTurnEndState(
  state: AutoTutorState,
  config: AutoTutorConfig,
  plan: AutoTutorPlan,
): void {
  const graduationMet = computeAutoTutorGraduationMet(state, config);
  if (graduationMet && (plan.target.type !== 'completion' || plan.selectedMove === 'summary')) {
    applyAutoTutorEndReason(state, 'mastery');
  } else if (state.turnCount >= config.turnLimit.maxTurns) {
    applyAutoTutorEndReason(state, 'max_turns');
  } else {
    applyAutoTutorEndReason(state, 'in_progress');
  }
}

export function applyAutoTutorCostCap(state: AutoTutorState): AutoTutorState {
  const nextState = cloneJson(state);
  applyAutoTutorEndReason(nextState, 'cost_cap');
  pushTransition(nextState, 'completed_cost_cap', 'cost cap reached');
  return nextState;
}

export function isAutoTutorCostCapReached(state: Pick<AutoTutorState, 'costUsd'>): boolean {
  return state.costUsd >= AUTO_TUTOR_COST_CAP_USD;
}

export function buildAutoTutorPublishState(state: AutoTutorState, config: AutoTutorConfig) {
  return {
    ...summarizeAutoTutorState(state),
    stoppedByCost: state.stoppedByCost,
    progress: computeAutoTutorProgress(state),
    progressCounts: computeAutoTutorProgressCounts(state, config),
  };
}

export function buildAutoTutorHistoryNote(
  config: AutoTutorConfig,
  state: AutoTutorState,
  tutorMessage: string,
): AutoTutorSavedHistoryNote {
  return {
    kind: 'autotutor',
    model: config.model,
    scriptId: config.script.id,
    state: summarizeAutoTutorResumableState(state),
    progress: computeAutoTutorProgress(state),
    completed: state.completed,
    mastered: state.mastered,
    endReason: state.endReason,
    stoppedByCost: state.stoppedByCost,
    tutorMessage,
  };
}

export function applySavedAutoTutorHistory(
  config: AutoTutorConfig,
  state: AutoTutorState,
  rows: AutoTutorHistoryRow[],
): void {
  if (rows.length === 0) {
    return;
  }
  const dialogue: AutoTutorState['dialogue'] = [];
  for (const row of rows) {
    const studentText = typeof row.input === 'string' && row.input.trim()
      ? row.input.trim()
      : (typeof row.responseValue === 'string' ? row.responseValue.trim() : '');
    const tutorText = typeof row.feedbackText === 'string' ? row.feedbackText.trim() : '';
    if (!studentText || !tutorText) {
      throw new Error('AutoTutor history row is missing student or tutor text');
    }
    dialogue.push({ role: 'student', text: studentText });
    dialogue.push({ role: 'tutor', text: tutorText });
  }

  const latestRow = rows[rows.length - 1];
  if (!latestRow) {
    throw new Error('AutoTutor history resume expected at least one row');
  }
  const latest = readAutoTutorHistoryNote<ReturnType<typeof summarizeAutoTutorState>>(latestRow);
  if (latest.scriptId !== config.script.id) {
    throw new Error(`AutoTutor saved history scriptId "${latest.scriptId}" does not match current script "${config.script.id}"`);
  }
  validateAutoTutorSavedEndState(latest);
  const savedState = validateAutoTutorSavedState(latest.state as AutoTutorSavedStateShape, state);
  if (
    latest.completed !== savedState.completed ||
    latest.mastered !== savedState.mastered ||
    latest.endReason !== savedState.endReason ||
    latest.stoppedByCost !== savedState.stoppedByCost
  ) {
    throw new Error('AutoTutor saved history top-level end state does not match state payload');
  }
  state.operationalPhase = savedState.operationalPhase;
  state.pedagogicalState = savedState.pedagogicalState;
  state.transitions = savedState.transitions;
  state.expectations = savedState.expectations;
  state.misconceptions = savedState.misconceptions;
  state.planner = savedState.planner;
  state.answerQuality = savedState.answerQuality;
  state.learnerContribution = savedState.learnerContribution;
  state.studentAskedQuestion = savedState.studentAskedQuestion;
  state.selectedMove = savedState.selectedMove;
  state.turnCount = savedState.turnCount;
  state.costUsd = savedState.costUsd;
  state.completed = savedState.completed;
  state.mastered = savedState.mastered;
  state.endReason = savedState.endReason;
  state.stoppedByCost = savedState.stoppedByCost;
  state.dialogue = dialogue;
}
