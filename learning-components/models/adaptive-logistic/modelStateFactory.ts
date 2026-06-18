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

type ExplicitModelTarget = {
  readonly stimulusId?: unknown;
  readonly stimulusKC?: unknown;
  readonly clusterKC?: unknown;
  readonly KCId?: unknown;
  readonly KCDefault?: unknown;
  readonly KCCluster?: unknown;
};

function hasIdentity(value: unknown): value is string | number {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeIdentity(value: unknown, fieldName: string): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  throw new Error(`[Unit Engine] Missing ${fieldName}; refusing synthetic fallback.`);
}

function getSparcStimulusRegistry(clusterStim: any): ExplicitModelTarget[] {
  const registry = clusterStim?.display?.stimulusRegistry;
  if (!Array.isArray(registry)) {
    return [];
  }
  return registry;
}

function createInitialCardStim(params: {
  readonly clusterKC: string | number;
  readonly stimKC: string | number;
  readonly stimIndex: number;
  readonly parameter: unknown[];
  readonly modelPracticeOnly?: boolean;
  readonly sourceStim?: any;
}) {
  return {
    clusterKC: params.clusterKC,
    stimIndex: params.stimIndex,
    stimulusKC: params.stimKC,
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
    parameter: params.parameter,
    instructionQuestionResult: null,
    timesSeen: 0,
    canUse: true,
    probabilityEstimate: 0.5,
    ...(params.modelPracticeOnly ? {
      modelPracticeOnly: true,
      correctResponse: params.sourceStim?.correctResponse || String(params.stimKC),
      params: params.sourceStim?.params || '0,0.8',
    } : {}),
  };
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
    const resolvedClusterKC = normalizeIdentity(clusterKC, `clusterKC for cluster index ${i}`);
    const card: any = {
      clusterKC: resolvedClusterKC,
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
      const stimClusterKC = normalizeIdentity(clusterStim.clusterKC, `clusterKC for stim ${j} in cluster index ${i}`);
      const stimKC = normalizeIdentity(clusterStim.stimulusKC, `stimulusKC for stim ${j} in cluster index ${i}`);
      if (String(stimClusterKC) !== String(resolvedClusterKC)) {
        throw new Error(`[Unit Engine] Inconsistent clusterKC in cluster index ${i}: cluster=${resolvedClusterKC}, stim=${stimClusterKC}.`);
      }
      const parameter = dependencies.getStimParameterArrayFromCluster(cluster, j);
      card.stims.push(createInitialCardStim({
        clusterKC: stimClusterKC,
        stimKC,
        stimIndex: j,
        parameter,
      }));

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

      for (const target of getSparcStimulusRegistry(clusterStim)) {
        if (!hasIdentity(target.stimulusKC) || !hasIdentity(target.clusterKC)) {
          throw new Error(`[Unit Engine] SPARC stimulusRegistry entry for stim ${j} in cluster index ${i} is missing clusterKC or stimulusKC.`);
        }
        const modelStimIndex = card.stims.length;
        const modelClusterKC = normalizeIdentity(target.clusterKC, 'SPARC stimulusRegistry.clusterKC');
        const modelStimKC = normalizeIdentity(target.stimulusKC, 'SPARC stimulusRegistry.stimulusKC');
        card.stims.push(createInitialCardStim({
          clusterKC: modelClusterKC,
          stimKC: modelStimKC,
          stimIndex: modelStimIndex,
          parameter,
          modelPracticeOnly: true,
          sourceStim: clusterStim,
        }));
        initProbs.push({
          cardIndex: i,
          stimIndex: modelStimIndex,
          probability: 0,
        });
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
