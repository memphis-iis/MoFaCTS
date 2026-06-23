import assert from 'node:assert/strict';
import { createSparcAuthoredInitialReplayState } from './sparcAuthoredInitialState';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import type {
  SparcAuthoredDocument,
  SparcInterfaceEvent,
} from './sparcSessionContracts';

const document: SparcAuthoredDocument = {
  id: 'fractions-doc',
  schemaVersion: 1,
  workingMemoryFacts: [{
    factType: 'problem',
    slots: {
      type: 'fraction-addition',
      firstNumerator: 1,
      firstDenominator: 4,
      secondNumerator: 1,
      secondDenominator: 6,
    },
  }, {
    factType: 'node-role',
    slots: {
      node: 'firstDenConv',
      role: 'converted-denominator',
      fraction: 'first',
    },
  }],
  initialState: [{
    target: {
      documentId: 'fractions-doc',
      nodeId: 'firstDenConv',
    },
    key: 'status',
    value: 'empty',
  }],
  root: {
    id: 'root',
    kind: 'document',
    children: [{
      id: 'fraction-panel',
      kind: 'panel',
      refs: [{
        relation: 'controls',
        target: {
          documentId: 'fractions-doc',
          nodeId: 'firstDenConv',
        },
      }],
      children: [{
        id: 'firstDenConv',
        kind: 'input',
      }],
    }],
  },
};

describe('sparcWorkingMemoryFacts', function() {
  it('builds working memory from authored facts, node facts, and replayed interface state', function() {
    const replayState = createSparcAuthoredInitialReplayState(document);

    const facts = buildSparcWorkingMemoryFacts({
      document,
      replayState,
    });

    assert.ok(facts.some((fact) => (
      fact.factType === 'problem'
      && fact.slots?.type === 'fraction-addition'
      && fact.slots.firstDenominator === 4
    )));
    assert.ok(facts.some((fact) => (
      fact.factType === 'node'
      && fact.slots?.node === 'firstDenConv'
      && fact.slots.kind === 'input'
      && fact.slots.parent === 'fraction-panel'
    )));
    assert.ok(facts.some((fact) => (
      fact.factType === 'node-reference'
      && fact.slots?.sourceNode === 'fraction-panel'
      && fact.slots.targetNode === 'firstDenConv'
      && fact.slots.relation === 'controls'
    )));
    assert.ok(facts.some((fact) => (
      fact.factType === 'interface-state'
      && fact.slots?.node === 'firstDenConv'
      && fact.slots.key === 'status'
      && fact.slots.value === 'empty'
    )));
  });

  it('adds current interface event payload as a working-memory fact', function() {
    const event: SparcInterfaceEvent = {
      eventId: 'event-1',
      type: 'value-changed',
      source: {
        documentId: 'fractions-doc',
        nodeId: 'firstDenConv',
      },
      time: 1000,
      payload: {
        selection: 'firstDenConv',
        action: 'UpdateTextArea',
        input: 12,
      },
    };

    const facts = buildSparcWorkingMemoryFacts({
      document,
      replayState: createSparcAuthoredInitialReplayState(document),
      event,
    });

    assert.ok(facts.some((fact) => (
      fact.factType === 'interface-event'
      && fact.slots?.eventId === 'event-1'
      && fact.slots.sourceNode === 'firstDenConv'
      && fact.slots.selection === 'firstDenConv'
      && fact.slots.action === 'UpdateTextArea'
      && fact.slots.input === 12
    )));
  });

  it('adds practice observations when a reactive event carries one', function() {
    const event: SparcInterfaceEvent = {
      eventId: 'event-2',
      type: 'outcome-recorded',
      source: {
        documentId: 'fractions-doc',
        nodeId: 'firstDenConv',
      },
      time: 2000,
      practiceObservation: {
        observationId: 'obs-1',
        sourceAddress: {
          documentId: 'fractions-doc',
          nodeId: 'firstDenConv',
        },
        time: 2000,
        problemStartTime: 1000,
        practiceDurationMs: 1000,
        outcome: 'correct',
        responseValue: 12,
      },
    };

    const facts = buildSparcWorkingMemoryFacts({
      document,
      event,
    });

    assert.ok(facts.some((fact) => (
      fact.factType === 'practice-observation'
      && fact.slots?.observationId === 'obs-1'
      && fact.slots.outcome === 'correct'
      && fact.slots.responseValue === 12
    )));
  });
});
