import { expect } from 'chai';
import {
  getCurrentScore,
  getScoringEnabled,
  resetScoreRuntimeState,
  setCurrentScore,
  setScoringEnabled,
} from './scoreRuntimeState';

describe('scoreRuntimeState', function() {
  beforeEach(function() {
    resetScoreRuntimeState();
  });

  afterEach(function() {
    resetScoreRuntimeState();
  });

  it('starts with score defaults after reset', function() {
    expect(getCurrentScore()).to.equal(0);
    expect(getScoringEnabled()).to.equal(undefined);
  });

  it('stores current score and scoring enabled state', function() {
    setCurrentScore(7);
    setScoringEnabled(true);

    expect(getCurrentScore()).to.equal(7);
    expect(getScoringEnabled()).to.equal(true);
  });

  it('clears score state on reset', function() {
    setCurrentScore(4);
    setScoringEnabled(false);

    resetScoreRuntimeState();

    expect(getCurrentScore()).to.equal(0);
    expect(getScoringEnabled()).to.equal(undefined);
  });
});
