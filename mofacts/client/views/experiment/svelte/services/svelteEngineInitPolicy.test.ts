import { expect } from 'chai';

import { resolveSvelteEngineInitPolicy } from './svelteEngineInitPolicy';

describe('svelteEngineInitPolicy', function() {
  it('initializes when no engine exists', function() {
    expect(resolveSvelteEngineInitPolicy({
      existingEngine: null,
      expectedUnitType: 'model',
      currentUnitNumber: 1,
      currentTdfId: 'tdf-1',
      currentUnitName: 'Unit 1',
    })).to.deep.equal({
      shouldInitEngine: true,
      engineUnitContextChanged: false,
    });
  });

  it('reuses an engine when unit type and launch context still match', function() {
    expect(resolveSvelteEngineInitPolicy({
      existingEngine: {
        unitType: 'model',
        __unitNumber: 1,
        __tdfId: 'tdf-1',
        __unitName: 'Unit 1',
      },
      expectedUnitType: 'model',
      currentUnitNumber: 1,
      currentTdfId: 'tdf-1',
      currentUnitName: 'Unit 1',
    })).to.deep.equal({
      shouldInitEngine: false,
      engineUnitContextChanged: false,
    });
  });

  it('initializes when unit type or launch context changes', function() {
    expect(resolveSvelteEngineInitPolicy({
      existingEngine: {
        unitType: 'schedule',
        __unitNumber: 1,
        __tdfId: 'tdf-1',
        __unitName: 'Unit 1',
      },
      expectedUnitType: 'model',
      currentUnitNumber: 1,
      currentTdfId: 'tdf-1',
      currentUnitName: 'Unit 1',
    }).shouldInitEngine).to.equal(true);

    expect(resolveSvelteEngineInitPolicy({
      existingEngine: {
        unitType: 'model',
        __unitNumber: 1,
        __tdfId: 'tdf-1',
        __unitName: 'Unit 1',
      },
      expectedUnitType: 'model',
      currentUnitNumber: 2,
      currentTdfId: 'tdf-1',
      currentUnitName: 'Unit 2',
    })).to.deep.equal({
      shouldInitEngine: true,
      engineUnitContextChanged: true,
    });
  });

  it('initializes unknown engines even when launch context matches', function() {
    expect(resolveSvelteEngineInitPolicy({
      existingEngine: {
        unitType: 'unknown',
        __unitNumber: 1,
        __tdfId: 'tdf-1',
        __unitName: 'Unit 1',
      },
      expectedUnitType: 'unknown',
      currentUnitNumber: 1,
      currentTdfId: 'tdf-1',
      currentUnitName: 'Unit 1',
    })).to.deep.equal({
      shouldInitEngine: true,
      engineUnitContextChanged: false,
    });
  });
});
