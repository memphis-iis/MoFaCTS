import assert from 'node:assert/strict';
import { createHistoryBackedModelPracticeStateProvider } from '../../runtime/modelPracticeStateQueries';
import { processSparcResponseOutcome } from './sparcResponseOutcomeProcessor';
import { evaluateSparcCondition } from './sparcConditionEvaluator';
import { replaySparcHistory } from './sparcStateReplay';
import type {
  SparcCondition,
  SparcModelTargetIdentity,
} from './sparcSessionContracts';

const sourceAddress = {
  documentId: 'doc-1',
  nodeId: 'region-7',
  path: ['widget-3', 'input'],
};

const modelTarget: SparcModelTargetIdentity = {
  sparcDocumentId: 'doc-1',
  sparcNodeId: 'region-7',
  sparcPath: ['widget-3', 'input'],
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

function contextFromHistory() {
  const correctRecord = processSparcResponseOutcome({
    TDFId: 'tdf-1',
    sessionID: 'session-1',
    levelUnit: 1,
    userId: 'user-1',
  }, {
    observationId: 'obs-1',
    sourceAddress,
    modelTarget,
    time: 2000,
    problemStartTime: 1000,
    outcome: 'correct',
    responseValue: 'Answer',
    stateWrites: [{
      target: sourceAddress,
      key: 'feedbackVisible',
      value: true,
    }],
  }).historyRecord;
  return {
    replayState: replaySparcHistory([correctRecord]),
    modelQueries: createHistoryBackedModelPracticeStateProvider([correctRecord]),
  };
}

describe('sparcConditionEvaluator', function() {
  it('evaluates replayed SPARC document-state conditions', function() {
    const condition: SparcCondition = {
      type: 'state',
      query: {
        target: sourceAddress,
        key: 'feedbackVisible',
      },
      compare: 'truthy',
    };

    assert.equal(evaluateSparcCondition(condition, contextFromHistory()), true);
  });

  it('evaluates model-state conditions through the injected model query capability', function() {
    const condition: SparcCondition = {
      type: 'model',
      query: {
        target: modelTarget,
        metric: 'priorCorrect',
      },
      compare: 'gte',
      value: 1,
    };

    assert.equal(evaluateSparcCondition(condition, contextFromHistory()), true);
  });

  it('combines state and model conditions without renderer globals', function() {
    const condition: SparcCondition = {
      type: 'all',
      conditions: [{
        type: 'state',
        query: {
          target: sourceAddress,
          key: 'feedbackVisible',
        },
        compare: 'eq',
        value: true,
      }, {
        type: 'model',
        query: {
          target: modelTarget,
          metric: 'lastOutcome',
        },
        compare: 'eq',
        value: 'correct',
      }, {
        type: 'not',
        condition: {
          type: 'state',
          query: {
            target: sourceAddress,
            key: 'blocked',
          },
          compare: 'truthy',
        },
      }],
    };

    assert.equal(evaluateSparcCondition(condition, contextFromHistory()), true);
  });

  it('fails clearly when a model condition has no model query capability', function() {
    const condition: SparcCondition = {
      type: 'model',
      query: {
        target: modelTarget,
        metric: 'priorCorrect',
      },
      compare: 'gte',
      value: 1,
    };

    assert.throws(
      () => evaluateSparcCondition(condition, {
        replayState: contextFromHistory().replayState,
      }),
      /requires model query capability/,
    );
  });

  it('fails clearly when numeric comparisons receive non-numeric values', function() {
    const condition: SparcCondition = {
      type: 'state',
      query: {
        target: sourceAddress,
        key: 'feedbackVisible',
      },
      compare: 'gt',
      value: 0,
    };

    assert.throws(
      () => evaluateSparcCondition(condition, contextFromHistory()),
      /requires finite numeric values/,
    );
  });
});
