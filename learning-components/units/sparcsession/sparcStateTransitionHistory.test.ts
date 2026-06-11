import assert from 'node:assert/strict';
import { createSparcStateCellKey, replaySparcHistory } from './sparcStateReplay';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import type { SparcStateTransition } from './sparcSessionContracts';

const transition: SparcStateTransition = {
  transitionId: 'transition-1',
  event: {
    eventId: 'event-1',
    type: 'condition-evaluated',
    source: {
      documentId: 'doc-1',
      nodeId: 'region-1',
    },
    time: 2000,
  },
  writes: [{
    target: {
      documentId: 'doc-1',
      nodeId: 'region-7',
      path: ['widget-3', 'feedback'],
    },
    key: 'visible',
    value: true,
  }],
};

describe('sparcStateTransitionHistory', function() {
  it('wraps a reactive state transition in canonical SPARC history for replay', function() {
    const record = createSparcStateTransitionHistoryRecord({
      core: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      },
      transition,
      action: 'sparc-reactive-rule',
    });

    assert.equal(record.levelUnitType, 'sparc');
    assert.equal(record.action, 'sparc-reactive-rule');
    assert.deepEqual(record.sparc.stateTransition, transition);

    const replayed = replaySparcHistory([record]);
    const cellKey = createSparcStateCellKey({
      documentId: 'doc-1',
      nodeId: 'region-7',
      path: ['widget-3', 'feedback'],
    }, 'visible');
    assert.equal(replayed.cells[cellKey]?.value, true);
  });

  it('requires shared learner identity before creating persistent history', function() {
    assert.throws(
      () => createSparcStateTransitionHistoryRecord({
        core: {
          TDFId: 'tdf-1',
          sessionID: 'session-1',
          levelUnit: 2,
        },
        transition,
      }),
      /SPARC state-transition history requires userId or anonStudentId/,
    );
  });

  it('refuses to create history for transitions that write into another document', function() {
    assert.throws(
      () => createSparcStateTransitionHistoryRecord({
        core: {
          TDFId: 'tdf-1',
          sessionID: 'session-1',
          levelUnit: 2,
          userId: 'user-1',
        },
        transition: {
          ...transition,
          writes: [{
            target: {
              documentId: 'doc-2',
              nodeId: 'region-7',
            },
            key: 'visible',
            value: true,
          }],
        },
      }),
      /write\[0\] target documentId "doc-2" does not match source document "doc-1"/,
    );
  });
});
