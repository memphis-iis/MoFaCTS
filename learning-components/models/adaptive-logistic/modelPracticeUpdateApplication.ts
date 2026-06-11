import type { ModelPracticeUpdateRequest } from '../../runtime/modelPracticeUpdates';
import type { ModelPracticeStateQuery } from '../../runtime/modelPracticeStateQueries';
import { applyAnswerUpdate } from './answerUpdates';

export type AdaptiveLogisticOutcomeScore = {
  readonly wasCorrect: boolean;
  readonly testType: string;
};

export type ApplyModelPracticeUpdateToAdaptiveLogisticParams = {
  readonly cardProbabilities: any;
  readonly request: ModelPracticeUpdateRequest;
  readonly scoreOutcome?: (outcome: string) => AdaptiveLogisticOutcomeScore;
  readonly onMissingResponseMetrics?: (responseKey: string) => void;
};

export type AppliedAdaptiveLogisticModelPracticeUpdate = {
  readonly cardIndex: number;
  readonly stimIndex: number;
  readonly responseKey?: string;
  readonly wasCorrect: boolean;
  readonly testType: string;
  readonly practiceTime: number;
};

function identityEquals(left: unknown, right: unknown): boolean {
  return left !== undefined && left !== null && right !== undefined && right !== null && String(left) === String(right);
}

function defaultScoreOutcome(outcome: string): AdaptiveLogisticOutcomeScore {
  if (outcome === 'correct') {
    return { wasCorrect: true, testType: 'd' };
  }
  if (outcome === 'incorrect') {
    return { wasCorrect: false, testType: 'd' };
  }
  if (outcome === 'study') {
    return { wasCorrect: false, testType: 's' };
  }
  throw new Error(`Adaptive logistic model update cannot score outcome "${outcome}" without an explicit scoreOutcome adapter`);
}

export function findAdaptiveLogisticModelTarget(params: {
  readonly cardProbabilities: any;
  readonly target: ModelPracticeUpdateRequest['target'];
}): { cardIndex: number; stimIndex: number } {
  const cards = params.cardProbabilities?.cards;
  if (!Array.isArray(cards)) {
    throw new Error('Adaptive logistic model update requires cardProbabilities.cards');
  }

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
    const card = cards[cardIndex];
    if (!identityEquals(card?.clusterKC, params.target.clusterKC)) {
      continue;
    }
    const stims = card?.stims;
    if (!Array.isArray(stims)) {
      continue;
    }
    for (let stimIndex = 0; stimIndex < stims.length; stimIndex += 1) {
      const stim = stims[stimIndex];
      if (identityEquals(stim?.stimulusKC, params.target.stimulusKC)) {
        return { cardIndex, stimIndex };
      }
    }
  }

  throw new Error(
    `Adaptive logistic model target not found: clusterKC=${String(params.target.clusterKC)}, stimulusKC=${String(params.target.stimulusKC)}`,
  );
}

export function queryAdaptiveLogisticModelPracticeState(params: {
  readonly cardProbabilities: any;
  readonly query: ModelPracticeStateQuery;
}): unknown {
  const target = findAdaptiveLogisticModelTarget({
    cardProbabilities: params.cardProbabilities,
    target: params.query.target,
  });
  const card = params.cardProbabilities.cards[target.cardIndex];
  const stim = card.stims[target.stimIndex];
  switch (params.query.metric) {
    case 'probability':
      return stim.probabilityEstimate;
    case 'priorCorrect':
      return stim.priorCorrect;
    case 'priorIncorrect':
      return stim.priorIncorrect;
    case 'priorStudy':
      return stim.priorStudy;
    case 'totalPracticeDuration':
      return stim.totalPracticeDuration;
    case 'lastOutcome':
      return stim.outcomeStack?.at(-1);
  }
}

export function applyModelPracticeUpdateToAdaptiveLogistic(
  params: ApplyModelPracticeUpdateToAdaptiveLogisticParams,
): AppliedAdaptiveLogisticModelPracticeUpdate {
  const target = findAdaptiveLogisticModelTarget({
    cardProbabilities: params.cardProbabilities,
    target: params.request.target,
  });
  const score = (params.scoreOutcome ?? defaultScoreOutcome)(params.request.outcome);
  const responseKey = params.request.target.response?.responseKey;
  const practiceTime = params.request.practiceDurationMs ?? 0;

  applyAnswerUpdate({
    cardProbabilities: params.cardProbabilities,
    cards: params.cardProbabilities.cards,
    selectedClusterIndex: target.cardIndex,
    currentStimIndex: target.stimIndex,
    whichStim: target.stimIndex,
    practiceTime,
    wasCorrect: score.wasCorrect,
    testType: score.testType,
    answerText: responseKey ?? '',
    onMissingResponseMetrics: () => {
      if (params.onMissingResponseMetrics) {
        params.onMissingResponseMetrics(responseKey ?? '');
        return;
      }
      throw new Error(`Adaptive logistic model update missing response metrics for responseKey="${responseKey ?? ''}"`);
    },
  });

  return {
    cardIndex: target.cardIndex,
    stimIndex: target.stimIndex,
    ...(responseKey ? { responseKey } : {}),
    wasCorrect: score.wasCorrect,
    testType: score.testType,
    practiceTime,
  };
}
