import { evaluateSparcProductionRules } from './sparcProductionRuleEvaluator';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import { logistic, targetOet, targetExpectancy, boltzmannProbabilities, advanceOet, boundedLogit, competitiveAssessmentFacts, competitiveCandidateFacts, createSparcCompetitiveRules, competitiveMoveFacts, selectCompetitiveActivation } from './sparcCompetitiveSelection';
import { strict as assert } from 'node:assert';
import { commitSparcTrialDisplayAutoTutorRules } from './sparcTrialDisplayRuntimeBridge';
import { currentSparcMenu } from './sparcInstructionalCycle';
import { replaySparcHistory } from './sparcStateReplay';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import type { SparcTrialDisplay, SparcTrialResult } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import { sparcHistoryWriteId } from '../../../mofacts/server/lib/sparcHistoryWrite';
import { sameHistoryWrite } from '../../../mofacts/server/lib/historyWriteIdentity';
import { sparcHistoryForPolicy } from '../../../mofacts/client/views/experiment/svelte/services/sparcRuntimeState';

function display(): SparcTrialDisplay {
  return { pageKey: 'cycle', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
    instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'oet-boltzmann-v2', policyVersion: 1 },
    autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A' }, { clusterKC: 'b', text: 'Explain B' }],
      misconceptions: [{ id: 'm', text: 'Misconception M' }, { id: 'n', text: 'Misconception N' }] },
    clusterTargets: [{ clusterIndex: 0, clusterKC: 'a' }, { clusterIndex: 1, clusterKC: 'b' }],
    workingMemoryFacts: ['a', 'b'].map((clusterKC) => ({ factType: 'kcGraph.node', slots: { clusterKC, centrality: 0.5 } })),
    nodes: [ { id: 'opening-tutor-message', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Explain the topic.' },
      { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input', value: '' },
      { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit', value: 'submit' } ],
  };
}
function fixture(covered = false) {
  const rows: CanonicalHistoryRecord[] = [];
  const requests: SparcUtteranceRequest[] = [];
  const source = display();
  let calls = 0;
  let time = 10;
  let fail = false;
  let coverage: Record<string, number> = { a: covered ? 1 : .2, b: covered ? 1 : .2 };
  let support: Record<string, number> = { m: 0, n: 0 };
  const submit = (result: SparcTrialResult, prior = [...rows], sessionID = 'session') => commitSparcTrialDisplayAutoTutorRules({
    core: { userId: 'u', TDFId: 'tdf', sessionID, levelUnit: 0 }, pageKey: 'cycle', display: source,
    result, priorHistoryRecords: prior,
    scoreLearnerResponse: () => { calls++; return {
      learningTargetScores: ['a', 'b'].map((clusterKC) => ({ clusterKC, coverage: coverage[clusterKC]! })),
      diagnosticMisconceptionScores: ['m', 'n'].map((id) => ({ id, supportStrength: support[id]! })),
    }; },
    generateTutorUtterance: (request) => {
      requests.push(request);
      if (fail) throw new Error('provider failed');
      if (request.action === 'prompt-supported') return { tutorMessage: 'What belongs at ? A?', figure: { assetId: 'image123', description: 'A process with its last step omitted.' } };
      const parts = request.moveDefinition.components;
      return parts ? { explanation: parts.includes('explanation') ? 'An explanation.' : null, richContent: parts.includes('richContent') ? '<table><tr><th>A</th></tr><tr><td>1</td></tr></table>' : null, question: 'What is A?' } : 'Tell me more about A.';
    },
    history: { writeCanonicalHistoryBatch: async records => { rows.push(...records); }, writeCanonicalHistory: async (record) => {
      const prior = rows.find((row) => sparcHistoryWriteId(row) === sparcHistoryWriteId(record));
      if (prior && !sameHistoryWrite(prior, record)) throw new Error('Conflicting accepted history');
      if (!prior) rows.push(record);
    } },
  });
  const menu = () => currentSparcMenu(replaySparcHistory(rows));
  return { rows, requests, source, menu, submit, calls: () => calls, setFail: (value: boolean) => { fail = value; },
    setScores: (next: Record<string, number>, misconceptions = { m: 0, n: 0 }) => { coverage = next; support = misconceptions; },
    answer: () => submit({ submittedNodes: { 'learner-response-input': 'An answer.' }, triggeredBy: 'learner-response-submit', timestamp: time++ }),
    choice: (id: string) => { const node = `${String(menu()?.slots?.menuId)}:${id}`; return submit({ submittedNodes: { [node]: id }, triggeredBy: node, timestamp: time++ }); },
  };
}


describe('Competitive instructional cycles', () => {
  it('floors a zero first assessment and retains nondecreasing expectation coverage', async () => {
    const f = fixture();
    const facts = () => Object.values(replaySparcHistory(f.rows).cells).map(cell => cell.value as SparcWorkingMemoryFact);
    f.setScores({ a: 0, b: 0 });
    await f.answer();
    assert.ok(Math.abs(logistic(targetExpectancy(facts(), 'expectation:a')) - .2) < 1e-9);
    assert.equal(facts().find(fact => fact.factType === 'learningTarget.score' && fact.slots?.clusterKC === 'a'), undefined, 'unchanged initial zero is reconstructed without a score row');
    f.setScores({ a: .6, b: 0 });
    await f.answer();
    f.setScores({ a: .1, b: 0 });
    await f.answer();
    assert.ok(Math.abs(logistic(targetExpectancy(facts(), 'expectation:a')) - .6) < 1e-9);
    assert.equal(facts().find(fact => fact.factType === 'learningTarget.score' && fact.slots?.clusterKC === 'a')!.slots!.coverage, .6);
  });
  it('retains the active KC and cycle across no progress and replay, then advances only at coverage', async () => {
    const f = fixture();
    const savedFacts = () => Object.values(replaySparcHistory(f.rows).cells).map(cell => cell.value as SparcWorkingMemoryFact);
    const cycle = () => savedFacts().find(fact => fact.factType === 'instructional.activeCycle')!;
    await f.answer();
    assert.equal(f.requests.at(-1)!.targetId, 'a');
    const originalCycle = cycle().slots!.cycleId;
    // B now has both a stronger target priority and a perfect pump/OET match.
    // Neither permits it to displace the unfinished active KC A.
    f.setScores({ a: 0, b: .2 });
    await f.answer();
    assert.equal(f.requests.at(-1)!.targetId, 'a');
    assert.equal(cycle().slots!.cycleId, originalCycle);
    assert.equal(cycle().slots!.cycleTurnCount, 1);
    assert.ok(Math.abs(logistic(targetOet(savedFacts(), 'expectation:a')) - .6) < 1e-9);
    assert.ok(Math.abs(logistic(targetOet(savedFacts(), 'expectation:b')) - .2) < 1e-9);
    f.setScores({ a: .79, b: .2 });
    await f.submit({ submittedNodes: { 'learner-response-input': 'Partial progress.' }, triggeredBy: 'learner-response-submit', timestamp: 50 }, JSON.parse(JSON.stringify(f.rows)), 'resumed-session');
    assert.equal(f.requests.at(-1)!.targetId, 'a');
    assert.equal(cycle().slots!.cycleId, originalCycle);
    assert.equal(cycle().slots!.cycleTurnCount, 2);
    f.setScores({ a: .8, b: .2 });
    await f.answer();
    assert.equal(f.requests.at(-1)!.targetId, 'b');
    assert.notEqual(cycle().slots!.cycleId, originalCycle);
    assert.ok(Math.abs(logistic(targetOet(savedFacts(), 'expectation:a')) - .2) < 1e-9);
    f.setScores({ a: .8, b: .8 });
    await f.answer();
    assert.equal(f.requests.length, 4);
  });
  it('preserves misconception interruption and stays on that misconception until resolved', async () => {
    const f = fixture(); await f.answer();
    f.setScores({ a: .2, b: .2 }, { m: .7, n: 0 });
    await f.answer();
    assert.equal(f.requests.at(-1)!.targetId, 'm');
    f.setScores({ a: .2, b: .2 }, { m: .3, n: .9 });
    await f.answer();
    assert.equal(f.requests.at(-1)!.targetId, 'm');
    f.setScores({ a: .2, b: .2 }, { m: .2, n: .9 });
    await f.answer();
    assert.equal(f.requests.at(-1)!.targetId, 'n');
    f.setScores({ a: .2, b: .2 }, { m: 0, n: .2 });
    await f.answer();
    assert.equal(f.requests.at(-1)!.targetId, 'a');
  });
  it('records seeded model observations, selected utility and production OET together', async () => {
    const f = fixture(); await f.answer();
    assert.equal(f.requests.length, 1);
    const facts = Object.values(replaySparcHistory(f.rows).cells).map(cell => cell.value as any);
    const decision = facts.find(fact => fact.factType === 'instructional.decision');
    assert.ok(Number.isFinite(decision.slots.utility));
    assert.ok(decision.slots.selectionProbability > 0);
    assert.equal(facts.filter(fact => fact.factType === 'instructional.modelObservation' && fact.slots.kind === 'initial').length, 2);
    assert.ok(Math.abs(logistic(targetOet(facts, decision.slots.targetKey)) - 0.4) < 1e-9);
    assert.ok(Math.abs(logistic(targetExpectancy(facts, 'expectation:a')) - 0.2) < 1e-9);
    await f.answer();
    const after = Object.values(replaySparcHistory(f.rows).cells).map(cell => cell.value as any);
    assert.equal(after.filter(fact => fact.factType === 'instructional.modelObservation' && fact.slots.kind === 'initial').length, 2);
    assert.ok(Math.abs(logistic(targetExpectancy(after, 'expectation:a')) - 0.2) < 1e-9);
  });
  it('retries the saved decision without a new score, sample or OET increment', async () => {
    const f = fixture(); f.setFail(true);
    await assert.rejects(f.answer(), /provider failed/);
    const before = JSON.parse(JSON.stringify(f.rows));
    f.setFail(false); await f.answer();
    assert.equal(f.calls(), 1);
    assert.equal(f.requests[0]!.action, f.requests[1]!.action);
    assert.equal(f.requests[0]!.targetId, f.requests[1]!.targetId);
    assert.equal(f.rows.filter(row => String((row.sparc as any).stateTransition.transitionId).endsWith(':decision')).length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(f.rows.slice(0, before.length))), before);
  });
  it('keeps durable output bounded over a long conversation without copying the execution trace', async () => {
    const f = fixture();
    for (let turn = 0; turn < 30; turn++) await f.answer();
    const cycles = f.rows.filter(row => String((row.sparc as any).stateTransition.transitionId).endsWith(':cycle'));
    assert.equal(cycles.length, 30);
    assert.ok(cycles.every(row => !(row.sparc as any).stateTransition.event.payload.productionRuleFirings));
    assert.ok(cycles.every(row => Buffer.byteLength(JSON.stringify(row.sparc)) < 16384));
  });
  it('stops when all targets are complete', async () => {
    const f = fixture(true); await f.answer(); assert.equal(f.requests.length, 0);
  });
  it('uses stable probabilities, equal ties and probability-scale OET increments', () => {
    assert.deepEqual(boltzmannProbabilities([-1000, -1000], .1), [.5, .5]);
    assert.ok(boltzmannProbabilities([-2, -1], .001)[1]! > .9999);
    assert.ok(Math.abs(logistic(advanceOet(boundedLogit(.2), .2)) - .4) < 1e-9);
    assert.ok(Math.abs(logistic(advanceOet(boundedLogit(.8), .2)) - .8) < 1e-9);
    assert.throws(() => boltzmannProbabilities([0], 0), /positive temperature/);
  });
});

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
    assert.equal(competitiveCandidateFacts([...history, ...complete, candidate]).at(-1)!.slots?.eligible, false);
  });
  it('competes only across moves for the progression-selected target without duplicate branch weighting', () => {
    const rules = createSparcCompetitiveRules();
    assert.ok(rules.every(rule => rule.salience === undefined));
    const facts: SparcWorkingMemoryFact[] = [
      {factType: 'interface-event', slots: {eventType: 'response-submitted', eventId: 'e'}},
      {factType: 'instructional.assessmentSnapshot', slots: {snapshotId: 'e'}},
      {factType: 'session.turnState', slots: {turnCount: 1}},
      {factType: 'instructional.cycleStatus', slots: {snapshotId: 'e', continuable: false}},
      ...competitiveMoveFacts(),
      ...['a', 'b'].map(targetId => ({factType: 'instructional.candidate', slots: {snapshotId: 'e', targetKind: 'expectation', targetId, targetKey: `expectation:${targetId}`, eligible: true, isMaximumWithinKind: targetId === 'a', currentValue: .2, expectancyLogit: boundedLogit(.2), oetLogit: boundedLogit(.2)}})),
    ];
    const activations = evaluateSparcProductionRules({facts: [...facts, facts.at(-1)!], rules, deferEffects: true});
    assert.equal(activations.length, 5);
    assert.ok(activations.every(activation => activation.bindings.targetId === 'a'));
    assert.deepEqual(competitiveMoveFacts().map(fact => fact.slots?.action), ['pump', 'prompt', 'prompt-supported', 'hint', 'assertion']);
    assert.ok(activations.every(activation => /\.(pump|prompt|prompt-supported|hint|assertion)$/.test(activation.ruleId)));
    const selected = selectCompetitiveActivation(activations, rules, () => .7)!;
    assert.deepEqual(selected, selectCompetitiveActivation([...activations].reverse(), rules, () => .7));
    assert.ok(Number(selected.bindings.utility) === 0);
    assert.ok(Number(selected.bindings.selectionProbability) > .99);
    assert.throws(() => selectCompetitiveActivation([...activations, { ...activations[0]!, bindings: { ...activations[0]!.bindings, targetKey: 'expectation:b' } }], rules), /share one instructional target/);
  });
  it('starts separately after a policy change and resumes only the latest compatible attempt', async () => {
    const f = fixture(); await f.answer();
    assert.equal(sparcHistoryForPolicy(f.rows, 'progressive-scaffolding-v1').length, 0);
    for (const oldPolicy of ['student-selected-v1', 'oet-boltzmann-v1']) {
      const oldRows = JSON.parse(JSON.stringify(f.rows)) as CanonicalHistoryRecord[];
      for (const row of oldRows) (row.sparc as any).stateTransition.event.payload.policyId = oldPolicy;
      assert.equal(sparcHistoryForPolicy(oldRows, 'student-selected-v2').length, 0);
      assert.equal(sparcHistoryForPolicy(oldRows, 'oet-boltzmann-v2').length, 0);
    }
    assert.equal(sparcHistoryForPolicy(f.rows, 'oet-boltzmann-v2').length, f.rows.length);
    const newest = {...f.rows.at(-1)!, sessionID: 'different-attempt'};
    assert.deepEqual(sparcHistoryForPolicy([...f.rows, newest], 'oet-boltzmann-v2'), [newest]);
  });
});
