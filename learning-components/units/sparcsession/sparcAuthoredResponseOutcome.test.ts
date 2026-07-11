import assert from 'node:assert/strict';
import { processSparcAuthoredResponseOutcome } from './sparcAuthoredResponseOutcome';
import type {
  SparcAuthoredDocument,
  SparcModelTargetIdentity,
} from './sparcSessionContracts';

const authoredTarget: SparcModelTargetIdentity = {
  sparcPageKey: 'doc-1',
  sparcNodeId: 'widget-1',
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

const explicitTarget: SparcModelTargetIdentity = {
  ...authoredTarget,
  stimulusKC: 'explicit-kc',
  KCId: 'explicit-kc',
  KCDefault: 'explicit-kc',
};

function authoredDocument(): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 2,
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'region-1',
        kind: 'panel',
        children: [{
          id: 'widget-1',
          kind: 'widget',
          modelTarget: authoredTarget,
        }],
      }],
    },
  };
}

describe('sparcAuthoredResponseOutcome', function() {
  it('uses the authored model target for a widget response outcome', function() {
    const processed = processSparcAuthoredResponseOutcome({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      userId: 'user-1',
    }, authoredDocument(), {
      observationId: 'obs-1',
      sourceAddress: {
        pageKey: 'doc-1',
        nodeId: 'widget-1',
      },
      time: 2000,
      problemStartTime: 1000,
      outcome: 'correct',
      responseValue: 'Answer',
    });

    assert.deepEqual(processed.observation.modelTarget, authoredTarget);
    assert.deepEqual(processed.modelUpdateRequest?.target, authoredTarget);
    assert.equal(processed.historyRecord.levelUnitType, 'model');
    assert.equal(processed.historyRecord.KCId, 'kc-1');
  });

  it('preserves an explicit outcome model target when one is supplied', function() {
    const processed = processSparcAuthoredResponseOutcome({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      userId: 'user-1',
    }, authoredDocument(), {
      observationId: 'obs-2',
      sourceAddress: {
        pageKey: 'doc-1',
        nodeId: 'widget-1',
      },
      modelTarget: explicitTarget,
      time: 2000,
      problemStartTime: 1000,
      outcome: 'correct',
      responseValue: 'Answer',
    });

    assert.deepEqual(processed.observation.modelTarget, explicitTarget);
    assert.deepEqual(processed.modelUpdateRequest?.target, explicitTarget);
    assert.equal(processed.historyRecord.KCId, 'explicit-kc');
  });
});
