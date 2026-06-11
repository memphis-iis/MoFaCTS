export const UNIT_ENGINE_SESSION_READ_KEYS = [
  'clozeQuestionParts',
  'clusterIndex',
  'curStudentPerformance',
  'currentRootTdfId',
  'currentStimuliSetId',
  'currentTdfFile',
  'currentTdfId',
  'currentTdfName',
  'currentTdfUnit',
  'currentUnitNumber',
  'instructionQuestionResults',
  'isVideoSession',
  'overallOutcomeHistory',
  'overallStudyHistory',
  'resetSchedule',
  'subTdfIndex',
  'testType',
] as const;

export const UNIT_ENGINE_SESSION_WRITE_KEYS = [
  'alternateDisplayIndex',
  'clusterIndex',
  'currentAnswer',
  'currentStimProbFunctionParameters',
  'firstCardPreparationDiagnostic',
  'overallOutcomeHistory',
  'overallStudyHistory',
  'responseKCMap',
  'schedule',
  'testType',
  'unitType',
] as const;

export type UnitEngineSessionReadKey = typeof UNIT_ENGINE_SESSION_READ_KEYS[number];
export type UnitEngineSessionWriteKey = typeof UNIT_ENGINE_SESSION_WRITE_KEYS[number];
