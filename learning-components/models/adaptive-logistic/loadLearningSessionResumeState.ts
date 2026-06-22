import { applyResumeModelState } from './resumeModelState';
import type { LearningHistoryReadOptions } from '../../units/UnitEngineServerMethods';

export interface LoadLearningSessionResumeStateParams {
  readonly userId: any;
  readonly tdfId: any;
  readonly currentUnitNumber: number;
  readonly resetStudentPerformance: boolean;
  readonly hiddenItems: unknown[];
  readonly cardProbabilities: any;
  readonly stimClusters: any[];
  readonly getLearningHistoryForUnit: (
    userId: any,
    tdfId: any,
    currentUnitNumber: number,
    resetStudentPerformance: boolean,
    options?: LearningHistoryReadOptions,
  ) => Promise<any[]>;
  readonly reconstructLearningStateFromHistory: (
    historyRows: any[],
    options?: { allowResponseLessModelPractice?: boolean },
  ) => any;
  readonly allowResponseLessModelPractice?: boolean;
  readonly setOverallOutcomeHistory: (history: any) => void;
  readonly setOverallStudyHistory: (history: any) => void;
  readonly getHistoryCorrectAnswer: (rawResponse: any) => string;
  readonly getHistoryResponseKey: (rawResponse: any) => string;
  readonly setNumVisibleCards: (numVisibleCards: number) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

function getResumeClusterKCs(cardProbabilities: any, stimClusters: any[]): Array<string | number> {
  const seen = new Set<string>();
  const clusterKCs: Array<string | number> = [];
  const cards = Array.isArray(cardProbabilities?.cards) ? cardProbabilities.cards : [];
  const sources = cards.length > 0 ? cards : stimClusters;
  for (const source of sources) {
    const value = source?.clusterKC ?? source?.stims?.[0]?.clusterKC;
    if (typeof value !== 'string' && typeof value !== 'number') {
      continue;
    }
    const key = `${typeof value}:${String(value).trim().toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    clusterKCs.push(value);
  }
  return clusterKCs;
}

export async function loadLearningSessionResumeState(
  params: LoadLearningSessionResumeStateParams,
): Promise<void> {
  params.log(1, 'loadResumeState start');

  const historyRows = await params.getLearningHistoryForUnit(
    params.userId,
    params.tdfId,
    params.currentUnitNumber,
    params.resetStudentPerformance,
    { clusterKCs: getResumeClusterKCs(params.cardProbabilities, params.stimClusters) },
  );
  const reconstructed = params.reconstructLearningStateFromHistory(historyRows || [], {
    allowResponseLessModelPractice: params.allowResponseLessModelPractice === true,
  });

  params.setOverallOutcomeHistory(reconstructed.overallOutcomeHistory);
  params.setOverallStudyHistory(reconstructed.overallStudyHistory);

  const numVisibleCards = applyResumeModelState({
    cardProbabilities: params.cardProbabilities,
    stimClusters: params.stimClusters,
    reconstructed,
    getHistoryCorrectAnswer: params.getHistoryCorrectAnswer,
    getHistoryResponseKey: params.getHistoryResponseKey,
  });
  params.setNumVisibleCards(numVisibleCards - params.hiddenItems.length);
}
