import { strict as assert } from 'assert';
import { createLearningSessionUnitEngine } from './LearningSessionUnitEngine';
import type { UnitEngineSessionReadKey } from '../UnitEngineSessionKeys';

function createMinimalDeps(overrides: Record<string, unknown> = {}): any {
  let unitFinishedCalls = 0;
  const deps = {
    getSessionValue(key: UnitEngineSessionReadKey) {
      if (key === 'currentTdfUnit') {
        return { learningsession: {} };
      }
      if (key === 'curStudentPerformance') {
        return { totalTime: 0 };
      }
      return undefined;
    },
    setSessionValue() {},
    getDeliverySettings: () => ({}),
    getStimCount: () => 0,
    getStimCluster: () => ({ stims: [] }),
    getStimKCBaseForCurrentStimuliSet: () => [],
    getTestType: () => 'd',
    getHiddenItems: () => [],
    setNumVisibleCards() {},
    setQuestionIndex() {},
    getDisplayAnswerText: (answer: unknown) => String(answer || ''),
    updateCurStudentPerformance() {},
    updateCurStudedentPracticeTime() {},
    serverMethods: {
      getResponseKCMapForTdf: async () => ({}),
      getStimulusCrowdStatsForDeck: async () => [],
      getLearningHistoryForUnit: async () => [],
    },
    getCurrentUserId: () => 'user-1',
    reconstructLearningStateFromHistory: () => ({}),
    extractDelimFields() {},
    rangeVal: (source: unknown) => [source],
    legacyFloat: (source: unknown) => Number(source),
    legacyInt: (source: unknown) => Number(source),
    currentUserHasRole: () => false,
    displayify: (value: unknown) => value,
    unitIsFinished() {
      unitFinishedCalls += 1;
    },
    alertUser() {},
    log() {},
    findTdfById: () => ({
      content: {
        tdfs: {
          tutor: {
            unit: [{ learningsession: { clusterlist: '' } }],
          },
        },
      },
    }),
    getUnitFinishedCalls: () => unitFinishedCalls,
    ...overrides,
  };
  return deps;
}

describe('LearningSessionUnitEngine selection completion guard', function() {
  it('does not advance the unit when no card is selected before a completion rule is satisfied', async function() {
    const deps = createMinimalDeps();
    const engine = await createLearningSessionUnitEngine(deps);

    try {
      await engine.selectNextCard({ clusterIndex: -1, stimIndex: -1 }, {});
      throw new Error('Expected selectNextCard to reject missing selection');
    } catch (error) {
      assert(error instanceof Error);
      assert.equal(
        error.message,
        'Learning session selection produced no card before a completion rule was satisfied; refusing to advance unit.'
      );
    }

    assert.equal(deps.getUnitFinishedCalls(), 0);
  });
});

describe('LearningSessionUnitEngine model practice updates', function() {
  it('applies canonical model-practice updates through the shared adaptive-logistic engine state', async function() {
    const cluster = {
      stims: [{
        clusterKC: 'cluster-1',
        stimulusKC: 'kc-1',
        correctResponse: 'Answer',
        params: '0,0',
      }],
    };
    const deps = createMinimalDeps({
      getSessionValue(key: UnitEngineSessionReadKey) {
        if (key === 'currentTdfUnit') {
          return { learningsession: {} };
        }
        if (key === 'currentTdfId') {
          return 'tdf-1';
        }
        if (key === 'currentUnitNumber') {
          return 2;
        }
        if (key === 'curStudentPerformance') {
          return { totalTime: 0 };
        }
        return undefined;
      },
      getStimCount: () => 1,
      getStimCluster: () => cluster,
      serverMethods: {
        getResponseKCMapForTdf: async () => ({ answer: 'response-kc-1' }),
        getStimulusCrowdStatsForDeck: async () => [],
        getLearningHistoryForUnit: async () => [],
      },
    });
    const engine = await createLearningSessionUnitEngine(deps);
    await engine.initializeLogisticModelState();

    const result = await engine.applyModelPracticeUpdate({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      userId: 'user-1',
    }, {
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
    }, {
      sparc: {
        documentId: 'doc-1',
      },
    });

    const cardProbabilities = engine.getCardProbabilitiesNoCalc();
    assert.equal(cardProbabilities.numQuestionsAnswered, 1);
    assert.equal(cardProbabilities.numCorrectAnswers, 1);
    assert.equal(cardProbabilities.cards[0].priorCorrect, 1);
    assert.equal(cardProbabilities.cards[0].stims[0].priorCorrect, 1);
    assert.equal(result.record.levelUnitType, 'model');
    assert.equal(result.record.eventType, 'sparc');
    assert.deepEqual(result.record.sparc, {
      documentId: 'doc-1',
    });
    cardProbabilities.cards[0].stims[0].probabilityEstimate = 0.81;
    assert.deepEqual(engine.getModelProgressItems(), [
      {
        id: '0:0:kc-1',
        stimulusKC: 'kc-1',
        clusterKC: 'cluster-1',
        probability: 0.81,
        introduced: true,
        current: false,
        canUse: true,
      },
    ]);
    assert.equal(engine.queryModelPracticeState({
      target: {
        stimuliSetId: 'stim-set-1',
        stimulusKC: 'kc-1',
        clusterKC: 'cluster-1',
        KCId: 'kc-1',
        KCDefault: 'kc-1',
        KCCluster: 'cluster-1',
      },
      metric: 'probability',
    }), 0.81);
  });
});
