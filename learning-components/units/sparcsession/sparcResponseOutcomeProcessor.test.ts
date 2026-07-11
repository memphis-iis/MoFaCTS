import assert from 'node:assert/strict';
import { assertCanonicalHistoryEnvelope } from '../../runtime/historyEnvelope';
import {
  createHistoryBackedModelPracticeStateProvider,
} from '../../runtime/modelPracticeStateQueries';
import {
  createSparcStateCellKey,
  replaySparcHistory,
} from './sparcStateReplay';
import { processSparcResponseOutcome } from './sparcResponseOutcomeProcessor';

describe('sparcResponseOutcomeProcessor', function() {
  it('records model-linked response outcomes as canonical model history plus replayable SPARC state', function() {
    const sourceAddress = {
      pageKey: 'doc-1',
      nodeId: 'widget-3-input',
    };
    const modelTarget = {
      sparcPageKey: 'doc-1',
      sparcNodeId: 'widget-3-input',
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

    const processed = processSparcResponseOutcome({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      levelUnitName: 'SPARC Unit',
      userId: 'user-1',
    }, {
      observationId: 'obs-1',
      sourceAddress,
      modelTarget,
      time: 3000,
      problemStartTime: 2000,
      practiceDurationMs: 500,
      outcome: 'correct',
      responseValue: 'Answer',
      input: 'Answer',
      displayedStimulus: 'Prompt',
      traceStep: {
        traceId: 'trace-1',
        productionRuleId: 'rule-1',
        actionId: 'region-7::UpdateTextField::Answer',
      },
    });

    assert.equal(processed.historyRecord.levelUnitType, 'model');
    assert.equal(processed.historyRecord.action, 'sparc-response-outcome');
    assert.equal(processed.historyRecord.KCId, 'kc-1');
    assert.deepEqual(processed.historyRecord.sparc.practiceObservation, processed.observation);
    assert.deepEqual(processed.historyRecord.sparc.stateTransition, processed.stateTransition);
    assert.deepEqual(processed.historyRecord.sparc.traceStep, processed.traceStep);
    assert.deepEqual(processed.modelUpdateRequest, {
      observationId: 'obs-1',
      target: modelTarget,
      outcome: 'correct',
      practiceDurationMs: 500,
      responseValue: 'Answer',
      input: 'Answer',
      displayedStimulus: 'Prompt',
      time: 3000,
      problemStartTime: 2000,
      selection: 'doc-1:widget-3-input',
      action: 'sparc-response-outcome',
      typeOfResponse: 'sparc',
      eventType: 'sparc',
      sourceAddress,
    });
    assert.doesNotThrow(() => assertCanonicalHistoryEnvelope(processed.historyRecord));

    const replayed = replaySparcHistory([processed.historyRecord]);
    const outcomeCellKey = createSparcStateCellKey(sourceAddress, 'lastOutcome');
    const responseCellKey = createSparcStateCellKey(sourceAddress, 'lastResponseValue');

    assert.equal(replayed.cells[outcomeCellKey]?.value, 'correct');
    assert.equal(replayed.cells[responseCellKey]?.value, 'Answer');
    assert.deepEqual(replayed.observations, [processed.observation]);
    assert.deepEqual(replayed.traceSteps, [processed.traceStep]);

    const modelState = createHistoryBackedModelPracticeStateProvider([processed.historyRecord]);
    assert.equal(modelState.queryModelPracticeState({
      target: modelTarget,
      metric: 'priorCorrect',
    }), 1);
  });

  it('records non-model reactive outcomes without card/model identity fields', function() {
    const sourceAddress = {
      pageKey: 'doc-1',
      nodeId: 'hint-toggle',
    };
    const processed = processSparcResponseOutcome({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 2,
      anonStudentId: 'anon-1',
    }, {
      observationId: 'obs-2',
      sourceAddress,
      time: 4000,
      problemStartTime: 3500,
      outcome: 'unknown',
      responseValue: true,
      stateWrites: [{
        target: sourceAddress,
        key: 'expanded',
        value: true,
      }],
    });

    assert.equal(processed.historyRecord.levelUnitType, 'sparc');
    assert.equal(processed.historyRecord.KCId, undefined);
    assert.equal(processed.modelUpdateRequest, undefined);
    assert.doesNotThrow(() => assertCanonicalHistoryEnvelope(processed.historyRecord));

    const replayed = replaySparcHistory([processed.historyRecord]);
    const cellKey = createSparcStateCellKey(sourceAddress, 'expanded');

    assert.equal(replayed.cells[cellKey]?.value, true);
    assert.equal(replayed.traceSteps.length, 0);
  });

  it('requires stable observation identity before writing history', function() {
    assert.throws(
      () => processSparcResponseOutcome({
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      }, {
        observationId: '',
        sourceAddress: {
          pageKey: 'doc-1',
          nodeId: 'node-1',
        },
        time: 1000,
        problemStartTime: 1000,
        outcome: 'unknown',
        responseValue: null,
      }),
      /observationId is required/,
    );
  });

  it('rejects model targets from another SPARC document before creating history', function() {
    assert.throws(
      () => processSparcResponseOutcome({
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      }, {
        observationId: 'obs-cross-doc-model',
        sourceAddress: {
          pageKey: 'doc-1',
          nodeId: 'node-1',
        },
        modelTarget: {
          sparcPageKey: 'doc-2',
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
      /modelTarget\.sparcPageKey "doc-2" does not match sourceAddress document "doc-1"/,
    );
  });

  it('rejects response outcome writes into another SPARC document before creating history', function() {
    assert.throws(
      () => processSparcResponseOutcome({
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      }, {
        observationId: 'obs-cross-doc-write',
        sourceAddress: {
          pageKey: 'doc-1',
          nodeId: 'node-1',
        },
        time: 1000,
        problemStartTime: 1000,
        outcome: 'unknown',
        responseValue: null,
        stateWrites: [{
          target: {
            pageKey: 'doc-2',
            nodeId: 'node-1',
          },
          key: 'visible',
          value: true,
        }],
      }),
      /stateWrites\[0\] target pageKey "doc-2" does not match source document "doc-1"/,
    );
  });
});
