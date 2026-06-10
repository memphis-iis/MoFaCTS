import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import { createSparcSessionUnitEngine, SPARC_SESSION_UNIT_TYPE } from './SparcSessionUnitEngine';

export { SPARC_SESSION_UNIT_TYPE };

export const sparcSessionUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
  id: 'mofacts.sparcsession-unit',
  kind: 'unit',
  unitTypes: [SPARC_SESSION_UNIT_TYPE],
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
  requiredServerMethods: [
    'getLearningHistoryForUnit',
    'getResponseKCMapForTdf',
    'getStimulusCrowdStatsForDeck',
  ],
  register(context) {
    context.registerUnitEngineWithDeps(SPARC_SESSION_UNIT_TYPE, (currentDeps) => {
      return createSparcSessionUnitEngine({
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
        serverMethods: currentDeps.serverMethods,
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
      });
    });
  },
};