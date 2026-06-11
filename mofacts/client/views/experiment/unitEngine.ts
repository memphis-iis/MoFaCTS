import {currentUserHasRole} from '../../lib/roleUtils';
import {
  extractDelimFields,
  rangeVal,
  getStimCount,
  getStimCluster,
  getStimKCBaseForCurrentStimuliSet,
  getTestType,
  updateCurStudentPerformance,
  updateCurStudedentPracticeTime
} from '../../lib/currentTestingHelpers';
import { createExperimentState } from './svelte/services/experimentState';
import { unitIsFinished } from './unitProgression';
import { CardStore } from './modules/cardStore';
import { deliverySettingsStore } from '../../lib/state/deliverySettingsStore';
import { ExperimentStateStore } from '../../lib/state/experimentStateStore';
import {meteorCallAsync} from '../../index';
import {clientConsole} from '../../lib/userSessionHelpers';
import {displayify} from '../../../common/globalHelpers';
import {Answers} from './answerAssess';
import { AdaptiveQuestionLogic } from './adaptiveQuestionLogic';
import { reconstructLearningStateFromHistory } from '../../lib/history/historyReconstruction';
import { hasScheduleArtifactForUnit } from './svelte/services/assessmentResume';
import { createUnitEngineServerMethods } from './unitEngineServerMethods';
import { callOpenRouterJson } from '../../lib/openRouterClient';
import {
  createEmptyUnit as createEmptyUnitWithDeps,
  createAutoTutorUnit as createAutoTutorUnitWithDeps,
  createUnitEngineByType as createUnitEngineByTypeWithDeps,
  createModelUnit as createModelUnitWithDeps,
  createScheduleUnit as createScheduleUnitWithDeps,
  createVideoUnit as createVideoUnitWithDeps,
  getCreatableUnitEngineTypes as getCreatableUnitEngineTypesWithDeps,
  type CreateUnitEngineDeps,
} from '../../../../learning-components/units/createUnitEngine';

const _ = (globalThis as any)._;
const Tdfs = (globalThis as any).Tdfs;

import { legacyFloat, legacyInt } from '../../../common/underscoreCompat';

export {createScheduleUnit, createModelUnit, createEmptyUnit, createVideoUnit, createAutoTutorUnit};

// Must be global: TDF calculateProbability snippets call getRandomInt() via eval.
function getRandomInt(max: any) {
  return Math.floor(Math.random() * max);
}
(globalThis as any).getRandomInt = getRandomInt;

function createUnitEngineDeps(): CreateUnitEngineDeps {
  return {
    app: {
      extend: (target, source) => _.extend(target, source),
    },
    session: {
      getSessionValue: (key) => Session.get(key),
      setSessionValue: (key, value) => Session.set(key, value),
    },
    deliverySettings: {
      getDeliverySettings: () => deliverySettingsStore.get() as Record<string, any>,
    },
    stimuli: {
      getStimCount,
      getStimCluster: (clusterIndex) => getStimCluster(clusterIndex) as any,
      getStimKCBaseForCurrentStimuliSet,
      getTestType,
      getDisplayAnswerText: (answer) => Answers.getDisplayAnswerText(answer),
      extractDelimFields,
      rangeVal,
      legacyFloat,
      legacyInt,
      displayify,
      findTdfById: (tdfId) => Tdfs.findOne({_id: tdfId}),
    },
    adaptiveModel: {
      createAdaptiveQuestionLogic: () => new AdaptiveQuestionLogic(),
      getHiddenItems: () => CardStore.getHiddenItems(),
      setNumVisibleCards: (numVisibleCards) => CardStore.setNumVisibleCards(numVisibleCards),
      updateCurStudentPerformance,
      updateCurStudedentPracticeTime,
    },
    history: {
      reconstructLearningStateFromHistory,
    },
    cardState: {
      setQuestionIndex: (questionIndex) => CardStore.setQuestionIndex(questionIndex),
      setCardValue: (key, value) => CardStore.setCardValue(key, value),
      setAlternateDisplayIndex: (value) => CardStore.setAlternateDisplayIndex(value),
      setOriginalQuestion: (value) => CardStore.setOriginalQuestion(value),
    },
    serverMethods: createUnitEngineServerMethods({ meteorCallAsync }),
    user: {
      getCurrentUserId: () => Meteor.userId(),
    },
    authz: {
      currentUserHasRole,
    },
    progression: {
      unitIsFinished,
    },
    assessmentState: {
      getExperimentState: () => ExperimentStateStore.get(),
      hasScheduleArtifactForUnit,
      createExperimentState,
    },
    uiAlerts: {
      alertUser: (message) => alert(message),
    },
    aiProvider: {
      callOpenRouterJson,
    },
    logging: {
      log: (level, ...args) => clientConsole(level, ...args),
    },
  };
}

async function createEmptyUnit(curExperimentData: any) {
  return await createEmptyUnitWithDeps(createUnitEngineDeps(), curExperimentData);
}

async function createModelUnit(curExperimentData: any) {
  return await createModelUnitWithDeps(createUnitEngineDeps(), curExperimentData);
}

async function createScheduleUnit(curExperimentData: any) {
  return await createScheduleUnitWithDeps(createUnitEngineDeps(), curExperimentData);
}

async function createVideoUnit(curExperimentData: any) {
  return await createVideoUnitWithDeps(createUnitEngineDeps(), curExperimentData);
}

async function createAutoTutorUnit(curExperimentData: any) {
  return await createAutoTutorUnitWithDeps(createUnitEngineDeps(), curExperimentData);
}

async function createUnitEngineByType(unitType: string, curExperimentData: any) {
  return await createUnitEngineByTypeWithDeps(createUnitEngineDeps(), curExperimentData, unitType);
}

function getCreatableUnitEngineTypes(): string[] {
  return getCreatableUnitEngineTypesWithDeps(createUnitEngineDeps());
}

export { createUnitEngineByType, getCreatableUnitEngineTypes };
