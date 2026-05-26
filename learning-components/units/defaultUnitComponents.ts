import type { LearningComponentManifest } from '../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from './createUnitEngine';
import {
  assessmentSessionUnitComponentManifest,
  ASSESSMENT_SESSION_UNIT_TYPE,
} from './assessment-session/manifest';
import {
  AUTO_TUTOR_SESSION_UNIT_TYPE,
} from './autotutor/AutoTutorUnitEngine';
import { autoTutorUnitComponentManifest } from './autotutor/manifest';
import {
  instructionUnitComponentManifest,
  INSTRUCTION_UNIT_TYPE,
} from './instruction/manifest';
import {
  learningSessionUnitComponentManifest,
  LEARNING_SESSION_UNIT_TYPE,
} from './learning-session/manifest';
import {
  videoSessionUnitComponentManifest,
  VIDEO_SESSION_UNIT_TYPE,
} from './video-session/manifest';

export const defaultUnitComponentManifests: readonly LearningComponentManifest<CreateUnitEngineDeps>[] = [
  instructionUnitComponentManifest,
  learningSessionUnitComponentManifest,
  assessmentSessionUnitComponentManifest,
  videoSessionUnitComponentManifest,
  autoTutorUnitComponentManifest,
];

export {
  ASSESSMENT_SESSION_UNIT_TYPE,
  AUTO_TUTOR_SESSION_UNIT_TYPE,
  INSTRUCTION_UNIT_TYPE,
  LEARNING_SESSION_UNIT_TYPE,
  VIDEO_SESSION_UNIT_TYPE,
};
