import { expect } from 'chai';
import { buildFeedbackContent } from './feedbackTextBuilder';

describe('feedbackTextBuilder', function() {
  it('keeps canonical feedback text plain while preserving display HTML', function() {
    const content = buildFeedbackContent({
      message: 'Incorrect. The <b>answer</b> is <span class="x">Paris</span>.',
      isCorrectAnswer: false,
    });

    expect(content.feedbackText).to.equal('Incorrect. The answer is Paris.');
    expect(content.feedbackHtml).to.contain('<b class="feedback-label">Incorrect.</b>');
    expect(content.feedbackHtml).to.contain('<b>answer</b>');
  });

  it('does not include the correct answer unless the setting is enabled', function() {
    const content = buildFeedbackContent({
      message: 'Incorrect.',
      isCorrectAnswer: false,
      showUserAnswer: true,
      userAnswerText: '',
      correctAnswerText: 'Paris',
      displayCorrectAnswer: false,
    });

    expect(content.feedbackText).to.equal('Incorrect.');
    expect(content.feedbackHtml).to.equal('<b class="feedback-label">Incorrect.</b>');
  });

  it('adds the correct answer as its own segment when enabled', function() {
    const content = buildFeedbackContent({
      message: 'Incorrect.',
      isCorrectAnswer: false,
      correctAnswerText: 'Paris',
      displayCorrectAnswer: true,
    });

    expect(content.feedbackText).to.equal('Incorrect. The correct answer is Paris.');
    expect(content.feedbackHtml).to.equal('<b class="feedback-label">Incorrect.</b><br>The correct answer is Paris.');
  });

  it('keeps close-enough answer wording in the explanation instead of appending a second correct-answer segment', function() {
    const content = buildFeedbackContent({
      message: "Close enough to the correct answer 'Paris'.",
      isCorrectAnswer: true,
      correctAnswerText: 'Paris',
      displayCorrectAnswer: true,
    });

    expect(content.feedbackText).to.equal("Close enough to the correct answer 'Paris'.");
  });

  it('uses policy layout only for joining selected segments', function() {
    const stacked = buildFeedbackContent({
      message: 'Incorrect.',
      isCorrectAnswer: false,
      showUserAnswer: true,
      userAnswerText: 'Lyon',
      feedbackLayout: 'stacked',
    });
    const inline = buildFeedbackContent({
      message: 'Incorrect.',
      isCorrectAnswer: false,
      showUserAnswer: true,
      userAnswerText: 'Lyon',
      feedbackLayout: 'inline',
    });

    expect(stacked.feedbackText).to.equal(inline.feedbackText);
    expect(stacked.feedbackText).to.equal('Your answer was Lyon. Incorrect.');
    expect(stacked.feedbackHtml).to.contain('<br>');
    expect(inline.feedbackHtml).not.to.contain('<br>');
  });

  it('applies custom label text only to outcome labels', function() {
    const content = buildFeedbackContent({
      message: 'Incorrect.',
      isCorrectAnswer: false,
      incorrectLabelText: 'Not quite.',
    });

    expect(content.feedbackText).to.equal('Not quite.');
    expect(content.feedbackHtml).to.contain('<b class="feedback-label">Not quite.</b>');
  });
});
