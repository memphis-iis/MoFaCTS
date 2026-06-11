import assert from 'node:assert/strict';
import { assertCanonicalHistoryEnvelope } from '../../runtime/historyEnvelope';
import { createSparcPracticeHistoryBridge } from './sparcPracticeHistoryBridge';
import type { SparcPracticeObservation } from './sparcSessionContracts';

describe('sparcPracticeHistoryBridge', function() {
  it('writes model-linked SPARC practice through the canonical model history shape', function() {
    const bridge = createSparcPracticeHistoryBridge({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      levelUnitName: 'SPARC Unit',
      userId: 'user-1',
    });
    const observation: SparcPracticeObservation = {
      observationId: 'obs-1',
      sourceAddress: {
        documentId: 'doc-1',
        nodeId: 'region-1',
        path: ['region-7', 'widget-3', 'input'],
      },
      modelTarget: {
        sparcDocumentId: 'doc-1',
        sparcNodeId: 'region-1',
        sparcPath: ['region-7', 'widget-3', 'input'],
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
      time: 2000,
      problemStartTime: 1000,
      practiceDurationMs: 500,
      outcome: 'correct',
      responseValue: 'Answer',
      input: 'Answer',
      displayedStimulus: 'Prompt',
    };

    const record = bridge.toCanonicalHistoryRecord(observation);

    assert.equal(record.eventType, 'sparc');
    assert.equal(record.levelUnitType, 'model');
    assert.equal(record.outcome, 'correct');
    assert.equal(record.responseValue, 'Answer');
    assert.equal(record.stimuliSetId, 'stim-set-1');
    assert.equal(record.stimulusKC, 'kc-1');
    assert.equal(record.clusterKC, 'cluster-1');
    assert.equal(record.KCId, 'kc-1');
    assert.equal(record.KCDefault, 'kc-1');
    assert.equal(record.KCCluster, 'cluster-1');
    assert.equal(record.responseKC, 'response-kc-1');
    assert.equal(record.responseKey, 'answer');
    assert.deepEqual(record.sparc.practiceObservation, observation);
    assert.doesNotThrow(() => assertCanonicalHistoryEnvelope(record));
    assert.deepEqual(bridge.fromCanonicalHistoryRecord(record), observation);
  });

  it('writes non-model SPARC observations without pretending they are card practice', function() {
    const bridge = createSparcPracticeHistoryBridge({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      anonStudentId: 'anon-1',
    });
    const observation: SparcPracticeObservation = {
      observationId: 'obs-2',
      sourceAddress: {
        documentId: 'doc-1',
        nodeId: 'toggle-1',
      },
      time: 3000,
      problemStartTime: 2500,
      outcome: 'unknown',
      responseValue: true,
    };

    const record = bridge.toCanonicalHistoryRecord(observation);

    assert.equal(record.eventType, 'sparc');
    assert.equal(record.levelUnitType, 'sparc');
    assert.equal(record.KCId, undefined);
    assert.doesNotThrow(() => assertCanonicalHistoryEnvelope(record));
    assert.deepEqual(bridge.fromCanonicalHistoryRecord(record), observation);
  });

  it('ignores non-SPARC canonical records during readback', function() {
    const bridge = createSparcPracticeHistoryBridge({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      userId: 'user-1',
    });

    assert.equal(bridge.fromCanonicalHistoryRecord({ eventType: 'h5p' }), null);
  });

  it('requires a shared user identity for persisted history records', function() {
    assert.throws(
      () => createSparcPracticeHistoryBridge({
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
      }),
      /SPARC history bridge requires userId or anonStudentId/,
    );
  });

  it('refuses to write model-linked SPARC observations whose model target names another document', function() {
    const bridge = createSparcPracticeHistoryBridge({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      userId: 'user-1',
    });

    assert.throws(
      () => bridge.toCanonicalHistoryRecord({
        observationId: 'obs-cross-doc',
        sourceAddress: {
          documentId: 'doc-1',
          nodeId: 'node-1',
        },
        modelTarget: {
          sparcDocumentId: 'doc-2',
          sparcNodeId: 'node-1',
          stimuliSetId: 'stim-set-1',
          stimulusKC: 'kc-1',
          clusterKC: 'cluster-1',
          KCId: 'kc-1',
          KCDefault: 'kc-1',
          KCCluster: 'cluster-1',
        },
        time: 1000,
        problemStartTime: 1000,
        outcome: 'correct',
        responseValue: 'Answer',
      }),
      /modelTarget\.sparcDocumentId "doc-2" does not match sourceAddress document "doc-1"/,
    );
  });

  it('refuses to read SPARC observations whose model target names another document', function() {
    const bridge = createSparcPracticeHistoryBridge({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      userId: 'user-1',
    });
    const record = bridge.toCanonicalHistoryRecord({
      observationId: 'obs-1',
      sourceAddress: {
        documentId: 'doc-1',
        nodeId: 'node-1',
      },
      time: 1000,
      problemStartTime: 1000,
      outcome: 'unknown',
      responseValue: null,
    });

    assert.throws(
      () => bridge.fromCanonicalHistoryRecord({
        ...record,
        sparc: {
          ...record.sparc,
          practiceObservation: {
            ...record.sparc.practiceObservation,
            modelTarget: {
              sparcDocumentId: 'doc-2',
              sparcNodeId: 'node-1',
              stimuliSetId: 'stim-set-1',
              stimulusKC: 'kc-1',
              clusterKC: 'cluster-1',
              KCId: 'kc-1',
              KCDefault: 'kc-1',
              KCCluster: 'cluster-1',
            },
          },
        },
      }),
      /modelTarget\.sparcDocumentId "doc-2" does not match sourceAddress document "doc-1"/,
    );
  });
});
