import { expect } from 'chai';
import { Session } from 'meteor/session';
import {
  decrementPausedLocks,
  getPausedLocks,
  incrementPausedLocks,
  isDisplayReady,
  isEnterKeyLocked,
  isInputReady,
  resetTrialReadinessState,
  setDisplayReady,
  setEnterKeyLock,
  setInputReady,
  setPausedLocks,
} from './trialReadinessState';

describe('trialReadinessState', function() {
  beforeEach(function() {
    resetTrialReadinessState();
  });

  afterEach(function() {
    resetTrialReadinessState();
  });

  it('owns display and input readiness while mirroring legacy Session keys', function() {
    setDisplayReady(true);
    setInputReady(true);

    expect(isDisplayReady()).to.equal(true);
    expect(isInputReady()).to.equal(true);
    expect(Session.get('displayReady')).to.equal(true);
    expect(Session.get('inputReady')).to.equal(true);
  });

  it('owns enter-key and paused input locks', function() {
    setEnterKeyLock(true);
    expect(isEnterKeyLocked()).to.equal(true);

    setPausedLocks(1);
    incrementPausedLocks(2);
    decrementPausedLocks(1);
    expect(getPausedLocks()).to.equal(2);

    decrementPausedLocks(10);
    expect(getPausedLocks()).to.equal(0);
  });
});
