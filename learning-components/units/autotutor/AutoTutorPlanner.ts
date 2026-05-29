export type AutoTutorMove =
  | 'feedback'
  | 'pump'
  | 'hint'
  | 'prompt'
  | 'assertion'
  | 'correction'
  | 'answer_question'
  | 'question_prompt'
  | 'final_answer_prompt'
  | 'summary';

export type AutoTutorCorrectionStage = 'hint' | 'prompt' | 'assertion';

export type AutoTutorTargetType = 'expectation' | 'misconception' | 'learner_question' | 'completion';

export type AutoTutorLearnerContributionType =
  | 'assertion'
  | 'idk'
  | 'help_request'
  | 'uncertainty'
  | 'affect'
  | 'meta'
  | 'question'
  | 'off_task';

export type AutoTutorExpectationScore = {
  current: boolean;
  coverage: number;
  evidence?: string;
  missing?: string[];
  tutoredByAssertion?: boolean;
  learnerRestatedAfterAssertion?: boolean;
  frontier: number;
  coherence: number;
  centrality: number;
  priority: number;
};

export type AutoTutorMisconceptionScore = {
  current: boolean;
  confidence: number;
  evidence?: string;
  repaired?: boolean;
  repairEvidence?: string;
};

export type AutoTutorLearnerQuestionScore = {
  current: boolean;
  answerableFromAuthoredContent: boolean;
  evidence?: string;
};

export type AutoTutorLearnerContributionScore = {
  type: AutoTutorLearnerContributionType;
  confidence: number;
  evidence?: string;
};

export type AutoTutorPlannerState = {
  focusedExpectationId?: string;
  focusedMisconceptionId?: string;
  lastCoveredExpectationId?: string;
  lastSelectedTargetId?: string;
  lastSelectedTargetType?: AutoTutorTargetType;
  focusTurnCount: number;
  moveCycleIndex: number;
  misconceptionCycleIndex?: number;
  contributionStreakType?: AutoTutorLearnerContributionType;
  contributionStreakCount?: number;
  expectationScores: Record<string, AutoTutorExpectationScore>;
  misconceptionScores: Record<string, AutoTutorMisconceptionScore>;
};

export type AutoTutorPlannerThresholds = {
  coverageThreshold: number;
  misconceptionThreshold: number;
};

export type AutoTutorPlannerWeights = {
  frontierWeight: number;
  coherenceWeight: number;
  centralityWeight: number;
};

export type AutoTutorPlannerScript = {
  expectations: Array<{ id: string; proposition: string; hints?: string[]; prompts?: Array<{ stem?: string; target?: string }>; assertion: string }>;
  misconceptions?: Array<{ id: string; correction: string; repairQuestion: string }>;
  dialogPolicy: Record<string, unknown>;
  summary: string;
};

export type AutoTutorPlannerInput = {
  script: AutoTutorPlannerScript;
  plannerState: AutoTutorPlannerState;
  learnerQuestion: AutoTutorLearnerQuestionScore;
  learnerContribution?: AutoTutorLearnerContributionScore;
  answerQuality: 'low' | 'partial' | 'high';
  requireFinalAnswerPrompt?: boolean;
  thresholds?: Partial<AutoTutorPlannerThresholds>;
  weights?: Partial<AutoTutorPlannerWeights>;
};

export type AutoTutorTarget = {
  type: AutoTutorTargetType;
  id?: string;
};

export type AutoTutorPlan = {
  target: AutoTutorTarget;
  selectedMove: AutoTutorMove;
  correctionStage?: AutoTutorCorrectionStage;
  nextPlannerState: AutoTutorPlannerState;
};

export const AUTO_TUTOR_DEFAULT_THRESHOLDS: AutoTutorPlannerThresholds = Object.freeze({
  coverageThreshold: 0.8,
  misconceptionThreshold: 0.65,
});

export const AUTO_TUTOR_DEFAULT_WEIGHTS: AutoTutorPlannerWeights = Object.freeze({
  frontierWeight: 0.5,
  coherenceWeight: 0.3,
  centralityWeight: 0.2,
});

const EXPECTATION_CYCLE: AutoTutorMove[] = ['hint', 'prompt', 'assertion'];
const MISCONCEPTION_CYCLE: AutoTutorCorrectionStage[] = ['hint', 'prompt', 'assertion'];
const MAX_FOCUS_TURNS = 6;

function assertScore(value: number, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`AutoTutor planner requires ${field} from 0 to 1`);
  }
}

function requiredExpectationIds(script: AutoTutorPlannerScript): string[] {
  const value = script.dialogPolicy.requiredExpectations;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('AutoTutor planner requires dialogPolicy.requiredExpectations');
  }
  const authoredIds = new Set(script.expectations.map((expectation) => expectation.id));
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || !authoredIds.has(id)) {
      throw new Error(`AutoTutor planner required expectation references unknown ID "${String(id)}"`);
    }
    ids.push(id);
  }
  return ids;
}

function isCovered(score: AutoTutorExpectationScore, threshold: number): boolean {
  return score.coverage >= threshold;
}

function mergeThresholds(thresholds?: Partial<AutoTutorPlannerThresholds>): AutoTutorPlannerThresholds {
  return {
    ...AUTO_TUTOR_DEFAULT_THRESHOLDS,
    ...(thresholds || {}),
  };
}

function mergeWeights(weights?: Partial<AutoTutorPlannerWeights>): AutoTutorPlannerWeights {
  return {
    ...AUTO_TUTOR_DEFAULT_WEIGHTS,
    ...(weights || {}),
  };
}

export function createInitialAutoTutorPlannerState(script: AutoTutorPlannerScript): AutoTutorPlannerState {
  const expectationScores: Record<string, AutoTutorExpectationScore> = {};
  for (const expectation of script.expectations) {
    expectationScores[expectation.id] = {
      current: false,
      coverage: 0,
      frontier: 0,
      coherence: 0,
      centrality: 0,
      priority: 0,
    };
  }
  const misconceptionScores: Record<string, AutoTutorMisconceptionScore> = {};
  for (const misconception of script.misconceptions || []) {
    misconceptionScores[misconception.id] = {
      current: false,
      confidence: 0,
    };
  }
  return {
    focusTurnCount: 0,
    moveCycleIndex: 0,
    expectationScores,
    misconceptionScores,
  };
}

export function validatePlannerState(script: AutoTutorPlannerScript, plannerState: AutoTutorPlannerState): void {
  const expectationIds = script.expectations.map((expectation) => expectation.id);
  const misconceptionIds = (script.misconceptions || []).map((misconception) => misconception.id);
  const stateExpectationIds = Object.keys(plannerState.expectationScores);
  const stateMisconceptionIds = Object.keys(plannerState.misconceptionScores);

  for (const id of expectationIds) {
    if (!stateExpectationIds.includes(id)) {
      throw new Error(`AutoTutor planner state omitted expectation score "${id}"`);
    }
  }
  for (const id of stateExpectationIds) {
    if (!expectationIds.includes(id)) {
      throw new Error(`AutoTutor planner state included unknown expectation score "${id}"`);
    }
    const score = plannerState.expectationScores[id];
    if (!score) {
      throw new Error(`AutoTutor planner state omitted expectation score "${id}"`);
    }
    if (typeof score.current !== 'boolean') {
      throw new Error(`AutoTutor planner state expectationScores.${id}.current must be boolean`);
    }
    assertScore(score.coverage, `expectationScores.${id}.coverage`);
    assertScore(score.frontier, `expectationScores.${id}.frontier`);
    assertScore(score.coherence, `expectationScores.${id}.coherence`);
    assertScore(score.centrality, `expectationScores.${id}.centrality`);
    assertScore(score.priority, `expectationScores.${id}.priority`);
  }
  for (const id of misconceptionIds) {
    if (!stateMisconceptionIds.includes(id)) {
      throw new Error(`AutoTutor planner state omitted misconception score "${id}"`);
    }
  }
  for (const id of stateMisconceptionIds) {
    if (!misconceptionIds.includes(id)) {
      throw new Error(`AutoTutor planner state included unknown misconception score "${id}"`);
    }
    const score = plannerState.misconceptionScores[id];
    if (!score) {
      throw new Error(`AutoTutor planner state omitted misconception score "${id}"`);
    }
    if (typeof score.current !== 'boolean') {
      throw new Error(`AutoTutor planner state misconceptionScores.${id}.current must be boolean`);
    }
    assertScore(score.confidence, `misconceptionScores.${id}.confidence`);
    if (score.repaired !== undefined && typeof score.repaired !== 'boolean') {
      throw new Error(`AutoTutor planner state misconceptionScores.${id}.repaired must be boolean when present`);
    }
  }
  if (!Number.isInteger(plannerState.focusTurnCount) || plannerState.focusTurnCount < 0) {
    throw new Error('AutoTutor planner state focusTurnCount must be a non-negative integer');
  }
  if (!Number.isInteger(plannerState.moveCycleIndex) || plannerState.moveCycleIndex < 0) {
    throw new Error('AutoTutor planner state moveCycleIndex must be a non-negative integer');
  }
  if (
    plannerState.misconceptionCycleIndex !== undefined &&
    (!Number.isInteger(plannerState.misconceptionCycleIndex) || plannerState.misconceptionCycleIndex < 0)
  ) {
    throw new Error('AutoTutor planner state misconceptionCycleIndex must be a non-negative integer when present');
  }
  if (
    plannerState.contributionStreakType !== undefined &&
    !['assertion', 'idk', 'help_request', 'uncertainty', 'affect', 'meta', 'question', 'off_task'].includes(plannerState.contributionStreakType)
  ) {
    throw new Error('AutoTutor planner state contributionStreakType is invalid when present');
  }
  if (
    plannerState.contributionStreakCount !== undefined &&
    (!Number.isInteger(plannerState.contributionStreakCount) || plannerState.contributionStreakCount < 0)
  ) {
    throw new Error('AutoTutor planner state contributionStreakCount must be a non-negative integer when present');
  }
}

export function recomputeExpectationPriorities(
  script: AutoTutorPlannerScript,
  scores: Record<string, AutoTutorExpectationScore>,
  weights?: Partial<AutoTutorPlannerWeights>,
): Record<string, AutoTutorExpectationScore> {
  const mergedWeights = mergeWeights(weights);
  const nextScores: Record<string, AutoTutorExpectationScore> = {};
  for (const expectation of script.expectations) {
    const score = scores[expectation.id];
    if (!score) {
      throw new Error(`AutoTutor score response omitted expectation "${expectation.id}"`);
    }
    const frontier = score.coverage;
    const priority =
      mergedWeights.frontierWeight * frontier +
      mergedWeights.coherenceWeight * score.coherence +
      mergedWeights.centralityWeight * score.centrality;
    nextScores[expectation.id] = {
      ...score,
      frontier,
      priority: Math.max(0, Math.min(1, priority)),
    };
  }
  return nextScores;
}

export function preserveDurableExpectationCoverage(
  script: AutoTutorPlannerScript,
  previousScores: Record<string, AutoTutorExpectationScore>,
  nextScores: Record<string, AutoTutorExpectationScore>,
): Record<string, AutoTutorExpectationScore> {
  const mergedScores: Record<string, AutoTutorExpectationScore> = {};
  for (const expectation of script.expectations) {
    const previousScore = previousScores[expectation.id];
    const nextScore = nextScores[expectation.id];
    if (!nextScore) {
      throw new Error(`AutoTutor score response omitted expectation "${expectation.id}"`);
    }
    if (!previousScore || nextScore.coverage >= previousScore.coverage) {
      mergedScores[expectation.id] = nextScore;
      continue;
    }
    mergedScores[expectation.id] = {
      ...previousScore,
      current: previousScore.current || nextScore.current,
      ...(previousScore.evidence || nextScore.evidence
        ? { evidence: previousScore.evidence || nextScore.evidence }
        : {}),
      ...(previousScore.missing || nextScore.missing
        ? { missing: previousScore.missing || nextScore.missing }
        : {}),
      coherence: Math.max(previousScore.coherence, nextScore.coherence),
      centrality: Math.max(previousScore.centrality, nextScore.centrality),
    };
  }
  return mergedScores;
}

export function getScoreableExpectationIds(
  script: AutoTutorPlannerScript,
  previousScores: Record<string, AutoTutorExpectationScore>,
  thresholds?: Partial<AutoTutorPlannerThresholds>,
): string[] {
  const mergedThresholds = mergeThresholds(thresholds);
  return script.expectations
    .filter((expectation) => {
      const previousScore = previousScores[expectation.id];
      return !previousScore || !isCovered(previousScore, mergedThresholds.coverageThreshold);
    })
    .map((expectation) => expectation.id);
}

export function mergeScoreableExpectationScores(
  script: AutoTutorPlannerScript,
  previousScores: Record<string, AutoTutorExpectationScore>,
  nextScores: Record<string, AutoTutorExpectationScore>,
  scoreableExpectationIds: string[],
): Record<string, AutoTutorExpectationScore> {
  const scoreableIds = new Set(scoreableExpectationIds);
  const mergedScores: Record<string, AutoTutorExpectationScore> = {};

  for (const expectation of script.expectations) {
    const previousScore = previousScores[expectation.id];
    const nextScore = nextScores[expectation.id];
    if (!scoreableIds.has(expectation.id)) {
      if (!previousScore) {
        throw new Error(`AutoTutor frozen expectation "${expectation.id}" is missing previous score`);
      }
      mergedScores[expectation.id] = previousScore;
      continue;
    }
    if (!nextScore) {
      throw new Error(`AutoTutor score response omitted expectation "${expectation.id}"`);
    }
    if (!previousScore || nextScore.coverage >= previousScore.coverage) {
      mergedScores[expectation.id] = nextScore;
      continue;
    }
    mergedScores[expectation.id] = {
      ...previousScore,
      current: previousScore.current || nextScore.current,
      ...(previousScore.evidence || nextScore.evidence
        ? { evidence: previousScore.evidence || nextScore.evidence }
        : {}),
      ...(previousScore.missing || nextScore.missing
        ? { missing: previousScore.missing || nextScore.missing }
        : {}),
      coherence: Math.max(previousScore.coherence, nextScore.coherence),
      centrality: Math.max(previousScore.centrality, nextScore.centrality),
    };
  }

  return mergedScores;
}

export function preserveRepairedMisconceptionState(
  script: AutoTutorPlannerScript,
  previousScores: Record<string, AutoTutorMisconceptionScore>,
  nextScores: Record<string, AutoTutorMisconceptionScore>,
): Record<string, AutoTutorMisconceptionScore> {
  const mergedScores: Record<string, AutoTutorMisconceptionScore> = {};
  for (const misconception of script.misconceptions || []) {
    const previousScore = previousScores[misconception.id];
    const nextScore = nextScores[misconception.id];
    if (!nextScore) {
      throw new Error(`AutoTutor score response omitted misconception "${misconception.id}"`);
    }

    if (nextScore.repaired) {
      mergedScores[misconception.id] = {
        ...nextScore,
        current: false,
        confidence: 0,
        repaired: true,
        ...(nextScore.repairEvidence || nextScore.evidence
          ? { repairEvidence: nextScore.repairEvidence || nextScore.evidence }
          : {}),
      };
      continue;
    }

    if (nextScore.current) {
      mergedScores[misconception.id] = {
        ...nextScore,
        repaired: false,
      };
      continue;
    }

    if (previousScore?.repaired) {
      mergedScores[misconception.id] = {
        ...nextScore,
        current: false,
        confidence: 0,
        repaired: true,
        ...(previousScore.repairEvidence || nextScore.repairEvidence || nextScore.evidence
          ? { repairEvidence: previousScore.repairEvidence || nextScore.repairEvidence || nextScore.evidence }
          : {}),
      };
      continue;
    }

    mergedScores[misconception.id] = nextScore;
  }
  return mergedScores;
}

function selectHighestPriorityExpectation(
  requiredIds: string[],
  scores: Record<string, AutoTutorExpectationScore>,
  coverageThreshold: number,
  excludedId?: string,
): string {
  let selectedId = '';
  let selectedPriority = -1;
  for (const id of requiredIds) {
    if (id === excludedId) {
      continue;
    }
    const score = scores[id];
    if (!score || isCovered(score, coverageThreshold)) {
      continue;
    }
    if (score.priority > selectedPriority || (score.priority === selectedPriority && id < selectedId)) {
      selectedId = id;
      selectedPriority = score.priority;
    }
  }
  if (!selectedId && excludedId) {
    return selectHighestPriorityExpectation(requiredIds, scores, coverageThreshold);
  }
  if (!selectedId) {
    throw new Error('AutoTutor planner could not select an uncovered required expectation');
  }
  return selectedId;
}

function isLowAgencyContribution(type?: AutoTutorLearnerContributionType): boolean {
  return type === 'idk' || type === 'help_request' || type === 'uncertainty' || type === 'affect' || type === 'meta' || type === 'off_task';
}

export function selectAutoTutorTarget(input: AutoTutorPlannerInput): AutoTutorTarget {
  const thresholds = mergeThresholds(input.thresholds);
  validatePlannerState(input.script, input.plannerState);
  const requiredIds = requiredExpectationIds(input.script);

  const contributionType = input.learnerContribution?.type;

  if (contributionType === 'question' || input.learnerQuestion.current) {
    return { type: 'learner_question' };
  }

  if (!isLowAgencyContribution(contributionType)) {
    let selectedMisconceptionId = '';
    let selectedConfidence = thresholds.misconceptionThreshold;
    for (const [id, score] of Object.entries(input.plannerState.misconceptionScores)) {
      if (!score.repaired && score.current && score.confidence >= selectedConfidence) {
        selectedMisconceptionId = id;
        selectedConfidence = score.confidence;
      }
    }
    if (selectedMisconceptionId) {
      return { type: 'misconception', id: selectedMisconceptionId };
    }
  }

  const requiredCovered = requiredIds.every((id) => {
    const score = input.plannerState.expectationScores[id];
    return Boolean(score && isCovered(score, thresholds.coverageThreshold));
  });
  if (requiredCovered) {
    return { type: 'completion' };
  }

  const focusId = input.plannerState.focusedExpectationId;
  const focusScore = focusId ? input.plannerState.expectationScores[focusId] : undefined;
  if (
    focusId &&
    focusScore &&
    requiredIds.includes(focusId) &&
    !isCovered(focusScore, thresholds.coverageThreshold) &&
    (isLowAgencyContribution(contributionType) || input.plannerState.focusTurnCount < MAX_FOCUS_TURNS)
  ) {
    return { type: 'expectation', id: focusId };
  }

  return {
    type: 'expectation',
    id: selectHighestPriorityExpectation(
      requiredIds,
      input.plannerState.expectationScores,
      thresholds.coverageThreshold,
      focusId,
    ),
  };
}

export function selectAutoTutorMove(input: AutoTutorPlannerInput, target: AutoTutorTarget): AutoTutorMove {
  const thresholds = mergeThresholds(input.thresholds);
  if (target.type === 'learner_question') {
    return 'answer_question';
  }
  if (target.type === 'misconception') {
    if (!target.id) {
      throw new Error('AutoTutor planner misconception target requires an ID');
    }
    return 'correction';
  }
  if (target.type === 'completion') {
    if (!input.requireFinalAnswerPrompt) {
      return 'summary';
    }
    return input.plannerState.lastSelectedTargetType === 'completion'
      ? 'summary'
      : 'final_answer_prompt';
  }
  if (!target.id) {
    throw new Error('AutoTutor planner expectation target requires an ID');
  }
  const score = input.plannerState.expectationScores[target.id];
  if (!score) {
    throw new Error(`AutoTutor planner selected unknown expectation "${target.id}"`);
  }
  const firstFocusTurn = input.plannerState.focusedExpectationId !== target.id || input.plannerState.focusTurnCount === 0;
  const contributionType = input.learnerContribution?.type;
  const contributionStreakCount = contributionType
    ? (input.plannerState.contributionStreakType === contributionType
      ? (input.plannerState.contributionStreakCount || 0) + 1
      : 1)
    : 0;
  if (contributionType === 'idk' || contributionType === 'help_request') {
    if (contributionStreakCount >= 3) {
      return 'assertion';
    }
    if (contributionStreakCount >= 2) {
      return 'prompt';
    }
    return 'hint';
  }
  if (contributionType === 'uncertainty' || contributionType === 'affect' || contributionType === 'meta' || contributionType === 'off_task') {
    return 'hint';
  }
  if (input.answerQuality === 'low' && firstFocusTurn) {
    return 'pump';
  }
  if (score.coverage >= thresholds.coverageThreshold * 0.75 && score.coverage < thresholds.coverageThreshold) {
    return 'prompt';
  }
  const cycleIndex = firstFocusTurn ? 0 : input.plannerState.moveCycleIndex;
  return EXPECTATION_CYCLE[cycleIndex % EXPECTATION_CYCLE.length] || 'hint';
}

export function planAutoTutorTurn(input: AutoTutorPlannerInput): AutoTutorPlan {
  const target = selectAutoTutorTarget(input);
  const selectedMove = selectAutoTutorMove(input, target);
  const nextPlannerState: AutoTutorPlannerState = JSON.parse(JSON.stringify(input.plannerState));
  let correctionStage: AutoTutorCorrectionStage | undefined;
  const thresholds = mergeThresholds(input.thresholds);
  if (input.learnerContribution) {
    if (nextPlannerState.contributionStreakType === input.learnerContribution.type) {
      nextPlannerState.contributionStreakCount = (nextPlannerState.contributionStreakCount || 0) + 1;
    } else {
      nextPlannerState.contributionStreakType = input.learnerContribution.type;
      nextPlannerState.contributionStreakCount = 1;
    }
  } else {
    delete nextPlannerState.contributionStreakType;
    delete nextPlannerState.contributionStreakCount;
  }
  nextPlannerState.lastSelectedTargetType = target.type;
  if (target.id) {
    nextPlannerState.lastSelectedTargetId = target.id;
  } else {
    delete nextPlannerState.lastSelectedTargetId;
  }

  if (target.type === 'expectation') {
    if (!target.id) {
      throw new Error('AutoTutor planner expectation target requires an ID');
    }
    if (nextPlannerState.focusedExpectationId !== target.id) {
      nextPlannerState.focusedExpectationId = target.id;
      nextPlannerState.focusTurnCount = 0;
      nextPlannerState.moveCycleIndex = 0;
    }
    nextPlannerState.focusTurnCount += 1;
    if (selectedMove === 'assertion') {
      const score = nextPlannerState.expectationScores[target.id];
      if (!score) {
        throw new Error(`AutoTutor planner selected unknown expectation "${target.id}"`);
      }
      score.tutoredByAssertion = true;
    }
    nextPlannerState.moveCycleIndex += 1;
  }

  if (target.type === 'misconception') {
    if (!target.id) {
      throw new Error('AutoTutor planner misconception target requires an ID');
    }
    if (nextPlannerState.focusedMisconceptionId !== target.id) {
      nextPlannerState.focusedMisconceptionId = target.id;
      nextPlannerState.misconceptionCycleIndex = 0;
    }
    const cycleIndex = nextPlannerState.misconceptionCycleIndex || 0;
    correctionStage = MISCONCEPTION_CYCLE[cycleIndex % MISCONCEPTION_CYCLE.length] || 'hint';
    nextPlannerState.misconceptionCycleIndex = cycleIndex + 1;
  } else {
    const hasActiveMisconception = Object.values(input.plannerState.misconceptionScores)
      .some((score) => !score.repaired && score.current && score.confidence >= thresholds.misconceptionThreshold);
    if (!hasActiveMisconception) {
      delete nextPlannerState.focusedMisconceptionId;
      delete nextPlannerState.misconceptionCycleIndex;
    }
  }

  for (const [id, score] of Object.entries(input.plannerState.expectationScores)) {
    if (isCovered(score, thresholds.coverageThreshold)) {
      nextPlannerState.lastCoveredExpectationId = id;
    }
  }

  validatePlannerState(input.script, nextPlannerState);
  return { target, selectedMove, ...(correctionStage ? { correctionStage } : {}), nextPlannerState };
}
