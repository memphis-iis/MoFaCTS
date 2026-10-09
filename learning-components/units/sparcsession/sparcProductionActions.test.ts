import assert from 'node:assert/strict';
import { evaluateSparcProductionRules, runSparcProductionRules, runSparcProductionRulesWithActions } from './sparcProductionRuleEvaluator';
import type { SparcProductionRule } from './sparcSessionContracts';

const rules: readonly SparcProductionRule[] = [{
  id: 'evaluate',
  when: [{ factType: 'response' }],
  then: [{ type: 'invoke-action', actionId: 'evaluate', args: { sample: { type: 'literal', value: 7 } } }],
}, {
  id: 'generate', salience: 100,
  when: [{ factType: 'assessed', slots: { value: { type: 'literal', value: 0.8 } } }],
  then: [{ type: 'invoke-action', actionId: 'generate' }],
}];

describe('SPARC production actions', () => {
  it('matches without executing actions and refuses calls in the synchronous driver', () => {
    assert.equal(evaluateSparcProductionRules({ rules, facts: [{ factType: 'response' }] }).length, 1);
    assert.throws(() => runSparcProductionRules({ rules, facts: [{ factType: 'response' }] }), /asynchronous production executor/);
  });

  it('resumes matching after an awaited action, retains activation identity, and obeys data dependencies over salience', async () => {
    const calls: string[] = [];
    const execution = await runSparcProductionRulesWithActions({
      rules: [...rules].reverse(), facts: [{ factType: 'response' }],
      actions: {
        evaluate: async ({ args }) => {
          assert.equal(args.sample, 7);
          await Promise.resolve();
          calls.push('evaluate');
          return { assertions: [{ fact: { factType: 'assessed', slots: { value: 0.8 } }, persist: false }], writes: [] };
        },
        generate: () => { calls.push('generate'); return { assertions: [], writes: [] }; },
      },
    });
    assert.deepEqual(calls, ['evaluate', 'generate']);
    assert.deepEqual(execution.firings.map((firing) => firing.ruleId), calls);
    assert.deepEqual(execution.firings.map((firing) => firing.executedActions), [['evaluate'], ['generate']]);
  });

  it('executes then effects in order and replaces stable facts before invoking the next action', async () => {
    const execution = await runSparcProductionRulesWithActions({
      facts: [{ factType: 'score', slots: { id: 'a', value: 0.1 } }],
      rules: [{ id: 'update', when: [{ factType: 'score' }], then: [{
        type: 'assert-fact', identitySlots: ['id'], fact: {
          factType: 'score', slots: { id: { type: 'literal', value: 'a' }, value: { type: 'literal', value: 0.9 } },
        },
      }, { type: 'invoke-action', actionId: 'inspect' }] }],
      actions: { inspect: ({ facts }) => {
        assert.deepEqual(facts, [{ factType: 'score', slots: { id: 'a', value: 0.9 } }]);
        return { assertions: [], writes: [] };
      } },
    });
    assert.equal(execution.firings.length, 1);
  });

  it('does not generate when the evaluation production is absent', async () => {
    let called = false;
    const execution = await runSparcProductionRulesWithActions({
      rules: rules.slice(1), facts: [{ factType: 'response' }],
      actions: { generate: () => { called = true; return { assertions: [], writes: [] }; } },
    });
    assert.equal(called, false);
    assert.equal(execution.firings.length, 0);
  });

  it('fails explicitly for missing handlers, malformed results, and rejected actions', async () => {
    const input = { rules, facts: [{ factType: 'response' }] };
    await assert.rejects(runSparcProductionRulesWithActions({ ...input, actions: {} }), /not registered/);
    await assert.rejects(runSparcProductionRulesWithActions({ ...input, actions: {
      evaluate: () => ({ assertions: null, writes: [] } as never),
    } }), /assertions and writes/);
    await assert.rejects(runSparcProductionRulesWithActions({ ...input, actions: {
      evaluate: async () => { throw new Error('provider unavailable'); },
    } }), /provider unavailable/);
  });
});
