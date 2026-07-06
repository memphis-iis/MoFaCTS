import { expect } from 'chai';
import {
  getFeedbackTypeFromHistory,
  getDisplayFeedback,
  isFeedbackUnset,
  isInFeedback,
  resetFeedbackRuntimeState,
  setDisplayFeedback,
  setFeedbackTypeFromHistory,
  setFeedbackUnset,
  setInFeedback,
} from './feedbackRuntimeState';

describe('feedbackRuntimeState', function() {
  beforeEach(function() {
    resetFeedbackRuntimeState();
  });

  afterEach(function() {
    resetFeedbackRuntimeState();
  });

  it('owns the display-feedback flag', function() {
    expect(getDisplayFeedback()).to.equal(false);

    setDisplayFeedback(true);

    expect(getDisplayFeedback()).to.equal(true);
  });

  it('owns feedback lifecycle flags and history feedback type', function() {
    expect(isInFeedback()).to.equal(false);
    expect(isFeedbackUnset()).to.equal(false);
    expect(getFeedbackTypeFromHistory()).to.equal(undefined);

    setInFeedback(true);
    setFeedbackUnset(true);
    setFeedbackTypeFromHistory('incorrect');

    expect(isInFeedback()).to.equal(true);
    expect(isFeedbackUnset()).to.equal(true);
    expect(getFeedbackTypeFromHistory()).to.equal('incorrect');
  });

  it('clears feedback lifecycle state on reset', function() {
    setDisplayFeedback(true);
    setInFeedback(true);
    setFeedbackUnset(true);
    setFeedbackTypeFromHistory('timeout');

    resetFeedbackRuntimeState();

    expect(getDisplayFeedback()).to.equal(false);
    expect(isInFeedback()).to.equal(false);
    expect(isFeedbackUnset()).to.equal(false);
    expect(getFeedbackTypeFromHistory()).to.equal(undefined);
  });
});
