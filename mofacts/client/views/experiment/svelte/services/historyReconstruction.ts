import { computePracticeTimeMs } from '../../../../../lib/practiceTime';

export type LearningOutcome = 'study' | 'correct' | 'incorrect';

export type LearningHistoryRecord = {
  time?: number | string | null;
  outcome?: LearningOutcome | string | null;
  KCCluster?: string | number | null;
  KCId?: string | number | null;
  CFCorrectAnswer?: string | number | null;
  CFEndLatency?: number | string | null;
  CFFeedbackLatency?: number | string | null;
  instructionQuestionResult?: unknown;
};

type AggregateEntry = {
  firstSeen: number;
  lastSeen: number;
  priorCorrect: number;
  priorIncorrect: number;
  allTimeCorrect: number;
  allTimeIncorrect: number;
  priorStudy: number;
  outcomeStack: number[];
  totalPracticeDuration: number;
  allTimeTotalPracticeDuration: number;
};

type ClusterAggregate = AggregateEntry & {
  trialsSinceLastSeen: number;
  hasBeenIntroduced: boolean;
  otherPracticeTime: number;
  instructionQuestionResult: unknown;
};

type StimulusAggregate = AggregateEntry & {
  curSessionPriorCorrect: number;
  curSessionPriorIncorrect: number;
  hasBeenIntroduced: boolean;
  timesSeen: number;
  otherPracticeTime: number;
  instructionQuestionResult: unknown;
};

type ResponseAggregate = AggregateEntry & {
  instructionQuestionResult: unknown;
};

type LearningReconstructionResult = {
  clusterState: Record<string, ClusterAggregate>;
  stimulusState: Record<string, StimulusAggregate>;
  responseState: Record<string, ResponseAggregate>;
  numQuestionsAnswered: number;
  numQuestionsAnsweredCurrentSession: number;
  numCorrectAnswers: number;
  overallOutcomeHistory: number[];
  overallStudyHistory: number[];
  orderedRows: Array<Required<Pick<LearningHistoryRecord, 'time' | 'outcome'>> & LearningHistoryRecord>;
};

type OrderedLearningHistoryRecord = Required<Pick<LearningHistoryRecord, 'time' | 'outcome'>> &
  LearningHistoryRecord & {
    __originalIndex: number;
  };

function toFiniteTime(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`[History Reconstruction] Missing or invalid ${fieldName}`);
  }
  return parsed;
}

function requireKey(value: unknown, fieldName: string): string {
  if (value === undefined || value === null || value === '') {
    throw new Error(`[History Reconstruction] Missing required field ${fieldName}`);
  }
  return String(value);
}

function requireOutcome(value: unknown): LearningOutcome {
  if (value === 'study' || value === 'correct' || value === 'incorrect') {
    return value;
  }
  throw new Error('[History Reconstruction] Missing or invalid outcome');
}

function createAggregateEntry(): AggregateEntry {
  return {
    firstSeen: 0,
    lastSeen: 0,
    priorCorrect: 0,
    priorIncorrect: 0,
    allTimeCorrect: 0,
    allTimeIncorrect: 0,
    priorStudy: 0,
    outcomeStack: [],
    totalPracticeDuration: 0,
    allTimeTotalPracticeDuration: 0,
  };
}

function createClusterAggregate(): ClusterAggregate {
  return {
    ...createAggregateEntry(),
    trialsSinceLastSeen: 3,
    hasBeenIntroduced: false,
    otherPracticeTime: 0,
    instructionQuestionResult: null,
  };
}

function createStimulusAggregate(): StimulusAggregate {
  return {
    ...createAggregateEntry(),
    curSessionPriorCorrect: 0,
    curSessionPriorIncorrect: 0,
    hasBeenIntroduced: false,
    timesSeen: 0,
    otherPracticeTime: 0,
    instructionQuestionResult: null,
  };
}

function createResponseAggregate(): ResponseAggregate {
  return {
    ...createAggregateEntry(),
    instructionQuestionResult: null,
  };
}

function applyAggregateTrial(
  entry: AggregateEntry,
  outcome: LearningOutcome,
  practiceTimeMs: number,
  time: number
): void {
  entry.lastSeen = time;
  if (entry.firstSeen < 1) {
    entry.firstSeen = time;
  }

  entry.totalPracticeDuration += practiceTimeMs;
  entry.allTimeTotalPracticeDuration += practiceTimeMs;

  if (outcome === 'study') {
    entry.priorStudy += 1;
    return;
  }

  const outcomeValue = outcome === 'correct' ? 1 : 0;
  entry.outcomeStack.push(outcomeValue);

  if (outcome === 'correct') {
    entry.priorCorrect += 1;
    entry.allTimeCorrect += 1;
    return;
  }

  entry.priorIncorrect += 1;
  entry.allTimeIncorrect += 1;
}

function updateOverallStudyHistory(overallStudyHistory: number[], row: LearningHistoryRecord, outcome: LearningOutcome): void {
  if (outcome === 'study') {
    overallStudyHistory.push(1);
    return;
  }

  const feedbackLatency = Number(row.CFFeedbackLatency);
  if (Number.isFinite(feedbackLatency) && feedbackLatency !== -1) {
    overallStudyHistory.push(0);
  }
}

export function reconstructLearningStateFromHistory(
  historyRows: LearningHistoryRecord[]
): LearningReconstructionResult {
  const orderedRows: OrderedLearningHistoryRecord[] = (historyRows || [])
    .map((row, index) => ({
      ...row,
      time: toFiniteTime(row?.time, 'time'),
      outcome: requireOutcome(row?.outcome),
      __originalIndex: index,
    }))
    .sort((a, b) => {
      if (a.time !== b.time) {
        return a.time - b.time;
      }
      return a.__originalIndex - b.__originalIndex;
    });

  const clusterState: Record<string, ClusterAggregate> = {};
  const stimulusState: Record<string, StimulusAggregate> = {};
  const responseState: Record<string, ResponseAggregate> = {};
  const lastSeenTrialIndexByCluster: Record<string, number> = {};
  const overallOutcomeHistory: number[] = [];
  const overallStudyHistory: number[] = [];

  for (let trialIndex = 0; trialIndex < orderedRows.length; trialIndex += 1) {
    const row = orderedRows[trialIndex];
    if (!row) {
      continue;
    }
    const outcome = row.outcome as LearningOutcome;
    const time = row.time as number;
    const clusterKey = requireKey(row.KCCluster, 'KCCluster');
    const stimulusKey = requireKey(row.KCId, 'KCId');
    const responseKey = requireKey(row.CFCorrectAnswer, 'CFCorrectAnswer');
    const practiceTimeMs = computePracticeTimeMs(row.CFEndLatency, row.CFFeedbackLatency);

    const cluster = clusterState[clusterKey] || (clusterState[clusterKey] = createClusterAggregate());
    const stimulus = stimulusState[stimulusKey] || (stimulusState[stimulusKey] = createStimulusAggregate());
    const response = responseState[responseKey] || (responseState[responseKey] = createResponseAggregate());

    applyAggregateTrial(cluster, outcome, practiceTimeMs, time);
    applyAggregateTrial(stimulus, outcome, practiceTimeMs, time);
    applyAggregateTrial(response, outcome, practiceTimeMs, time);

    stimulus.timesSeen += 1;
    cluster.hasBeenIntroduced = cluster.firstSeen > 0;
    stimulus.hasBeenIntroduced = stimulus.firstSeen > 0;

    if (outcome === 'correct') {
      stimulus.curSessionPriorCorrect += 1;
      overallOutcomeHistory.push(1);
    } else if (outcome === 'incorrect') {
      stimulus.curSessionPriorIncorrect += 1;
      overallOutcomeHistory.push(0);
    }
    updateOverallStudyHistory(overallStudyHistory, row, outcome);

    if (row.instructionQuestionResult !== undefined) {
      cluster.instructionQuestionResult = row.instructionQuestionResult;
      stimulus.instructionQuestionResult = row.instructionQuestionResult;
      response.instructionQuestionResult = row.instructionQuestionResult;
    }

    for (const [otherClusterKey, otherCluster] of Object.entries(clusterState)) {
      if (otherClusterKey !== clusterKey && otherCluster.firstSeen > 0) {
        otherCluster.otherPracticeTime += practiceTimeMs;
      }
    }

    for (const [otherStimulusKey, otherStimulus] of Object.entries(stimulusState)) {
      if (otherStimulusKey !== stimulusKey && otherStimulus.firstSeen > 0) {
        otherStimulus.otherPracticeTime += practiceTimeMs;
      }
    }

    lastSeenTrialIndexByCluster[clusterKey] = trialIndex;
  }

  const lastTrialIndex = orderedRows.length - 1;
  for (const [clusterKey, cluster] of Object.entries(clusterState)) {
    const lastSeenTrialIndex = lastSeenTrialIndexByCluster[clusterKey];
    cluster.trialsSinceLastSeen = typeof lastSeenTrialIndex === 'number'
      ? Math.max(lastTrialIndex - lastSeenTrialIndex, 0)
      : 3;
    cluster.hasBeenIntroduced = cluster.firstSeen > 0;
  }

  let numQuestionsAnswered = 0;
  let numQuestionsAnsweredCurrentSession = 0;
  let numCorrectAnswers = 0;
  for (const stimulus of Object.values(stimulusState)) {
    numQuestionsAnswered += stimulus.priorCorrect + stimulus.priorIncorrect;
    numQuestionsAnsweredCurrentSession += stimulus.curSessionPriorCorrect + stimulus.curSessionPriorIncorrect;
    numCorrectAnswers += stimulus.priorCorrect;
  }

  return {
    clusterState,
    stimulusState,
    responseState,
    numQuestionsAnswered,
    numQuestionsAnsweredCurrentSession,
    numCorrectAnswers,
    overallOutcomeHistory,
    overallStudyHistory,
    orderedRows: orderedRows.map(({ __originalIndex, ...row }) => row),
  };
}
