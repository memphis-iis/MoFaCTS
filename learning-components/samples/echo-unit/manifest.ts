import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import {
  createSampleEchoUnitEngine,
  SAMPLE_ECHO_UNIT_TYPE,
  type SampleEchoUnitDeps,
} from './EchoUnitEngine';

export const sampleEchoUnitComponentManifest: LearningComponentManifest<SampleEchoUnitDeps> = {
  id: 'sample.echo-unit',
  kind: 'unit',
  unitTypes: [SAMPLE_ECHO_UNIT_TYPE],
  requiredCapabilities: ['logging'],
  register(context) {
    context.registerUnitEngineWithDeps(SAMPLE_ECHO_UNIT_TYPE, createSampleEchoUnitEngine);
  },
};
