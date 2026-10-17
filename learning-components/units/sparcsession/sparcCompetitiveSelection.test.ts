import { strict as assert } from 'node:assert';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import { logistic, targetExpectancy, boltzmannProbabilities, boundedLogit, competitiveAssessmentFacts, competitiveCandidateFacts, selectCompetitiveActivation } from './sparcCompetitiveSelection';
import { createSparcDynamicInstructionRules } from './sparcDynamicInstructionRules';
describe('Competitive target and replay contracts', () => {
  it('floors replayed assessments without losing literal changes or delaying recovery above the floor', () => {
    let history: SparcWorkingMemoryFact[] = [];
    const key = 'expectation:a';
    for (const [index, coverage] of [0, 0, .1, .15, .3, .7].entries()) {
      const observed = competitiveAssessmentFacts({ facts: history,
        scoreFacts: [{ factType: 'learningTarget.score', slots: { clusterKC: 'a', coverage } }],
        snapshotId: `floor-${index}`, coverageThreshold: .8, misconceptionThreshold: .2 });
      history.push(...observed);
      const replayed = JSON.parse(JSON.stringify(history));
      assert.ok(Math.abs(logistic(targetExpectancy(replayed, key)) - Math.max(.2, coverage)) < 1e-9);
      const rawSum = history.filter(fact => fact.factType === 'instructional.modelObservation')
        .reduce((sum, fact) => sum + Number(fact.slots!.delta), 0);
      assert.ok(Math.abs(rawSum - boundedLogit(coverage)) < 1e-9);
    }
    assert.equal(history.filter(fact => fact.slots?.kind === 'initial').length, 1);
  });
  it('orients only detected misconceptions and permits negative model changes', () => {
    const score = (supportStrength: number) => [{ factType: 'diagnostic.misconceptionScore', slots: { id: 'm', supportStrength } }];
    const observe = (facts: SparcWorkingMemoryFact[], support: number, snapshotId: string) => competitiveAssessmentFacts({facts, scoreFacts: score(support), snapshotId, coverageThreshold: .8, misconceptionThreshold: .2});
    assert.equal(observe([], 0, 'zero').length, 0);
    const first = observe([], .7, 'first');
    assert.ok(Math.abs(logistic(targetExpectancy(first, 'misconception:m')) - .3) < 1e-9);
    const regression = observe(first, .9, 'regression');
    assert.ok(Number(regression[0]!.slots?.delta) < 0);
    const history = [...first, ...regression];
    assert.ok(Math.abs(logistic(targetExpectancy(history, 'misconception:m')) - .2) < 1e-9);
    const complete = observe(history, .1, 'complete');
    assert.ok(complete.some(fact => fact.factType === 'instructional.oet'));
    const candidate = {factType: 'instructional.candidate', slots: {targetKind: 'misconception', targetKey: 'misconception:m', currentValue: .1, goalValue: .2, eligible: false}};
    assert.equal(competitiveCandidateFacts([...history, ...complete, candidate], Math.log(4)).at(-1)!.slots?.eligible, false);
  });
  it('preserves stable Boltzmann probabilities, ties, and activation ordering for categorized agent moves', () => {
    assert.deepEqual(boltzmannProbabilities([-1000, -1000], .1), [.5, .5]);
    assert.ok(boltzmannProbabilities([-2, -1], .001)[1]! > .9999);
    assert.throws(() => boltzmannProbabilities([0], 0), /positive temperature/);
    const rules = createSparcDynamicInstructionRules('agent').filter(rule => rule.module === 'dialogue.instructional-competition');
    const activations = rules.slice(0, 2).map((rule, i) => ({ ruleId: rule.id, assertedFacts: [], persistentAssertedFacts: [], persistentAssertedFactIdentitySlots: [], writes: [], messages: [], modelPracticeObservations: [], classifications: [], credits: [], terminatesProductionPhase: false, bindings: {
      targetKey: 'expectation:a', expectancyLogit: boundedLogit(.2), assistance: i ? 3.02 : 2.52, oetLogit: Math.log(4),
    } }));
    const selected = selectCompetitiveActivation(activations, rules, () => .7)!;
    assert.deepEqual(selected, selectCompetitiveActivation([...activations].reverse(), rules, () => .7));
    assert.ok(Number(selected.bindings.selectionProbability) > 0);
    assert.throws(() => selectCompetitiveActivation([...activations, { ...activations[0]!, bindings: { ...activations[0]!.bindings, targetKey: 'expectation:b' } }], rules), /share one instructional target/);
  });
});
