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
