import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import { LEARNING_SESSION_UNIT_TYPE } from '../unitTypes';
import { createLearningSessionUnitEngine } from './LearningSessionUnitEngine';

export { LEARNING_SESSION_UNIT_TYPE };

export const learningSessionUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
  id: 'mofacts.learning-session-unit',
  kind: 'unit',
  unitTypes: [LEARNING_SESSION_UNIT_TYPE],
  requiredCapabilities: [
    'session',
    'delivery-settings',
    'stimuli',
    'card-state',
    'adaptive-card-model',
    'history',
    'server-methods',
    'authz',
    'logging',
    'ui-alerts',
  ],
  requiredServerMethods: [
    'getLearningHistoryForUnit',
    'getResponseKCMapForTdf',
    'getStimulusCrowdStatsForDeck',
  ],
  register(context) {
    context.registerUnitEngineWithDeps(LEARNING_SESSION_UNIT_TYPE, (currentDeps) => {
      return createLearningSessionUnitEngine({
        getSessionValue: currentDeps.session.getSessionValue,
        setSessionValue: currentDeps.session.setSessionValue,
        getDeliverySettings: currentDeps.deliverySettings.getDeliverySettings,
        getStimCount: currentDeps.stimuli.getStimCount,
        getStimCluster: currentDeps.stimuli.getStimCluster,
        getTestType: currentDeps.stimuli.getTestType,
        getHiddenItems: currentDeps.adaptiveModel.getHiddenItems,
        setNumVisibleCards: currentDeps.adaptiveModel.setNumVisibleCards,
        setQuestionIndex: currentDeps.cardState.setQuestionIndex,
        getDisplayAnswerText: currentDeps.stimuli.getDisplayAnswerText,
        updateCurStudentPerformance: currentDeps.adaptiveModel.updateCurStudentPerformance,
        serverMethods: currentDeps.serverMethods,
        getCurrentUserId: currentDeps.user.getCurrentUserId,
        reconstructLearningStateFromHistory: currentDeps.history.reconstructLearningStateFromHistory,
        extractDelimFields: currentDeps.stimuli.extractDelimFields,
        rangeVal: currentDeps.stimuli.rangeVal,
        legacyFloat: currentDeps.stimuli.legacyFloat,
        legacyInt: currentDeps.stimuli.legacyInt,
        currentUserHasRole: currentDeps.authz.currentUserHasRole,
        displayify: currentDeps.stimuli.displayify,
        unitIsFinished: currentDeps.progression.unitIsFinished,
        findTdfById: currentDeps.stimuli.findTdfById,
        alertUser: currentDeps.uiAlerts.alertUser,
        log: currentDeps.logging.log,
      });
    });
  },
};
