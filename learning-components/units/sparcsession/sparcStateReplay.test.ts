import assert from 'node:assert/strict';
import { withCanonicalHistorySchemaVersion } from '../../runtime/historyEnvelope';
import { createSparcPracticeHistoryBridge } from './sparcPracticeHistoryBridge';
import {
  createEmptySparcReplayState,
  createSparcStateCellKey,
  replaySparcHistory,
} from './sparcStateReplay';
import type {
  SparcCanonicalHistoryRecord,
  SparcPracticeObservation,
  SparcStateTransition,
  SparcTraceStep,
} from './sparcSessionContracts';

function makeBaseSparcRecord(
  sparc: SparcCanonicalHistoryRecord['sparc'],
): SparcCanonicalHistoryRecord {
  return withCanonicalHistorySchemaVersion({
    TDFId: 'tdf-1',
    sessionID: 'session-1',
    userId: 'user-1',
    levelUnit: 1,
    levelUnitName: 'SPARC Unit',
    levelUnitType: 'sparc',
    time: 2000,
    problemStartTime: 1000,
    selection: 'doc-1:region-1',
    action: 'sparc-state-transition',
    outcome: 'unknown',
    typeOfResponse: 'sparc',
    responseValue: '',
    input: '',
    displayedStimulus: '',
    eventType: 'sparc',
    sparc,
  }) as SparcCanonicalHistoryRecord;
}

describe('sparcStateReplay', function() {
  it('recreates document state from ordered SPARC state-transition history', function() {
    const firstTransition: SparcStateTransition = {
      transitionId: 'transition-1',
      event: {
        eventId: 'event-1',
        type: 'value-changed',
        source: {
          documentId: 'doc-1',
          nodeId: 'region-1',
        },
        time: 2000,
      },
      writes: [
        {
          target: {
            documentId: 'doc-1',
            nodeId: 'widget-3-input',
          },
          key: 'value',
          value: 'draft answer',
        },
      ],
    };
    const secondTransition: SparcStateTransition = {
      transitionId: 'transition-2',
      event: {
        eventId: 'event-2',
        type: 'outcome-recorded',
        source: {
          documentId: 'doc-1',
          nodeId: 'widget-3',
        },
        time: 2500,
      },
      writes: [
        {
          target: {
            documentId: 'doc-1',
            nodeId: 'widget-3-input',
          },
          key: 'value',
          value: 'final answer',
        },
        {
          target: {
            documentId: 'doc-1',
            nodeId: 'widget-3-feedback',
          },
          key: 'visible',
          value: true,
        },
      ],
    };

    const state = replaySparcHistory([
      makeBaseSparcRecord({
        documentId: 'doc-1',
        sourceAddress: firstTransition.event.source,
        stateTransition: firstTransition,
      }),
      makeBaseSparcRecord({
        documentId: 'doc-1',
        sourceAddress: secondTransition.event.source,
        stateTransition: secondTransition,
      }),
    ]);
    const valueCellKey = createSparcStateCellKey(
      {
        documentId: 'doc-1',
        nodeId: 'widget-3-input',
      },
      'value',
    );
    const feedbackCellKey = createSparcStateCellKey(
      {
        documentId: 'doc-1',
        nodeId: 'widget-3-feedback',
      },
      'visible',
    );

    assert.equal(state.cells[valueCellKey]?.value, 'final answer');
    assert.equal(state.cells[valueCellKey]?.transitionId, 'transition-2');
    assert.equal(state.cells[feedbackCellKey]?.value, true);
    assert.deepEqual(state.transitions, [firstTransition, secondTransition]);
  });

  it('keeps batch-applied replay state equivalent to one-pass raw-history replay', function() {
    const firstTransition: SparcStateTransition = {
      transitionId: 'transition-1',
      event: {
        eventId: 'event-1',
        type: 'value-changed',
        source: {
          documentId: 'doc-1',
          nodeId: 'region-1',
        },
        time: 2000,
      },
      writes: [{
        target: {
          documentId: 'doc-1',
          nodeId: 'answer',
        },
        key: 'value',
        value: 'draft',
      }],
    };
    const secondTransition: SparcStateTransition = {
      transitionId: 'transition-2',
      event: {
        eventId: 'event-2',
        type: 'outcome-recorded',
        source: {
          documentId: 'doc-1',
          nodeId: 'region-1',
        },
        time: 2500,
      },
      writes: [
        {
          target: {
            documentId: 'doc-1',
            nodeId: 'answer',
          },
          key: 'value',
          value: 'final',
        },
        {
          target: {
            documentId: 'doc-1',
            nodeId: 'feedback',
          },
          key: 'visible',
          value: true,
        },
      ],
    };
    const firstRecord = makeBaseSparcRecord({
      documentId: 'doc-1',
      sourceAddress: firstTransition.event.source,
      stateTransition: firstTransition,
    });
    const secondRecord = makeBaseSparcRecord({
      documentId: 'doc-1',
      sourceAddress: secondTransition.event.source,
      stateTransition: secondTransition,
    });

    const onePassState = replaySparcHistory([firstRecord, secondRecord]);
    const batchAppliedState = replaySparcHistory(
      [secondRecord],
      replaySparcHistory([firstRecord]),
    );

    assert.deepEqual(batchAppliedState, onePassState);
  });

  it('collects practice observations and trace steps from canonical SPARC history', function() {
    const bridge = createSparcPracticeHistoryBridge({
      TDFId: 'tdf-1',
      sessionID: 'session-1',
      levelUnit: 1,
      userId: 'user-1',
    });
    const observation: SparcPracticeObservation = {
      observationId: 'obs-1',
      sourceAddress: {
        documentId: 'doc-1',
        nodeId: 'widget-1',
      },
      time: 3000,
      problemStartTime: 1000,
      outcome: 'correct',
      responseValue: '42',
    };
    const traceStep: SparcTraceStep = {
      traceId: 'trace-1',
      sourceAddress: observation.sourceAddress,
      productionRuleId: 'rule-1',
      actionId: 'widget-1::UpdateTextArea::42',
      outcome: 'correct',
      time: 3000,
    };

    const state = replaySparcHistory([
      bridge.toCanonicalHistoryRecord(observation),
      makeBaseSparcRecord({
        documentId: 'doc-1',
        sourceAddress: observation.sourceAddress,
        traceStep,
      }),
    ]);

    assert.deepEqual(state.observations, [observation]);
    assert.deepEqual(state.traceSteps, [traceStep]);
  });

  it('preserves caller-provided initial state and ignores non-SPARC records', function() {
    const initialState = createEmptySparcReplayState();
    const state = replaySparcHistory([{ eventType: 'h5p' }], initialState);

    assert.equal(state, initialState);
  });

  it('throws clearly when a SPARC event lacks the typed SPARC extension', function() {
    assert.throws(
      () => replaySparcHistory([{ eventType: 'sparc' }]),
      /SPARC history record missing sparc extension/,
    );
  });

  it('rejects SPARC history when extension and source documents disagree', function() {
    const transition: SparcStateTransition = {
      transitionId: 'transition-1',
      event: {
        eventId: 'event-1',
        type: 'value-changed',
        source: {
          documentId: 'doc-1',
          nodeId: 'region-1',
        },
        time: 2000,
      },
      writes: [{
        target: {
          documentId: 'doc-1',
          nodeId: 'region-1',
        },
        key: 'visible',
        value: true,
      }],
    };

    assert.throws(
      () => replaySparcHistory([
        makeBaseSparcRecord({
          documentId: 'doc-2',
          sourceAddress: transition.event.source,
          stateTransition: transition,
        }),
      ]),
      /sparc\.sourceAddress\.documentId "doc-1" does not match SPARC history document "doc-2"/,
    );
  });

  it('rejects SPARC state-transition writes that target another document', function() {
    assert.throws(
      () => replaySparcHistory([
        makeBaseSparcRecord({
          documentId: 'doc-1',
          sourceAddress: {
            documentId: 'doc-1',
            nodeId: 'region-1',
          },
          stateTransition: {
            transitionId: 'transition-1',
            event: {
              eventId: 'event-1',
              type: 'value-changed',
              source: {
                documentId: 'doc-1',
                nodeId: 'region-1',
              },
              time: 2000,
            },
            writes: [{
              target: {
                documentId: 'doc-2',
                nodeId: 'region-1',
              },
              key: 'visible',
              value: true,
            }],
          },
        }),
      ]),
      /sparc\.stateTransition\.writes\[0\]\.target\.documentId "doc-2" does not match SPARC history document "doc-1"/,
    );
  });

  it('rejects SPARC state transitions whose event source differs from the history source', function() {
    assert.throws(
      () => replaySparcHistory([
        makeBaseSparcRecord({
          documentId: 'doc-1',
          sourceAddress: {
            documentId: 'doc-1',
            nodeId: 'region-1',
          },
          stateTransition: {
            transitionId: 'transition-1',
            event: {
              eventId: 'event-1',
              type: 'value-changed',
              source: {
                documentId: 'doc-1',
                nodeId: 'widget-3',
              },
              time: 2000,
            },
            writes: [{
              target: {
                documentId: 'doc-1',
                nodeId: 'region-7',
              },
              key: 'visible',
              value: true,
            }],
          },
        }),
      ]),
      /sparc\.stateTransition\.event\.source .* does not match SPARC sourceAddress/,
    );
  });

  it('rejects SPARC practice observations that point at another document', function() {
    assert.throws(
      () => replaySparcHistory([
        makeBaseSparcRecord({
          documentId: 'doc-1',
          sourceAddress: {
            documentId: 'doc-1',
            nodeId: 'region-1',
          },
          practiceObservation: {
            observationId: 'obs-1',
            sourceAddress: {
              documentId: 'doc-2',
              nodeId: 'widget-1',
            },
            time: 2000,
            problemStartTime: 1000,
            outcome: 'correct',
            responseValue: 'answer',
          },
        }),
      ]),
      /sparc\.practiceObservation\.sourceAddress\.documentId "doc-2" does not match SPARC history document "doc-1"/,
    );
  });

  it('rejects SPARC practice observations whose source differs from the history source', function() {
    assert.throws(
      () => replaySparcHistory([
        makeBaseSparcRecord({
          documentId: 'doc-1',
          sourceAddress: {
            documentId: 'doc-1',
            nodeId: 'region-1',
          },
          practiceObservation: {
            observationId: 'obs-1',
            sourceAddress: {
              documentId: 'doc-1',
              nodeId: 'widget-3',
            },
            time: 2000,
            problemStartTime: 1000,
            outcome: 'correct',
            responseValue: 'answer',
          },
        }),
      ]),
      /sparc\.practiceObservation\.sourceAddress .* does not match SPARC sourceAddress/,
    );
  });

  it('rejects SPARC trace steps that point at another document', function() {
    assert.throws(
      () => replaySparcHistory([
        makeBaseSparcRecord({
          documentId: 'doc-1',
          sourceAddress: {
            documentId: 'doc-1',
            nodeId: 'region-1',
          },
          traceStep: {
            traceId: 'trace-1',
            sourceAddress: {
              documentId: 'doc-2',
              nodeId: 'widget-1',
            },
            productionRuleId: 'rule-1',
            actionId: 'widget-1::UpdateTextField::answer',
            outcome: 'correct',
            time: 2000,
          },
        }),
      ]),
      /sparc\.traceStep\.sourceAddress\.documentId "doc-2" does not match SPARC history document "doc-1"/,
    );
  });

  it('rejects SPARC trace steps whose source differs from the history source', function() {
    assert.throws(
      () => replaySparcHistory([
        makeBaseSparcRecord({
          documentId: 'doc-1',
          sourceAddress: {
            documentId: 'doc-1',
            nodeId: 'region-1',
          },
          traceStep: {
            traceId: 'trace-1',
            sourceAddress: {
              documentId: 'doc-1',
              nodeId: 'widget-3',
            },
            productionRuleId: 'rule-1',
            actionId: 'widget-1::UpdateTextField::answer',
            outcome: 'correct',
            time: 2000,
          },
        }),
      ]),
      /sparc\.traceStep\.sourceAddress .* does not match SPARC sourceAddress/,
    );
  });

  it('rejects malformed replay writes instead of inferring state', function() {
    assert.throws(
      () => replaySparcHistory([
        makeBaseSparcRecord({
          documentId: 'doc-1',
          sourceAddress: {
            documentId: 'doc-1',
            nodeId: 'region-1',
          },
          stateTransition: {
            transitionId: 'transition-1',
            event: {
              eventId: 'event-1',
              type: 'value-changed',
              source: {
                documentId: 'doc-1',
                nodeId: 'region-1',
              },
              time: 2000,
            },
            writes: [
              {
                target: {
                  documentId: 'doc-1',
                  nodeId: 'region-1',
                },
                key: '',
                value: 'unaddressed',
              },
            ],
          },
        }),
      ]),
      /sparc\.stateTransition\.writes\[0\]\.key is required/,
    );
  });
});
