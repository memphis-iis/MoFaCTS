import { strict as assert } from 'node:assert';
import { commitSparcTrialDisplayAutoTutorRules, createSparcAuthoredDocumentFromTrialDisplay } from './sparcTrialDisplayRuntimeBridge';
import { currentSparcMenu, projectSparcMenuOperations } from './sparcInstructionalCycle';
import { replaySparcHistory } from './sparcStateReplay';
import { readExpectationLogitHistory } from '../../runtime/expectationLogitHistory';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import type { SparcTrialDisplay, SparcTrialResult } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import { sparcHistoryWriteId } from '../../../mofacts/server/lib/sparcHistoryWrite';
import { sameHistoryWrite } from '../../../mofacts/server/lib/historyWriteIdentity';
import { clearSparcRuntimeState, hydrateSparcRuntimeHistory, readSparcResumeSnapshot, rememberSparcRuntimeHistoryRecord } from '../../../mofacts/client/views/experiment/svelte/services/sparcRuntimeState';

function display(version: 'student' | 'agent'): SparcTrialDisplay {
  return { pageKey: 'cycle', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
    instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: version === 'student' ? 'student-selected-v2' : 'agent-selected-v1', policyVersion: 1 },
    autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A' }, { clusterKC: 'b', text: 'Explain B' }], misconceptions: [] },
    clusterTargets: [{ clusterIndex: 0, clusterKC: 'a' }, { clusterIndex: 1, clusterKC: 'b' }],
    workingMemoryFacts: [
      ...['a', 'b'].map((clusterKC) => ({ factType: 'kcGraph.node', slots: { clusterKC, centrality: 0.5 } })),
      ...['a', 'b'].map(source => ({ factType: 'kcGraph.relationship', slots: { sourceClusterKC: source, targetClusterKC: source === 'a' ? 'b' : 'a', strength: .5 } })),
    ],
    nodes: [ { id: 'opening-tutor-message', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Explain the topic.' },
      { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input', value: '' },
      { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit', value: 'submit' } ],
  };
}
function fixture(version: 'student' | 'agent', covered = false) {
  const rows: CanonicalHistoryRecord[] = [];
  const requests: SparcUtteranceRequest[] = [];
  const source = display(version);
  let calls = 0;
  let time = 10;
  let fail = false;
  const submit = (result: SparcTrialResult, prior = [...rows], sessionID = 'session') => commitSparcTrialDisplayAutoTutorRules({
    core: { userId: 'u', TDFId: 'tdf', sessionID, levelUnit: 0 }, pageKey: 'cycle', display: source,
    result, priorHistoryRecords: prior,
    scoreLearnerResponse: () => { calls++; return { learningTargetScores: ['a', 'b'].map((clusterKC) => ({ clusterKC, coverage: covered ? 1 : 0.2 })) }; },
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
    answer: () => submit({ submittedNodes: { 'learner-response-input': 'An answer.' }, triggeredBy: 'learner-response-submit', timestamp: time++ }),
    choice: (id: string) => { const node = `${String(menu()?.slots?.menuId)}:${id}`; return submit({ submittedNodes: { [node]: id }, triggeredBy: node, timestamp: time++ }); },
  };
}

describe('SPARC instructional cycles', () => {
  it('offers six production-defined options and uses one assessment before a chosen primitive', async () => {
    const f = fixture('student');
    await f.answer();
    assert.equal(f.calls(), 1); assert.equal(f.requests.length, 0);
    assert.equal((f.menu()?.slots?.options as unknown[]).length, 6);
    await f.choice('assertion');
    assert.equal(f.calls(), 1); assert.equal(f.requests[0]!.action, 'assertion');
    assert.equal(f.menu()?.slots?.status, 'consumed');
    assert.equal(readExpectationLogitHistory(f.rows, { userId: 'u', TDFId: 'tdf', levelUnit: 0, pageKey: 'cycle' }).get('a')!.length, 1);
    await f.answer();
    assert.equal(f.calls(), 2); assert.equal(f.menu()?.slots?.status, 'pending');
  });
  it('executes a supported student choice directly without another assessment', async () => {
    const f = fixture('student'); await f.answer();
    await f.choice('prompt-supported');
    assert.equal(f.calls(), 1);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0]!.action, 'prompt-supported');
    assert.equal(f.requests[0]!.moveDefinition.assistance, 1.33);
    const restored = replaySparcHistory(JSON.parse(JSON.stringify(f.rows)));
    assert.ok(restored.transitions.some(transition => transition.writes.some(write => (write.value as { node?: { figure?: unknown } })?.node?.figure)));
    assert.equal(currentSparcMenu(restored)?.slots?.status, 'consumed');
  });
  it('allows next-target selection before mastery and continued practice after full completion', async () => {
    for (const covered of [false, true]) {
      const f = fixture('student', covered);
      await f.answer();
      const first = (f.menu()?.slots?.options as { targetId: string }[])[0]!.targetId;
      await f.choice('next-target');
      const second = (f.menu()?.slots?.options as { targetId: string }[])[0]!.targetId;
      assert.notEqual(first, second); assert.equal(f.calls(), 1);
      await f.choice('pump');
      await f.answer();
      assert.equal(f.menu()?.slots?.status, 'pending');
    }
  });
  it('replays a failed selected action without scoring again or accepting another decision', async () => {
    const f = fixture('student'); await f.answer(); f.setFail(true);
    await assert.rejects(f.choice('hint'), /provider failed/);
    const decisions = () => f.rows.filter((row) => String((row.sparc as { stateTransition: { transitionId: string } }).stateTransition.transitionId).endsWith(':decision')).length;
    assert.equal(decisions(), 1);
    assert.equal(f.menu()?.slots?.status, 'selected');
    const restored = replaySparcHistory(JSON.parse(JSON.stringify(f.rows)));
    assert.ok(projectSparcMenuOperations(restored).length > 0);
    f.setFail(false); await f.choice('hint');
    assert.equal(decisions(), 1); assert.equal(f.calls(), 1); assert.equal(f.menu()?.slots?.status, 'consumed');
  });
  it('keeps agent selection automatic and stops naturally when all targets are covered', async () => {
    const agent = fixture('agent'); await agent.answer(); assert.equal(agent.requests[0]!.action, 'pump');
    await agent.answer(); assert.equal(agent.requests[1]!.action, 'instruction.question');
    const done = fixture('agent', true); await done.answer();
    assert.equal(done.requests.length, 0); assert.equal(done.menu(), undefined);
    for (const version of ['student', 'agent'] as const) {
      const rules = createSparcAuthoredDocumentFromTrialDisplay({ pageKey: 'cycle', display: display(version) }).productionRules!;
      assert.equal(rules.some((rule) => rule.id === 'instruction.student.menu'), version === 'student');
    }
  });
  it('retains composite primitives in the separate fixed-agent component policy', async () => {
    const agent = fixture('agent');
    for (let turn = 0; turn < 5; turn++) await agent.answer();
    assert.deepEqual(agent.requests.map((request) => request.action), ['pump', 'instruction.question',
      'instruction.explanation-question', 'instruction.rich-question', 'instruction.explanation-rich-question']);
  });
  it('honors every named AutoTutor choice directly, including after coverage is complete', async () => {
    for (const covered of [false, true]) {
      const f = fixture('student', covered);
      for (const move of ['pump', 'prompt', 'prompt-supported', 'hint', 'assertion']) {
        await f.answer();
        const options = f.menu()?.slots?.options as { id: string; label: string; targetId: string }[];
        assert.deepEqual(options.map(option => option.label), ['Pump', 'Prompt (unsupported)', 'Prompt (supported)', 'Hint', 'Assertion', 'Move to the next KC']);
        const priorCalls = f.calls();
        await f.choice(move);
        const request = f.requests.at(-1)!;
        assert.equal(request.action, move);
        assert.equal(request.targetId, options[0]!.targetId);
        assert.equal(request.moveDefinition.family, 'autotutor-dialogue');
        assert.equal(request.moveDefinition.components, undefined);
        assert.equal(f.calls(), priorCalls);
      }
    }
  });
  it('rejects the former composite and bundled AutoTutor menu options', async () => {
    const f = fixture('student'); await f.answer();
    for (const option of ['question', 'explanation', 'rich', 'explanation-rich', 'autotutor']) {
      await assert.rejects(f.choice(option), /Select an offered|Stale|exactly one/);
    }
    assert.equal(f.requests.length, 0);
  });
  it('arbitrates next-target versus instruction across resumed launch identities', async () => {
    const f = fixture('student'); await f.answer();
    const snapshot = JSON.parse(JSON.stringify(f.rows));
    const menuId = String(f.menu()?.slots?.menuId);
    const click = (id: string, session: string) => f.submit({ submittedNodes: { [`${menuId}:${id}`]: id },
      triggeredBy: `${menuId}:${id}`, timestamp: 50 }, snapshot, session);
    const outcomes = await Promise.allSettled([click('next-target', 'reopened-a'), click('pump', 'reopened-b')]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal(f.rows.filter((row) => (row.sparc as any).stateTransition.transitionId === `${menuId}:choice:decision`).length, 1);
    assert.ok(f.rows.every((row) => row.sessionID === 'session'));
  });
  it('rejects stale and conflicting buttons and restores accepted output without generation', async () => {
    const f = fixture('student'); await f.answer();
    const menuId = String(f.menu()?.slots?.menuId);
    const result = { submittedNodes: { [`${menuId}:pump`]: 'pump' }, triggeredBy: `${menuId}:pump`, timestamp: 50 };
    await f.submit(result);
    const count = f.rows.length;
    await f.submit(result);
    assert.equal(f.rows.length, count); assert.equal(f.requests.length, 1);
    await assert.rejects(f.submit({ ...result, triggeredBy: `${menuId}:hint` }), /Conflicting|Stale/);
    await f.answer();
    await assert.rejects(f.submit({ ...result, triggeredBy: `${menuId}:next-target` }), /Select an offered|Stale|exactly one/);
  });
  it('feeds the actual app probability projection identically on live acceptance and hydration', async () => {
    const f = fixture('student'); await f.answer();
    const scope = { userId: 'u', TDFId: 'tdf', levelUnit: 0, pageKey: 'cycle', display: f.source };
    clearSparcRuntimeState();
    assert.deepEqual(readSparcResumeSnapshot(scope).expectationProbabilities, { a: 0.5, b: 0.5 });
    for (const row of f.rows) rememberSparcRuntimeHistoryRecord(row);
    const live = readSparcResumeSnapshot(scope);
    assert.ok(live.expectationProbabilities.a! > 0.5);
    clearSparcRuntimeState(); hydrateSparcRuntimeHistory(JSON.parse(JSON.stringify(f.rows)));
    const restored = readSparcResumeSnapshot(scope);
    assert.deepEqual(restored.expectationProbabilities, live.expectationProbabilities);
    assert.deepEqual(restored.nodeValues, live.nodeValues);
    clearSparcRuntimeState();
  });
});
