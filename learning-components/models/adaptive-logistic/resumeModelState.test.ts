import { strict as assert } from 'assert';
import { applyResumeModelState } from './resumeModelState';

function createAggregate(overrides: Record<string, unknown> = {}) {
  return {
    firstSeen: 1000,
    lastSeen: 1000,
    priorCorrect: 1,
    priorIncorrect: 0,
    allTimeCorrect: 1,
    allTimeIncorrect: 0,
    priorStudy: 0,
    outcomeStack: [1],
    timeHistory: [1000],
    totalPracticeDuration: 250,
    allTimeTotalPracticeDuration: 250,
    trialsSinceLastSeen: 0,
    hasBeenIntroduced: true,
    otherPracticeTime: 0,
    instructionQuestionResult: null,
    ...overrides,
  };
}

function createCardProbabilities(): any {
  return {
    cards: [{
      clusterKC: 'fractions.lcd',
      canUse: true,
      stims: [{
        stimulusKC: 'local-stimulus',
        clusterKC: 'fractions.lcd',
        canUse: true,
        priorCorrect: 0,
        timesSeen: 0,
        hasBeenIntroduced: false,
      }],
    }],
    responses: {},
  };
}

describe('applyResumeModelState shared cluster hydration', function() {
  it('projects shared cluster practice onto a local stimulus when item identity differs', function() {
    const cardProbabilities = createCardProbabilities();

    applyResumeModelState({
      cardProbabilities,
      stimClusters: [{ stims: [{ correctResponse: 'LCD' }] }],
      reconstructed: {
        clusterState: {
          'fractions.lcd': createAggregate({ priorCorrect: 2, priorStudy: 1 }),
        },
        stimulusState: {
          'remote-stimulus': createAggregate({ priorCorrect: 2 }),
        },
        responseState: {},
        numQuestionsAnswered: 2,
        numQuestionsAnsweredCurrentSession: 2,
        numCorrectAnswers: 2,
      },
      getHistoryResponseKey: (rawResponse) => String(rawResponse || '').toLowerCase(),
    });

    const stim = cardProbabilities.cards[0].stims[0];
    assert.equal(stim.stimulusKC, 'local-stimulus');
    assert.equal(stim.priorCorrect, 2);
    assert.equal(stim.priorStudy, 1);
    assert.equal(stim.timesSeen, 3);
    assert.equal(stim.hasBeenIntroduced, true);
  });

  it('keeps exact local stimulus history more specific than shared cluster projection', function() {
    const cardProbabilities = createCardProbabilities();

    applyResumeModelState({
      cardProbabilities,
      stimClusters: [{ stims: [{ correctResponse: 'LCD' }] }],
      reconstructed: {
        clusterState: {
          'fractions.lcd': createAggregate({ priorCorrect: 2 }),
        },
        stimulusState: {
          'local-stimulus': {
            ...createAggregate({ priorCorrect: 1 }),
            curSessionPriorCorrect: 1,
            curSessionPriorIncorrect: 0,
            timesSeen: 1,
          },
        },
        responseState: {},
        numQuestionsAnswered: 2,
        numQuestionsAnsweredCurrentSession: 2,
        numCorrectAnswers: 2,
      },
      getHistoryResponseKey: (rawResponse) => String(rawResponse || '').toLowerCase(),
    });

    const stim = cardProbabilities.cards[0].stims[0];
    assert.equal(stim.priorCorrect, 1);
    assert.equal(stim.timesSeen, 1);
  });

  it('normalizes card cluster identity before applying shared history', function() {
    const cardProbabilities = createCardProbabilities();
    cardProbabilities.cards[0].clusterKC = ' Fractions.LCD ';

    applyResumeModelState({
      cardProbabilities,
      stimClusters: [{ stims: [{ correctResponse: 'LCD' }] }],
      reconstructed: {
        clusterState: {
          'fractions.lcd': createAggregate({ priorCorrect: 3 }),
        },
        stimulusState: {},
        responseState: {},
        numQuestionsAnswered: 3,
        numQuestionsAnsweredCurrentSession: 3,
        numCorrectAnswers: 3,
      },
      getHistoryResponseKey: (rawResponse) => String(rawResponse || '').toLowerCase(),
    });

    const card = cardProbabilities.cards[0];
    const stim = card.stims[0];
    assert.equal(card.priorCorrect, 3);
    assert.equal(stim.priorCorrect, 3);
    assert.equal(stim.timesSeen, 3);
  });

  it('hydrates response state by the normalized response key', function() {
    const cardProbabilities = createCardProbabilities();
    cardProbabilities.responses.lcdanswer = {
      priorCorrect: 0,
      priorIncorrect: 0,
      totalPracticeDuration: 0,
    };

    applyResumeModelState({
      cardProbabilities,
      stimClusters: [{ stims: [{ correctResponse: 'LCD Answer' }] }],
      reconstructed: {
        clusterState: {},
        stimulusState: {},
        responseState: {
          lcdanswer: createAggregate({ priorCorrect: 2, totalPracticeDuration: 500 }),
        },
        numQuestionsAnswered: 2,
        numQuestionsAnsweredCurrentSession: 2,
        numCorrectAnswers: 2,
      },
      getHistoryResponseKey: (rawResponse) => String(rawResponse || '').replace(/\s+/g, '').toLowerCase(),
    });

    assert.equal(cardProbabilities.responses.lcdanswer.priorCorrect, 2);
    assert.equal(cardProbabilities.responses.lcdanswer.totalPracticeDuration, 500);
  });
});
