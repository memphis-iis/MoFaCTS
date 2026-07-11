import assert from 'node:assert/strict';
import { withCanonicalHistorySchemaVersion } from './historyEnvelope';
import {
  createHistoryBackedModelPracticeStateProvider,
  MODEL_PRACTICE_METRICS,
  queryModelPracticeHistory,
} from './modelPracticeStateQueries';
import type { CanonicalHistoryRecord } from './historyEnvelope';
import type { ModelPracticeHistoryIdentity } from './historyStimulusIdentity';

const target: ModelPracticeHistoryIdentity = {
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
};

function makeModelRecord(
  outcome: string,
  overrides: Record<string, unknown> = {},
): CanonicalHistoryRecord {
  return withCanonicalHistorySchemaVersion({
    TDFId: 'tdf-1',
    sessionID: 'session-1',
    userId: 'user-1',
    levelUnit: 1,
    levelUnitType: 'model',
    time: 2000,
    problemStartTime: 1000,
    selection: 'selection',
    action: 'answer',
    outcome,
    typeOfResponse: 'text',
    responseValue: 'answer',
    input: 'answer',
    displayedStimulus: 'prompt',
    eventType: '',
    stimuliSetId: target.stimuliSetId,
    stimulusKC: target.stimulusKC,
    clusterKC: target.clusterKC,
    KCId: target.KCId,
    KCDefault: target.KCDefault,
    KCCluster: target.KCCluster,
    responseKC: target.response?.responseKC,
    responseKey: target.response?.responseKey,
    ...overrides,
  });
}

function makeCardHistoryLogRecord(
  outcome: string,
  overrides: Record<string, unknown> = {},
): CanonicalHistoryRecord {
  return makeModelRecord(outcome, {
    levelUnitName: 'Learning Session',
    action: 'UpdateTextField',
    probabilityEstimate: 0.7,
    studentResponseType: outcome === 'study' ? 'HINT_REQUEST' : 'ATTEMPT',
    tutorResponseType: outcome === 'study' ? 'HINT_MSG' : 'RESULT',
    CFStimFileIndex: 0,
    CFSetShuffledIndex: 0,
    CFReviewEntry: '',
    ...overrides,
  });
}

describe('modelPracticeStateQueries', function() {
  it('exports the shared model-practice metric vocabulary', function() {
    assert.deepEqual(MODEL_PRACTICE_METRICS, [
      'probability',
      'priorCorrect',
      'priorIncorrect',
      'priorStudy',
      'totalPracticeDuration',
      'lastOutcome',
    ]);
  });

  it('answers shared model-history metrics from canonical practice records', function() {
    const records = [
      makeModelRecord('correct', { responseDuration: 200 }),
      makeModelRecord('incorrect', { responseDuration: 300 }),
      makeModelRecord('study', {
        typeOfResponse: 'study',
        practiceDurationMs: 400,
      }),
      makeModelRecord('correct', {
        stimulusKC: 'other-kc',
        KCId: 'other-kc',
        KCDefault: 'other-kc',
        clusterKC: 'other-cluster',
        KCCluster: 'other-cluster',
      }),
    ];

    assert.equal(queryModelPracticeHistory(records, {
      target,
      metric: 'priorCorrect',
    }), 1);
    assert.equal(queryModelPracticeHistory(records, {
      target,
      metric: 'priorIncorrect',
    }), 1);
    assert.equal(queryModelPracticeHistory(records, {
      target,
      metric: 'priorStudy',
    }), 1);
    assert.equal(queryModelPracticeHistory(records, {
      target,
      metric: 'totalPracticeDuration',
    }), 900);
    assert.equal(queryModelPracticeHistory(records, {
      target,
      metric: 'lastOutcome',
    }), 'study');
  });

  it('hydrates shared model history across different item envelope fields in one course', function() {
    const records = [
      makeModelRecord('correct', {
        courseAssignment: { courseId: 'course-1' },
        stimuliSetId: 'stim-set-a',
        stimulusKC: 'item-a',
        KCId: 'item-a',
        KCDefault: 'item-a',
      }),
      makeModelRecord('incorrect', {
        courseAssignment: { courseId: 'course-1' },
        stimuliSetId: 'stim-set-b',
        stimulusKC: 'item-b',
        KCId: 'item-b',
        KCDefault: 'item-b',
      }),
      makeModelRecord('correct', {
        courseAssignment: { courseId: 'course-2' },
        stimuliSetId: 'stim-set-c',
        stimulusKC: 'item-c',
        KCId: 'item-c',
        KCDefault: 'item-c',
      }),
    ];

    assert.equal(queryModelPracticeHistory(records, {
      target,
      userId: 'user-1',
      modelContext: {
        contextKind: 'course',
        contextId: 'course-1',
      },
      metric: 'priorCorrect',
    }), 1);
    assert.equal(queryModelPracticeHistory(records, {
      target,
      userId: 'user-1',
      modelContext: {
        contextKind: 'course',
        contextId: 'course-1',
      },
      metric: 'priorIncorrect',
    }), 1);
  });

  it('answers model-history metrics from card practice history-log records', function() {
    const records = [
      makeCardHistoryLogRecord('correct', { responseDuration: 250 }),
      makeCardHistoryLogRecord('incorrect', { responseDuration: 350 }),
    ];

    assert.equal(queryModelPracticeHistory(records, {
      target,
      metric: 'priorCorrect',
    }), 1);
    assert.equal(queryModelPracticeHistory(records, {
      target,
      metric: 'priorIncorrect',
    }), 1);
    assert.equal(queryModelPracticeHistory(records, {
      target,
      metric: 'totalPracticeDuration',
    }), 600);
    assert.equal(queryModelPracticeHistory(records, {
      target,
      metric: 'lastOutcome',
    }), 'incorrect');
  });

  it('counts SPARC model records written with canonical responseDuration', function() {
    assert.equal(queryModelPracticeHistory([
      makeModelRecord('correct', {
        eventType: 'sparc',
        responseDuration: 450,
        sparc: {
          pageKey: 'doc-1',
          sourceAddress: {
            pageKey: 'doc-1',
            nodeId: 'widget-1',
          },
        },
      }),
    ], {
      target,
      metric: 'totalPracticeDuration',
    }), 450);
  });

  it('uses SPARC observation duration through the shared model-history exchange', function() {
    assert.equal(queryModelPracticeHistory([
      makeModelRecord('correct', {
        eventType: 'sparc',
        responseDuration: undefined,
        practiceDurationMs: undefined,
        sparc: {
          pageKey: 'doc-1',
          sourceAddress: {
            pageKey: 'doc-1',
            nodeId: 'widget-1',
          },
          practiceObservation: {
            observationId: 'obs-1',
            sourceAddress: {
              pageKey: 'doc-1',
              nodeId: 'widget-1',
            },
            time: 2000,
            problemStartTime: 1000,
            practiceDurationMs: 500,
            outcome: 'correct',
            responseValue: 'answer',
          },
        },
      }),
    ], {
      target,
      metric: 'totalPracticeDuration',
    }), 500);
  });

  it('lets target-level queries read card or SPARC rows with response identities', function() {
    const targetWithoutResponse: ModelPracticeHistoryIdentity = {
      stimuliSetId: target.stimuliSetId,
      stimulusKC: target.stimulusKC,
      clusterKC: target.clusterKC,
      KCId: target.KCId,
      KCDefault: target.KCDefault,
      KCCluster: target.KCCluster,
    };

    assert.equal(queryModelPracticeHistory([
      makeModelRecord('correct', {
        responseKC: 'response-kc-1',
        responseKey: 'answer',
      }),
      makeModelRecord('incorrect', {
        eventType: 'sparc',
        responseKC: 'response-kc-2',
        responseKey: 'alternate-answer',
      }),
    ], {
      target: targetWithoutResponse,
      metric: 'priorCorrect',
    }), 1);
    assert.equal(queryModelPracticeHistory([
      makeModelRecord('correct', {
        responseKC: 'response-kc-1',
        responseKey: 'answer',
      }),
      makeModelRecord('incorrect', {
        eventType: 'sparc',
        responseKC: 'response-kc-2',
        responseKey: 'alternate-answer',
      }),
    ], {
      target: targetWithoutResponse,
      metric: 'priorIncorrect',
    }), 1);
  });

  it('fails clearly when a model row is not in the shared model-history format', function() {
    assert.throws(
      () => queryModelPracticeHistory([
        makeModelRecord('correct', {
          KCCluster: undefined,
        }),
      ], {
        target,
        metric: 'priorCorrect',
      }),
      /Model practice history record missing KCCluster/,
    );
  });

  it('can be exposed as a generic model-state provider', function() {
    const provider = createHistoryBackedModelPracticeStateProvider([
      makeModelRecord('correct'),
    ]);

    assert.equal(provider.queryModelPracticeState({
      target,
      metric: 'priorCorrect',
    }), 1);
  });

  it('requires a live model-state provider for probability queries', function() {
    assert.throws(
      () => queryModelPracticeHistory([makeModelRecord('correct')], {
        target,
        metric: 'probability',
      }),
      /Model probability queries require a live model-state provider/,
    );
  });
});
