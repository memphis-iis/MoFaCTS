import { createInitialModelState } from './modelStateFactory';
import {
  applyStimulusCrowdStatsToCards,
  collectStimulusKCsForCrowdStats,
  type StimulusCrowdStat,
} from './stimulusCrowdStatsModel';

export interface InitializeLearningModelStateParams {
  readonly numQuestions: number;
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
  readonly resolveRuntimeConfig: (unit: any) => Record<string, unknown> | null;
  readonly unitLabel: string;
  readonly alertUser: (message: string) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export async function initializeLearningModelState(
  params: InitializeLearningModelStateParams,
): Promise<void> {
  params.log(1, 'initializeLogisticModelState', params.numQuestions);
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
    const session = params.resolveRuntimeConfig(params.currentTdfUnit) || {};
    const errorMsg = `${params.unitLabel} in unit "${params.currentTdfUnit.unitname}" (unit ${params.currentUnitNumber}) has no cards. ` +
      `Check clusterlist configuration. ` +
      `Clusterlist: "${session.clusterlist || 'MISSING'}", ` +
      `NumQuestions: ${params.numQuestions}, ` +
      `InitCards length: ${initCards ? initCards.length : 'null'}`;
    params.log(1, '[Unit Engine] EMPTY MODEL ERROR:', errorMsg);
    params.alertUser(`${params.unitLabel} has no cards - check TDF clusterlist configuration`);
    throw new Error(errorMsg);
  }
}
