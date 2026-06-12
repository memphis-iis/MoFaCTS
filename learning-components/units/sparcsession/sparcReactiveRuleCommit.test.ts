import assert from 'node:assert/strict';
import { createEmptySparcReplayState, createSparcStateCellKey, replaySparcHistory } from './sparcStateReplay';
import { commitSparcAuthoredReactiveEvent } from './sparcReactiveRuleCommit';
import type { SparcAuthoredDocument } from './sparcSessionContracts';

const sourceAddress = {
  documentId: 'doc-1',
  nodeId: 'region-1',
};

const targetAddress = {
  documentId: 'doc-1',
  nodeId: 'widget-3-feedback',
};

const document: SparcAuthoredDocument = {
  id: 'doc-1',
  schemaVersion: 1,
  reactiveRules: [{
    id: 'show-feedback',
    when: {
      type: 'state',
      query: {
        target: sourceAddress,
        key: 'submitted',
      },
      compare: 'truthy',
    },
    writes: [{
      target: targetAddress,
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

const core = {
  TDFId: 'tdf-1',
  sessionID: 'session-1',
  levelUnit: 2,
  userId: 'user-1',
};

describe('sparcReactiveRuleCommit', function() {
  it('writes canonical history when authored reactive rules produce a transition', async function() {
    const writtenRecords: unknown[] = [];
    const replayState = {
      ...createEmptySparcReplayState(),
      cells: {
        [createSparcStateCellKey(sourceAddress, 'submitted')]: {
          address: sourceAddress,
          key: 'submitted',
          value: true,
          transitionId: 'previous',
          eventId: 'previous-event',
          time: 1000,
        },
      },
    };

    const committed = await commitSparcAuthoredReactiveEvent({
      core,
      document,
      event: {
        eventId: 'event-1',
        type: 'condition-evaluated',
        source: sourceAddress,
        time: 2000,
      },
      context: {
        replayState,
      },
      runtime: {
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.deepEqual(committed.evaluation.matchedRuleIds, ['show-feedback']);
    assert.equal(committed.historyRecord?.action, 'sparc-reactive-rule');
    assert.deepEqual(writtenRecords, [committed.historyRecord]);

    const replayed = replaySparcHistory([committed.historyRecord!], replayState);
    assert.equal(replayed.cells[createSparcStateCellKey(targetAddress, 'visible')]?.value, true);
  });

  it('does not write history when authored reactive rules do not match', async function() {
    const writtenRecords: unknown[] = [];

    const committed = await commitSparcAuthoredReactiveEvent({
      core,
      document,
      event: {
        eventId: 'event-2',
        type: 'condition-evaluated',
        source: sourceAddress,
        time: 3000,
      },
      context: {
        replayState: createEmptySparcReplayState(),
      },
      runtime: {
        history: {
          async writeCanonicalHistory(record) {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.deepEqual(committed.evaluation.skippedRuleIds, ['show-feedback']);
    assert.equal(committed.historyRecord, undefined);
    assert.deepEqual(writtenRecords, []);
  });
});
