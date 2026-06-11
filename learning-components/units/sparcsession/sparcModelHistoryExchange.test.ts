import assert from 'node:assert/strict';
import { withCanonicalHistorySchemaVersion } from '../../runtime/historyEnvelope';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import { processSparcResponseOutcome } from './sparcResponseOutcomeProcessor';
import {
  readSparcReadableModelPracticeEvent,
  readSparcReadableModelPracticeEvents,
  sparcModelTargetMatchesSharedIdentity,
} from './sparcModelHistoryExchange';
import type { SparcModelTargetIdentity } from './sparcSessionContracts';

const modelTarget: SparcModelTargetIdentity = {
  sparcDocumentId: 'doc-1',
  sparcNodeId: 'region-1',
  sparcPath: ['input'],
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

function cardModelRecord(overrides: Record<string, unknown> = {}): CanonicalHistoryRecord {
  return withCanonicalHistorySchemaVersion({
    TDFId: 'tdf-1',
    sessionID: 'session-1',
    userId: 'user-1',
    levelUnit: 1,
    levelUnitName: 'Card Unit',
    levelUnitType: 'model',
    time: 2000,
    problemStartTime: 1000,
    practiceDurationMs: 300,
    selection: 'card-selection',
    action: 'card-response',
    outcome: 'correct',
    typeOfResponse: 'text',
    responseValue: 'Answer',
    input: 'Answer',
    displayedStimulus: 'Prompt',
    eventType: '',
    stimuliSetId: modelTarget.stimuliSetId,
    stimulusKC: modelTarget.stimulusKC,
    clusterKC: modelTarget.clusterKC,
    KCId: modelTarget.KCId,
    KCDefault: modelTarget.KCDefault,
    KCCluster: modelTarget.KCCluster,
    responseKC: modelTarget.response?.responseKC,
    responseKey: modelTarget.response?.responseKey,
    ...overrides,
  });
}

describe('sparcModelHistoryExchange', function() {
  it('reads plain card model practice as a SPARC-readable shared model event', function() {
    const event = readSparcReadableModelPracticeEvent(cardModelRecord());

    assert.ok(event);
    assert.deepEqual(event.identity, {
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
    });
    assert.equal(event.time, 2000);
    assert.equal(event.outcome, 'correct');
    assert.equal(event.practiceDurationMs, 300);
    assert.equal(event.sparcObservation, undefined);
  });

  it('preserves SPARC observations on model-linked SPARC practice records', function() {
    const processed = processSparcResponseOutcome({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      userId: 'user-1',
    }, {
      observationId: 'obs-1',
      sourceAddress: {
        documentId: 'doc-1',
        nodeId: 'region-1',
        path: ['input'],
      },
      modelTarget,
      time: 3000,
      problemStartTime: 2000,
      practiceDurationMs: 500,
      outcome: 'incorrect',
      responseValue: 'Wrong',
    });

    const event = readSparcReadableModelPracticeEvent(processed.historyRecord);

    assert.ok(event);
    assert.equal(event.outcome, 'incorrect');
    assert.equal(event.practiceDurationMs, 500);
    assert.deepEqual(event.sparcObservation, processed.observation);
    assert.equal(sparcModelTargetMatchesSharedIdentity(modelTarget, event.identity), true);
  });

  it('filters non-model history records out of SPARC-readable shared model events', function() {
    const events = readSparcReadableModelPracticeEvents([
      { eventType: 'sparc', levelUnitType: 'sparc' },
      cardModelRecord(),
    ]);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.responseValue, 'Answer');
  });

  it('fails clearly when a model record is missing shared identity fields', function() {
    assert.throws(
      () => readSparcReadableModelPracticeEvent(cardModelRecord({
        KCId: undefined,
      })),
      /Model practice history record missing KCId/,
    );
  });
});
