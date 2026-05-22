export interface CreateInitialModelStateDependencies {
  readonly stimClusters: any[];
  readonly responseKCMap: Record<string, unknown>;
  readonly getStimParameterArrayFromCluster: (cluster: any, whichStim: number) => unknown[];
  readonly normalizeResponseText: (rawResponse: unknown) => string;
}

export interface InitialModelState {
  readonly cards: any[];
  readonly responses: Record<string, any>;
  readonly probabilities: Array<{
    cardIndex: number;
    stimIndex: number;
    probability: number;
  }>;
}

export function createInitialModelState(
  dependencies: CreateInitialModelStateDependencies,
): InitialModelState {
  const initCards: any[] = [];
  const initResponses: Record<string, any> = {};
  const initProbs: Array<{ cardIndex: number; stimIndex: number; probability: number }> = [];

  for (let i = 0; i < dependencies.stimClusters.length; ++i) {
    const cluster = dependencies.stimClusters[i];
    const clusterKC = cluster.stims?.[0]?.clusterKC;
    if (!Number.isFinite(clusterKC)) {
      throw new Error(`[Unit Engine] Missing clusterKC for cluster index ${i}; refusing synthetic fallback.`);
    }
    const card: any = {
      clusterKC,
      priorCorrect: 0,
      allTimeCorrect: 0,
      allTimeIncorrect: 0,
      priorIncorrect: 0,
      hasBeenIntroduced: false,
      outcomeStack: [],
      lastSeen: 0,
      firstSeen: 0,
      totalPracticeDuration: 0,
      allTimeTotalPracticeDuration: 0,
      otherPracticeTime: 0,
      previousCalculatedProbabilities: [],
      priorStudy: 0,
      trialsSinceLastSeen: 3,
      canUse: false,
      stims: [],
      instructionQuestionResult: null,
    };

    const numStims = cluster.stims.length;
    for (let j = 0; j < numStims; ++j) {
      const clusterStim = cluster.stims[j];
      const stimClusterKC = clusterStim.clusterKC;
      const stimKC = clusterStim.stimulusKC;
      if (!Number.isFinite(stimClusterKC)) {
        throw new Error(`[Unit Engine] Missing clusterKC for stim ${j} in cluster index ${i}; refusing synthetic fallback.`);
      }
      if (!Number.isFinite(stimKC)) {
        throw new Error(`[Unit Engine] Missing stimulusKC for stim ${j} in cluster index ${i}; refusing synthetic fallback.`);
      }
      if (stimClusterKC !== clusterKC) {
        throw new Error(`[Unit Engine] Inconsistent clusterKC in cluster index ${i}: cluster=${clusterKC}, stim=${stimClusterKC}.`);
      }
      const parameter = dependencies.getStimParameterArrayFromCluster(cluster, j);
      card.stims.push({
        clusterKC: stimClusterKC,
        stimIndex: j,
        stimulusKC: stimKC,
        priorCorrect: 0,
        allTimeCorrect: 0,
        allTimeIncorrect: 0,
        curSessionPriorCorrect: 0,
        priorIncorrect: 0,
        curSessionPriorIncorrect: 0,
        hasBeenIntroduced: false,
        outcomeStack: [],
        lastSeen: 0,
        firstSeen: 0,
        totalPracticeDuration: 0,
        allTimeTotalPracticeDuration: 0,
        otherPracticeTime: 0,
        previousCalculatedProbabilities: [],
        priorStudy: 0,
        parameter: parameter,
        instructionQuestionResult: null,
        timesSeen: 0,
        canUse: true,
      });

      initProbs.push({
        cardIndex: i,
        stimIndex: j,
        probability: 0,
      });

      const rawResponse = cluster.stims[j].correctResponse;
      const response = dependencies.normalizeResponseText(rawResponse);
      if (!(response in initResponses)) {
        initResponses[response] = {
          KCId: dependencies.responseKCMap[response],
          priorCorrect: 0,
          allTimeCorrect: 0,
          allTimeIncorrect: 0,
          priorIncorrect: 0,
          firstSeen: 0,
          lastSeen: 0,
          totalPracticeDuration: 0,
          allTimeTotalPracticeDuration: 0,
          priorStudy: 0,
          outcomeStack: [],
          instructionQuestionResult: null,
        };
      }
    }

    initCards.push(card);
  }

  return {
    cards: initCards,
    responses: initResponses,
    probabilities: initProbs,
  };
}
