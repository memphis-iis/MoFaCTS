import { applyResumeModelState } from './resumeModelState';

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
  ) => Promise<any[]>;
  readonly reconstructLearningStateFromHistory: (historyRows: any[]) => any;
  readonly setOverallOutcomeHistory: (history: any) => void;
  readonly setOverallStudyHistory: (history: any) => void;
  readonly getHistoryCorrectAnswer: (rawResponse: any) => string;
  readonly getHistoryResponseKey: (rawResponse: any) => string;
  readonly setNumVisibleCards: (numVisibleCards: number) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
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
  );
  const reconstructed = params.reconstructLearningStateFromHistory(historyRows || []);

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
