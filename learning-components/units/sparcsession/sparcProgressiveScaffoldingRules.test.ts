import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runSparcProductionRules } from './sparcProductionRuleEvaluator';
import { createSparcProgressiveScaffoldingRules } from './sparcProgressiveScaffoldingRules';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

function fact(factType: string, slots: Record<string, unknown> = {}): SparcWorkingMemoryFact {
  return { factType, slots };
}

function commonFacts(): SparcWorkingMemoryFact[] {
  return [
    fact('instructional.assessmentSnapshot', { snapshotId: 'snapshot-1' }),
    fact('controller.completionState', { completed: false }),
    fact('session.turnState', { turnCount: 2 }),
  ];
}

function candidate(params: {
  targetKind: 'expectation' | 'misconception';
  targetId: string;
  currentValue: number;
  maximum?: boolean;
}): SparcWorkingMemoryFact {
  return fact('instructional.candidate', {
    snapshotId: 'snapshot-1',
    targetKind: params.targetKind,
    targetId: params.targetId,
    targetKey: `${params.targetKind}:${params.targetId}`,
    currentValue: params.currentValue,
    eligible: true,
    isMaximumWithinKind: params.maximum !== false,
  });
}

function activeCycle(params: {
  targetKind: 'expectation' | 'misconception';
  targetId: string;
  stage: string;
}): SparcWorkingMemoryFact {
  return fact('instructional.activeCycle', {
    cycleId: 'cycle-1',
    targetKind: params.targetKind,
    targetId: params.targetId,
    targetKey: `${params.targetKind}:${params.targetId}`,
    stage: params.stage,
    priorValue: 0.2,
    startedAtTurn: 1,
    cycleTurnCount: 0,
    status: 'active',
  });
}

function progress(targetKind: 'expectation' | 'misconception', targetId: string, meaningfulGain: boolean): SparcWorkingMemoryFact {
  return fact('instructional.progress', {
    snapshotId: 'snapshot-1',
    cycleId: 'cycle-1',
    targetKind,
    targetId,
    targetKey: `${targetKind}:${targetId}`,
    meaningfulGain,
    goalReached: false,
  });
}

function execute(facts: readonly SparcWorkingMemoryFact[]) {
  return runSparcProductionRules({
    facts,
    rules: createSparcProgressiveScaffoldingRules(),
  });
}

function selectedAction(facts: readonly SparcWorkingMemoryFact[]): SparcWorkingMemoryFact {
  const execution = execute(facts);
  const selected = execution.facts.filter((entry) => entry.factType === 'controller.selectedAction');
  assert.equal(selected.length, 1);
  const decisions = execution.facts.filter((entry) => entry.factType === 'instructional.decision');
  assert.equal(decisions.length, 1);
  return selected[0]!;
}

describe('SPARC production-owned instructional control', function() {
  it('starts the maximum expectation at pump when no misconception is eligible', function() {
    const selected = selectedAction([
      ...commonFacts(),
      fact('instructional.cycleStatus', { snapshotId: 'snapshot-1', continuable: false }),
      candidate({ targetKind: 'expectation', targetId: 'kc-a', currentValue: 0.2 }),
    ]);
    assert.equal(selected.slots?.targetType, 'expectation');
    assert.equal(selected.slots?.action, 'pump');
  });

  it('starts the maximum threshold-eligible misconception at a targeted prompt', function() {
    const selected = selectedAction([
      ...commonFacts(),
      fact('instructional.cycleStatus', { snapshotId: 'snapshot-1', continuable: false }),
      candidate({ targetKind: 'expectation', targetId: 'kc-a', currentValue: 0.2 }),
      candidate({ targetKind: 'misconception', targetId: 'm1', currentValue: 0.7 }),
    ]);
    assert.equal(selected.slots?.targetType, 'misconception');
    assert.equal(selected.slots?.targetId, 'm1');
    assert.equal(selected.slots?.action, 'prompt');
  });

  it('interrupts an active expectation whenever a misconception is eligible', function() {
    const execution = execute([
      ...commonFacts(),
      fact('instructional.cycleStatus', { snapshotId: 'snapshot-1', continuable: true }),
      activeCycle({ targetKind: 'expectation', targetId: 'kc-a', stage: 'PUMP' }),
      candidate({ targetKind: 'expectation', targetId: 'kc-a', currentValue: 0.3 }),
      candidate({ targetKind: 'misconception', targetId: 'm1', currentValue: 0.4 }),
      progress('expectation', 'kc-a', true),
    ]);
    assert.deepEqual(execution.firings.map((firing) => firing.ruleId), ['dialogue.target.misconception.interrupt']);
    assert.equal(execution.facts.find((entry) => entry.factType === 'controller.selectedAction')?.slots?.action, 'prompt');
  });

  it('keeps a productive expectation pump at pump', function() {
    const selected = selectedAction([
      ...commonFacts(),
      fact('instructional.cycleStatus', { snapshotId: 'snapshot-1', continuable: true }),
      activeCycle({ targetKind: 'expectation', targetId: 'kc-a', stage: 'PUMP' }),
      candidate({ targetKind: 'expectation', targetId: 'kc-a', currentValue: 0.4 }),
      progress('expectation', 'kc-a', true),
    ]);
    assert.equal(selected.slots?.action, 'pump');
  });

  it('advances an unproductive expectation pump to prompt', function() {
    const selected = selectedAction([
      ...commonFacts(),
      fact('instructional.cycleStatus', { snapshotId: 'snapshot-1', continuable: true }),
      activeCycle({ targetKind: 'expectation', targetId: 'kc-a', stage: 'PUMP' }),
      candidate({ targetKind: 'expectation', targetId: 'kc-a', currentValue: 0.2 }),
      progress('expectation', 'kc-a', false),
    ]);
    assert.equal(selected.slots?.action, 'prompt');
  });

  it('continues an active misconception rather than switching to an expectation', function() {
    const selected = selectedAction([
      ...commonFacts(),
      fact('instructional.cycleStatus', { snapshotId: 'snapshot-1', continuable: true }),
      activeCycle({ targetKind: 'misconception', targetId: 'm1', stage: 'PROMPT' }),
      candidate({ targetKind: 'misconception', targetId: 'm1', currentValue: 0.6 }),
      candidate({ targetKind: 'expectation', targetId: 'kc-a', currentValue: 0.1 }),
      progress('misconception', 'm1', true),
    ]);
    assert.equal(selected.slots?.targetType, 'misconception');
    assert.equal(selected.slots?.action, 'pump');
  });

  it('selects completion independently of an active cycle', function() {
    const selected = selectedAction([
      fact('instructional.assessmentSnapshot', { snapshotId: 'snapshot-1' }),
      fact('controller.completionState', { completed: true }),
      activeCycle({ targetKind: 'expectation', targetId: 'kc-a', stage: 'PUMP' }),
    ]);
    assert.equal(selected.slots?.targetType, 'completion');
    assert.equal(selected.slots?.action, 'summary');
  });
});
