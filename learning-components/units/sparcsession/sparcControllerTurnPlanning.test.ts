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
      fact('dialogue.thresholds', { coverageThreshold: 0.8 }),
      fact('controller.targetSelectionPolicy', { policy: 'kc-graph-priority', coverageThreshold: 0.8 }),
      fact('autotutor.expectation', { clusterKC: 'kc-a', text: 'Use A.' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2, addressed: false }),
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

function selectedAction(result: ReturnType<typeof evaluateSparcControllerTurnPlanning>): SparcWorkingMemoryFact | undefined {
  return result.productionRuleEvaluation.execution.firings
    .flatMap((firing) => firing.assertedFacts)
    .find((entry) => entry.factType === 'controller.selectedAction');
}

describe('evaluateSparcControllerTurnPlanning', function() {
  it('instantiates a general expectation target before firing the authored Pump rule', function() {
    const result = evaluateSparcControllerTurnPlanning({ document: document(), event });
    assert.equal(result.targetSelection.selectedTargetType, 'learningTarget');
    assert.ok(result.productionRuleFacts.some((entry) => (
      entry.factType === 'instructionalTarget.active'
      && entry.slots?.targetKey === 'expectation:kc-a'
    )));
    assert.equal(selectedAction(result)?.slots?.action, 'pump');
    assert.equal(selectedAction(result)?.slots?.targetType, 'expectation');
  });

  it('instantiates a misconception through the same authored Pump rule', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: document([
        fact('autotutor.misconception', { id: 'm1', text: 'Incorrect belief.' }),
        fact('diagnostic.misconceptionScore', { id: 'm1', supportStrength: 0.7, addressed: true }),
      ]),
      event,
    });
    assert.equal(result.targetSelection.selectedTargetType, 'misconception');
    assert.ok(result.productionRuleFacts.some((entry) => (
      entry.factType === 'instructionalTarget.active'
      && entry.slots?.targetKey === 'misconception:m1'
    )));
    assert.equal(selectedAction(result)?.slots?.action, 'pump');
    assert.equal(selectedAction(result)?.slots?.targetType, 'misconception');
  });

  it('keeps completion outside the scaffold chain', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: document([
        fact('dialogue.graduation', { requiredTargetCount: 1 }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.9, addressed: true }),
      ]),
      event,
    });
    assert.equal(selectedAction(result)?.slots?.action, 'summary');
    assert.equal(selectedAction(result)?.slots?.targetType, 'completion');
  });

  it('uses current completion after replayed in-progress state when the learner succeeds', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: document([
        fact('dialogue.graduation', { requiredTargetCount: 1 }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.9 }),
      ]),
      event,
      extraFacts: [
        fact('controller.completionState', {
          completed: false,
          reason: 'in-progress',
          coveredTargetCount: 0,
          requiredTargetCount: 1,
        }),
      ],
    });

    assert.equal(
      result.derivedFacts.find((entry) => entry.factType === 'controller.completionState')?.slots?.completed,
      true,
    );
    assert.equal(selectedAction(result)?.slots?.action, 'summary');
    assert.equal(selectedAction(result)?.slots?.targetType, 'completion');
  });

  it('selects the terminal summary at the total turn limit even with an active misconception', function() {
    const result = evaluateSparcControllerTurnPlanning({
      document: document([
        fact('dialogue.graduation', { requiredTargetCount: 1, maxActiveMisconceptions: 0, maxTurns: 1 }),
        fact('autotutor.misconception', { id: 'm1', text: 'Incorrect belief.' }),
        fact('diagnostic.misconceptionScore', { id: 'm1', supportStrength: 0.7 }),
      ]),
      event,
    });

    assert.equal(selectedAction(result)?.slots?.action, 'summary');
    assert.equal(selectedAction(result)?.slots?.targetType, 'completion');
    assert.equal(result.derivedFacts.find((entry) => entry.factType === 'controller.completionState')?.slots?.reason, 'max-turns');
  });
});
