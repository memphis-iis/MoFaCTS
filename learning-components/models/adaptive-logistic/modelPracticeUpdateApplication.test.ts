import assert from 'node:assert/strict';
import {
  applyModelPracticeUpdateToAdaptiveLogistic,
  queryAdaptiveLogisticModelPracticeState,
} from './modelPracticeUpdateApplication';
import type { ModelPracticeUpdateRequest } from '../../runtime/modelPracticeUpdates';

function createCardProbabilities(): any {
  return {
    numQuestionsAnswered: 0,
    numQuestionsAnsweredCurrentSession: 0,
    numCorrectAnswers: 0,
    responses: {
      answer: {
        priorCorrect: 0,
        allTimeCorrect: 0,
        priorIncorrect: 0,
        allTimeIncorrect: 0,
        outcomeStack: [],
      },
    },
    cards: [{
      clusterKC: 'cluster-1',
      priorCorrect: 0,
      allTimeCorrect: 0,
      priorIncorrect: 0,
      allTimeIncorrect: 0,
      otherPracticeTime: 0,
      outcomeStack: [],
      stims: [{
        stimulusKC: 'kc-1',
        priorCorrect: 0,
        curSessionPriorCorrect: 0,
        allTimeCorrect: 0,
        priorIncorrect: 0,
        curSessionPriorIncorrect: 0,
        allTimeIncorrect: 0,
        totalPracticeDuration: 0,
        allTimeTotalPracticeDuration: 0,
        otherPracticeTime: 0,
        timesSeen: 0,
        outcomeStack: [],
      }],
    }],
  };
}

const request: ModelPracticeUpdateRequest = {
  observationId: 'obs-1',
  target: {
    stimuliSetId: 'stim-set-1',
    stimulusKC: 'kc-1',
    clusterKC: 'cluster-1',
    KCId: 'kc-1',
    KCDefault: 'kc-1',
    KCCluster: 'cluster-1',
    response: {
      responseKC: 'response-kc-1',
      responseKey: 'answer',
    },
  },
  outcome: 'correct',
  practiceDurationMs: 250,
  responseValue: 'Answer',
  time: 2000,
  problemStartTime: 1500,
  selection: 'doc-1:widget-1',
  action: 'sparc-response',
  typeOfResponse: 'sparc',
  eventType: 'sparc',
};

describe('modelPracticeUpdateApplication', function() {
  it('applies a canonical model practice update to adaptive-logistic state by identity', function() {
    const cardProbabilities = createCardProbabilities();

    const applied = applyModelPracticeUpdateToAdaptiveLogistic({
      cardProbabilities,
      request,
    });

    assert.deepEqual(applied, {
      cardIndex: 0,
      stimIndex: 0,
      responseKey: 'answer',
      wasCorrect: true,
      testType: 'd',
      practiceTime: 250,
    });
    assert.equal(cardProbabilities.numQuestionsAnswered, 1);
    assert.equal(cardProbabilities.numQuestionsAnsweredCurrentSession, 1);
    assert.equal(cardProbabilities.numCorrectAnswers, 1);
    assert.equal(cardProbabilities.cards[0].priorCorrect, 1);
    assert.equal(cardProbabilities.cards[0].stims[0].priorCorrect, 1);
    assert.equal(cardProbabilities.cards[0].stims[0].timesSeen, 1);
    assert.equal(cardProbabilities.cards[0].stims[0].totalPracticeDuration, 250);
    assert.deepEqual(cardProbabilities.cards[0].outcomeStack, [1]);
    assert.deepEqual(cardProbabilities.responses.answer.outcomeStack, [1]);
  });

  it('fails loudly when a canonical target is not present in adaptive-logistic state', function() {
    assert.throws(
      () => applyModelPracticeUpdateToAdaptiveLogistic({
        cardProbabilities: createCardProbabilities(),
        request: {
          ...request,
          target: {
            ...request.target,
            stimulusKC: 'missing-kc',
            KCId: 'missing-kc',
            KCDefault: 'missing-kc',
          },
        },
      }),
      /Adaptive logistic model target not found: clusterKC=cluster-1, stimulusKC=missing-kc/,
    );
  });

  it('requires an explicit outcome adapter for non-binary SPARC outcomes', function() {
    assert.throws(
      () => applyModelPracticeUpdateToAdaptiveLogistic({
        cardProbabilities: createCardProbabilities(),
        request: {
          ...request,
          outcome: 'partial',
        },
      }),
      /cannot score outcome "partial" without an explicit scoreOutcome adapter/,
    );
  });

  it('queries live adaptive-logistic probability state by canonical model identity', function() {
    const cardProbabilities = createCardProbabilities();
    cardProbabilities.cards[0].stims[0].probabilityEstimate = 0.64;

    assert.equal(queryAdaptiveLogisticModelPracticeState({
      cardProbabilities,
      query: {
        target: request.target,
        metric: 'probability',
      },
    }), 0.64);
  });
});
