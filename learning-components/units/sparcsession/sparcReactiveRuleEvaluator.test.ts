import assert from 'node:assert/strict';
import { createHistoryBackedModelPracticeStateProvider } from '../../runtime/modelPracticeStateQueries';
import {
  evaluateSparcAuthoredReactiveRules,
  evaluateSparcReactiveRules,
} from './sparcReactiveRuleEvaluator';
import { processSparcResponseOutcome } from './sparcResponseOutcomeProcessor';
import { replaySparcHistory } from './sparcStateReplay';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import type {
  SparcAuthoredDocument,
  SparcModelTargetIdentity,
  SparcReactiveRule,
} from './sparcSessionContracts';

const sourceAddress = {
  documentId: 'doc-1',
  nodeId: 'region-1',
};

const feedbackAddress = {
  documentId: 'doc-1',
  nodeId: 'region-7',
  path: ['widget-3', 'feedback'],
};

const document: SparcAuthoredDocument = {
  id: 'doc-1',
  schemaVersion: 1,
  reactiveRules: [{
    id: 'authored-show-region-7-feedback',
    when: {
      type: 'state',
      query: {
        target: sourceAddress,
        key: 'submitted',
      },
      compare: 'truthy',
    },
    writes: [{
      target: feedbackAddress,
      key: 'visible',
      value: true,
    }],
  }],
  root: {
    id: 'root',
    kind: 'document',
    children: [{
      id: 'region-1',
      kind: 'region',
      refs: [{
        relation: 'controls',
        target: {
          documentId: 'doc-1',
          nodeId: 'region-7',
          path: ['widget-3', 'feedback'],
        },
      }],
    }, {
      id: 'region-7',
      kind: 'region',
      children: [{
        id: 'widget-3',
        kind: 'widget',
        children: [{
          id: 'feedback',
          kind: 'feedback',
        }],
      }],
    }],
  },
};

const modelTarget: SparcModelTargetIdentity = {
  sparcDocumentId: 'doc-1',
  sparcNodeId: 'region-1',
  stimuliSetId: 'stim-set-1',
  stimulusKC: 'kc-1',
  clusterKC: 'cluster-1',
  KCId: 'kc-1',
  KCDefault: 'kc-1',
  KCCluster: 'cluster-1',
};

function createContext() {
  const processed = processSparcResponseOutcome({
    TDFId: 'tdf-1',
    sessionID: 'session-1',
    levelUnit: 2,
    userId: 'user-1',
  }, {
    observationId: 'obs-1',
    sourceAddress,
    modelTarget,
    time: 2000,
    problemStartTime: 1500,
    outcome: 'correct',
    responseValue: 'Answer',
    stateWrites: [{
      target: sourceAddress,
      key: 'submitted',
      value: true,
    }],
  });
  const replayState = replaySparcHistory([processed.historyRecord]);
  return {
    replayState,
    modelQueries: createHistoryBackedModelPracticeStateProvider([processed.historyRecord]),
  };
}

describe('sparcReactiveRuleEvaluator', function() {
  it('evaluates reactive rules authored on the document by default', function() {
    const result = evaluateSparcAuthoredReactiveRules({
      document,
      event: {
        eventId: 'event-0',
        type: 'condition-evaluated',
        source: sourceAddress,
        time: 2050,
      },
      context: createContext(),
    });

    assert.deepEqual(result.matchedRuleIds, ['authored-show-region-7-feedback']);
    assert.equal(result.transition?.writes[0]?.key, 'visible');
  });

  it('writes from one region event into a nested target inside another region', function() {
    const rules: SparcReactiveRule[] = [{
      id: 'show-region-7-feedback',
      when: {
        type: 'state',
        query: {
          target: sourceAddress,
          key: 'submitted',
        },
        compare: 'truthy',
      },
      writes: [{
        target: feedbackAddress,
        key: 'visible',
        value: true,
      }],
    }];

    const result = evaluateSparcReactiveRules({
      document,
      event: {
        eventId: 'event-1',
        type: 'condition-evaluated',
        source: sourceAddress,
        time: 2100,
      },
      rules,
      context: createContext(),
    });

    assert.deepEqual(result.matchedRuleIds, ['show-region-7-feedback']);
    assert.equal(result.transition?.writes[0]?.target.nodeId, 'region-7');
    assert.deepEqual(result.transition?.writes[0]?.target.path, ['widget-3', 'feedback']);
    assert.ok(result.transition);
    const replayed = replaySparcHistory([
      createSparcStateTransitionHistoryRecord({
        core: {
          TDFId: 'tdf-1',
          sessionID: 'session-1',
          levelUnit: 2,
          userId: 'user-1',
        },
        transition: result.transition,
        action: 'sparc-reactive-rule',
      }),
    ], createContext().replayState);
    const cellKey = JSON.stringify(['doc-1', 'region-7', ['widget-3', 'feedback'], 'visible']);
    assert.equal(replayed.cells[cellKey]?.value, true);
  });

  it('uses model conditions when deciding whether a reactive rule writes state', function() {
    const result = evaluateSparcReactiveRules({
      document,
      event: {
        eventId: 'event-2',
        type: 'model-updated',
        source: sourceAddress,
        time: 2200,
      },
      rules: [{
        id: 'unlock-after-correct',
        when: {
          type: 'model',
          query: {
            target: modelTarget,
            metric: 'priorCorrect',
          },
          compare: 'gte',
          value: 1,
        },
        writes: [{
          target: feedbackAddress,
          key: 'locked',
          value: false,
        }],
      }],
      context: createContext(),
    });

    assert.deepEqual(result.matchedRuleIds, ['unlock-after-correct']);
    assert.equal(result.transition?.writes[0]?.value, false);
  });

  it('fails clearly when a rule targets a missing nested address', function() {
    assert.throws(
      () => evaluateSparcReactiveRules({
        document,
        event: {
          eventId: 'event-3',
          type: 'condition-evaluated',
          source: sourceAddress,
          time: 2300,
        },
        rules: [{
          id: 'bad-target',
          writes: [{
            target: {
              documentId: 'doc-1',
              nodeId: 'region-7',
              path: ['missing'],
            },
            key: 'visible',
            value: true,
          }],
        }],
        context: createContext(),
      }),
      /SPARC address path segment "missing" not found under node "region-7"/,
    );
  });
});
