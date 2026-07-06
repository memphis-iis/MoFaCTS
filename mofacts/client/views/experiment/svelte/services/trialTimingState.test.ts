import { expect } from 'chai';
import {
  getScrollListCount,
  getTrialEndTimestamp,
  getTrialStartTimestamp,
  resetTrialTimingState,
  setCurIntervalId,
  setCurTimeoutId,
  setScrollListCount,
  setTrialEndTimestamp,
  setTrialStartTimestamp,
  setVarLenTimeoutName,
} from './trialTimingState';

describe('trialTimingState', function() {
  beforeEach(function() {
    resetTrialTimingState();
  });

  afterEach(function() {
    resetTrialTimingState();
  });

  it('stores trial timestamps and scroll count', function() {
    setTrialStartTimestamp(100);
    setTrialEndTimestamp(200);
    setScrollListCount(3);

    expect(getTrialStartTimestamp()).to.equal(100);
    expect(getTrialEndTimestamp()).to.equal(200);
    expect(getScrollListCount()).to.equal(3);
  });

  it('clears timing state on reset', function() {
    setTrialStartTimestamp(100);
    setTrialEndTimestamp(200);
    setCurTimeoutId(1);
    setCurIntervalId(2);
    setVarLenTimeoutName('timeout-name');
    setScrollListCount(3);

    resetTrialTimingState();

    expect(getTrialStartTimestamp()).to.equal(0);
    expect(getTrialEndTimestamp()).to.equal(0);
    expect(getScrollListCount()).to.equal(0);
  });
});
