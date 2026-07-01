import assert from 'node:assert/strict';
import { applySparcStateTransition, createEmptySparcReplayState } from './sparcStateReplay';
import { createSparcStableWorkingMemoryFactStateWrite } from './sparcWorkingMemoryState';
import { createSparcAuthoredInitialReplayState } from './sparcAuthoredInitialState';
import {
  buildSparcWorkingMemoryFacts,
  buildSparcWorkingMemoryFactsWithDerivations,
} from './sparcWorkingMemoryFacts';
import type {
  SparcAuthoredDocument,
  SparcInterfaceEvent,
  SparcRuleExpression,
} from './sparcSessionContracts';

const literal = (value: unknown): SparcRuleExpression => ({ type: 'literal', value });
const variable = (name: string): SparcRuleExpression => ({ type: 'variable', name });

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

  it('derives transient working-memory facts from authored conditions', function() {
    const event: SparcInterfaceEvent = {
      eventId: 'event-branch',
      type: 'value-changed',
      source: {
        documentId: 'fractions-doc',
        nodeId: 'firstDenConv',
      },
      time: 1000,
      payload: {
        input: 12,
      },
    };
    const documentWithDerivedFacts: SparcAuthoredDocument = {
      ...document,
      derivedFacts: [{
        id: 'select-lcd-denominator-path',
        when: [{
          factType: 'interface-event',
          slots: {
            sourceNode: { type: 'literal', value: 'firstDenConv' },
            input: {
              type: 'bind',
              variable: 'selectedDenominator',
            },
          },
        }],
        tests: [{
          op: 'eq',
          left: variable('selectedDenominator'),
          right: literal(12),
        }],
        fact: {
          factType: 'fraction.activeDenominatorPath',
          slots: {
            denominator: variable('selectedDenominator'),
            path: literal('lcd'),
          },
        },
      }],
    };

    const facts = buildSparcWorkingMemoryFacts({
      document: documentWithDerivedFacts,
      replayState: createSparcAuthoredInitialReplayState(documentWithDerivedFacts),
      event,
    });

    assert.ok(facts.some((fact) => (
      fact.factType === 'fraction.activeDenominatorPath'
      && fact.slots?.denominator === 12
      && fact.slots.path === 'lcd'
    )));

    const result = buildSparcWorkingMemoryFactsWithDerivations({
      document: documentWithDerivedFacts,
      replayState: createSparcAuthoredInitialReplayState(documentWithDerivedFacts),
      event,
    });
    assert.equal(result.derivedRuleExecution?.firings.length, 1);
    assert.equal(result.derivedRuleExecution?.firings[0]?.ruleId, 'derived-fact:select-lcd-denominator-path');
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

  it('projects stable replayed working-memory facts with latest-value semantics', function() {
    const target = {
      documentId: 'fractions-doc',
      nodeId: 'root',
    };
    const replayState = applySparcStateTransition(
      applySparcStateTransition(createEmptySparcReplayState(), {
        transitionId: 'turn-1',
        event: {
          eventId: 'turn-1',
          type: 'response-submitted',
          source: target,
          time: 1000,
        },
        writes: [createSparcStableWorkingMemoryFactStateWrite({
          target,
          fact: {
            factType: 'controller.selectedAction',
            slots: {
              action: 'hint',
              targetType: 'learningTarget',
              clusterKC: 'kc-a',
            },
          },
        })],
      }),
      {
        transitionId: 'turn-2',
        event: {
          eventId: 'turn-2',
          type: 'response-submitted',
          source: target,
          time: 2000,
        },
        writes: [createSparcStableWorkingMemoryFactStateWrite({
          target,
          fact: {
            factType: 'controller.selectedAction',
            slots: {
              action: 'summary',
              targetType: 'learningTarget',
              clusterKC: 'kc-b',
            },
          },
        })],
      },
    );

    const selectedActions = buildSparcWorkingMemoryFacts({
      document,
      replayState,
    }).filter((fact) => fact.factType === 'controller.selectedAction');

    assert.equal(selectedActions.length, 1);
    assert.equal(selectedActions[0]?.slots?.action, 'summary');
    assert.equal(selectedActions[0]?.slots?.clusterKC, 'kc-b');
  });
});
