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
  providedServices: [
    'sparc.authored-initial-state',
    'sparc.authored-model-targets',
    'sparc.authored-response-outcome',
    'sparc.condition-evaluation',
    'sparc.ctat-trace-comparison',
    'sparc.document-addressing',
    'sparc.document-replay',
    'sparc.model-history-exchange',
    'sparc.model-query-adapter',
    'sparc.model-update-request',
    'sparc.response-outcome-authored-rules',
    'sparc.response-outcome-commit',
    'sparc.response-outcome-history',
    'sparc.reactive-rule-commit',
    'sparc.reactive-rule-evaluation',
    'sparc.sample-documents',
    'sparc.state-replay',
    'sparc.state-transition-history',
    'sparc.vertical-layout-validation',
  ],
  register(context) {
    context.registerUnitEngineWithDeps(SPARC_SESSION_UNIT_TYPE, (currentDeps) => {
      return createSparcSessionUnitEngine({
        getSessionValue: currentDeps.session.getSessionValue,
        setSessionValue: currentDeps.session.setSessionValue,
        getDeliverySettings: currentDeps.deliverySettings.getDeliverySettings,
        getStimCount: currentDeps.stimuli.getStimCount,
        getStimCluster: currentDeps.stimuli.getStimCluster,
        getStimKCBaseForCurrentStimuliSet: currentDeps.stimuli.getStimKCBaseForCurrentStimuliSet,
        getTestType: currentDeps.stimuli.getTestType,
        getHiddenItems: currentDeps.adaptiveModel.getHiddenItems,
        setNumVisibleCards: currentDeps.adaptiveModel.setNumVisibleCards,
        setQuestionIndex: currentDeps.cardState.setQuestionIndex,
        getDisplayAnswerText: currentDeps.stimuli.getDisplayAnswerText,
        updateCurStudentPerformance: currentDeps.adaptiveModel.updateCurStudentPerformance,
        updateCurStudedentPracticeTime: currentDeps.adaptiveModel.updateCurStudedentPracticeTime,
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
