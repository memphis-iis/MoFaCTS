import assert from 'node:assert/strict';
import { withCanonicalHistorySchemaVersion } from '../../runtime/historyEnvelope';
import { replaySparcDocumentHistory } from './sparcDocumentReplay';
import { createSparcStateCellKey } from './sparcStateReplay';
import type {
  SparcAuthoredDocument,
  SparcCanonicalHistoryRecord,
  SparcStateTransition,
} from './sparcSessionContracts';

function authoredDocument(): SparcAuthoredDocument {
  return {
    id: 'doc-1',
    schemaVersion: 1,
    initialState: [{
      target: {
        pageKey: 'doc-1',
        nodeId: 'panel-1',
      },
      key: 'visible',
      value: false,
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'region-1',
        kind: 'panel',
        children: [{
          id: 'panel-1',
          kind: 'output',
        }],
      }],
    },
  };
}

function makeSparcRecord(
  transition: SparcStateTransition,
): SparcCanonicalHistoryRecord {
  return withCanonicalHistorySchemaVersion({
    TDFId: 'tdf-1',
    sessionID: 'session-1',
    userId: 'user-1',
    levelUnit: 1,
    levelUnitName: 'SPARC Unit',
    levelUnitType: 'sparc',
    time: transition.event.time,
    problemStartTime: 1000,
    selection: 'doc-1:region-1',
    action: 'sparc-state-transition',
    outcome: 'unknown',
    typeOfResponse: 'sparc',
    responseValue: '',
    input: '',
    displayedStimulus: '',
    eventType: 'sparc',
    sparc: {
      pageKey: 'doc-1',
      sourceAddress: transition.event.source,
      stateTransition: transition,
    },
  }) as SparcCanonicalHistoryRecord;
}

describe('sparcDocumentReplay', function() {
  it('replays ordered history over authored document start state', function() {
    const transition: SparcStateTransition = {
      transitionId: 'transition-1',
      event: {
        eventId: 'event-1',
        type: 'condition-evaluated',
        source: {
          pageKey: 'doc-1',
          nodeId: 'region-1',
        },
        time: 2000,
      },
      writes: [{
        target: {
          pageKey: 'doc-1',
          nodeId: 'panel-1',
        },
        key: 'visible',
        value: true,
      }],
    };

    const state = replaySparcDocumentHistory(authoredDocument(), [
      makeSparcRecord(transition),
    ]);
    const cellKey = createSparcStateCellKey({
      pageKey: 'doc-1',
      nodeId: 'panel-1',
    }, 'visible');

    assert.equal(state.cells[cellKey]?.value, true);
    assert.equal(state.cells[cellKey]?.transitionId, 'transition-1');
    assert.deepEqual(state.transitions, [transition]);
  });

  it('keeps authored start state when no history records exist', function() {
    const state = replaySparcDocumentHistory(authoredDocument(), []);
    const cellKey = createSparcStateCellKey({
      pageKey: 'doc-1',
      nodeId: 'panel-1',
    }, 'visible');

    assert.equal(state.cells[cellKey]?.value, false);
    assert.equal(state.cells[cellKey]?.transitionId, 'authored-initial-state');
    assert.deepEqual(state.transitions, []);
  });
});
