import { expect } from 'chai';
import { buildIncomingTrialSlotDisplaySnapshot } from './incomingTrialSlotDisplay';

describe('incomingTrialSlotDisplay', () => {
  it('returns an empty snapshot when there is no prepared trial', () => {
    const snapshot = buildIncomingTrialSlotDisplaySnapshot({
      defaultInputMode: 'text',
      deliverySettings: {},
      formatAnswerText: (answer) => answer,
      layoutMode: undefined,
      performanceCurrentTrial: 3,
      preparedTrial: null,
      skipStudyEnabled: true,
    });

    expect(snapshot).to.deep.equal({
      expectedFeedbackBlockerSrc: '',
      expectedStimulusBlockerSrc: '',
      preparedSubsetKind: 'none',
      slot: null,
      slotKey: 'none',
    });
  });

  it('builds a question slot from prepared trial content', () => {
    const snapshot = buildIncomingTrialSlotDisplaySnapshot({
      defaultInputMode: 'text',
      deliverySettings: {
        correctColor: 'green',
        displayCorrectFeedback: true,
        displayIncorrectFeedback: true,
        displayQuestionNumber: true,
      },
      formatAnswerText: (answer) => `answer:${answer}`,
      layoutMode: 'default',
      performanceCurrentTrial: 4,
      preparedTrial: {
        currentAnswer: 'A',
        currentDisplay: { text: 'Prompt' },
        questionIndex: 7,
        testType: 'q',
      },
      skipStudyEnabled: true,
    });

    expect(snapshot.preparedSubsetKind).to.equal('question');
    expect(snapshot.slotKey).to.equal('7::Prompt::::::');
    expect(snapshot.slot?.subset.kind).to.equal('question');
    expect(snapshot.slot?.subset.replayEnabled).to.equal(true);
    expect(snapshot.slot?.props).to.include({
      inputEnabled: false,
      questionNumber: 5,
    });
  });

  it('builds a study slot with feedback-style display settings', () => {
    const snapshot = buildIncomingTrialSlotDisplaySnapshot({
      defaultInputMode: 'text',
      deliverySettings: {
        correctColor: 'green',
        displayCorrectFeedback: false,
        displayIncorrectFeedback: true,
        displayQuestionNumber: true,
        skipstudy: true,
      },
      formatAnswerText: (answer) => answer,
      layoutMode: 'default',
      performanceCurrentTrial: 1,
      preparedTrial: {
        currentAnswer: 'B',
        currentDisplay: { text: 'Study prompt' },
        questionIndex: 2,
        testType: 's',
      },
      skipStudyEnabled: true,
    });

    expect(snapshot.preparedSubsetKind).to.equal('study');
    expect(snapshot.slot?.subset.kind).to.equal('study');
    expect(snapshot.slot?.subset.showSkipStudyButton).to.equal(true);
    expect(snapshot.slot?.props).to.include({
      correctColor: 'var(--app-text-color)',
      displayCorrectFeedback: true,
      displayIncorrectFeedback: false,
      isCorrect: true,
      questionNumber: 2,
    });
  });

  it('reports expected blocker sources from generated display props', () => {
    const snapshot = buildIncomingTrialSlotDisplaySnapshot({
      defaultInputMode: 'text',
      deliverySettings: {},
      formatAnswerText: (answer) => answer,
      layoutMode: 'default',
      performanceCurrentTrial: 0,
      preparedTrial: {
        currentAnswer: 'A',
        currentDisplay: { imgSrc: '/stim.png' },
        questionIndex: 3,
        testType: 'q',
      },
      skipStudyEnabled: false,
    });

    expect(snapshot.expectedStimulusBlockerSrc).to.equal('/stim.png');
  });
});
