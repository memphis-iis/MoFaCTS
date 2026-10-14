import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import { createExternalUrlUnitEngine } from './ExternalUrlUnitEngine';

export const EXTERNAL_URL_SESSION_UNIT_TYPE = 'external-url';

export const externalUrlSessionUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
  id: 'mofacts.external-url-session-unit',
  kind: 'unit',
  unitTypes: [EXTERNAL_URL_SESSION_UNIT_TYPE],
  requiredCapabilities: ['session', 'logging'],
  register(context) {
    context.registerUnitEngineWithDeps(EXTERNAL_URL_SESSION_UNIT_TYPE, (currentDeps) => createExternalUrlUnitEngine({
      setSessionValue: currentDeps.session.setSessionValue,
      log: currentDeps.logging.log,
    }));
  },
};
