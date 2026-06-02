import { createInitialModelState } from './model/modelStateFactory';
import {
  applyStimulusCrowdStatsToCards,
  collectStimulusKCsForCrowdStats,
  type StimulusCrowdStat,
} from './model/stimulusCrowdStatsModel';
import { resolveLearningSessionRuntimeConfig } from './learningSessionRuntimeConfig';

export interface InitializeLearningModelStateParams {
  readonly numQuestions: number;
  readonly curKCBase: any;
  readonly currentTdfId: any;
  readonly currentTdfUnit: any;
  readonly currentUnitNumber: any;
  readonly stimClusters: any[];
  readonly getResponseKCMapForTdf: (tdfId: any) => Promise<Record<string, unknown>>;
  readonly getStimulusCrowdStatsForDeck: (tdfId: any, stimulusKCs: Array<string | number>) => Promise<StimulusCrowdStat[]>;
  readonly setResponseKCMap: (responseKCMap: Record<string, unknown>) => void;
  readonly getStimParameterArrayFromCluster: (cluster: any, whichStim: number) => unknown[];
  readonly normalizeResponseText: (rawResponse: unknown) => string;
  readonly setUpClusterList: (cards: any[]) => void;
  readonly initCardProbs: (overrideData: any) => void;
  readonly alertUser: (message: string) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export async function initializeLearningModelState(
  params: InitializeLearningModelStateParams,
): Promise<void> {
  params.log(1, 'initializeLogisticModelState', params.numQuestions, params.curKCBase);
  const stimulusKCs = collectStimulusKCsForCrowdStats(params.stimClusters);
  const [responseKCMap, crowdStats] = await Promise.all([
    params.getResponseKCMapForTdf(params.currentTdfId),
    params.getStimulusCrowdStatsForDeck(params.currentTdfId, stimulusKCs),
  ]);
  params.setResponseKCMap(responseKCMap);
  params.log(2, 'initializeLogisticModelState,responseKCMap', responseKCMap);
  params.log(2, 'initializeLogisticModelState,stimulusCrowdStats', {
    requested: stimulusKCs.length,
    returned: crowdStats.length,
  });

  const initialModelState = createInitialModelState({
    stimClusters: params.stimClusters,
    responseKCMap,
    getStimParameterArrayFromCluster: params.getStimParameterArrayFromCluster,
    normalizeResponseText: params.normalizeResponseText,
  });
  const initCards = initialModelState.cards;
  const initResponses = initialModelState.responses;
  const initProbs = initialModelState.probabilities;

  params.setUpClusterList(initCards);
  applyStimulusCrowdStatsToCards({
    cards: initCards,
    crowdStats,
  });

  params.initCardProbs({
    cards: initCards,
    responses: initResponses,
  });

  params.log(2, 'initCards:', initCards, initProbs);

  if (!initCards || initCards.length === 0) {
    const session = resolveLearningSessionRuntimeConfig(params.currentTdfUnit) || {};
    const errorMsg = `Learning/video session in unit "${params.currentTdfUnit.unitname}" (unit ${params.currentUnitNumber}) has no cards. ` +
      `Check clusterlist configuration. ` +
      `Clusterlist: "${session.clusterlist || 'MISSING'}", ` +
      `NumQuestions: ${params.numQuestions}, ` +
      `InitCards length: ${initCards ? initCards.length : 'null'}`;
    params.log(1, '[Unit Engine] EMPTY MODEL ERROR:', errorMsg);
    params.alertUser('Learning session has no cards - check TDF clusterlist configuration');
    throw new Error(errorMsg);
  }
}
