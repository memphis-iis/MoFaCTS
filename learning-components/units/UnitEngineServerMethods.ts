export type LearningHistoryReadOptions = {
  readonly courseAssignment?: {
    readonly assignmentId: string;
    readonly courseId: string;
    readonly TDFId: string;
    readonly launchSource: 'courses';
  } | null;
  readonly clusterKCs?: Array<string | number>;
};

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
    options?: LearningHistoryReadOptions,
  ) => Promise<any[]>;
  readonly getSparcHistoryForUnit: (
    userId: string,
    tdfId: string,
    unitNumber: number,
    options?: Pick<LearningHistoryReadOptions, 'courseAssignment'>,
  ) => Promise<unknown[]>;
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
    'getSparcHistoryForUnit',
    'getResponseKCMapForTdf',
    'getStimulusCrowdStatsForDeck',
  ]);
}
