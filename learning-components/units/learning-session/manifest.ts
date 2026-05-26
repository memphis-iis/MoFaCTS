import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import { createLearningSessionUnitEngine } from './LearningSessionUnitEngine';

export const LEARNING_SESSION_UNIT_TYPE = 'model';

export const learningSessionUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
  id: 'mofacts.learning-session-unit',
  kind: 'unit',
  unitTypes: [LEARNING_SESSION_UNIT_TYPE],
  requiredCapabilities: [
    'session',
    'delivery-settings',
    'stimuli',
    'adaptive-model',
    'history',
    'server-methods',
    'authz',
    'logging',
    'ui-alerts',
  ],
  register(context) {
    context.registerUnitEngineWithDeps(LEARNING_SESSION_UNIT_TYPE, (currentDeps) => createLearningSessionUnitEngine({
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
  },
};
