import assert from 'node:assert/strict';
import {
  createCanonicalModelPracticeHistoryRecord,
  type ModelPracticeUpdateRequest,
} from './modelPracticeUpdates';
import { createModelPracticeRuntime } from './modelPracticeRuntime';

const request: ModelPracticeUpdateRequest = {
  observationId: 'obs-1',
  target: {
    stimuliSetId: 'stim-set-1',
    stimulusKC: 'kc-1',
    clusterKC: 'cluster-1',
    KCId: 'kc-1',
    KCDefault: 'kc-1',
    KCCluster: 'cluster-1',
  },
  outcome: 'correct',
  responseValue: 'Answer',
  time: 2000,
  problemStartTime: 1500,
  selection: 'doc-1:widget-1',
  action: 'sparc-response',
  typeOfResponse: 'sparc',
  eventType: 'sparc',
};

describe('modelPracticeRuntime', function() {
  it('applies a model update and returns the canonical history record for persistence', async function() {
    const appliedRequests: ModelPracticeUpdateRequest[] = [];
    const runtime = createModelPracticeRuntime({
      applyUpdate(currentRequest) {
        appliedRequests.push(currentRequest);
        return {
          probabilityEstimate: 0.73,
        };
      },
      queryState() {
        throw new Error('query not used');
      },
      createHistoryRecord: createCanonicalModelPracticeHistoryRecord,
    });

    const result = await runtime.applyModelPracticeUpdate({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      userId: 'user-1',
    }, request, {
      sparc: {
        pageKey: 'doc-1',
      },
    });

    assert.deepEqual(appliedRequests, [request]);
    assert.deepEqual(result.modelResult, {
      probabilityEstimate: 0.73,
    });
    assert.equal(result.record.levelUnitType, 'model');
    assert.equal(result.record.eventType, 'sparc');
    assert.deepEqual(result.record.sparc, {
      pageKey: 'doc-1',
    });
  });

  it('does not create history if model update application fails', async function() {
    const runtime = createModelPracticeRuntime({
      applyUpdate() {
        throw new Error('model target missing');
      },
      queryState() {
        throw new Error('query not used');
      },
      createHistoryRecord() {
        throw new Error('history should not be created after failed model update');
      },
    });

    await assert.rejects(
      Promise.resolve(runtime.applyModelPracticeUpdate({
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      }, request)),
      /model target missing/,
    );
  });

  it('exposes live model-state queries through the same runtime capability', function() {
    const runtime = createModelPracticeRuntime({
      applyUpdate() {
        throw new Error('update not used');
      },
      queryState(query) {
        assert.equal(query.metric, 'probability');
        return 0.82;
      },
      createHistoryRecord: createCanonicalModelPracticeHistoryRecord,
    });

    assert.equal(runtime.queryModelPracticeState({
      target: request.target,
      metric: 'probability',
    }), 0.82);
  });
});
