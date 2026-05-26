import type { UnitType } from '../../../common/types';

export type InstructionContinueNavigationTarget = '/card' | '/learningDashboard';

export type InstructionContinuePolicy = {
  navigationTarget: InstructionContinueNavigationTarget;
  sessionPatch?: {
    currentUnitNumber: number;
    currentTdfUnitIndex: number;
    curUnitInstructionsSeen: boolean;
  };
  experimentStatePatch?: {
    currentUnitNumber: number;
    lastUnitCompleted: number;
  };
};

export function resolveInstructionContinuePolicy(params: {
  unitType: UnitType;
  currentUnitNumber: number;
  unitCount: number;
}): InstructionContinuePolicy {
  const nextUnitNumber = params.currentUnitNumber + 1;

  if (params.unitType !== 'instruction-only') {
    return {
      navigationTarget: '/card',
      sessionPatch: {
        currentUnitNumber: params.currentUnitNumber,
        currentTdfUnitIndex: params.currentUnitNumber,
        curUnitInstructionsSeen: true,
      },
    };
  }

  const navigationTarget = nextUnitNumber < params.unitCount ? '/card' : '/learningDashboard';
  const policy: InstructionContinuePolicy = {
    navigationTarget,
    experimentStatePatch: {
      currentUnitNumber: nextUnitNumber,
      lastUnitCompleted: params.currentUnitNumber,
    },
  };
  if (navigationTarget === '/card') {
    policy.sessionPatch = {
      currentUnitNumber: nextUnitNumber,
      currentTdfUnitIndex: nextUnitNumber,
      curUnitInstructionsSeen: false,
    };
  }
  return policy;
}
