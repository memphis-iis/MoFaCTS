import { expect } from 'chai';
import { buildFeedbackContent } from './feedbackTextBuilder';

const englishFeedbackText = {
  userAnswerFeedbackText: 'Your answer was Lyon.',
  correctAnswerFeedbackText: 'The correct answer is Paris.',
  correctAnswerImageFeedbackText: 'Incorrect. The correct response is displayed below.',
  correctAnswerImageAltText: 'Correct answer image',
};

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
      ...englishFeedbackText,
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
      ...englishFeedbackText,
    });

    expect(content.feedbackText).to.equal('Incorrect. The correct answer is Paris.');
    expect(content.feedbackHtml).to.equal('<b class="feedback-label">Incorrect.</b><br>The correct answer is Paris.');
  });

  it('renders only the learner-facing answer text passed to incorrect feedback', function() {
    const content = buildFeedbackContent({
      message: 'Incorrect.',
      isCorrectAnswer: false,
      correctAnswerText: 'Choong Moo one',
      displayCorrectAnswer: true,
      correctAnswerFeedbackText: 'The correct answer is Choong Moo one.',
    });

    expect(content.feedbackText).to.equal('Incorrect. The correct answer is Choong Moo one.');
    expect(content.feedbackHtml).to.equal('<b class="feedback-label">Incorrect.</b><br>The correct answer is Choong Moo one.');
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
      ...englishFeedbackText,
    });
    const inline = buildFeedbackContent({
      message: 'Incorrect.',
      isCorrectAnswer: false,
      showUserAnswer: true,
      userAnswerText: 'Lyon',
      feedbackLayout: 'inline',
      ...englishFeedbackText,
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

  it('uses caller-provided localized sentence fragments around authored answer text', function() {
    const content = buildFeedbackContent({
      message: 'Incorrect.',
      isCorrectAnswer: false,
      showUserAnswer: true,
      userAnswerText: 'Lyon',
      correctAnswerText: 'Paris',
      displayCorrectAnswer: true,
      userAnswerFeedbackText: 'Tu respuesta fue Lyon.',
      correctAnswerFeedbackText: 'La respuesta correcta es Paris.',
      incorrectLabelText: 'Incorrecto.',
    });

    expect(content.feedbackText).to.equal('Tu respuesta fue Lyon. Incorrecto. La respuesta correcta es Paris.');
    expect(content.feedbackHtml).to.equal('Tu respuesta fue Lyon.<br><b class="feedback-label">Incorrecto.</b><br>La respuesta correcta es Paris.');
  });

  it('fails clearly when a required localized feedback fragment is missing', function() {
    expect(() => buildFeedbackContent({
      message: 'Incorrect.',
      isCorrectAnswer: false,
      correctAnswerText: 'Paris',
      displayCorrectAnswer: true,
    })).to.throw('[FeedbackDisplay] Missing localized feedback text: correctAnswerFeedbackText');
  });
});
