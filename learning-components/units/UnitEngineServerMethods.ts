export type UnitEngineServerMethods = {
  readonly getAutoTutorHistoryForUnit: (
    userId: string,
    tdfId: string,
    unitNumber: number,
  ) => Promise<unknown[]>;
  readonly getLearningHistoryForUnit: (
    userId: any,
    tdfId: any,
    currentUnitNumber: number,
    resetStudentPerformance: boolean,
  ) => Promise<any[]>;
  readonly getResponseKCMapForTdf: (tdfId: any) => Promise<Record<string, unknown>>;
  readonly getStimulusCrowdStatsForDeck: (
    tdfId: any,
    stimulusKCs: Array<string | number>,
  ) => Promise<Array<{
    stimulusKC: string | number;
    correctCount: number;
    incorrectCount: number;
    totalCount: number;
  }>>;
};

export function getUnitEngineServerMethodNames(): Set<keyof UnitEngineServerMethods> {
  return new Set([
    'getAutoTutorHistoryForUnit',
    'getLearningHistoryForUnit',
    'getResponseKCMapForTdf',
    'getStimulusCrowdStatsForDeck',
  ]);
}
