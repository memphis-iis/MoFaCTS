import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import { createVideoSessionUnitEngine } from './VideoUnitEngine';

export const VIDEO_SESSION_UNIT_TYPE = 'video';

export const videoSessionUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
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
};
