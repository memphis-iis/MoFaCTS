import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import {
  AUTO_TUTOR_SESSION_UNIT_TYPE,
  createAutoTutorUnitEngine,
} from './AutoTutorUnitEngine';

export const autoTutorUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
  id: 'mofacts.autotutor-unit',
  kind: 'unit',
  unitTypes: [AUTO_TUTOR_SESSION_UNIT_TYPE],
  requiredCapabilities: ['logging'],
  register(context) {
    context.registerUnitEngine(AUTO_TUTOR_SESSION_UNIT_TYPE, createAutoTutorUnitEngine);
  },
};
