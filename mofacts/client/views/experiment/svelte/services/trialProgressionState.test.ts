import { expect } from 'chai';
import {
  getQuestionIndex,
  incrementQuestionIndex,
  resetQuestionIndex,
  setQuestionIndex,
} from './trialProgressionState';

describe('trialProgressionState', function() {
  beforeEach(function() {
    resetQuestionIndex();
  });

  afterEach(function() {
    resetQuestionIndex();
  });

  it('owns the active trial question index independently of the old runtime store', function() {
    expect(getQuestionIndex()).to.equal(0);

    setQuestionIndex(3);
    expect(getQuestionIndex()).to.equal(3);

    incrementQuestionIndex(2);
    expect(getQuestionIndex()).to.equal(5);

    resetQuestionIndex();
    expect(getQuestionIndex()).to.equal(0);
  });
});
