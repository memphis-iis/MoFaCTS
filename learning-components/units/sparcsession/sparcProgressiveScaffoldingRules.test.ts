import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runSparcProductionRules } from './sparcProductionRuleEvaluator';
import { createSparcProgressiveScaffoldingRules } from './sparcProgressiveScaffoldingRules';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

function fact(factType: string, slots: Record<string, unknown> = {}): SparcWorkingMemoryFact {
  return { factType, slots };
}

function facts(params: {
  stage: string;
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
      lastAction: params.stage.toLowerCase(),
    }),
    fact('controller.completionState', { completed: params.completed === true }),
  ];
  if (params.madeProgress !== undefined) {
    result.push(fact('learningObservation.targetProgress', {
      targetKey: 'expectation:kc-a',
      madeProgress: params.madeProgress,
      newlyResolved: false,
    }));
  }
  if (params.completed) result.push(fact('dialogue.completionSelected'));
  return result;
}

function selectedAction(inputFacts: readonly SparcWorkingMemoryFact[]): string {
  const execution = runSparcProductionRules({
    facts: inputFacts,
    rules: createSparcProgressiveScaffoldingRules(),
  });
  const selected = execution.facts
    .filter((entry) => entry.factType === 'controller.selectedAction');
  assert.equal(selected.length, 1);
  return String(selected[0]!.slots?.action);
}

describe('SPARC progressive scaffolding productions', function() {
  it('selects the four no-progress stages without relying on salience', function() {
    assert.equal(selectedAction(facts({ stage: 'ELICIT' })), 'pump');
    assert.equal(selectedAction(facts({ stage: 'PUMP', madeProgress: false })), 'prompt');
    assert.equal(selectedAction(facts({ stage: 'PROMPT', madeProgress: false })), 'hint');
    assert.equal(selectedAction(facts({ stage: 'HINT', madeProgress: false })), 'assertion');
  });

  it('de-escalates progress and cycles post-assertion failure to pump', function() {
    assert.equal(selectedAction(facts({ stage: 'HINT', madeProgress: true })), 'pump');
    assert.equal(selectedAction(facts({ stage: 'ASSERTION', madeProgress: false })), 'pump');
  });

  it('selects summary independently at completion', function() {
    assert.equal(selectedAction(facts({ stage: 'ASSERTION', completed: true })), 'summary');
  });

  it('defers legitimate content questions and preserves scored progress', function() {
    const execution = runSparcProductionRules({
      facts: [
        ...facts({ stage: 'PUMP', madeProgress: true }),
        fact('dialogue.learnerQuestion', { contentFocused: true }),
      ],
      rules: createSparcProgressiveScaffoldingRules(),
    });

    assert.deepEqual(execution.firings.map((firing) => firing.ruleId), [
      'dialogue.question.defer',
      'dialogue.scaffold.pump',
    ]);
    assert.equal(selectedAction(execution.initialFacts), 'pump');
    assert.equal(
      execution.facts.find((entry) => entry.factType === 'dialogue.responseModifier')?.slots?.action,
      'question-deferral',
    );
    assert.equal(
      execution.facts.some((entry) => entry.slots?.observationKind === 'learner-question-no-progress'),
      false,
    );
  });

  it('defers legitimate content questions and follows real no-progress observations', function() {
    const execution = runSparcProductionRules({
      facts: [
        ...facts({ stage: 'PUMP', madeProgress: false }),
        fact('dialogue.learnerQuestion', { contentFocused: true }),
      ],
      rules: createSparcProgressiveScaffoldingRules(),
    });

    assert.deepEqual(execution.firings.map((firing) => firing.ruleId), [
      'dialogue.question.defer',
      'dialogue.scaffold.prompt',
    ]);
    assert.equal(selectedAction(execution.initialFacts), 'prompt');
  });

  it('declines off-topic or inappropriate questions without advancing the scaffold', function() {
    assert.equal(selectedAction([
      ...facts({ stage: 'PROMPT', madeProgress: false }),
      fact('dialogue.learnerQuestion', { contentFocused: false }),
    ]), 'question-scope-refusal');
  });

  it('keeps terminal completion ahead of learner-question handling', function() {
    assert.equal(selectedAction([
      ...facts({ stage: 'ASSERTION', completed: true }),
      fact('dialogue.learnerQuestion', { contentFocused: true }),
    ]), 'summary');
  });
});
