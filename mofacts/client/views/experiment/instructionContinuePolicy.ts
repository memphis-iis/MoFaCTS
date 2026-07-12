import type { UnitType } from '../../../common/types';

export type InstructionContinueNavigationTarget = '/content' | '/home';

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
      navigationTarget: '/content',
      sessionPatch: {
        currentUnitNumber: params.currentUnitNumber,
        currentTdfUnitIndex: params.currentUnitNumber,
        curUnitInstructionsSeen: true,
      },
    };
  }

  const navigationTarget = nextUnitNumber < params.unitCount ? '/content' : '/home';
  const policy: InstructionContinuePolicy = {
    navigationTarget,
    experimentStatePatch: {
      currentUnitNumber: nextUnitNumber,
      lastUnitCompleted: params.currentUnitNumber,
    },
  };
  if (navigationTarget === '/content') {
    policy.sessionPatch = {
      currentUnitNumber: nextUnitNumber,
      currentTdfUnitIndex: nextUnitNumber,
      curUnitInstructionsSeen: false,
    };
  }
  return policy;
}
