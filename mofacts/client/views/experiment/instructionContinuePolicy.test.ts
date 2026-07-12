import { expect } from 'chai';

import { resolveInstructionContinuePolicy } from './instructionContinuePolicy';

describe('instructionContinuePolicy', function() {
  it('routes regular units from instructions to the active card unit', function() {
    expect(resolveInstructionContinuePolicy({
      unitType: 'model',
      currentUnitNumber: 2,
      unitCount: 5,
    })).to.deep.equal({
      navigationTarget: '/content',
      sessionPatch: {
        currentUnitNumber: 2,
        currentTdfUnitIndex: 2,
        curUnitInstructionsSeen: true,
      },
    });
  });

  it('advances instruction-only units to the next unit instructions/content entry', function() {
    expect(resolveInstructionContinuePolicy({
      unitType: 'instruction-only',
      currentUnitNumber: 2,
      unitCount: 5,
    })).to.deep.equal({
      navigationTarget: '/content',
      sessionPatch: {
        currentUnitNumber: 3,
        currentTdfUnitIndex: 3,
        curUnitInstructionsSeen: false,
      },
      experimentStatePatch: {
        currentUnitNumber: 3,
        lastUnitCompleted: 2,
      },
    });
  });

  it('routes past the final instruction-only unit to the home dashboard', function() {
    expect(resolveInstructionContinuePolicy({
      unitType: 'instruction-only',
      currentUnitNumber: 4,
      unitCount: 5,
    })).to.deep.equal({
      navigationTarget: '/home',
      experimentStatePatch: {
        currentUnitNumber: 5,
        lastUnitCompleted: 4,
      },
    });
  });
});
