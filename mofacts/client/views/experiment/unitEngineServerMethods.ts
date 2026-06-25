import type { UnitEngineServerMethods } from '../../../../learning-components/units/UnitEngineServerMethods';
import { getCourseAssignmentLaunchContext } from '../../lib/courseAssignmentLaunchContext';

export type UnitEngineServerMethodDeps = {
  readonly meteorCallAsync: (name: string, ...args: any[]) => Promise<any>;
};

function withActiveCourseAssignment(options?: Record<string, unknown>): Record<string, unknown> {
  const context = getCourseAssignmentLaunchContext();
  if (!context) {
    return { ...(options || {}) };
  }
  return {
    ...(options || {}),
    courseAssignment: context,
  };
}

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
      options,
    ) => await deps.meteorCallAsync(
      'getLearningHistoryForUnit',
      userId,
      tdfId,
      currentUnitNumber,
      resetStudentPerformance,
      withActiveCourseAssignment(options),
    ) as any[],
    getSparcHistoryForUnit: async (userId, tdfId, unitNumber, options) => await deps.meteorCallAsync(
      'getSparcHistoryForUnit',
      userId,
      tdfId,
      unitNumber,
      withActiveCourseAssignment(options),
    ) as unknown[],
    getResponseKCMapForTdf: async (tdfId) => await deps.meteorCallAsync(
      'getResponseKCMapForTdf',
      tdfId,
      withActiveCourseAssignment(),
    ) as Record<string, unknown>,
    getStimulusCrowdStatsForDeck: async (tdfId, stimulusKCs) => await deps.meteorCallAsync(
      'getStimulusCrowdStatsForDeck',
      tdfId,
      stimulusKCs,
      withActiveCourseAssignment(),
    ) as Array<{
      stimulusKC: string | number;
      correctCount: number;
      incorrectCount: number;
      totalCount: number;
    }>,
  };
}
