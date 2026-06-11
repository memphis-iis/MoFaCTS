import assert from 'node:assert/strict';
import { withCanonicalHistorySchemaVersion } from './historyEnvelope';
import {
  createHistoryBackedModelPracticeStateProvider,
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

describe('modelPracticeStateQueries', function() {
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

  it('counts SPARC model records written with canonical responseDuration', function() {
    assert.equal(queryModelPracticeHistory([
      makeModelRecord('correct', {
        eventType: 'sparc',
        responseDuration: 450,
        sparc: {
          documentId: 'doc-1',
          sourceAddress: {
            documentId: 'doc-1',
            nodeId: 'widget-1',
          },
        },
      }),
    ], {
      target,
      metric: 'totalPracticeDuration',
    }), 450);
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
