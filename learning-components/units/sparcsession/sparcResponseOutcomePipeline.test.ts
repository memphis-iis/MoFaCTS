import assert from 'node:assert/strict';
import { createCanonicalModelPracticeHistoryRecord } from '../../runtime/modelPracticeUpdates';
import { createEmptySparcReplayState, createSparcStateCellKey } from './sparcStateReplay';
import {
  commitSparcResponseOutcomeFromDocumentHistory,
  commitSparcResponseOutcomeWithAuthoredRules,
  processAndCommitSparcAuthoredResponseOutcome,
} from './sparcResponseOutcomePipeline';
import { processSparcResponseOutcome } from './sparcResponseOutcomeProcessor';
import type {
  SparcAuthoredDocument,
  SparcCondition,
  SparcModelTargetIdentity,
} from './sparcSessionContracts';

const core = {
  TDFId: 'tdf-1',
  sessionID: 'session-1',
  levelUnit: 2,
  userId: 'user-1',
};

const sourceAddress = {
  documentId: 'doc-1',
  nodeId: 'region-1',
};

const feedbackAddress = {
  documentId: 'doc-1',
  nodeId: 'widget-3-feedback',
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

function documentWithRule(ruleWhen: SparcCondition): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 1,
    reactiveRules: [{
      id: 'show-feedback',
      when: ruleWhen,
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
        kind: 'panel',
      }, {
        id: 'region-7',
        kind: 'panel',
        children: [{
          id: 'widget-3',
          kind: 'widget',
          children: [{
            id: 'widget-3-feedback',
            kind: 'feedback',
          }],
        }],
      }],
    },
  };
}

function documentWithInitialStateAndRule(ruleWhen: SparcCondition): SparcAuthoredDocument {
  return {
    ...documentWithRule(ruleWhen),
    initialState: [{
      target: feedbackAddress,
      key: 'visible',
      value: false,
    }],
  };
}

function documentWithAuthoredModelTargetAndRule(ruleWhen: SparcCondition): SparcAuthoredDocument {
  const document = documentWithInitialStateAndRule(ruleWhen);
  const [region1, region7] = document.root.children ?? [];
  return {
    ...document,
    root: {
      ...document.root,
      children: [{
        ...region1!,
        modelTarget,
      }, region7!],
    },
  };
}

describe('sparcResponseOutcomePipeline', function() {
  it('commits a SPARC-only response and then persists matching authored rule writes', async function() {
    const writtenRecords: unknown[] = [];
    const processed = processSparcResponseOutcome(core, {
      observationId: 'obs-1',
      sourceAddress,
      time: 2000,
      problemStartTime: 1500,
      outcome: 'correct',
      responseValue: 'Answer',
    });

    const result = await commitSparcResponseOutcomeWithAuthoredRules({
      core,
      document: documentWithRule({
        type: 'state',
        query: {
          target: sourceAddress,
          key: 'lastOutcome',
        },
        compare: 'eq',
        value: 'correct',
      }),
      processed,
      replayState: createEmptySparcReplayState(),
      runtime: {
        adaptiveModel: {
          applyModelPracticeUpdate() {
            throw new Error('adaptive model should not run for SPARC-only outcome');
          },
          queryModelPracticeState() {
            throw new Error('model query not used');
          },
        },
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, false);
    assert.deepEqual(result.reactiveCommit.evaluation.matchedRuleIds, ['show-feedback']);
    assert.equal(writtenRecords.length, 2);
    assert.equal(result.reactiveCommit.historyRecord?.action, 'sparc-reactive-rule');
    assert.equal(result.replayStateAfterResponse.cells[createSparcStateCellKey(sourceAddress, 'lastOutcome')]?.value, 'correct');
    assert.equal(result.finalReplayState.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, true);
  });

  it('commits a model-linked response before evaluating model-conditioned authored rules', async function() {
    const writtenRecords: unknown[] = [];
    const processed = processSparcResponseOutcome(core, {
      observationId: 'obs-2',
      sourceAddress,
      modelTarget,
      time: 2500,
      problemStartTime: 2000,
      outcome: 'correct',
      responseValue: 'Answer',
    });

    const result = await commitSparcResponseOutcomeWithAuthoredRules({
      core,
      document: documentWithRule({
        type: 'model',
        query: {
          target: modelTarget,
          metric: 'priorCorrect',
        },
        compare: 'gte',
        value: 1,
      }),
      processed,
      replayState: createEmptySparcReplayState(),
      runtime: {
        adaptiveModel: {
          applyModelPracticeUpdate(currentCore, request, extensionFields) {
            return {
              record: createCanonicalModelPracticeHistoryRecord(currentCore, request, extensionFields),
            };
          },
          queryModelPracticeState() {
            throw new Error('history-backed model condition should be used');
          },
        },
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, true);
    assert.deepEqual(result.reactiveCommit.evaluation.matchedRuleIds, ['show-feedback']);
    assert.equal(writtenRecords.length, 2);
    assert.equal(result.responseCommit.historyRecord.levelUnitType, 'model');
    assert.equal(result.reactiveCommit.historyRecord?.levelUnitType, 'sparc');
    assert.equal(result.finalReplayState.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, true);
  });

  it('evaluates authored probability conditions against the live adaptive model after a response update', async function() {
    const writtenRecords: unknown[] = [];
    const processed = processSparcResponseOutcome(core, {
      observationId: 'obs-probability',
      sourceAddress,
      modelTarget,
      time: 2600,
      problemStartTime: 2000,
      outcome: 'correct',
      responseValue: 'Answer',
    });

    const result = await commitSparcResponseOutcomeWithAuthoredRules({
      core,
      document: documentWithRule({
        type: 'model',
        query: {
          target: modelTarget,
          metric: 'probability',
        },
        compare: 'gte',
        value: 0.8,
      }),
      processed,
      replayState: createEmptySparcReplayState(),
      runtime: {
        adaptiveModel: {
          applyModelPracticeUpdate(currentCore, request, extensionFields) {
            return {
              record: createCanonicalModelPracticeHistoryRecord(currentCore, request, extensionFields),
            };
          },
          queryModelPracticeState(query) {
            assert.equal(query.metric, 'probability');
            assert.deepEqual(query.target, modelTarget);
            return 0.82;
          },
        },
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, true);
    assert.deepEqual(result.reactiveCommit.evaluation.matchedRuleIds, ['show-feedback']);
    assert.equal(result.finalReplayState.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, true);
    assert.equal(writtenRecords.length, 2);
  });

  it('derives replay state from authored document plus prior canonical history before committing response rules', async function() {
    const writtenRecords: unknown[] = [];
    const priorCardRecord = createCanonicalModelPracticeHistoryRecord(core, {
      observationId: 'card-obs-1',
      target: modelTarget,
      time: 1900,
      problemStartTime: 1500,
      outcome: 'correct',
      responseValue: 'prior card answer',
      selection: 'card:kcid:kc-1',
      action: 'card-response',
      typeOfResponse: 'card',
    });
    const processed = processSparcResponseOutcome(core, {
      observationId: 'obs-3',
      sourceAddress,
      modelTarget,
      time: 2500,
      problemStartTime: 2000,
      outcome: 'correct',
      responseValue: 'Answer',
    });

    const result = await commitSparcResponseOutcomeFromDocumentHistory({
      core,
      document: documentWithInitialStateAndRule({
        type: 'model',
        query: {
          target: modelTarget,
          metric: 'priorCorrect',
        },
        compare: 'gte',
        value: 2,
      }),
      processed,
      priorHistoryRecords: [priorCardRecord],
      runtime: {
        adaptiveModel: {
          applyModelPracticeUpdate(currentCore, request, extensionFields) {
            return {
              record: createCanonicalModelPracticeHistoryRecord(currentCore, request, extensionFields),
            };
          },
          queryModelPracticeState() {
            throw new Error('history-backed model condition should be used');
          },
        },
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, true);
    assert.deepEqual(result.reactiveCommit.evaluation.matchedRuleIds, ['show-feedback']);
    assert.equal(result.replayStateAfterResponse.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, false);
    assert.equal(result.finalReplayState.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, true);
    assert.equal(writtenRecords.length, 2);
  });

  it('processes authored model targets before committing response and authored rules', async function() {
    const writtenRecords: unknown[] = [];

    const result = await processAndCommitSparcAuthoredResponseOutcome({
      core,
      document: documentWithAuthoredModelTargetAndRule({
        type: 'model',
        query: {
          target: modelTarget,
          metric: 'priorCorrect',
        },
        compare: 'gte',
        value: 1,
      }),
      input: {
        observationId: 'obs-4',
        sourceAddress,
        time: 3000,
        problemStartTime: 2500,
        outcome: 'correct',
        responseValue: 'Answer',
      },
      priorHistoryRecords: [],
      runtime: {
        adaptiveModel: {
          applyModelPracticeUpdate(currentCore, request, extensionFields) {
            assert.deepEqual(request.target, modelTarget);
            return {
              record: createCanonicalModelPracticeHistoryRecord(currentCore, request, extensionFields),
            };
          },
          queryModelPracticeState() {
            throw new Error('history-backed model condition should be used');
          },
        },
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, true);
    assert.equal(result.responseCommit.historyRecord.levelUnitType, 'model');
    assert.equal(result.responseCommit.historyRecord.KCId, 'kc-1');
    assert.deepEqual(result.reactiveCommit.evaluation.matchedRuleIds, ['show-feedback']);
    assert.equal(result.finalReplayState.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, true);
    assert.equal(writtenRecords.length, 2);
  });
});
