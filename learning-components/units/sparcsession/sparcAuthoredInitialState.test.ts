import assert from 'node:assert/strict';
import { withCanonicalHistorySchemaVersion } from '../../runtime/historyEnvelope';
import {
  createSparcAuthoredInitialReplayState,
} from './sparcAuthoredInitialState';
import {
  createSparcStateCellKey,
  replaySparcHistory,
} from './sparcStateReplay';
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
        documentId: 'doc-1',
        nodeId: 'region-7',
        path: ['widget-3', 'feedback'],
      },
      key: 'visible',
      value: false,
    }],
    root: {
      id: 'root',
      kind: 'document',
      children: [{
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
    selection: 'doc-1:region-7',
    action: 'sparc-state-transition',
    outcome: 'unknown',
    typeOfResponse: 'sparc',
    responseValue: '',
    input: '',
    displayedStimulus: '',
    eventType: 'sparc',
    sparc: {
      documentId: 'doc-1',
      sourceAddress: transition.event.source,
      stateTransition: transition,
    },
  }) as SparcCanonicalHistoryRecord;
}

describe('sparcAuthoredInitialState', function() {
  it('creates replay cells from authored document initial state without writing history transitions', function() {
    const state = createSparcAuthoredInitialReplayState(authoredDocument());
    const cellKey = createSparcStateCellKey({
      documentId: 'doc-1',
      nodeId: 'region-7',
      path: ['widget-3', 'feedback'],
    }, 'visible');

    assert.equal(state.cells[cellKey]?.value, false);
    assert.equal(state.cells[cellKey]?.transitionId, 'authored-initial-state');
    assert.deepEqual(state.transitions, []);
    assert.deepEqual(state.observations, []);
  });

  it('replays history changes over authored initial state', function() {
    const initialState = createSparcAuthoredInitialReplayState(authoredDocument());
    const transition: SparcStateTransition = {
      transitionId: 'transition-1',
      event: {
        eventId: 'event-1',
        type: 'condition-evaluated',
        source: {
          documentId: 'doc-1',
          nodeId: 'region-7',
          path: ['widget-3'],
        },
        time: 2500,
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

    const state = replaySparcHistory([makeSparcRecord(transition)], initialState);
    const cellKey = createSparcStateCellKey({
      documentId: 'doc-1',
      nodeId: 'region-7',
      path: ['widget-3', 'feedback'],
    }, 'visible');

    assert.equal(state.cells[cellKey]?.value, true);
    assert.equal(state.cells[cellKey]?.transitionId, 'transition-1');
    assert.deepEqual(state.transitions, [transition]);
  });

  it('fails clearly when authored initial state points outside the document', function() {
    const document: SparcAuthoredDocument = {
      ...authoredDocument(),
      initialState: [{
        target: {
          documentId: 'doc-1',
          nodeId: 'region-7',
          path: ['missing'],
        },
        key: 'visible',
        value: false,
      }],
    };

    assert.throws(
      () => createSparcAuthoredInitialReplayState(document),
      /path segment "missing" not found/,
    );
  });
});
