import { normalizeClusterKC } from '../../runtime/sharedModelPracticeIdentity';

export interface ApplyResumeModelStateParams {
  readonly cardProbabilities: any;
  readonly stimClusters: any[];
  readonly reconstructed: any;
  readonly getHistoryResponseKey: (rawResponse: unknown) => string;
}

function createStimulusStateFromSharedCluster(clusterState: any) {
  if (!clusterState || typeof clusterState !== 'object') {
    return null;
  }
  const priorCorrect = Number(clusterState.priorCorrect || 0);
  const priorIncorrect = Number(clusterState.priorIncorrect || 0);
  const priorStudy = Number(clusterState.priorStudy || 0);
  return {
    firstSeen: clusterState.firstSeen,
    lastSeen: clusterState.lastSeen,
    priorCorrect,
    priorIncorrect,
    allTimeCorrect: clusterState.allTimeCorrect,
    allTimeIncorrect: clusterState.allTimeIncorrect,
    priorStudy,
    outcomeStack: Array.isArray(clusterState.outcomeStack) ? [...clusterState.outcomeStack] : [],
    timeHistory: Array.isArray(clusterState.timeHistory) ? [...clusterState.timeHistory] : [],
    totalPracticeDuration: clusterState.totalPracticeDuration,
    allTimeTotalPracticeDuration: clusterState.allTimeTotalPracticeDuration,
    curSessionPriorCorrect: priorCorrect,
    curSessionPriorIncorrect: priorIncorrect,
    hasBeenIntroduced: clusterState.hasBeenIntroduced === true || Number(clusterState.firstSeen || 0) > 0,
    timesSeen: priorCorrect + priorIncorrect + priorStudy,
    otherPracticeTime: clusterState.otherPracticeTime,
  };
}

export function applyResumeModelState(params: ApplyResumeModelStateParams): number {
  const cards = params.cardProbabilities.cards;

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    const card = cards[cardIndex];
    const clusterState = params.reconstructed.clusterState[normalizeClusterKC(card.clusterKC)];
    if (clusterState) {
      Object.assign(card, clusterState);
    }

    for (let stimIndex = 0; stimIndex < card.stims.length; stimIndex++) {
      const stim = card.stims[stimIndex];
      const stimulusState = params.reconstructed.stimulusState[String(stim.stimulusKC)];
      if (stimulusState) {
        Object.assign(stim, stimulusState);
      } else {
        const sharedClusterStimulusState = createStimulusStateFromSharedCluster(clusterState);
        if (sharedClusterStimulusState) {
          Object.assign(stim, sharedClusterStimulusState);
        }
      }
    }
  }

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    const card = cards[cardIndex];
    for (let stimIndex = 0; stimIndex < card.stims.length; stimIndex++) {
      const rawResponse = params.stimClusters[cardIndex]?.stims?.[stimIndex]?.correctResponse;
      const responseKey = params.getHistoryResponseKey(rawResponse);
      const responseState = params.reconstructed.responseState[String(responseKey)];
      if (responseKey && responseState && params.cardProbabilities.responses[responseKey]) {
        Object.assign(params.cardProbabilities.responses[responseKey], responseState);
      }
    }
  }

  let numVisibleCards = 0;
  for (let i = 0; i < params.cardProbabilities.cards.length; i++) {
    if (params.cardProbabilities.cards[i].canUse) {
      numVisibleCards += params.cardProbabilities.cards[i].stims.length;
    }
  }

  Object.assign(params.cardProbabilities, {
    numQuestionsAnswered: params.reconstructed.numQuestionsAnswered,
    numQuestionsAnsweredCurrentSession: params.reconstructed.numQuestionsAnsweredCurrentSession,
    numCorrectAnswers: params.reconstructed.numCorrectAnswers,
  });

  return numVisibleCards;
}
