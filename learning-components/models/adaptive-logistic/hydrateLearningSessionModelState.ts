import { applyResumeModelState } from './resumeModelState';
import type { LearningHistoryReadOptions } from '../../units/UnitEngineServerMethods';

export interface HydrateLearningSessionModelStateParams {
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
    options?: { allowResponseLessSparcModelPractice?: boolean },
  ) => any;
  readonly allowResponseLessSparcModelPractice?: boolean;
  readonly setOverallOutcomeHistory: (history: any) => void;
  readonly setOverallStudyHistory: (history: any) => void;
  readonly getHistoryResponseKey: (rawResponse: any) => string;
  readonly setNumVisibleCards: (numVisibleCards: number) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

function getResumeClusterKCs(cardProbabilities: any, stimClusters: any[]): Array<string | number> {
  const seen = new Set<string>();
  const clusterKCs: Array<string | number> = [];
  const cards = Array.isArray(cardProbabilities?.cards) ? cardProbabilities.cards : [];
  const usableCards = cards.filter((card: any) => card?.canUse === true);
  const sources = usableCards.length > 0
    ? usableCards
    : cards.length > 0
      ? cards
      : stimClusters;
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

function normalizeClusterKey(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized ? normalized : null;
}

function filterHistoryRowsForActiveClusters(historyRows: any[], clusterKCs: Array<string | number>): any[] {
  const activeClusterKeys = new Set(
    clusterKCs
      .map((clusterKC) => normalizeClusterKey(clusterKC))
      .filter((clusterKC): clusterKC is string => clusterKC !== null),
  );
  if (activeClusterKeys.size === 0) {
    return [];
  }
  return historyRows.filter((row) => {
    const clusterKey = normalizeClusterKey(row?.clusterKC ?? row?.KCCluster);
    return clusterKey !== null && activeClusterKeys.has(clusterKey);
  });
}

export async function hydrateLearningSessionModelState(
  params: HydrateLearningSessionModelStateParams,
): Promise<void> {
  params.log(1, 'hydrateLearningSessionModelState start');

  const activeClusterKCs = getResumeClusterKCs(params.cardProbabilities, params.stimClusters);
  const historyRows = await params.getLearningHistoryForUnit(
    params.userId,
    params.tdfId,
    params.currentUnitNumber,
    params.resetStudentPerformance,
  );
  const activeHistoryRows = filterHistoryRowsForActiveClusters(historyRows || [], activeClusterKCs);
  const reconstructed = params.reconstructLearningStateFromHistory(activeHistoryRows, {
    allowResponseLessSparcModelPractice: params.allowResponseLessSparcModelPractice === true,
  });

  params.setOverallOutcomeHistory(reconstructed.overallOutcomeHistory);
  params.setOverallStudyHistory(reconstructed.overallStudyHistory);

  const numVisibleCards = applyResumeModelState({
    cardProbabilities: params.cardProbabilities,
    stimClusters: params.stimClusters,
    reconstructed,
    getHistoryResponseKey: params.getHistoryResponseKey,
  });
  params.setNumVisibleCards(numVisibleCards - params.hiddenItems.length);
}
