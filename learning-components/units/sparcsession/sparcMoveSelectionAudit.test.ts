import { strict as assert } from 'node:assert';
import { auditSparcMoveSelection } from './sparcMoveSelectionAudit';
import { runSparcProductionRules } from './sparcProductionRuleEvaluator';
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
  fact('dialogue.problemStatement', { text: 'Explain the clean target.' }),
  fact('autotutor.expectation', {
    clusterKC: 'kc-a',
    text: 'Use a clean target.',
  }),
  fact('learningTarget.selected', { clusterKC: 'kc-a' }),
  fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.4 }),
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
  it('audits the terminal move that actually fired', function() {
    const execution = runSparcProductionRules({ facts, rules });
    const audit = auditSparcMoveSelection({ execution, rules });

    assert.deepEqual(audit.candidates.map((candidate) => candidate.ruleId), [
      'dialogue.move.hint',
    ]);
    assert.equal(audit.selected?.ruleId, 'dialogue.move.hint');
    assert.equal(audit.selected?.action, 'hint');
    assert.equal(audit.selected?.targetId, 'kc-a');
    assert.equal(audit.utteranceRequest?.action, 'hint');
    assert.deepEqual(audit.candidates.map((candidate) => candidate.valid), [true]);
  });

  it('audits a different terminal move when the executed rule salience changes', function() {
    const promptFirstRules = rules.map((rule) => (
      rule.id === 'dialogue.move.prompt' ? { ...rule, salience: 95 } : rule
    ));
    const execution = runSparcProductionRules({ facts, rules: promptFirstRules });
    const audit = auditSparcMoveSelection({
      execution,
      rules: promptFirstRules,
    });

    assert.deepEqual(audit.candidates.map((candidate) => candidate.ruleId), [
      'dialogue.move.prompt',
    ]);
    assert.equal(audit.selected?.ruleId, 'dialogue.move.prompt');
    assert.equal(audit.utteranceRequest?.action, 'prompt');
  });

  it('rejects matched selected actions that have no clean target text', function() {
    const incompleteFacts = facts.filter((entry) => entry.factType !== 'autotutor.expectation');
    const execution = runSparcProductionRules({ facts: incompleteFacts, rules });
    const audit = auditSparcMoveSelection({
      execution,
      rules,
    });

    assert.equal(audit.candidates[0]?.ruleId, 'dialogue.move.hint');
    assert.equal(audit.candidates[0]?.valid, false);
    assert.match(audit.candidates[0]?.rejectionReason ?? '', /missing clean expectation text/);
    assert.equal(audit.selected, undefined);
    assert.equal(audit.utteranceRequest, undefined);
  });
});
