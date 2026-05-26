import { createAssessmentUnitEngine } from './assessment-session/AssessmentUnitEngine';
import {
  autoTutorUnitComponentManifest,
  AUTO_TUTOR_SESSION_UNIT_TYPE,
} from './autotutor/AutoTutorUnitEngine';
import { createInstructionUnitEngine } from './instruction/InstructionUnitEngine';
import { createLearningSessionUnitEngine } from './learning-session/LearningSessionUnitEngine';
import { createVideoSessionUnitEngine } from './video-session/VideoUnitEngine';
import type { LearningComponentManifest } from '../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from './createUnitEngine';

export const INSTRUCTION_UNIT_TYPE = 'instruction-only';
export const LEARNING_SESSION_UNIT_TYPE = 'model';
export const ASSESSMENT_SESSION_UNIT_TYPE = 'schedule';
export const VIDEO_SESSION_UNIT_TYPE = 'video';

export const defaultUnitComponentManifests: readonly LearningComponentManifest<CreateUnitEngineDeps>[] = [
  {
    id: 'mofacts.instruction-unit',
    kind: 'unit',
    unitTypes: [INSTRUCTION_UNIT_TYPE],
    requiredCapabilities: ['logging'],
    register(context) {
      context.registerUnitEngine(INSTRUCTION_UNIT_TYPE, createInstructionUnitEngine);
    },
  },
  {
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
  },
  {
    id: 'mofacts.assessment-session-unit',
    kind: 'unit',
    unitTypes: [ASSESSMENT_SESSION_UNIT_TYPE],
    requiredCapabilities: [
      'session',
      'assessment-state',
      'stimuli',
      'server-methods',
      'logging',
      'ui-alerts',
    ],
    register(context) {
      context.registerUnitEngineWithDeps(ASSESSMENT_SESSION_UNIT_TYPE, (currentDeps) => createAssessmentUnitEngine({
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
    },
  },
  {
    id: 'mofacts.video-session-unit',
    kind: 'unit',
    unitTypes: [VIDEO_SESSION_UNIT_TYPE],
    requiredCapabilities: ['session', 'logging'],
    register(context) {
      context.registerUnitEngineWithDeps(VIDEO_SESSION_UNIT_TYPE, (currentDeps) => createVideoSessionUnitEngine({
        setSessionValue: currentDeps.setSessionValue,
        log: currentDeps.log,
      }));
    },
  },
  autoTutorUnitComponentManifest,
];

export { AUTO_TUTOR_SESSION_UNIT_TYPE };
