import { expect } from 'chai';
import {
  applyStimulusCrowdStatsToCards,
  collectStimulusKCsForCrowdStats,
} from '../../learning-components/units/learning-session/model/stimulusCrowdStatsModel';
import { calculateSingleProbability } from '../../learning-components/units/learning-session/model/probabilityCalculation';
import { applyAnswerUpdate } from '../../learning-components/units/learning-session/model/answerUpdates';

describe('learning-session crowd stats integration', function() {
  it('collects each stimulus KC once for the startup batch read', function() {
    const stimulusKCs = collectStimulusKCsForCrowdStats([
      { stims: [{ stimulusKC: 1001 }, { stimulusKC: 1002 }] },
      { stims: [{ stimulusKC: 1001 }, { stimulusKC: '1003' }] },
    ]);

    expect(stimulusKCs).to.deep.equal([1001, 1002, '1003']);
  });

  it('attaches returned crowd counts and uses zeros for missing aggregate rows', function() {
    const cards = [{
      stims: [
        { stimulusKC: 1001 },
        { stimulusKC: 1002 },
      ],
    }];

    applyStimulusCrowdStatsToCards({
      cards,
      crowdStats: [{
        stimulusKC: 1001,
        correctCount: 3,
        incorrectCount: 2,
        totalCount: 5,
      }],
    });

    expect(cards[0]!.stims[0]).to.deep.include({
      crowdStimSuccessCount: 3,
      crowdStimFailureCount: 2,
      crowdStimTotalTests: 5,
    });
    expect(cards[0]!.stims[1]).to.deep.include({
      crowdStimSuccessCount: 0,
      crowdStimFailureCount: 0,
      crowdStimTotalTests: 0,
    });
  });

  it('rejects malformed aggregate totals instead of using them in probability calculations', function() {
    expect(() => applyStimulusCrowdStatsToCards({
      cards: [{ stims: [{ stimulusKC: 1001 }] }],
      crowdStats: [{
        stimulusKC: 1001,
        correctCount: 3,
        incorrectCount: 2,
        totalCount: 6,
      }],
    })).to.throw('totalCount must equal correctCount + incorrectCount');
  });

  it('exposes local stimulus crowd counts to custom probability functions', function() {
    let observedP: any = null;

    const result = calculateSingleProbability({
      cardProbabilities: {
        numQuestionsAnswered: 0,
        numCorrectAnswers: 0,
        responses: {
          answer: {
            priorCorrect: 0,
            priorIncorrect: 0,
            outcomeStack: [],
            lastSeen: 0,
            priorStudy: 0,
            timeHistory: [],
          },
        },
        cards: [{
          priorCorrect: 0,
          priorIncorrect: 0,
          priorStudy: 0,
          lastSeen: 0,
          firstSeen: 0,
          otherPracticeTime: 0,
          timeHistory: [],
          previousCalculatedProbabilities: [],
          outcomeStack: [],
          stims: [{
            priorCorrect: 1,
            priorIncorrect: 2,
            priorStudy: 0,
            lastSeen: 0,
            firstSeen: 0,
            otherPracticeTime: 0,
            timeHistory: [],
            previousCalculatedProbabilities: [],
            outcomeStack: [],
            crowdStimSuccessCount: 7,
            crowdStimFailureCount: 5,
            crowdStimTotalTests: 12,
          }],
        }],
      },
      cardIndex: 0,
      stimIndex: 0,
      sequenceIndex: 0,
      stimCluster: {
        stims: [{
          correctResponse: 'Answer',
          params: '0,.7',
        }],
      },
      probabilityFunction: (p) => {
        observedP = p;
        p.probability = 0.5;
        return p;
      },
      deliverySettings: {},
      overallOutcomeHistory: [],
      overallStudyHistory: [],
      getDisplayAnswerText: (answer) => String(answer),
      normalizeResponseText: (answer) => answer.toLowerCase(),
      legacyFloat: (value) => Number(value),
      log() {},
    });

    expect(result.probability).to.equal(0.5);
    expect(observedP).to.deep.include({
      crowdStimSuccessCount: 7,
      crowdStimFailureCount: 5,
      crowdStimTotalTests: 12,
    });
  });

  it('adds the current learner answer to crowd counts only in local session state', function() {
    const cardProbabilities = {
      numQuestionsAnswered: 0,
      numQuestionsAnsweredCurrentSession: 0,
      numCorrectAnswers: 0,
      responses: {
        answer: {
          priorCorrect: 0,
          allTimeCorrect: 0,
          allTimeIncorrect: 0,
          priorIncorrect: 0,
          outcomeStack: [],
        },
      },
      cards: [{
        firstSeen: 0,
        priorCorrect: 0,
        allTimeCorrect: 0,
        allTimeIncorrect: 0,
        priorIncorrect: 0,
        outcomeStack: [],
        stims: [{
          priorCorrect: 0,
          priorIncorrect: 0,
          curSessionPriorCorrect: 0,
          curSessionPriorIncorrect: 0,
          allTimeCorrect: 0,
          allTimeIncorrect: 0,
          totalPracticeDuration: 0,
          allTimeTotalPracticeDuration: 0,
          timesSeen: 0,
          crowdStimSuccessCount: 3,
          crowdStimFailureCount: 2,
          crowdStimTotalTests: 5,
          outcomeStack: [],
        }],
      }],
    };

    applyAnswerUpdate({
      cardProbabilities,
      cards: cardProbabilities.cards,
      selectedClusterIndex: 0,
      currentStimIndex: 0,
      whichStim: 0,
      practiceTime: 1000,
      wasCorrect: true,
      testType: 'd',
      answerText: 'answer',
      onMissingResponseMetrics() {},
    });

    expect(cardProbabilities.cards[0]!.stims[0]).to.deep.include({
      crowdStimSuccessCount: 4,
      crowdStimFailureCount: 2,
      crowdStimTotalTests: 6,
      curSessionPriorCorrect: 1,
    });
    expect(cardProbabilities.numQuestionsAnsweredCurrentSession).to.equal(1);
  });

  it('does not add study trials to transient crowd counts', function() {
    const cardProbabilities = {
      numQuestionsAnswered: 0,
      numQuestionsAnsweredCurrentSession: 0,
      numCorrectAnswers: 0,
      responses: {},
      cards: [{
        firstSeen: 0,
        stims: [{
          totalPracticeDuration: 0,
          allTimeTotalPracticeDuration: 0,
          timesSeen: 0,
          crowdStimSuccessCount: 3,
          crowdStimFailureCount: 2,
          crowdStimTotalTests: 5,
        }],
      }],
    };

    applyAnswerUpdate({
      cardProbabilities,
      cards: cardProbabilities.cards,
      selectedClusterIndex: 0,
      currentStimIndex: 0,
      whichStim: 0,
      practiceTime: 1000,
      wasCorrect: true,
      testType: 's',
      answerText: 'answer',
      onMissingResponseMetrics() {},
    });

    expect(cardProbabilities.cards[0]!.stims[0]).to.deep.include({
      crowdStimSuccessCount: 3,
      crowdStimFailureCount: 2,
      crowdStimTotalTests: 5,
      timesSeen: 1,
    });
    expect(cardProbabilities.numQuestionsAnsweredCurrentSession).to.equal(0);
  });
});
