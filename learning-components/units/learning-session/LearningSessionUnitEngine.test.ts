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
      if (key === 'currentTdfFile') {
        return {
          tdfs: {
            tutor: {
              unit: [{ learningsession: { clusterlist: '' } }, { learningsession: {} }, { learningsession: {} }],
            },
          },
        };
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
    getTestType: () => 'd',
    getHiddenItems: () => [],
    setNumVisibleCards() {},
    setQuestionIndex() {},
    getDisplayAnswerText: (answer: unknown) => String(answer || ''),
    updateCurStudentPerformance() {},
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
  it('loads prior SPARC model history into a later flashcard learning session for the same cluster model', async function() {
    const clusters = [{
      stims: [{
        clusterKC: 'cluster-1',
        stimulusKC: 'kc-1',
        correctResponse: 'Answer',
        params: '0,0',
      }],
    }, {
      stims: [{
        clusterKC: 'other-cluster',
        stimulusKC: 'other-kc',
        correctResponse: 'Other',
        params: '0,0',
      }],
    }];
    const relevantHistoryRow = {
      eventType: 'sparc',
      levelUnitType: 'model',
      time: 1000,
      outcome: 'correct',
      stimuliSetId: 'stim-set-1',
      stimulusKC: 'kc-1',
      clusterKC: 'cluster-1',
      KCId: 'kc-1',
      KCDefault: 'kc-1',
      KCCluster: 'cluster-1',
      responseKey: 'answer',
      responseDuration: 250,
      responseValue: 'Answer',
    };
    const unrelatedHistoryRow = {
      ...relevantHistoryRow,
      time: 900,
      stimulusKC: 'other-kc',
      clusterKC: 'other-cluster',
      KCId: 'other-kc',
      KCDefault: 'other-kc',
      KCCluster: 'other-cluster',
    };
    const historyRows = [unrelatedHistoryRow, relevantHistoryRow];
    let requestedUnitNumber: number | null = null;
    let requestedLearningHistoryOptions: any = null;
    let reconstructionRows: unknown[] = [];
    const sessionValues = new Map<string, unknown>();
    const deps = createMinimalDeps({
      getSessionValue(key: UnitEngineSessionReadKey) {
        if (sessionValues.has(key)) {
          return sessionValues.get(key);
        }
        if (key === 'currentTdfUnit') {
          return { learningsession: { clusterlist: '0' } };
        }
        if (key === 'currentTdfId') {
          return 'tdf-1';
        }
        if (key === 'currentUnitNumber') {
          return 2;
        }
        if (key === 'currentTdfFile') {
          return {
            tdfs: {
              tutor: {
                unit: [{}, {}, { learningsession: { clusterlist: '0' } }],
              },
            },
          };
        }
        if (key === 'curStudentPerformance') {
          return { totalTime: 0 };
        }
        return undefined;
      },
      setSessionValue(key: string, value: unknown) {
        sessionValues.set(key, value);
      },
      getStimCount: () => clusters.length,
      getStimCluster: (clusterIndex: number) => clusters[clusterIndex],
      serverMethods: {
        getResponseKCMapForTdf: async () => ({ answer: 'response-kc-1' }),
        getStimulusCrowdStatsForDeck: async () => [],
        getLearningHistoryForUnit: async (
          _userId: string,
          _tdfId: string,
          currentUnitNumber: number,
          _resetStudentPerformance: boolean,
          options?: unknown,
        ) => {
          requestedUnitNumber = currentUnitNumber;
          requestedLearningHistoryOptions = options;
          return historyRows;
        },
      },
      reconstructLearningStateFromHistory(rows: unknown[]) {
        reconstructionRows = rows;
        return {
          clusterState: {
            'cluster-1': {
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
            },
          },
          stimulusState: {
            'kc-1': {
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
              curSessionPriorCorrect: 1,
              curSessionPriorIncorrect: 0,
              hasBeenIntroduced: true,
              timesSeen: 1,
              otherPracticeTime: 0,
            },
          },
          responseState: {
            Answer: {
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
            },
          },
          numQuestionsAnswered: 1,
          numQuestionsAnsweredCurrentSession: 1,
          numCorrectAnswers: 1,
          overallOutcomeHistory: [1],
          overallStudyHistory: [0],
        };
      },
      extractDelimFields(source: string, fields: unknown[]) {
        fields.push(source);
      },
      rangeVal: () => [],
      legacyInt: (source: unknown) => Number(source),
    });
    const engine = await createLearningSessionUnitEngine(deps);
    await engine.initializeLogisticModelState();

    await engine.loadResumeState();

    assert.equal(requestedUnitNumber, 2);
    assert.equal(requestedLearningHistoryOptions, undefined);
    assert.deepEqual(reconstructionRows, [relevantHistoryRow]);
    const cardProbabilities = engine.getCardProbabilitiesNoCalc();
    assert.equal(cardProbabilities.cards[0].priorCorrect, 1);
    assert.equal(cardProbabilities.cards[0].hasBeenIntroduced, true);
    assert.equal(cardProbabilities.cards[0].stims[0].priorCorrect, 1);
    assert.equal(cardProbabilities.cards[0].stims[0].timesSeen, 1);
    assert.equal(cardProbabilities.numQuestionsAnswered, 1);
    assert.deepEqual(deps.getSessionValue('overallOutcomeHistory'), [1]);
  });

  it('hydrates a local stimulus from shared cluster history when stimulus identities differ across systems', async function() {
    const cluster = {
      stims: [{
        clusterKC: 'fractions.lcd',
        stimulusKC: 'kc-definitions-local-item',
        correctResponse: 'LCD',
        params: '0,0',
      }],
    };
    const historyRows = [{
      eventType: 'sparc',
      levelUnitType: 'model',
      time: 1000,
      outcome: 'correct',
      stimuliSetId: 'sparc-stim-set',
      stimulusKC: 'sparc-local-item',
      clusterKC: 'fractions.lcd',
      KCId: 'sparc-local-item',
      KCDefault: 'sparc-local-item',
      KCCluster: 'fractions.lcd',
      responseDuration: 250,
      responseValue: 'Determine LCD',
      sparc: {
        practiceObservation: {
          practiceDurationMs: 250,
        },
      },
    }];
    const sessionValues = new Map<string, unknown>();
    let requestedLearningHistoryOptions: any = null;
    let reconstructionOptions: any = null;
    const deps = createMinimalDeps({
      getSessionValue(key: UnitEngineSessionReadKey) {
        if (sessionValues.has(key)) {
          return sessionValues.get(key);
        }
        if (key === 'currentTdfUnit') {
          return { learningsession: { clusterlist: '0' } };
        }
        if (key === 'currentTdfId') {
          return 'fraction-kc-definitions-tdf';
        }
        if (key === 'currentUnitNumber') {
          return 1;
        }
        if (key === 'currentTdfFile') {
          return {
            tdfs: {
              tutor: {
                unit: [{}, { learningsession: { clusterlist: '0' } }],
              },
            },
          };
        }
        if (key === 'curStudentPerformance') {
          return { totalTime: 0 };
        }
        return undefined;
      },
      setSessionValue(key: string, value: unknown) {
        sessionValues.set(key, value);
      },
      getStimCount: () => 1,
      getStimCluster: () => cluster,
      serverMethods: {
        getResponseKCMapForTdf: async () => ({ lcd: 'response-kc-1' }),
        getStimulusCrowdStatsForDeck: async () => [],
        getLearningHistoryForUnit: async (
          _userId: string,
          _tdfId: string,
          _currentUnitNumber: number,
          _resetStudentPerformance: boolean,
          options?: unknown,
        ) => {
          requestedLearningHistoryOptions = options;
          return historyRows;
        },
      },
      reconstructLearningStateFromHistory(rows: unknown[], options: any) {
        assert.deepEqual(rows, historyRows);
        reconstructionOptions = options;
        return {
          clusterState: {
            'fractions.lcd': {
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
            },
          },
          stimulusState: {
            'sparc-local-item': {
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
              curSessionPriorCorrect: 1,
              curSessionPriorIncorrect: 0,
              hasBeenIntroduced: true,
              timesSeen: 1,
              otherPracticeTime: 0,
            },
          },
          responseState: {},
          numQuestionsAnswered: 1,
          numQuestionsAnsweredCurrentSession: 1,
          numCorrectAnswers: 1,
          overallOutcomeHistory: [1],
          overallStudyHistory: [0],
        };
      },
      extractDelimFields(source: string, fields: unknown[]) {
        fields.push(source);
      },
      rangeVal: () => [],
      legacyInt: (source: unknown) => Number(source),
    });
    const engine = await createLearningSessionUnitEngine(deps);
    await engine.initializeLogisticModelState();

    await engine.loadResumeState();

    assert.equal(requestedLearningHistoryOptions, undefined);
    assert.deepEqual(reconstructionOptions, { allowResponseLessSparcModelPractice: true });
    const cardProbabilities = engine.getCardProbabilitiesNoCalc();
    assert.equal(cardProbabilities.cards[0].priorCorrect, 1);
    assert.equal(cardProbabilities.cards[0].stims[0].stimulusKC, 'kc-definitions-local-item');
    assert.equal(cardProbabilities.cards[0].stims[0].priorCorrect, 1);
    assert.equal(cardProbabilities.cards[0].stims[0].hasBeenIntroduced, true);
    assert.equal(cardProbabilities.cards[0].stims[0].timesSeen, 1);
  });

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
        if (key === 'currentTdfFile') {
          return {
            tdfs: {
              tutor: {
                unit: [{}, {}, { learningsession: {} }],
              },
            },
          };
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
      findTdfById: () => {
        throw new Error('findTdfById should not be required for active TDF model probability preparation');
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
        pageKey: 'doc-1',
      },
    });

    const cardProbabilities = engine.getCardProbabilitiesNoCalc();
    assert.equal(cardProbabilities.numQuestionsAnswered, 1);
    assert.equal(cardProbabilities.numCorrectAnswers, 1);
    assert.equal(cardProbabilities.cards[0].priorCorrect, 1);
    assert.equal(cardProbabilities.cards[0].stims[0].priorCorrect, 1);
    assert.equal(result.record.levelUnitType, 'model');
    assert.equal(result.record.eventType, 'sparc');
    assert.equal(result.record.modelEvidenceSource, 'sparc');
    assert.deepEqual(result.record.sparc, {
      pageKey: 'doc-1',
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
