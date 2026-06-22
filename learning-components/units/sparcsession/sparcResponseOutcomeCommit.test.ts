import assert from 'node:assert/strict';
import { createCanonicalModelPracticeHistoryRecord } from '../../runtime/modelPracticeUpdates';
import {
  commitSparcProcessedResponseOutcome,
} from './sparcResponseOutcomeCommit';
import { processSparcResponseOutcome } from './sparcResponseOutcomeProcessor';
import type { SparcModelTargetIdentity } from './sparcSessionContracts';

const core = {
  TDFId: 'tdf-1',
  sessionID: 'session-1',
  levelUnit: 2,
  userId: 'user-1',
};

const sourceAddress = {
  documentId: 'doc-1',
  nodeId: 'widget-1',
};

const modelTarget: SparcModelTargetIdentity = {
  sparcDocumentId: 'doc-1',
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

describe('sparcResponseOutcomeCommit', function() {
  it('applies model-linked outcomes through adaptive model runtime before writing shared history', async function() {
    const writtenRecords: unknown[] = [];
    const processed = processSparcResponseOutcome(core, {
      observationId: 'obs-1',
      sourceAddress,
      modelTarget,
      time: 2000,
      problemStartTime: 1500,
      practiceDurationMs: 250,
      outcome: 'correct',
      responseValue: 'Answer',
      stateWrites: [{
        target: sourceAddress,
        key: 'feedback',
        value: 'ok',
      }],
    });

    const committed = await commitSparcProcessedResponseOutcome(core, processed, {
      adaptiveModel: {
        queryModelPracticeState() {
          throw new Error('query not used while committing outcome');
        },
        applyModelPracticeUpdate(currentCore, request, extensionFields) {
          return {
            record: createCanonicalModelPracticeHistoryRecord(currentCore, request, extensionFields),
            modelResult: {
              probabilityEstimate: 0.7,
            },
          };
        },
      },
      history: {
        async writeCanonicalHistory(record) {
          writtenRecords.push(record);
        },
      },
    });

    assert.equal(committed.usedAdaptiveModel, true);
    assert.equal(committed.historyRecord.modelEvidenceSource, 'sparc');
    assert.deepEqual(committed.modelResult, {
      probabilityEstimate: 0.7,
    });
    assert.equal(committed.historyRecord.levelUnitType, 'model');
    assert.deepEqual(committed.historyRecord.sparc.stateTransition, processed.stateTransition);
    assert.deepEqual(writtenRecords, [committed.historyRecord]);
  });

  it('writes SPARC-only outcomes directly without applying the adaptive model', async function() {
    const writtenRecords: unknown[] = [];
    const processed = processSparcResponseOutcome(core, {
      observationId: 'obs-2',
      sourceAddress,
      time: 2500,
      problemStartTime: 2400,
      outcome: 'unknown',
      responseValue: true,
    });

    const committed = await commitSparcProcessedResponseOutcome(core, processed, {
      adaptiveModel: {
        queryModelPracticeState() {
          throw new Error('query not used while committing SPARC-only outcome');
        },
        applyModelPracticeUpdate() {
          throw new Error('adaptive model should not be called for SPARC-only outcomes');
        },
      },
      history: {
        async writeCanonicalHistory(record) {
          writtenRecords.push(record);
        },
      },
    });

    assert.equal(committed.usedAdaptiveModel, false);
    assert.equal(committed.historyRecord.levelUnitType, 'sparc');
    assert.deepEqual(writtenRecords, [processed.historyRecord]);
  });
});
