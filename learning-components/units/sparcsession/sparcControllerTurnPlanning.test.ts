import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateSparcControllerTurnPlanning } from './sparcControllerTurnPlanning';
import { createSparcProgressiveScaffoldingRules } from './sparcProgressiveScaffoldingRules';
import type { SparcAuthoredDocument, SparcInterfaceEvent, SparcWorkingMemoryFact } from './sparcSessionContracts';

function fact(factType: string, slots: Record<string, unknown> = {}): SparcWorkingMemoryFact {
  return { factType, slots };
}

function document(extraFacts: readonly SparcWorkingMemoryFact[] = []): SparcAuthoredDocument {
  return {
    id: 'sparc-doc',
    schemaVersion: 2,
    instructionalController: {
      adapterId: 'sparc-autotutor-v1',
      policyId: 'progressive-scaffolding-v1',
      policyVersion: 1,
      parameters: { minimumProgress: 0.05 },
    },
    workingMemoryFacts: [
      fact('dialogue.thresholds', { coverageThreshold: 0.8, misconceptionThreshold: 0.2 }),
      fact('controller.targetSelectionPolicy', { policy: 'kc-graph-priority', coverageThreshold: 0.8 }),
      fact('autotutor.expectation', { clusterKC: 'kc-a', text: 'Use A.' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 }),
      fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.5, description: 'A' }),
      ...extraFacts,
    ],
    productionRules: createSparcProgressiveScaffoldingRules(),
    root: { id: 'root', kind: 'document', children: [{ id: 'learner-input', kind: 'input' }] },
  };
}

const event: SparcInterfaceEvent = {
  eventId: 'event-plan-turn',
  type: 'response-submitted',
  source: { pageKey: 'sparc-doc', nodeId: 'learner-input' },
  time: 1200,
  payload: { input: 'learner response' },
};

function selectedAction(result: ReturnType<typeof evaluateSparcControllerTurnPlanning>): SparcWorkingMemoryFact {
  return result.productionRuleEvaluation.execution.facts
    .filter((entry) => entry.factType === 'controller.selectedAction')[0]!;
}

describe('evaluateSparcControllerTurnPlanning', function() {
  it('lets a production start the maximum expectation at pump', function() {
    const result = evaluateSparcControllerTurnPlanning({ document: document(), event });
    assert.equal(result.instructionalProjection.candidates.maximumExpectation?.targetId, 'kc-a');
    assert.equal(selectedAction(result).slots?.targetType, 'expectation');
    assert.equal(selectedAction(result).slots?.action, 'pump');
  });

  it('gives every threshold-eligible misconception priority and starts the maximum at prompt', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: document([
        fact('autotutor.misconception', { id: 'm-low', text: 'Low.' }),
        fact('autotutor.misconception', { id: 'm-high', text: 'High.' }),
        fact('diagnostic.misconceptionScore', { id: 'm-low', supportStrength: 0.3 }),
        fact('diagnostic.misconceptionScore', { id: 'm-high', supportStrength: 0.7 }),
      ]),
      event,
    });
    assert.equal(result.instructionalProjection.candidates.maximumMisconception?.targetId, 'm-high');
    assert.equal(selectedAction(result).slots?.targetId, 'm-high');
    assert.equal(selectedAction(result).slots?.action, 'prompt');
  });

  it('interrupts an unfinished expectation when a misconception crosses threshold', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: document([
        fact('autotutor.misconception', { id: 'm1', text: 'Incorrect belief.' }),
        fact('diagnostic.misconceptionScore', { id: 'm1', supportStrength: 0.4 }),
        fact('instructional.activeCycle', {
          cycleId: 'cycle-a', targetKind: 'expectation', targetId: 'kc-a', targetKey: 'expectation:kc-a',
          stage: 'PUMP', priorValue: 0.1, startedAtTurn: 1, cycleTurnCount: 0, status: 'active',
        }),
      ]),
      event,
    });
    assert.equal(selectedAction(result).slots?.targetType, 'misconception');
    assert.equal(selectedAction(result).slots?.action, 'prompt');
  });

  it('selects the terminal summary at completion', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: document([
        fact('dialogue.graduation', { requiredTargetCount: 1 }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.9 }),
      ]),
      event,
    });
    assert.equal(selectedAction(result).slots?.targetType, 'completion');
    assert.equal(selectedAction(result).slots?.action, 'summary');
  });
});
