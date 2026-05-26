import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { CreateUnitEngineDeps } from '../createUnitEngine';
import type { UnitEngine } from '../UnitEngine';

export const AUTO_TUTOR_SESSION_UNIT_TYPE = 'autotutor';

export function createAutoTutorUnitEngine(): Partial<UnitEngine> {
  return {
    unitType: AUTO_TUTOR_SESSION_UNIT_TYPE,
    async cardAnswered() {},
    selectNextCard() {},
    findCurrentCardInfo() {},
    unitFinished() {
      return false;
    },
  };
}

export const autoTutorUnitComponentManifest: LearningComponentManifest<CreateUnitEngineDeps> = {
  id: 'mofacts.autotutor-unit-placeholder',
  kind: 'unit',
  unitTypes: [AUTO_TUTOR_SESSION_UNIT_TYPE],
  requiredCapabilities: ['logging'],
  register(context) {
    context.registerUnitEngine(AUTO_TUTOR_SESSION_UNIT_TYPE, createAutoTutorUnitEngine);
  },
};
