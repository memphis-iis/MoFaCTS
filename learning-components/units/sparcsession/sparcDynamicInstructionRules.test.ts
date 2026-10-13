import { strict as assert } from 'node:assert';
import { SPARC_DYNAMIC_AGENT_POLICY_ID, SPARC_DYNAMIC_STUDENT_POLICY_ID, sparcPolicyForAccount } from '../../runtime/sparcInstructionalPolicies';
import { commitSparcTrialDisplayAutoTutorRules } from './sparcTrialDisplayRuntimeBridge';
import { currentSparcMenu, projectSparcMenuOperations } from './sparcInstructionalCycle';
import { projectSparcInstructionMessages } from './sparcInstructionalPrimitives';
import { applySparcProgressiveNodeOperations, collectSparcProgressiveNodeOperations } from '../../trial-displays/sparc/sparcProgressiveNodes';
import { replaySparcHistory } from './sparcStateReplay';
import { logistic, targetExpectancy } from './sparcCompetitiveSelection';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import type { SparcTrialDisplay, SparcTrialResult } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import type { SparcWorkingMemoryFact, SparcStateTransition } from './sparcSessionContracts';

const transition = (row: CanonicalHistoryRecord) => (row.sparc as { stateTransition: SparcStateTransition }).stateTransition;

function fixture(version: 'student' | 'agent', longIdentities = false) {
  const rows: CanonicalHistoryRecord[] = [];
  const requests: SparcUtteranceRequest[] = [];
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => longIdentities ? `dynamic.stats-confidence-interval-001.kc.${id}` : id);
  const pageKey = longIdentities ? 'sparc-dynamic-confidence-interval-agent-with-seven-long-target-identities' : 'dynamic-cycle';
  const source: SparcTrialDisplay = {
    pageKey, schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
    instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: version === 'student' ? SPARC_DYNAMIC_STUDENT_POLICY_ID : SPARC_DYNAMIC_AGENT_POLICY_ID, policyVersion: 1 },
    autoTutorTargets: { expectations: ids.map(clusterKC => ({ clusterKC, text: `Explain ${clusterKC}` })),
      misconceptions: ['m1', 'm2', 'm3'].map(id => ({ id, text: `Misconception ${id}` })) },
    clusterTargets: ids.map((clusterKC, clusterIndex) => ({ clusterKC, clusterIndex })),
    workingMemoryFacts: ids.map(clusterKC => ({ factType: 'kcGraph.node', slots: { clusterKC, centrality: .5 } })),
    nodes: [{ id: 'opening-tutor-message', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Explain the topic.' },
      { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input' },
      { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit', value: 'submit' }],
  };
  let calls = 0;
  let timestamp = 10;
  let coverage = .2;
  let firstCoverage: number | undefined;
  let support = 0;
  let failQuestion = false;
  let failModelAfter: number | undefined;
  const submit = (result: SparcTrialResult) => commitSparcTrialDisplayAutoTutorRules({
    core: { userId: 'u', TDFId: 'dynamic', sessionID: 'session', levelUnit: 0 }, pageKey, display: source,
    result, priorHistoryRecords: JSON.parse(JSON.stringify(rows)),
    scoreLearnerResponse: () => { calls++; return { learningTargetScores: ids.map(clusterKC => ({ clusterKC, coverage: clusterKC === ids[0] ? firstCoverage ?? coverage : coverage })),
      diagnosticMisconceptionScores: ['m1', 'm2', 'm3'].map(id => ({ id, supportStrength: id === 'm1' ? support : 0 })) }; },
    generateTutorUtterance: async request => {
      requests.push(request);
      if (request.action === 'instruction.feedback') {
        assert.ok(request.plannerState);
        assert.equal(request.targetType, 'feedback');
        assert.ok(rows.some(row => transition(row).transitionId.endsWith(':assessment')));
        return 'Your answer identifies the relevant idea; here is the correction.';
      }
      assert.ok(rows.some(row => transition(row).transitionId.endsWith(':feedback')));
      assert.ok(request.dialogueHistory?.some(entry => String(entry.text).includes('here is the correction')));
      const explanation = request.moveDefinition.components!.includes('explanation') ? request.realizedInstruction?.explanation ?? 'An explanation of the target.' : null;
      const richContent = request.moveDefinition.components!.includes('richContent') ? request.realizedInstruction?.richContent ?? 'In the worked case, apply the rule to get 4.' : null;
      if (explanation && !request.realizedInstruction?.explanation) await request.onInstructionComponent?.('explanation', explanation);
      if (richContent && !request.realizedInstruction?.richContent) await request.onInstructionComponent?.('richContent', richContent);
      if (failQuestion) throw new Error('question failed');
      const question = request.realizedInstruction?.question ?? 'How does the rule apply to the new case?';
      if (!request.realizedInstruction?.question) await request.onInstructionComponent?.('question', question);
      return { explanation, richContent, question };
    },
    history: { writeCanonicalHistory: async record => {
      if (transition(record).transitionId.includes(':assessment:model:') && failModelAfter !== undefined
        && rows.filter(row => transition(row).transitionId.includes(':assessment:model:')).length >= failModelAfter) throw new Error('model write interrupted');
      rows.push(record);
    } },
  });
  const menu = () => currentSparcMenu(replaySparcHistory(rows));
  const answer = (time = timestamp++) => submit({ submittedNodes: { 'learner-response-input': longIdentities ? 'A learner response about constructing and interpreting a confidence interval. '.repeat(8) : 'An answer.' }, triggeredBy: 'learner-response-submit', timestamp: time });
  const choice = (id: string, time = timestamp++) => {
    const node = `${String(menu()?.slots?.menuId)}:${id}`;
    return submit({ submittedNodes: { [node]: id }, triggeredBy: node, timestamp: time });
  };
  const facts = () => Object.values(replaySparcHistory(rows).cells).map(cell => cell.value as SparcWorkingMemoryFact);
  return { source, rows, requests, answer, choice, menu, facts, calls: () => calls,
    scores: (value: number, misconception = 0) => { coverage = value; support = misconception; }, firstTarget: (value: number) => { firstCoverage = value; },
    fail: (value: boolean) => { failQuestion = value; }, failModel: (after?: number) => { failModelAfter = after; } };
}

describe('Dynamic instruction production cycles', () => {
  it('preserves explicit new policies for admins and rejects non-admin entry', () => {
    for (const id of [SPARC_DYNAMIC_AGENT_POLICY_ID, SPARC_DYNAMIC_STUDENT_POLICY_ID]) {
      assert.equal(sparcPolicyForAccount(true, id), id);
      assert.throws(() => sparcPolicyForAccount(false, id), /admin account/);
    }
  });
  it('provides saved feedback before the student menu, with exactly three moves plus navigation', async () => {
    const f = fixture('student'); await f.answer();
    assert.equal(f.calls(), 1); assert.equal(f.requests.length, 1);
    assert.deepEqual((f.menu()!.slots!.options as { id: string }[]).map(option => option.id), ['question', 'explanation-question', 'explanation-rich-question', 'next-target']);
    assert.ok(transition(f.rows[1]!).transitionId.endsWith(':feedback'));
    await f.choice('explanation-rich-question');
    assert.equal(f.calls(), 1); assert.equal(f.menu()!.slots!.status, 'consumed');
    assert.equal(f.requests.at(-1)!.moveDefinition.assistance, 2.77);
    await f.answer(); assert.equal(f.calls(), 2);
  });
  it('keeps next-KC navigation separate from instruction and evaluation', async () => {
    const f = fixture('student'); await f.answer();
    const first = (f.menu()!.slots!.options as { targetId: string }[])[0]!.targetId;
    await f.choice('next-target');
    const next = (f.menu()!.slots!.options as { targetId: string }[])[0]!.targetId;
    assert.notEqual(next, first); assert.equal(f.calls(), 1); assert.equal(f.requests.length, 1);
    await f.choice('question'); assert.equal(f.requests.at(-1)!.targetId, next);
  });
  it('uses fixed 80 percent competition, keeps the floor, and does not ramp OET', async () => {
    const f = fixture('agent'); f.scores(0); await f.answer();
    const request = f.requests.at(-1)!;
    assert.equal(request.moveDefinition.assistance, 2.77);
    assert.ok(Math.abs(request.competition!.oetLogit! - Math.log(4)) < 1e-9);
    assert.ok(Math.abs(logistic(targetExpectancy(f.facts(), 'expectation:a')) - .2) < 1e-9);
    assert.equal(f.facts().some(fact => fact.factType === 'instructional.oet' && Number(fact.slots?.logit) > -Math.log(4)), false);
    await f.answer(); assert.equal(f.requests.at(-1)!.competition!.oetLogit, request.competition!.oetLogit);
  });
  it('automatically advances from a covered expectation to an unfinished expectation', async () => {
    const f = fixture('student'); await f.answer(); await f.choice('question');
    f.firstTarget(.9); await f.answer();
    assert.equal((f.menu()!.slots!.options as { targetId: string }[])[0]!.targetId, 'b');
    await f.choice('question'); assert.equal(f.requests.at(-1)!.targetId, 'b');
  });
  it('excludes covered expectations when selecting the first expectation after feedback', async () => {
    const f = fixture('student'); f.firstTarget(1); await f.answer();
    assert.equal((f.menu()!.slots!.options as { targetId: string }[])[0]!.targetId, 'b');
  });
  it('presents each composite as one message and preserves selected buttons between feedback and instruction after replay', async () => {
    const f = fixture('student'); await f.answer(); await f.choice('explanation-rich-question');
    const replay = replaySparcHistory(JSON.parse(JSON.stringify(f.rows)));
    const nodes = applySparcProgressiveNodeOperations([], [
      ...collectSparcProgressiveNodeOperations(replay.transitions), ...projectSparcMenuOperations(replay),
    ]) as Record<string, unknown>[];
    const messages = projectSparcInstructionMessages(nodes.filter(node => node.atomType === 'dialogue-utterance'
      || node.atomType === 'html-block' || node.groupType === 'button-group'));
    const index = messages.findIndex(node => node.action === 'instruction.dynamic.explanation-rich-question');
    assert.equal(messages.filter(node => node.action === 'instruction.dynamic.explanation-rich-question').length, 1);
    assert.equal((messages[index]!.children as unknown[]).length, 3);
    assert.ok(String(messages[index - 1]!.id).endsWith(':selected'), JSON.stringify(messages.map(node => node.id)));
    const button = (messages[index - 1]!.children as Record<string, unknown>[])[0]!;
    assert.equal(button.label, 'Explanation with example or figure and question');
    assert.equal(button.selected, true); assert.equal(button.readOnly, true);
    await f.answer(); await f.choice('next-target'); await f.choice('question');
    const markers = projectSparcMenuOperations(replaySparcHistory(f.rows)).filter(operation => operation.type === 'insert-node' && String(operation.node.id).endsWith(':selected'));
    assert.equal(markers.length, 3);
  });
  it('displays explanation before support even when support was realized and saved first', () => {
    const action = 'instruction.dynamic.explanation-rich-question';
    const nodes = ['richContent', 'explanation', 'question'].map(component => ({
      id: `turn:${component}`, turnEventId: 'turn', action, atomType: 'dialogue-utterance', value: component,
    }));
    const projected = projectSparcInstructionMessages(nodes);
    assert.equal(projected.length, 1);
    assert.deepEqual(projected[0]!.children!.map(child => child.value), ['explanation', 'richContent', 'question']);
    assert.deepEqual(nodes.map(node => node.value), ['richContent', 'explanation', 'question']);
  });
  it('interrupts an expectation for a misconception and offers the same moves in both conditions', async () => {
    for (const version of ['student', 'agent'] as const) {
      const f = fixture(version); await f.answer();
      if (version === 'student') await f.choice('question');
      f.scores(.2, .8); await f.answer();
      if (version === 'student') await f.choice('explanation-question');
      assert.equal(f.requests.at(-1)!.targetType, 'misconception');
      assert.equal(f.requests.at(-1)!.targetId, 'm1');
      assert.ok(f.requests.at(-1)!.action.startsWith('instruction.dynamic.'));
    }
  });
  it('saves final-answer feedback before stopping in both conditions', async () => {
    for (const version of ['student', 'agent'] as const) {
      const f = fixture(version); f.scores(.9); await f.answer();
      assert.equal(f.requests.length, 1); assert.equal(f.requests[0]!.action, 'instruction.feedback');
      assert.equal(f.facts().find(fact => fact.factType === 'controller.completionState')!.slots!.completed, true);
      assert.equal(f.menu(), undefined);
      assert.equal((transition(f.rows.at(-1)!).writes.at(-1)!.value as { node: { readOnly: boolean } }).node.readOnly, true);
    }
  });
  it('resumes saved support and feedback without another score or selection', async () => {
    const f = fixture('agent'); f.fail(true);
    await assert.rejects(f.answer(100), /question failed/);
    const original = f.requests.at(-1)!;
    assert.ok(f.rows.some(row => transition(row).transitionId.endsWith(':primitive:richContent')));
    f.fail(false); await f.answer(100);
    assert.equal(f.calls(), 1);
    assert.equal(f.requests.filter(request => request.action === 'instruction.feedback').length, 1);
    assert.equal(f.requests.at(-1)!.action, original.action);
    assert.ok(f.requests.at(-1)!.realizedInstruction?.explanation);
    assert.ok(f.requests.at(-1)!.realizedInstruction?.richContent);
    assert.equal(f.rows.filter(row => transition(row).transitionId.endsWith(':primitive:richContent')).length, 1);
  });
  it('retains the selected history button and permits retry only of the accepted student choice after failure', async () => {
    const f = fixture('student'); await f.answer(); f.fail(true);
    await assert.rejects(f.choice('explanation-rich-question', 100), /question failed/);
    const operations = projectSparcMenuOperations(replaySparcHistory(f.rows));
    const active = operations.find(operation => operation.type === 'insert-node' && operation.node.id === 'instructional-choice-menu');
    assert.ok(active && active.type === 'insert-node');
    const buttons = active.node.children as Record<string, unknown>[];
    assert.deepEqual(buttons.filter(button => !button.readOnly).map(button => button.value), ['explanation-rich-question']);
    f.fail(false); await f.choice('explanation-rich-question', 100);
    assert.equal(f.calls(), 1);
    assert.equal(projectSparcMenuOperations(replaySparcHistory(f.rows)).filter(operation => operation.type === 'insert-node' && String(operation.node.id).endsWith(':selected')).length, 1);
  });
  it('bounds seven-target model updates and resumes interrupted persistence without rescoring or duplicate gains', async () => {
    const f = fixture('agent', true); f.failModel(2);
    await assert.rejects(f.answer(100), /model write interrupted/);
    assert.equal(f.calls(), 1); assert.equal(f.requests.length, 0);
    f.failModel(); await f.answer(100);
    assert.equal(f.calls(), 1);
    const models = f.facts().filter(fact => fact.factType === 'instructional.modelObservation');
    assert.equal(models.filter(fact => fact.slots!.kind === 'initial').length, 7);
    assert.equal(models.filter(fact => fact.slots!.kind === 'gain').length, 7);
    assert.ok(f.rows.every(row => Buffer.byteLength(JSON.stringify(row.sparc)) < 16384));
    const updates = f.rows.filter(row => transition(row).transitionId.includes(':assessment:model:'));
    assert.equal(updates.length, 7);
    const combined = { ...transition(f.rows[0]!), writes: [...transition(f.rows[0]!).writes, ...updates.flatMap(row => transition(row).writes)] };
    assert.ok(Buffer.byteLength(JSON.stringify({ ...(f.rows[0]!.sparc as object), stateTransition: combined })) > 16384);
  });
});
