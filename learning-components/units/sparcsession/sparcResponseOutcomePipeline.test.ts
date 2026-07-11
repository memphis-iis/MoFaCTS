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
  SparcModelTargetIdentity,
  SparcRuleExpression,
} from './sparcSessionContracts';

const core = {
  TDFId: 'tdf-1',
  sessionID: 'session-1',
  levelUnit: 2,
  userId: 'user-1',
};

const sourceAddress = {
  pageKey: 'doc-1',
  nodeId: 'region-1',
};

const feedbackAddress = {
  pageKey: 'doc-1',
  nodeId: 'feedback',
};

const modelTarget: SparcModelTargetIdentity = {
  sparcPageKey: 'doc-1',
  sparcNodeId: 'region-1',
  stimuliSetId: 'stim-set-1',
  stimulusKC: 'kc-1',
  clusterKC: 'cluster-1',
  KCId: 'kc-1',
  KCDefault: 'kc-1',
  KCCluster: 'cluster-1',
};

const literal = (value: unknown): SparcRuleExpression => ({ type: 'literal', value });
const variable = (name: string): SparcRuleExpression => ({ type: 'variable', name });

function baseDocument(productionRules: NonNullable<SparcAuthoredDocument['productionRules']>): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 1,
    initialState: [{
      target: feedbackAddress,
      key: 'visible',
      value: false,
    }],
    productionRules,
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'region-1',
        kind: 'panel',
      }, {
        id: 'feedback',
        kind: 'feedback',
      }],
    },
  };
}

function responseStateRule(): NonNullable<SparcAuthoredDocument['productionRules']>[number] {
  return {
    id: 'show-feedback',
    when: [{
      factType: 'interface-state',
      slots: {
        pageKey: { type: 'literal', value: 'doc-1' },
        node: { type: 'literal', value: 'region-1' },
        key: { type: 'literal', value: 'lastOutcome' },
        value: { type: 'literal', value: 'correct' },
      },
    }],
    then: [{
      type: 'write-state',
      write: {
        target: feedbackAddress,
        key: 'visible',
        value: literal(true),
      },
    }],
  };
}

function modelStateRule(metric: 'priorCorrect' | 'probability', threshold: number) {
  return {
    id: `show-feedback-from-${metric}`,
    when: [{
      factType: 'model-state',
      slots: {
        pageKey: { type: 'literal' as const, value: 'doc-1' },
        node: { type: 'literal' as const, value: 'region-1' },
        metric: { type: 'literal' as const, value: metric },
        value: { type: 'bind' as const, variable: 'modelValue' },
      },
    }],
    tests: [{
      op: 'gte' as const,
      left: variable('modelValue'),
      right: literal(threshold),
    }],
    then: [{
      type: 'write-state' as const,
      write: {
        target: feedbackAddress,
        key: 'visible',
        value: literal(true),
      },
    }],
  };
}

function runtime(writtenRecords: unknown[], probability = 0.82): any {
  return {
    adaptiveModel: {
      applyModelPracticeUpdate(currentCore: typeof core, request: Parameters<typeof createCanonicalModelPracticeHistoryRecord>[1], extensionFields?: Record<string, unknown>) {
        return {
          record: createCanonicalModelPracticeHistoryRecord(currentCore, request, extensionFields),
        };
      },
      queryModelPracticeState(query: { metric: string }) {
        assert.equal(query.metric, 'probability');
        return probability;
      },
    },
    history: {
      async writeCanonicalHistory(record: unknown) {
        writtenRecords.push(record);
      },
    },
  };
}

describe('sparcResponseOutcomePipeline', function() {
  it('commits a SPARC-only response and then persists matching production-rule writes', async function() {
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
      document: baseDocument([responseStateRule()]),
      processed,
      replayState: createEmptySparcReplayState(),
      runtime: runtime(writtenRecords),
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, false);
    assert.deepEqual(result.productionCommit.execution.firings.map((firing) => firing.ruleId), ['show-feedback']);
    assert.equal(result.productionCommit.historyRecord?.action, 'sparc-production-rule');
    assert.equal(writtenRecords.length, 3);
    assert.equal(result.replayStateAfterResponse.cells[createSparcStateCellKey(sourceAddress, 'lastOutcome')]?.value, 'correct');
    assert.equal(result.finalReplayState.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, true);
  });

  it('converts history-backed model metrics into model-state facts before production evaluation', async function() {
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
      document: {
        ...baseDocument([modelStateRule('priorCorrect', 1)]),
        root: {
          id: 'root',
          kind: 'document',
          children: [{
            id: 'region-1',
            kind: 'panel',
            modelTarget,
          }, {
            id: 'feedback',
            kind: 'feedback',
          }],
        },
      },
      processed,
      replayState: createEmptySparcReplayState(),
      runtime: runtime(writtenRecords),
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, true);
    assert.deepEqual(result.productionCommit.execution.firings.map((firing) => firing.ruleId), ['show-feedback-from-priorCorrect']);
    assert.equal(result.finalReplayState.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, true);
    assert.equal(writtenRecords.length, 3);
  });

  it('uses the live adaptive model for probability model-state facts', async function() {
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
      document: {
        ...baseDocument([modelStateRule('probability', 0.8)]),
        root: {
          id: 'root',
          kind: 'document',
          children: [{
            id: 'region-1',
            kind: 'panel',
            modelTarget,
          }, {
            id: 'feedback',
            kind: 'feedback',
          }],
        },
      },
      processed,
      replayState: createEmptySparcReplayState(),
      runtime: runtime(writtenRecords, 0.82),
    });

    assert.deepEqual(result.productionCommit.execution.firings.map((firing) => firing.ruleId), ['show-feedback-from-probability']);
    assert.equal(result.finalReplayState.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, true);
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
      document: {
        ...baseDocument([modelStateRule('priorCorrect', 2)]),
        root: {
          id: 'root',
          kind: 'document',
          children: [{
            id: 'region-1',
            kind: 'panel',
            modelTarget,
          }, {
            id: 'feedback',
            kind: 'feedback',
          }],
        },
      },
      processed,
      priorHistoryRecords: [priorCardRecord],
      runtime: runtime(writtenRecords),
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, true);
    assert.deepEqual(result.productionCommit.execution.firings.map((firing) => firing.ruleId), ['show-feedback-from-priorCorrect']);
    assert.equal(result.replayStateAfterResponse.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, false);
    assert.equal(result.finalReplayState.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, true);
  });

  it('processes authored model targets before committing response and authored production rules', async function() {
    const writtenRecords: unknown[] = [];

    const result = await processAndCommitSparcAuthoredResponseOutcome({
      core,
      document: {
        ...baseDocument([modelStateRule('priorCorrect', 1)]),
        root: {
          id: 'root',
          kind: 'document',
          children: [{
            id: 'region-1',
            kind: 'panel',
            modelTarget,
          }, {
            id: 'feedback',
            kind: 'feedback',
          }],
        },
      },
      input: {
        observationId: 'obs-4',
        sourceAddress,
        time: 3000,
        problemStartTime: 2500,
        outcome: 'correct',
        responseValue: 'Answer',
      },
      priorHistoryRecords: [],
      runtime: runtime(writtenRecords),
    });

    assert.equal(result.responseCommit.usedAdaptiveModel, true);
    assert.equal(result.responseCommit.historyRecord.levelUnitType, 'model');
    assert.equal(result.responseCommit.historyRecord.KCId, 'kc-1');
    assert.deepEqual(result.productionCommit.execution.firings.map((firing) => firing.ruleId), ['show-feedback-from-priorCorrect']);
    assert.equal(result.finalReplayState.cells[createSparcStateCellKey(feedbackAddress, 'visible')]?.value, true);
  });
});
