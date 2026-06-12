import { expect } from 'chai';
import {
  buildTrialContentPropsFromSubset,
  buildTrialContentProps,
  getCorrectAnswerImageSrc,
} from './trialContentProps';
import { buildTrialSubset } from './trialDisplayState';

describe('trial content props adapter', function() {
  it('finds image answer sources from answer identity fields', function() {
    const buttonList = [
      { buttonName: '/wrong.png', buttonValue: 'wrong', isImage: true },
      { buttonName: '/answer.png', verbalChoice: 'Answer', isImage: true },
    ];

    expect(getCorrectAnswerImageSrc(buttonList, 'Answer')).to.equal('/answer.png');
    expect(getCorrectAnswerImageSrc(buttonList, 'missing')).to.equal('');
    expect(getCorrectAnswerImageSrc(null, 'Answer')).to.equal('');
  });

  it('builds TrialContent props and blocker sources for an active question slot', function() {
    const result = buildTrialContentProps({
      defaultInputMode: 'text',
      deliverySettings: {
        choiceButtonCols: 2,
        correctColor: 'green',
        correctLabelText: 'Correct',
        displayCorrectAnswerInIncorrectFeedback: true,
        displayUserAnswerInFeedback: true,
        feedbackLayout: 'below',
        forceCorrectPrompt: '',
        incorrectColor: 'red',
        incorrectLabelText: 'Incorrect',
        inputPlaceholderText: 'Type',
      },
      formatAnswerText: (answer) => answer.toUpperCase(),
      layoutMode: 'left',
      slotState: {
        kind: 'question',
        displayVisible: true,
        responseVisible: true,
        inputEnabled: true,
        questionNumber: 4,
        replayEnabled: true,
        showQuestionNumber: true,
        srAttempt: '2',
        srMaxAttempts: 3,
        userAnswer: 'draft',
      },
      trialLike: {
        buttonList: [{ buttonName: '/answer.png', buttonValue: 'ANSWER', isImage: true }],
        currentAnswer: 'answer',
        currentDisplay: { text: 'Prompt', imgSrc: '/prompt.png' },
      },
    });

    expect(result.expectedStimulusBlockerSrc).to.equal('/prompt.png');
    expect(result.expectedFeedbackBlockerSrc).to.equal('');
    expect(result.correctAnswerImageSrc).to.equal('/answer.png');
    expect(result.props).to.deep.include({
      layoutMode: 'left',
      subsetKind: 'question',
      displayVisible: true,
      responseVisible: true,
      inputMode: 'text',
      inputEnabled: true,
      userAnswer: 'draft',
      inputPlaceholder: 'Type',
      buttonColumns: 2,
      srStatus: 'idle',
      srAttempt: 2,
      srMaxAttempts: 3,
      correctAnswer: 'ANSWER',
      correctAnswerImageSrc: '/answer.png',
      forceCorrectPrompt: 'Please type the correct answer to continue',
      replayEnabled: true,
    });
  });

  it('uses incorrect feedback image as a feedback blocker', function() {
    const result = buildTrialContentProps({
      defaultInputMode: 'buttons',
      deliverySettings: {},
      formatAnswerText: (answer) => answer,
      layoutMode: 'right',
      slotState: {
        kind: 'feedback',
        feedbackVisible: true,
        isCorrect: false,
      },
      trialLike: {
        buttonList: [{ buttonName: '/correct.png', buttonValue: 'A', isImage: true }],
        currentAnswer: 'A',
      },
    });

    expect(result.expectedFeedbackBlockerSrc).to.equal('/correct.png');
    expect(result.props).to.deep.include({
      feedbackVisible: true,
      isCorrect: false,
      correctAnswer: 'A',
      correctAnswerImageSrc: '/correct.png',
    });
  });

  it('builds TrialContent props from an already-derived active subset', function() {
    const subset = buildTrialSubset({
      kind: 'feedback',
      display: { text: 'Prompt' },
      displayVisible: true,
      feedbackVisible: true,
      questionNumber: 8,
      showQuestionNumber: true,
    });

    const result = buildTrialContentPropsFromSubset({
      buttonList: [{ buttonName: '/current-answer.png', buttonValue: 'raw-answer', isImage: true }],
      correctAnswer: 'Formatted answer',
      correctAnswerImageSrc: '/current-answer.png',
      correctColor: 'blue',
      defaultInputMode: 'sr',
      deliverySettings: {
        choiceButtonCols: 3,
        correctLabelText: 'Yes',
        incorrectLabelText: 'No',
      },
      displayCorrectFeedback: true,
      displayIncorrectFeedback: true,
      feedbackMessage: 'Feedback',
      feedbackUserAnswer: 'spoken',
      inputEnabled: false,
      isCorrect: false,
      isTimeout: true,
      layoutMode: 'top',
      srAttempt: 1,
      srMaxAttempts: 2,
      srStatus: 'processing',
      subset,
      userAnswer: 'typed',
    });

    expect(result.expectedFeedbackBlockerSrc).to.equal('/current-answer.png');
    expect(result.props).to.deep.include({
      layoutMode: 'top',
      subsetKind: 'feedback',
      inputMode: 'sr',
      userAnswer: 'typed',
      feedbackUserAnswer: 'spoken',
      srStatus: 'processing',
      srAttempt: 1,
      srMaxAttempts: 2,
      isTimeout: true,
      correctAnswer: 'Formatted answer',
      correctAnswerImageSrc: '/current-answer.png',
      correctColor: 'blue',
      buttonColumns: 3,
    });
  });
});
