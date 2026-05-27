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
};
