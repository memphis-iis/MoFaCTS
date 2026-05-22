import type { UnitEngine } from "../UnitEngine";

export function createInstructionUnitEngine(): Partial<UnitEngine> {
  return {
    unitType: "instruction-only",
    unitFinished() {
      return true;
    },
    selectNextCard() { },
    findCurrentCardInfo() { },
    async cardAnswered() { },
  };
}
