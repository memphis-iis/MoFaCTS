import { createBaseUnitEngine } from './createBaseUnitEngine';
import { createAssessmentUnitEngine } from './assessment-session/AssessmentUnitEngine';
import { createInstructionUnitEngine } from './instruction/InstructionUnitEngine';
import { createLearningSessionUnitEngine } from './learning-session/LearningSessionUnitEngine';
import { createVideoSessionUnitEngine } from './video-session/VideoUnitEngine';
import {
  createRegisteredUnitEngine,
  hasRegisteredUnitEngine,
  registerUnitEngine,
  registerUnitEngineWithDeps,
} from './UnitEngineRegistry';

const INSTRUCTION_UNIT_TYPE = 'instruction-only';
const LEARNING_SESSION_UNIT_TYPE = 'model';
const ASSESSMENT_SESSION_UNIT_TYPE = 'schedule';
const VIDEO_SESSION_UNIT_TYPE = 'video';
const AUTO_TUTOR_SESSION_UNIT_TYPE = 'autotutor';

export interface CreateUnitEngineDeps {
  readonly extend: (target: any, source: any) => any;
  readonly createAdaptiveQuestionLogic: () => any;
  readonly getSessionValue: (key: string) => any;
  readonly setSessionValue: (key: string, value: any) => void;
  readonly getDeliverySettings: () => Record<string, any>;
  readonly getStimCount: () => number;
  readonly getStimCluster: (clusterIndex: any) => any;
  readonly getStimKCBaseForCurrentStimuliSet: () => any;
  readonly getTestType: () => string;
  readonly getHiddenItems: () => unknown[];
  readonly setNumVisibleCards: (numVisibleCards: number) => void;
  readonly setQuestionIndex: (questionIndex: number) => void;
  readonly getDisplayAnswerText: (answer: any) => string;
  readonly updateCurStudentPerformance: (wasCorrect: any, practiceTime: any, testType: any) => void;
  readonly updateCurStudedentPracticeTime: (practiceTime: any) => void;
  readonly meteorCallAsync: (name: string, ...args: any[]) => Promise<any>;
  readonly getCurrentUserId: () => any;
  readonly reconstructLearningStateFromHistory: (historyRows: any[]) => any;
  readonly extractDelimFields: (source: any, target: any[]) => void;
  readonly rangeVal: (source: any) => any[];
  readonly legacyFloat: (source: any) => number;
  readonly legacyInt: (source: any) => number;
  readonly currentUserHasRole: (roles: string) => boolean;
  readonly displayify: (value: any) => any;
  readonly unitIsFinished: (reason: string) => void;
  readonly findTdfById: (tdfId: any) => any;
  readonly getExperimentState: () => any;
  readonly hasScheduleArtifactForUnit: (experimentState: any, unitNumber: any) => boolean;
  readonly createExperimentState: (newExperimentState: any) => Promise<any>;
  readonly setCardValue: (key: string, value: unknown) => void;
  readonly setAlternateDisplayIndex: (value: number | undefined) => void;
  readonly setOriginalQuestion: (value: unknown) => void;
  readonly alertUser: (message: string) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

async function createWithBase(
  deps: CreateUnitEngineDeps,
  curExperimentData: any,
  unitType: string,
) {
  const baseEngine = createDefaultUnitEngine(deps, curExperimentData);
  const engineExtension = await createRegisteredUnitEngine(unitType, deps);
  const engine = deps.extend(baseEngine, engineExtension);
  await engine.init();
  return engine;
}

function getStimAnswer(deps: CreateUnitEngineDeps, clusterIndex: any, whichAnswer: any) {
  const cluster = deps.getStimCluster(clusterIndex);
  const stim = cluster.stims[whichAnswer];
  if (!stim) {
    throw new Error(`Stim not found for cluster ${clusterIndex}, stim ${whichAnswer}`);
  }
  return stim.correctResponse;
}

export function createDefaultUnitEngine(deps: CreateUnitEngineDeps, curExperimentData: any): any {
  const stimClusters: any[] = [];
  const numQuestions = deps.getStimCount();
  for (let i = 0; i < numQuestions; ++i) {
    stimClusters.push(deps.getStimCluster(i));
  }
  const engine = createBaseUnitEngine({
    experimentState: curExperimentData.experimentState,
    adaptiveQuestionLogic: deps.createAdaptiveQuestionLogic(),
    stimClusters,
    getCurrentTestType: () => deps.getSessionValue('testType'),
    getDeliverySettings: deps.getDeliverySettings,
    getStimAnswer: (clusterIndex, whichAnswer) => getStimAnswer(deps, clusterIndex, whichAnswer),
    setSessionValue: deps.setSessionValue,
    setCardValue: deps.setCardValue,
    setAlternateDisplayIndex: deps.setAlternateDisplayIndex,
    setOriginalQuestion: deps.setOriginalQuestion,
    log: deps.log,
  });
  deps.log(1, 'curExperimentData:', curExperimentData);
  return engine;
}

function registerDefaultUnitEngines(_deps: CreateUnitEngineDeps): void {
  if (!hasRegisteredUnitEngine(INSTRUCTION_UNIT_TYPE)) {
    registerUnitEngine(INSTRUCTION_UNIT_TYPE, createInstructionUnitEngine);
  }
  if (!hasRegisteredUnitEngine(LEARNING_SESSION_UNIT_TYPE)) {
    registerUnitEngineWithDeps<CreateUnitEngineDeps>(LEARNING_SESSION_UNIT_TYPE, (currentDeps) => createLearningSessionUnitEngine({
      getSessionValue: currentDeps.getSessionValue,
      setSessionValue: currentDeps.setSessionValue,
      getDeliverySettings: currentDeps.getDeliverySettings,
      getStimCount: currentDeps.getStimCount,
      getStimCluster: currentDeps.getStimCluster,
      getStimKCBaseForCurrentStimuliSet: currentDeps.getStimKCBaseForCurrentStimuliSet,
      getTestType: currentDeps.getTestType,
      getHiddenItems: currentDeps.getHiddenItems,
      setNumVisibleCards: currentDeps.setNumVisibleCards,
      setQuestionIndex: currentDeps.setQuestionIndex,
      getDisplayAnswerText: currentDeps.getDisplayAnswerText,
      updateCurStudentPerformance: currentDeps.updateCurStudentPerformance,
      updateCurStudedentPracticeTime: currentDeps.updateCurStudedentPracticeTime,
      meteorCallAsync: currentDeps.meteorCallAsync,
      getCurrentUserId: currentDeps.getCurrentUserId,
      reconstructLearningStateFromHistory: currentDeps.reconstructLearningStateFromHistory,
      extractDelimFields: currentDeps.extractDelimFields,
      rangeVal: currentDeps.rangeVal,
      legacyFloat: currentDeps.legacyFloat,
      legacyInt: currentDeps.legacyInt,
      currentUserHasRole: currentDeps.currentUserHasRole,
      displayify: currentDeps.displayify,
      unitIsFinished: currentDeps.unitIsFinished,
      findTdfById: currentDeps.findTdfById,
      alertUser: currentDeps.alertUser,
      log: currentDeps.log,
    }));
  }
  if (!hasRegisteredUnitEngine(ASSESSMENT_SESSION_UNIT_TYPE)) {
    registerUnitEngineWithDeps<CreateUnitEngineDeps>(ASSESSMENT_SESSION_UNIT_TYPE, (currentDeps) => createAssessmentUnitEngine({
      getSessionValue: currentDeps.getSessionValue,
      setSessionValue: currentDeps.setSessionValue,
      getExperimentState: currentDeps.getExperimentState,
      hasScheduleArtifactForUnit: currentDeps.hasScheduleArtifactForUnit,
      createExperimentState: currentDeps.createExperimentState,
      getStimCount: currentDeps.getStimCount,
      setQuestionIndex: currentDeps.setQuestionIndex,
      alertUser: currentDeps.alertUser,
      log: currentDeps.log,
    }));
  }
  if (!hasRegisteredUnitEngine(VIDEO_SESSION_UNIT_TYPE)) {
    registerUnitEngineWithDeps<CreateUnitEngineDeps>(VIDEO_SESSION_UNIT_TYPE, (currentDeps) => createVideoSessionUnitEngine({
      setSessionValue: currentDeps.setSessionValue,
      log: currentDeps.log,
    }));
  }
  if (!hasRegisteredUnitEngine(AUTO_TUTOR_SESSION_UNIT_TYPE)) {
    registerUnitEngine(AUTO_TUTOR_SESSION_UNIT_TYPE, () => ({
      unitType: AUTO_TUTOR_SESSION_UNIT_TYPE,
      async cardAnswered() {},
      selectNextCard() {},
      findCurrentCardInfo() {},
      unitFinished() {
        return false;
      },
    }));
  }
}

export async function createEmptyUnit(deps: CreateUnitEngineDeps, curExperimentData: any) {
  registerDefaultUnitEngines(deps);
  return await createWithBase(deps, curExperimentData, INSTRUCTION_UNIT_TYPE);
}

export async function createModelUnit(deps: CreateUnitEngineDeps, curExperimentData: any) {
  registerDefaultUnitEngines(deps);
  return await createWithBase(deps, curExperimentData, LEARNING_SESSION_UNIT_TYPE);
}

export async function createScheduleUnit(deps: CreateUnitEngineDeps, curExperimentData: any) {
  registerDefaultUnitEngines(deps);
  return await createWithBase(deps, curExperimentData, ASSESSMENT_SESSION_UNIT_TYPE);
}

export async function createVideoUnit(deps: CreateUnitEngineDeps, curExperimentData: any) {
  registerDefaultUnitEngines(deps);
  return await createWithBase(deps, curExperimentData, VIDEO_SESSION_UNIT_TYPE);
}

export async function createAutoTutorUnit(deps: CreateUnitEngineDeps, curExperimentData: any) {
  registerDefaultUnitEngines(deps);
  return await createWithBase(deps, curExperimentData, AUTO_TUTOR_SESSION_UNIT_TYPE);
}
