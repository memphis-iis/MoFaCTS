import type { UnitEngineExtension } from '../UnitEngine';
import {
  createInitialAutoTutorState,
  scoreAndPlanAutoTutorTurn,
  validateAutoTutorLearnerInput,
} from './AutoTutorStateMachine';

export const AUTO_TUTOR_SESSION_UNIT_TYPE = 'autotutor';

export type AutoTutorUnitEngine = UnitEngineExtension & {
  createInitialState: typeof createInitialAutoTutorState;
  scoreAndPlanTurn: typeof scoreAndPlanAutoTutorTurn;
  validateLearnerInput: typeof validateAutoTutorLearnerInput;
};

function unsupportedGenericCardEngineMethod(methodName: string): never {
  throw new Error(`AutoTutor unit engine does not support generic card-engine method ${methodName}`);
}

export function createAutoTutorUnitEngine(): AutoTutorUnitEngine {
  return {
    unitType: AUTO_TUTOR_SESSION_UNIT_TYPE,
    createInitialState: createInitialAutoTutorState,
    scoreAndPlanTurn: scoreAndPlanAutoTutorTurn,
    validateLearnerInput: validateAutoTutorLearnerInput,
    async cardAnswered() {
      unsupportedGenericCardEngineMethod('cardAnswered');
    },
    selectNextCard() {
      unsupportedGenericCardEngineMethod('selectNextCard');
    },
    findCurrentCardInfo() {
      unsupportedGenericCardEngineMethod('findCurrentCardInfo');
    },
    unitFinished() {
      unsupportedGenericCardEngineMethod('unitFinished');
    },
    async prepareNextTrial() {
      return { selection: null, preparedAdvanceMode: 'none' };
    },
    commitPreparedTrial() { return false; },
    async advanceAfterAnswer() {
      unsupportedGenericCardEngineMethod('advanceAfterAnswer');
    },
    isFinished() {
      unsupportedGenericCardEngineMethod('isFinished');
    },
    getDisplayQuestionIndex(machineQuestionIndex) { return machineQuestionIndex; },
    clearPreparedTrial() { },
  };
}
