import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { currentUserHasRole } from '../../lib/roleUtils';
import {
  extractDelimFields,
  rangeVal,
  getStimCount,
  getStimCluster,
  getTestType,
  updateCurStudentPerformance,
  updateCurStudedentPracticeTime
} from '../../lib/currentTestingHelpers';
import { createExperimentState } from './svelte/services/experimentState';
import { unitIsFinished } from './svelte/services/unitProgression';
import {
  getHiddenItems,
  setNumVisibleCards,
} from './svelte/services/hiddenVisibilityRuntimeState';
import { deliverySettingsStore } from '../../lib/state/deliverySettingsStore';
import { ExperimentStateStore } from '../../lib/state/experimentStateStore';
import { meteorCallAsync } from '../../index';
import { clientConsole } from '../../lib/userSessionHelpers';
import { displayify } from '../../../common/globalHelpers';
import { Answers } from './answerAssess';
import { KC_MULTIPLE } from '../../../common/Definitions';
import { AdaptiveUnitCoordinator } from '../../../../learning-components/units/shared/AdaptiveUnitCoordinator';
import { reconstructLearningStateFromHistory } from '../../lib/history/historyReconstruction';
import { hasScheduleArtifactForUnit } from './svelte/services/assessmentResume';
import { createUnitEngineServerMethods } from './unitEngineServerMethods';
import { callOpenRouterJson } from '../../lib/openRouterClient';
import { setQuestionIndex } from './svelte/services/trialProgressionState';
import {
  setAlternateDisplayIndex,
  setCurrentAnswer,
  setOriginalQuestion,
} from './svelte/services/activeTrialDisplayRuntimeState';
import type { CreateUnitEngineDeps } from '../../../../learning-components/units/createUnitEngine';
import {
  UNIT_ENGINE_SESSION_READ_KEYS,
  UNIT_ENGINE_SESSION_WRITE_KEYS,
  type UnitEngineSessionReadKey,
  type UnitEngineSessionWriteKey,
} from '../../../../learning-components/units/UnitEngineSessionKeys';
import { legacyFloat, legacyInt } from '../../../common/underscoreCompat';
import { translatePlatformString } from '../../lib/interfaceI18n';
import { getActiveUiLocale } from '../../lib/interfaceLocaleState';

export { UNIT_ENGINE_SESSION_READ_KEYS, UNIT_ENGINE_SESSION_WRITE_KEYS };
export type { UnitEngineSessionReadKey, UnitEngineSessionWriteKey };

export interface AppUnitEngineRuntimeContext extends CreateUnitEngineDeps {
  readonly session: CreateUnitEngineDeps['session'] & {
    readonly allowedReadKeys: ReadonlySet<UnitEngineSessionReadKey>;
    readonly allowedWriteKeys: ReadonlySet<UnitEngineSessionWriteKey>;
  };
}

const readKeySet = new Set<string>(UNIT_ENGINE_SESSION_READ_KEYS);
const writeKeySet = new Set<string>(UNIT_ENGINE_SESSION_WRITE_KEYS);

// Must be global: legacy TDF calculateProbability snippets call getRandomInt() via eval.
function getRandomInt(max: any) {
  return Math.floor(Math.random() * max);
}
(globalThis as { getRandomInt?: (max: any) => number }).getRandomInt = getRandomInt;

function assertAllowedSessionReadKey(key: string): asserts key is UnitEngineSessionReadKey {
  if (!readKeySet.has(key)) {
    throw new Error(`[Unit Engine Runtime] Component session read is not allowed for key "${key}"`);
  }
}

function assertAllowedSessionWriteKey(key: string): asserts key is UnitEngineSessionWriteKey {
  if (!writeKeySet.has(key)) {
    throw new Error(`[Unit Engine Runtime] Component session write is not allowed for key "${key}"`);
  }
}

function getUnderscoreExtend(): (target: any, source: any) => any {
  const underscore = (globalThis as { _?: { extend?: (target: any, source: any) => any } })._;
  if (typeof underscore?.extend !== 'function') {
    throw new Error('[Unit Engine Runtime] global underscore extend is unavailable');
  }
  return underscore.extend.bind(underscore);
}

function findTdfById(tdfId: any): any {
  const requestedId = String(tdfId || '').trim();
  const activeTdfId = String(Session.get('currentTdfId') || '').trim();
  const activeTdfDoc = Session.get('currentTdfDoc');
  if (requestedId && requestedId === activeTdfId) {
    if (!activeTdfDoc || typeof activeTdfDoc !== 'object') {
      throw new Error(`[Unit Engine Runtime] Active TDF document is unavailable for currentTdfId ${requestedId}`);
    }
    return activeTdfDoc;
  }
  const tdfs = (globalThis as { Tdfs?: { findOne?: (query: Record<string, unknown>) => any } }).Tdfs;
  if (typeof tdfs?.findOne !== 'function') {
    throw new Error('[Unit Engine Runtime] Tdfs.findOne is unavailable');
  }
  return tdfs.findOne({ _id: requestedId });
}

export function createAppUnitEngineRuntimeContext(): AppUnitEngineRuntimeContext {
  return {
    app: {
      extend: (target, source) => getUnderscoreExtend()(target, source),
    },
    session: {
      allowedReadKeys: new Set(UNIT_ENGINE_SESSION_READ_KEYS),
      allowedWriteKeys: new Set(UNIT_ENGINE_SESSION_WRITE_KEYS),
      getSessionValue: (key) => {
        assertAllowedSessionReadKey(key);
        return Session.get(key);
      },
      setSessionValue: (key, value) => {
        assertAllowedSessionWriteKey(key);
        Session.set(key, value);
      },
    },
    deliverySettings: {
      getDeliverySettings: () => deliverySettingsStore.get() as Record<string, any>,
    },
    stimuli: {
      getStimCount,
      getStimCluster: (clusterIndex) => getStimCluster(clusterIndex) as any,
      getTestType,
      getDisplayAnswerText: (answer) => Answers.getDisplayAnswerText(answer),
      extractDelimFields,
      rangeVal,
      legacyFloat,
      legacyInt,
      displayify,
      findTdfById,
    },
    adaptiveModel: {
      createAdaptiveCoordinator: (currentUnit) => new AdaptiveUnitCoordinator(currentUnit, {
        loadOutcomeRows: async () => await meteorCallAsync(
          'getAdaptiveOutcomeRows',
          Meteor.userId(),
          Session.get('currentTdfId'),
        ),
        getCurrentStimuliSet: () => Session.get('currentStimuliSet'),
        kcMultiple: KC_MULTIPLE,
        reportUnitBuildFailure: () => alert(translatePlatformString(getActiveUiLocale(), 'lesson.unitBuildFailed')),
        log: (level, ...args) => clientConsole(level, ...args),
      }),
      getHiddenItems,
      setNumVisibleCards,
      updateCurStudentPerformance,
      updateCurStudedentPracticeTime,
    },
    history: {
      reconstructLearningStateFromHistory,
    },
    cardState: {
      setQuestionIndex,
      setCurrentAnswer,
      setAlternateDisplayIndex,
      setOriginalQuestion,
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
