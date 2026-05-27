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
    getResponseKCMapForTdf: async (tdfId) => await deps.meteorCallAsync(
      'getResponseKCMapForTdf',
      tdfId,
    ) as Record<string, unknown>,
  };
}
