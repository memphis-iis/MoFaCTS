import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateSparcProductionRules } from './sparcProductionRuleEvaluator';
import { createSparcProgressiveScaffoldingRules } from './sparcProgressiveScaffoldingRules';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

function fact(factType: string, slots: Record<string, unknown> = {}): SparcWorkingMemoryFact {
  return { factType, slots };
}

function facts(params: {
  stage: string;
  addressed?: boolean;
  madeProgress?: boolean;
  completed?: boolean;
}): SparcWorkingMemoryFact[] {
  const result = [
    fact('instructionalTarget.active', {
      targetKey: 'expectation:kc-a',
      targetKind: 'expectation',
      targetId: 'kc-a',
      focusEpisodeId: 'episode-1',
      status: 'active',
    }),
    fact('scaffold.state', {
      targetKey: 'expectation:kc-a',
      focusEpisodeId: 'episode-1',
      stage: params.stage,
    }),
    fact('controller.completionState', { completed: params.completed === true }),
  ];
  if (params.addressed !== undefined && params.madeProgress !== undefined) {
    result.push(fact('learningObservation.targetProgress', {
      targetKey: 'expectation:kc-a',
      addressed: params.addressed,
      madeProgress: params.madeProgress,
      newlyResolved: false,
    }));
  }
  if (params.completed) result.push(fact('dialogue.completionSelected'));
  return result;
}

function selectedAction(inputFacts: readonly SparcWorkingMemoryFact[]): string {
  const firings = evaluateSparcProductionRules({
    facts: inputFacts,
    rules: createSparcProgressiveScaffoldingRules(),
  });
  const selected = firings.flatMap((firing) => firing.assertedFacts)
    .filter((entry) => entry.factType === 'controller.selectedAction');
  assert.equal(selected.length, 1);
  return String(selected[0]!.slots?.action);
}

describe('SPARC progressive scaffolding productions', function() {
  it('selects the four no-progress stages without relying on salience', function() {
    assert.equal(selectedAction(facts({ stage: 'ELICIT' })), 'pump');
    assert.equal(selectedAction(facts({ stage: 'PUMP', addressed: true, madeProgress: false })), 'prompt');
    assert.equal(selectedAction(facts({ stage: 'PROMPT', addressed: true, madeProgress: false })), 'hint');
    assert.equal(selectedAction(facts({ stage: 'HINT', addressed: true, madeProgress: false })), 'assertion');
  });

  it('de-escalates progress and cycles post-assertion failure to pump', function() {
    assert.equal(selectedAction(facts({ stage: 'HINT', addressed: true, madeProgress: true })), 'pump');
    assert.equal(selectedAction(facts({ stage: 'ASSERTION', addressed: true, madeProgress: false })), 'pump');
  });

  it('holds the current scaffold on a non-addressing response', function() {
    assert.equal(selectedAction(facts({ stage: 'PUMP', addressed: false, madeProgress: false })), 'pump');
    assert.equal(selectedAction(facts({ stage: 'PROMPT', addressed: false, madeProgress: false })), 'prompt');
    assert.equal(selectedAction(facts({ stage: 'HINT', addressed: false, madeProgress: false })), 'hint');
    assert.equal(selectedAction(facts({ stage: 'ASSERTION', addressed: false, madeProgress: false })), 'assertion');
  });

  it('selects summary independently at completion', function() {
    assert.equal(selectedAction(facts({ stage: 'ASSERTION', completed: true })), 'summary');
  });
});
