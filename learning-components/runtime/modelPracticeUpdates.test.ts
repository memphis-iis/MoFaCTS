import assert from 'node:assert/strict';
import { assertCanonicalHistoryEnvelope } from './historyEnvelope';
import {
  createCanonicalModelPracticeHistoryRecord,
  type ModelPracticeUpdateRequest,
} from './modelPracticeUpdates';

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
  practiceDurationMs: 450,
  responseValue: 'Answer',
  input: 'Answer',
  displayedStimulus: 'Prompt',
  time: 2000,
  problemStartTime: 1500,
  selection: 'doc-1:widget-1',
  action: 'response-submitted',
  typeOfResponse: 'sparc',
  eventType: 'sparc',
};

describe('modelPracticeUpdates', function() {
  it('builds a canonical model practice record from a generic update request', function() {
    const record = createCanonicalModelPracticeHistoryRecord({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      levelUnitName: 'SPARC Unit',
      userId: 'user-1',
    }, request);

    assert.equal(record.levelUnitType, 'model');
    assert.equal(record.eventType, 'sparc');
    assert.equal(record.outcome, 'correct');
    assert.equal(record.responseDuration, 450);
    assert.equal(record.stimuliSetId, 'stim-set-1');
    assert.equal(record.stimulusKC, 'kc-1');
    assert.equal(record.clusterKC, 'cluster-1');
    assert.equal(record.KCId, 'kc-1');
    assert.equal(record.KCDefault, 'kc-1');
    assert.equal(record.KCCluster, 'cluster-1');
    assert.equal(record.responseKC, 'response-kc-1');
    assert.equal(record.responseKey, 'answer');
    assert.doesNotThrow(() => assertCanonicalHistoryEnvelope(record));
  });

  it('requires canonical model identity consistency', function() {
    assert.throws(
      () => createCanonicalModelPracticeHistoryRecord({
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      }, {
        ...request,
        target: {
          ...request.target,
          KCId: 'different-kc',
        },
      }),
      /Model practice history identity mismatch: KCId must equal stimulusKC/,
    );
  });
});
