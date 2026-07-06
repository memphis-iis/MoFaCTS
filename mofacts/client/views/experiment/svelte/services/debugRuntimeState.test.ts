import { expect } from 'chai';
import {
  getDebugParms,
  resetDebugRuntimeState,
  setDebugParms,
} from './debugRuntimeState';

describe('debugRuntimeState', function() {
  beforeEach(function() {
    resetDebugRuntimeState();
  });

  afterEach(function() {
    resetDebugRuntimeState();
  });

  it('stores debug parameters defensively', function() {
    const source = { probParmsDisplay: true };
    setDebugParms(source);
    source.probParmsDisplay = false;

    expect(getDebugParms()).to.deep.equal({ probParmsDisplay: true });

    const read = getDebugParms();
    if (read) {
      read.probParmsDisplay = false;
    }

    expect(getDebugParms()).to.deep.equal({ probParmsDisplay: true });
  });

  it('clears debug parameters on reset', function() {
    setDebugParms({ probParmsDisplay: true });

    resetDebugRuntimeState();

    expect(getDebugParms()).to.equal(undefined);
  });
});
