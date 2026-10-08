import { expect } from 'chai';
import { buildTrialFeedbackHistory } from './trialFeedbackHistory';
import { getFeedbackTimeoutMs, getMainTimeoutMs, hasAnswerFeedback } from '../utils/timeoutUtils';

describe('trial feedback type and duration contract', function() {
  const deliverySettings = { correctprompt: 2000, reviewstudy: 3000, purestudy: 4000 };

  for (const isCorrect of [true, false]) {
    it(`records ${isCorrect ? 'correct' : 'incorrect'} drill feedback with the outcome duration`, function() {
      const context = { testType: 'd', isCorrect, deliverySettings, feedbackText: ' Feedback ' };
      expect(hasAnswerFeedback(context)).to.equal(true);
      expect(getFeedbackTimeoutMs(context)).to.equal(isCorrect ? 2000 : 3000);
      expect(buildTrialFeedbackHistory(context)).to.deep.equal({
        feedbackText: 'Feedback', feedbackType: isCorrect ? 'correct' : 'incorrect',
      });
    });

    it(`allows a skipped ${isCorrect ? 'correct' : 'incorrect'} drill feedback phase to reach history logging`, function() {
      const context = {
        testType: 'd', isCorrect, feedbackText: '',
        deliverySettings: {
          correctprompt: isCorrect ? 0 : 2000,
          reviewstudy: isCorrect ? 2000 : 0,
        },
      };
      expect(hasAnswerFeedback(context)).to.equal(false);
      expect(buildTrialFeedbackHistory(context)).to.deep.equal({ feedbackText: '', feedbackType: '' });
    });

    it(`still rejects missing feedback text for a positive ${isCorrect ? 'correct' : 'incorrect'} duration`, function() {
      expect(() => buildTrialFeedbackHistory({ testType: 'd', isCorrect, deliverySettings }))
        .to.throw('feedbackText missing before history write');
    });
  }

  for (const testType of ['t', 'h', 'i', 's']) {
    it(`does not record answer feedback for ${testType} trials even with positive durations`, function() {
      const context = { testType, isCorrect: false, deliverySettings, feedbackText: 'Must not be logged' };
      expect(hasAnswerFeedback(context)).to.equal(false);
      expect(buildTrialFeedbackHistory(context)).to.deep.equal({ feedbackText: '', feedbackType: '' });
    });
  }

  it('keeps study presentation controlled by purestudy', function() {
    expect(getMainTimeoutMs({ testType: 's', deliverySettings })).to.equal(4000);
    expect(getFeedbackTimeoutMs({ testType: 's', deliverySettings })).to.equal(4000);
  });

  it('ignores retired feedback visibility switches', function() {
    expect(buildTrialFeedbackHistory({
      testType: 'd', isCorrect: true, feedbackText: 'Correct.',
      deliverySettings: { ...deliverySettings, displayCorrectFeedback: false, displayIncorrectFeedback: false },
    })).to.deep.equal({ feedbackText: 'Correct.', feedbackType: 'correct' });
  });
});
