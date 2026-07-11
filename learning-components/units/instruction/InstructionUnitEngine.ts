import type { UnitEngineExtension } from "../UnitEngine";

export function createInstructionUnitEngine(): UnitEngineExtension {
  return {
    unitType: "instruction-only",
    unitFinished() {
      return true;
    },
    selectNextCard() { },
    findCurrentCardInfo() { },
    async cardAnswered() { },
    async prepareNextTrial() {
      return { selection: null, preparedAdvanceMode: 'direct' };
    },
    commitPreparedTrial() { return false; },
    async advanceAfterAnswer() { },
    isFinished() { return true; },
    getDisplayQuestionIndex(machineQuestionIndex) { return machineQuestionIndex; },
    clearPreparedTrial() { },
  };
}
