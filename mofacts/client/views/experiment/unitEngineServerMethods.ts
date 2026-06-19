import type { UnitEngineServerMethods } from '../../../../learning-components/units/UnitEngineServerMethods';

export type UnitEngineServerMethodDeps = {
  readonly meteorCallAsync: (name: string, ...args: any[]) => Promise<any>;
};

export function createUnitEngineServerMethods(
  deps: UnitEngineServerMethodDeps,
): UnitEngineServerMethods {
  return {
    getAutoTutorHistoryForUnit: async (userId, tdfId, unitNumber) => await deps.meteorCallAsync(
      'getAutoTutorHistoryForUnit',
      userId,
      tdfId,
      unitNumber,
    ) as unknown[],
    getLearningHistoryForUnit: async (
      userId,
      tdfId,
      currentUnitNumber,
      resetStudentPerformance,
    ) => await deps.meteorCallAsync(
      'getLearningHistoryForUnit',
      userId,
      tdfId,
      currentUnitNumber,
      resetStudentPerformance,
    ) as any[],
    getSparcHistoryForUnit: async (userId, tdfId, unitNumber) => await deps.meteorCallAsync(
      'getSparcHistoryForUnit',
      userId,
      tdfId,
      unitNumber,
    ) as unknown[],
    getResponseKCMapForTdf: async (tdfId) => await deps.meteorCallAsync(
      'getResponseKCMapForTdf',
      tdfId,
    ) as Record<string, unknown>,
    getStimulusCrowdStatsForDeck: async (tdfId, stimulusKCs) => await deps.meteorCallAsync(
      'getStimulusCrowdStatsForDeck',
      tdfId,
      stimulusKCs,
    ) as Array<{
      stimulusKC: string | number;
      correctCount: number;
      incorrectCount: number;
      totalCount: number;
    }>,
  };
}
