import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import { ASSESSMENT_SESSION_UNIT_TYPE } from '../unitTypes';
import { createAssessmentUnitEngine } from './AssessmentUnitEngine';

export { ASSESSMENT_SESSION_UNIT_TYPE };

export const assessmentSessionUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
  id: 'mofacts.assessment-session-unit',
  kind: 'unit',
  unitTypes: [ASSESSMENT_SESSION_UNIT_TYPE],
  requiredCapabilities: [
    'session',
    'assessment-state',
    'stimuli',
    'card-state',
    'logging',
    'ui-alerts',
  ],
  register(context) {
    context.registerUnitEngineWithDeps(ASSESSMENT_SESSION_UNIT_TYPE, (currentDeps) => createAssessmentUnitEngine({
      getSessionValue: currentDeps.session.getSessionValue,
      setSessionValue: currentDeps.session.setSessionValue,
      getExperimentState: currentDeps.assessmentState.getExperimentState,
      hasScheduleArtifactForUnit: currentDeps.assessmentState.hasScheduleArtifactForUnit,
      createExperimentState: currentDeps.assessmentState.createExperimentState,
      getStimCount: currentDeps.stimuli.getStimCount,
      setQuestionIndex: currentDeps.cardState.setQuestionIndex,
      alertUser: currentDeps.uiAlerts.alertUser,
      log: currentDeps.logging.log,
    }));
  },
};
