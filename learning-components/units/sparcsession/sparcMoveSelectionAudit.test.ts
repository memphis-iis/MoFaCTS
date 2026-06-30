import { strict as assert } from 'node:assert';
import { auditSparcMoveSelection } from './sparcMoveSelectionAudit';
import type {
  SparcProductionRule,
  SparcRuleExpression,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

function literal(value: unknown): SparcRuleExpression {
  return { type: 'literal', value };
}

function variable(name: string): SparcRuleExpression {
  return { type: 'variable', name };
}

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

const facts: readonly SparcWorkingMemoryFact[] = [
  fact('learningTarget.selected', { clusterKC: 'kc-a' }),
  fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.4 }),
  fact('dialogue.moveContent', {
    targetType: 'learningTarget',
    clusterKC: 'kc-a',
    action: 'hint',
    text: 'Use a hint.',
  }),
  fact('dialogue.moveContent', {
    targetType: 'learningTarget',
    clusterKC: 'kc-a',
    action: 'prompt',
    text: 'Use a prompt.',
  }),
];

const rules: readonly SparcProductionRule[] = [{
  id: 'dialogue.move.hint',
  salience: 90,
  when: [{
    factType: 'learningTarget.selected',
    slots: {
      clusterKC: { type: 'bind', variable: 'clusterKC' },
    },
  }],
  then: [{
    type: 'assert-fact',
    fact: {
      factType: 'controller.selectedAction',
      slots: {
        targetType: literal('learningTarget'),
        clusterKC: variable('clusterKC'),
        action: literal('hint'),
      },
    },
  }, {
    type: 'terminate-production-phase',
    reason: 'move-selected',
  }],
}, {
  id: 'dialogue.move.prompt',
  salience: 80,
  when: [{
    factType: 'learningTarget.selected',
    slots: {
      clusterKC: { type: 'bind', variable: 'clusterKC' },
    },
  }],
  then: [{
    type: 'assert-fact',
    fact: {
      factType: 'controller.selectedAction',
      slots: {
        targetType: literal('learningTarget'),
        clusterKC: variable('clusterKC'),
        action: literal('prompt'),
      },
    },
  }, {
    type: 'terminate-production-phase',
    reason: 'move-selected',
  }],
}];

describe('auditSparcMoveSelection', function() {
  it('audits matched terminal move rules and selects the highest-salience valid action', function() {
    const audit = auditSparcMoveSelection({ facts, rules });

    assert.deepEqual(audit.candidates.map((candidate) => candidate.ruleId), [
      'dialogue.move.hint',
      'dialogue.move.prompt',
    ]);
    assert.equal(audit.selected?.ruleId, 'dialogue.move.hint');
    assert.equal(audit.selected?.action, 'hint');
    assert.equal(audit.selected?.targetId, 'kc-a');
    assert.equal(audit.utteranceRequest?.action, 'hint');
    assert.deepEqual(audit.candidates.map((candidate) => candidate.valid), [true, true]);
  });

  it('simulates alternate salience sets without changing facts or rules', function() {
    const audit = auditSparcMoveSelection({
      facts,
      rules,
      salienceOverrides: {
        'dialogue.move.prompt': 95,
      },
    });

    assert.deepEqual(audit.candidates.map((candidate) => candidate.ruleId), [
      'dialogue.move.prompt',
      'dialogue.move.hint',
    ]);
    assert.equal(audit.selected?.ruleId, 'dialogue.move.prompt');
    assert.equal(audit.utteranceRequest?.action, 'prompt');
  });

  it('rejects matched selected actions that have no authored move content', function() {
    const audit = auditSparcMoveSelection({
      facts: facts.filter((entry) => !(entry.factType === 'dialogue.moveContent' && entry.slots?.action === 'hint')),
      rules,
    });

    assert.equal(audit.candidates[0]?.ruleId, 'dialogue.move.hint');
    assert.equal(audit.candidates[0]?.valid, false);
    assert.match(audit.candidates[0]?.rejectionReason ?? '', /missing dialogue\.moveContent/);
    assert.equal(audit.selected?.ruleId, 'dialogue.move.prompt');
    assert.equal(audit.utteranceRequest?.action, 'prompt');
  });
});
