import type { SparcRetainedEvidence } from './sparcEvidenceHistory';
import { strict as assert } from 'node:assert';
import { SPARC_DYNAMIC_AGENT_POLICY_ID, SPARC_DYNAMIC_STUDENT_POLICY_ID, SPARC_CATEGORIZED_AGENT_POLICY_ID, SPARC_CATEGORIZED_STUDENT_POLICY_ID, sparcPolicyForAccount } from '../../runtime/sparcInstructionalPolicies';
import { SPARC_TARGET_CATEGORIES, type SparcTargetCategory } from '../../runtime/sparcTargetCategories';
import { createSparcDynamicInstructionRules, SPARC_CATEGORIZED_MENU_OPTIONS } from './sparcDynamicInstructionRules';
import { SPARC_CATEGORIZED_MOVE_DEFINITIONS } from './sparcMoveDefinitions';
import { savedSparcChoiceQuestions, sparcQuestionAnswerNodes, projectSparcAnsweredQuestionOperations } from './sparcMultipleChoiceQuestion';
import { buildSparcDialogueHistory } from './sparcUtteranceRequest';
import { progressiveDialogueFacts } from './sparcWorkingMemoryFacts';
import { commitSparcTrialDisplayAutoTutorRules } from './sparcTrialDisplayRuntimeBridge';
import { currentSparcMenu, projectSparcMenuOperations } from './sparcInstructionalCycle';
import { projectSparcInstructionMessages } from './sparcInstructionalPrimitives';
import { applySparcProgressiveNodeOperations, collectSparcProgressiveNodeOperations } from '../../trial-displays/sparc/sparcProgressiveNodes';
import { replaySparcHistory } from './sparcStateReplay';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import { logistic, targetExpectancy } from './sparcCompetitiveSelection';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import type { SparcTrialDisplay, SparcTrialResult } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import type { SparcWorkingMemoryFact, SparcStateTransition } from './sparcSessionContracts';

const transition = (row: CanonicalHistoryRecord) => (row.sparc as { stateTransition: SparcStateTransition }).stateTransition;

function fixture(version: 'student' | 'agent', longIdentities = false, category?: SparcTargetCategory, targetCount = 7, misconceptionCount = 3) {
  const rows: CanonicalHistoryRecord[] = [];
  const requests: SparcUtteranceRequest[] = [];
  const ids = Array.from({ length: targetCount }, (_, i) => String.fromCharCode(97 + i)).map(id => longIdentities ? `dynamic.biology-species-speciation-hlw4e-ch21-001.kc.${id}` : id);
  const misconceptionIds = Array.from({ length: misconceptionCount }, (_, i) => `m${i + 1}`);
  const pageKey = longIdentities ? 'sparc-dynamic-confidence-interval-agent-with-seven-long-target-identities' : 'dynamic-cycle';
  const source: SparcTrialDisplay = {
    pageKey, schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
    instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: version === 'student' ? category ? SPARC_CATEGORIZED_STUDENT_POLICY_ID : SPARC_DYNAMIC_STUDENT_POLICY_ID : category ? SPARC_CATEGORIZED_AGENT_POLICY_ID : SPARC_DYNAMIC_AGENT_POLICY_ID, policyVersion: 1 },
    autoTutorTargets: { expectations: ids.map(clusterKC => ({ clusterKC, text: `Explain ${clusterKC}`, ...(category ? { category } : {}) })),
      misconceptions: misconceptionIds.map(id => ({ id, text: `Misconception ${id}`, ...(category ? { category } : {}) })) },
    clusterTargets: ids.map((clusterKC, clusterIndex) => ({ clusterKC, clusterIndex })),
    workingMemoryFacts: [{ factType: 'dialogue.source', slots: { topic: 'The lesson topic' } },
      { factType: 'dialogue.utterance', factId: 'opening:question', slots: { speaker: 'tutor', component: 'question',
        eventId: 'opening', targetType: 'learningTarget', targetId: ids[0], text: 'Explain the topic.' } },
      ...ids.map(clusterKC => ({ factType: 'kcGraph.node', slots: { clusterKC, centrality: .5 } })),
      ...ids.flatMap(source => ids.filter(target => source !== target).map(target => ({ factType: 'kcGraph.relationship', slots: { sourceClusterKC: source, targetClusterKC: target, strength: .5 } })))],
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
  let failBatch = false;
  let evidence: SparcRetainedEvidence[] = [];
  const submit = (result?: SparcTrialResult) => commitSparcTrialDisplayAutoTutorRules({
    core: { userId: 'u', TDFId: 'dynamic', sessionID: 'session', levelUnit: 0 }, pageKey, display: source,
    ...(result ? { result } : {}), priorHistoryRecords: JSON.parse(JSON.stringify(rows)),
    scoreLearnerResponse: () => { calls++; return { learningTargetScores: ids.map(clusterKC => ({ clusterKC, coverage: clusterKC === ids[0] ? firstCoverage ?? coverage : coverage })),
      evidence, diagnosticMisconceptionScores: misconceptionIds.map(id => ({ id, supportStrength: id === 'm1' ? support : 0 })) }; },
    generateTutorUtterance: async request => {
      requests.push(request);
      if (request.action === 'instruction.feedback') {
        assert.ok(request.plannerState);
        assert.equal(request.targetType, 'feedback');
        assert.ok(rows.some(row => transition(row).transitionId.endsWith(':assessment')));
        return 'Your answer identifies the relevant idea; here is the correction.';
      }
      if (request.learnerText) {
        assert.ok(rows.some(row => transition(row).transitionId.endsWith(':feedback')));
        assert.ok(request.dialogueHistory?.some(entry => String(entry.text).includes('here is the correction')));
      }
      const explanation = request.moveDefinition.components!.includes('explanation') ? request.realizedInstruction?.explanation ?? 'An explanation of the target.' : null;
      const richContent = request.moveDefinition.components!.includes('richContent') ? request.realizedInstruction?.richContent ?? 'In the worked case, apply the rule to get 4.' : null;
      if (explanation && !request.realizedInstruction?.explanation) await request.onInstructionComponent?.('explanation', explanation);
      if (richContent && !request.realizedInstruction?.richContent) await request.onInstructionComponent?.('richContent', richContent);
      if (failQuestion) throw new Error('question failed');
      const question = request.realizedInstruction?.question ?? 'How does the rule apply to the new case?';
      const choices = request.moveDefinition.responseFormat === 'multiple-choice' ? request.realizedInstruction?.choices ?? [
        { id: 'a', label: 'The rule holds under its specified conditions.', correct: true },
        { id: 'b', label: 'The rule holds under every condition.', correct: false },
        { id: 'c', label: 'The rule never holds.', correct: false },
      ] : undefined;
      if (!request.realizedInstruction?.question) await request.onInstructionComponent?.('question', question, undefined, choices ? { choices } : undefined);
      return { explanation, richContent, question, ...(choices ? { choices } : {}) };
    },
    history: { writeCanonicalHistoryBatch: async records => {
      if (failBatch) throw new Error('assessment write interrupted');
      rows.push(...records);
    }, writeCanonicalHistory: async record => {
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
  const mcAnswer = (id: string, time = timestamp++) => {
    const question = savedSparcChoiceQuestions(replaySparcHistory(rows)).at(-1)!;
    const node = `${String(question.id)}:answer:${id}`;
    return submit({ submittedNodes: { [node]: id }, triggeredBy: node, timestamp: time });
  };
  return { source, rows, requests, submit, answer, choice, mcAnswer, menu, facts, evidence: (value: SparcRetainedEvidence[]) => { evidence = value; }, calls: () => calls,
    scores: (value: number, misconception = 0) => { coverage = value; support = misconception; }, firstTarget: (value: number) => { firstCoverage = value; },
    fail: (value: boolean) => { failQuestion = value; }, failModel: (after?: number) => { failModelAfter = after; },
    failBatch: (value: boolean) => { failBatch = value; } };
}

describe('Dynamic instruction production cycles', () => {
  it('starts at the configured chain endpoint for both categorized policies and skips incidentally covered KCs', async () => {
    for (const version of ['agent', 'student'] as const) {
      const f = fixture(version, false, 'fact');
      const order = ['g', 'c', 'e', 'a', 'b', 'd', 'f'];
      f.source.workingMemoryFacts = [...f.source.workingMemoryFacts!,
        { factType: 'controller.targetSelectionPolicy', slots: { startingKC: 'g' } },
        { factType: 'kcGraph.chain', slots: { startingKC: 'g', order } }];
      await f.submit();
      const target = () => version === 'agent' ? f.requests.at(-1)?.targetId
        : (f.menu()?.slots?.options as { targetId: string }[])[0]?.targetId;
      assert.equal(target(), 'g');
      assert.equal(f.calls(), 0, 'startup must not create an assessment');
      if (version === 'student') await f.choice('question.text');
      f.scores(.9); f.firstTarget(.2); // g/c/e are incidentally covered; a is not.
      if (f.requests.at(-1)?.moveDefinition.responseFormat === 'multiple-choice') await f.mcAnswer('a');
      else await f.answer();
      assert.equal(target(), 'a');
      assert.equal(f.calls(), 1);
    }
  });

  it('binds an unanswered corrected question to its latest saved meaning while preserving the original journal', async () => {
    const f = fixture('student', false, 'model-rule'); await f.answer(); await f.choice('question.multiple-choice');
    const before = JSON.stringify(f.rows);
    const replay = replaySparcHistory(f.rows);
    const question = savedSparcChoiceQuestions(replay).at(-1)!;
    const original = replay.transitions.find(t => t.writes.some(w => (w.value as { node?: { id?: string } })?.node?.id === question.id))!;
    const write = original.writes.find(w => (w.value as { node?: { id?: string } })?.node?.id === question.id)!;
    const corrected = { ...question, value: 'Which complete claim applies?', choices: [
      { id: 'a', label: 'A complete incorrect claim.', correct: false },
      { id: 'b', label: 'A complete corrected claim.', correct: true },
      { id: 'c', label: 'Another complete incorrect claim.', correct: false },
    ] };
    f.rows.push(createSparcStateTransitionHistoryRecord({ core: { TDFId: 'tdf', sessionID: 'session', userId: 'u', levelUnit: 0 },
      transition: { transitionId: 'question-correction', event: { eventId: 'question-correction', type: 'value-changed',
        source: { ...original.event.source, nodeId: String(question.id) }, time: original.event.time + .5 },
        writes: [{ ...write, value: { type: 'append-node', boxId: 'dialogue-flow', node: corrected } }] } }));
    assert.equal(JSON.stringify(f.rows.slice(0, -1)), before);
    const restored = replaySparcHistory(JSON.parse(JSON.stringify(f.rows)));
    const questions = savedSparcChoiceQuestions(restored);
    assert.equal(questions.filter(q => q.id === question.id).length, 1);
    assert.deepEqual(questions.at(-1)?.choices, corrected.choices);
    const facts = progressiveDialogueFacts(restored).filter(fact => fact.factId === question.id);
    assert.equal(facts.length, 1); assert.equal(facts[0]!.slots!.text, corrected.value);
    const shown = applySparcProgressiveNodeOperations([], projectSparcAnsweredQuestionOperations(restored)) as Record<string, unknown>[];
    assert.equal(shown.filter(n => n.id === question.id).length, 1);
    assert.equal(shown.at(-1)?.value, corrected.value);
    await f.mcAnswer('b');
    const response = replaySparcHistory(f.rows).transitions.find(t => t.event.payload?.questionId === question.id)!.event;
    assert.equal(response.payload!.input, 'A complete corrected claim.');
    assert.equal(response.payload!.correct, true);
    assert.equal(response.payload!.choiceId, 'b');
  });
  it('retains change-only descriptive evidence across failed generation and full resume', async () => {
    const f = fixture('agent', false, 'model-rule');
    const evidence: SparcRetainedEvidence = { kind: 'expectation', id: 'a', demonstrated: ['A demonstrated requirement'], incorrect: [], unresolved: ['A remaining requirement'], citations: [] };
    f.evidence([evidence]); f.fail(true);
    await assert.rejects(f.answer(100), /question failed/);
    const changes = () => f.rows.filter(row => transition(row).transitionId.includes(':assessment:evidence:'));
    assert.equal(changes().length, 1); assert.equal(f.calls(), 1);
    f.fail(false); await f.answer(100);
    assert.equal(f.calls(), 1); assert.equal(changes().length, 1);
    assert.equal(f.requests.at(-1)!.historySessionId, 'session');
    const respond = () => f.requests.at(-1)!.moveDefinition.responseFormat === 'multiple-choice' ? f.mcAnswer('a') : f.answer();
    await respond(); assert.equal(changes().length, 1);
    f.evidence([{ ...evidence, unresolved: [] }]); await respond();
    assert.equal(changes().length, 2);
    assert.deepEqual(f.facts().find(fact => fact.factType === 'instructional.evidence')?.slots?.unresolved, []);
  });
  it('journals only changed scores, including misconception activation and repair, with bounded chapter-sized rows', async () => {
    const f = fixture('agent', true, 'model-rule', 24, 20);
    f.scores(0); f.firstTarget(.3);
    await f.answer();
    const changes = () => f.rows.filter(row => transition(row).transitionId.includes(':assessment:score:'));
    const respond = () => f.requests.at(-1)!.moveDefinition.responseFormat === 'multiple-choice' ? f.mcAnswer('a') : f.answer();
    assert.equal(changes().length, 1);
    assert.equal((transition(changes()[0]!).writes[0]!.value as SparcWorkingMemoryFact).factType, 'learningTarget.score');
    const firstCount = f.rows.length;
    await respond();
    assert.equal(changes().length, 1, 'unchanged carried scores must not create score rows');
    assert.ok(f.rows.slice(firstCount).some(row => transition(row).transitionId.endsWith(':assessment')));
    f.scores(0, .7); await respond();
    assert.equal(changes().length, 2);
    f.scores(0, 0); await respond();
    assert.equal(changes().length, 3);
    const repair = transition(changes().at(-1)!).writes[0]!.value as SparcWorkingMemoryFact;
    assert.equal(repair.factType, 'diagnostic.misconceptionScore');
    assert.equal(repair.slots!.supportStrength, 0);
    f.scores(.9); f.firstTarget(.9); await respond();
    assert.equal(changes().length, 27, 'each of the 24 newly changed KCs gets one row');
    assert.ok(f.rows.every(row => Buffer.byteLength(JSON.stringify(row.sparc)) < 16384));
    assert.equal(f.facts().filter(fact => fact.factType === 'learningTarget.score').length, 24);
  });
  it('accepts no partial score state when an assessment batch fails, then resumes accepted assessment without rescoring', async () => {
    const f = fixture('agent', true, 'fact-model', 24, 20);
    f.failBatch(true);
    await assert.rejects(f.answer(100), /assessment write interrupted/);
    assert.equal(f.rows.length, 0);
    f.failBatch(false); f.failModel(2);
    await assert.rejects(f.answer(100), /model write interrupted/);
    assert.equal(f.calls(), 2);
    const acceptedScoreRows = f.rows.filter(row => transition(row).transitionId.includes(':assessment:score:')).length;
    f.failModel(); await f.answer(100);
    assert.equal(f.calls(), 2, 'the accepted assessment must not invoke the provider again');
    assert.equal(f.rows.filter(row => transition(row).transitionId.includes(':assessment:score:')).length, acceptedScoreRows);
    assert.equal(new Set(f.rows.map(row => transition(row).transitionId)).size, f.rows.length);
  });
  it('starts the most central KC without a focal question, assessment, learner turn, or duplicate startup on reload', async () => {
    const f = fixture('agent', false, 'model-rule');
    f.source.nodes = f.source.nodes!.filter(node => (node as { id: string }).id !== 'opening-tutor-message');
    f.source.workingMemoryFacts = (f.source.workingMemoryFacts as SparcWorkingMemoryFact[]).map(fact => fact.slots?.clusterKC === 'b'
      ? { ...fact, slots: { ...fact.slots, centrality: .9 } } : fact);
    f.fail(true);
    await assert.rejects(f.submit(), /question failed/);
    const first = f.requests[0]!;
    assert.equal(first.targetId, 'b');
    assert.ok(first.sourceRuleId?.includes('.expectation.start.'));
    assert.equal(first.problemStatement, 'The lesson topic');
    assert.equal(first.learnerText, '');
    f.fail(false);
    await f.submit();
    assert.equal(f.requests.at(-1)!.sourceRuleId, first.sourceRuleId);
    assert.equal(f.calls(), 0);
    assert.ok(!f.rows.some(row => transition(row).transitionId.includes(':assessment') || transition(row).transitionId.endsWith(':feedback')));
    assert.equal(f.facts().find(fact => fact.factType === 'session.turnState')?.slots?.turnCount, 0);
    assert.ok(!buildSparcDialogueHistory(progressiveDialogueFacts(replaySparcHistory(f.rows))).some(entry => entry.role === 'student'));
    const count = f.rows.length, requests = f.requests.length;
    await f.submit();
    assert.equal(f.rows.length, count);
    assert.equal(f.requests.length, requests);
    if (first.moveDefinition.responseFormat === 'multiple-choice') await f.mcAnswer('a'); else await f.answer();
    assert.equal(f.calls(), 1);
    const afterAnswer = f.rows.length;
    await f.submit();
    assert.equal(f.rows.length, afterAnswer);
  });
  it('offers the initial student menu on the central KC and generates only the chosen move without an assessment', async () => {
    const f = fixture('student', false, 'fact');
    f.source.nodes = f.source.nodes!.filter(node => (node as { id: string }).id !== 'opening-tutor-message');
    await f.submit();
    assert.equal(f.calls(), 0);
    assert.equal(f.requests.length, 0);
    assert.equal((f.menu()!.slots!.options as { targetId: string }[])[0]!.targetId, 'a');
    await f.choice('explanation-question.text');
    assert.equal(f.calls(), 0);
    assert.equal(f.requests.at(-1)!.learnerText, '');
    assert.equal(f.requests.at(-1)!.targetId, 'a');
    const replay = replaySparcHistory(f.rows);
    const displayed = applySparcProgressiveNodeOperations(f.source.nodes, [
      ...collectSparcProgressiveNodeOperations(replay.transitions), ...projectSparcMenuOperations(replay),
    ]) as { id: string }[];
    assert.ok(displayed.findIndex(node => node.id.endsWith(':selected')) < displayed.findIndex(node => node.id.endsWith(':explanation')));
    await f.answer();
    assert.equal(f.calls(), 1);
  });
  it('builds all 210 automatic variants with exact category conditions and the six approved assistance values', () => {
    const rules = createSparcDynamicInstructionRules('agent', true).filter(rule => rule.module === 'dialogue.instructional-competition');
    assert.equal(rules.length, 210);
    assert.equal(new Set(rules.map(rule => rule.id)).size, 210);
    for (const category of SPARC_TARGET_CATEGORIES) {
      const variants = rules.filter(rule => rule.id.endsWith(`.${category}`));
      assert.equal(variants.length, 30);
      assert.ok(variants.every(rule => rule.when.some(condition => 'factType' in condition
        && ['autotutor.expectation', 'autotutor.misconception'].includes(condition.factType)
        && JSON.stringify(condition.slots?.category) === JSON.stringify({ type: 'literal', value: category }))));
    }
    assert.deepEqual(SPARC_CATEGORIZED_MOVE_DEFINITIONS.map(move => move.assistance), [-.25, .25, 1.55, 2.05, 2.52, 3.02]);
  });
  it('routes every student category/composition/format combination to the same composed primitive and retains target transitions', async () => {
    for (const category of SPARC_TARGET_CATEGORIES) for (const option of SPARC_CATEGORIZED_MENU_OPTIONS.filter(option => option.id !== 'next-target')) {
      const f = fixture('student', false, category); await f.answer();
      await assert.rejects(f.answer(), /Select an offered instructional option/);
      assert.equal(f.calls(), 1);
      await f.choice(option.id);
      const request = f.requests.at(-1)!;
      assert.equal(request.action, option.action);
      assert.equal(request.targetId, 'a');
      assert.ok(request.sourceRuleId!.endsWith(`.${category}`));
      for (const aspect of category.split('-')) assert.ok(request.moveDefinition.promptPolicy.includes(`${aspect.toUpperCase()}:`));
      assert.ok(request.moveDefinition.promptPolicy.includes('Strategically integrate as many'));
      assert.equal(f.calls(), 1);
      if (request.moveDefinition.responseFormat === 'multiple-choice') await f.mcAnswer('a'); else await f.answer();
      assert.equal(f.calls(), 2);
      await f.choice('next-target'); assert.equal(f.calls(), 2);
    }
  });
  it('binds MC answers to saved option identities and meanings, rejects stale/modified answers and restores the selected option', async () => {
    for (const id of ['a', 'b']) {
      const f = fixture('student', false, 'model-rule'); await f.answer(); await f.choice('question.multiple-choice');
      assert.equal((f.menu()!.slots!.options as unknown[]).length, 7);
      await assert.rejects(f.answer(), /Select an option/);
      const before = JSON.stringify(savedSparcChoiceQuestions(replaySparcHistory(f.rows)));
      await f.mcAnswer(id);
      assert.equal(f.calls(), 2);
      assert.equal(JSON.stringify(savedSparcChoiceQuestions(replaySparcHistory(f.rows))), before);
      const replay = replaySparcHistory(JSON.parse(JSON.stringify(f.rows)));
      const restored = projectSparcAnsweredQuestionOperations(replay).find(operation => 'node' in operation && operation.node.choices)!;
      assert.ok('node' in restored);
      if ('node' in restored) {
        const answers = sparcQuestionAnswerNodes(restored.node, true).children as Record<string, unknown>[];
        assert.equal(answers.find(choice => choice.selected)?.value, id);
        assert.ok(answers.every(choice => choice.readOnly));
        assert.equal(answers.find(choice => choice.selected)?.label, id === 'a' ? 'The rule holds under its specified conditions.' : 'The rule holds under every condition.');
      }
      const response = replay.transitions.find(entry => entry.event.payload?.choiceId === id)!.event;
      const original = collectSparcProgressiveNodeOperations(replay.transitions);
      const projected = projectSparcAnsweredQuestionOperations(replay);
      assert.deepEqual(projected.map(operation => 'node' in operation ? operation.node.id : operation), original.map(operation => 'node' in operation ? operation.node.id : operation));
      assert.equal(response.type, 'response-submitted');
      assert.equal(response.payload!.correct, id === 'a');
      assert.equal(response.payload!.input, id === 'a' ? 'The rule holds under its specified conditions.' : 'The rule holds under every condition.');
      const dialogue = buildSparcDialogueHistory(progressiveDialogueFacts(replay));
      assert.equal(dialogue.find(entry => entry.text === response.payload!.input)?.responseFormat, 'multiple-choice');
      const retainedRows = f.rows.length;
      await f.submit({ submittedNodes: { [response.source.nodeId]: id }, triggeredBy: response.source.nodeId, timestamp: 500 });
      assert.equal(f.calls(), 2); assert.equal(f.rows.length, retainedRows);
      await assert.rejects(f.submit({ submittedNodes: { [response.source.nodeId]: 'modified' }, triggeredBy: response.source.nodeId, timestamp: 501 }), /binding/);
    }
  });
  it('keeps the selected target, misconception interruption, and feedback-first completion in the categorized agent', async () => {
    for (const category of SPARC_TARGET_CATEGORIES) {
      const f = fixture('agent', false, category); await f.answer();
      assert.equal(f.requests.at(-1)!.targetId, 'a');
      assert.ok(f.requests.at(-1)!.sourceRuleId!.endsWith(`.${category}`));
      const respond = () => f.requests.at(-1)!.moveDefinition.responseFormat === 'multiple-choice' ? f.mcAnswer('b') : f.answer();
      await respond(); assert.equal(f.requests.at(-1)!.targetId, 'a');
      f.scores(.3,.8); await respond(); assert.equal(f.requests.at(-1)!.targetId, 'm1');
      f.scores(.9,0); await respond();
      assert.equal(f.requests.at(-1)!.action, 'instruction.feedback');
      assert.equal(f.facts().find(fact => fact.factType === 'controller.completionState')!.slots!.completed, true);
    }
  });
  it('rejects a missing category at runtime and preserves admin restrictions for the new family', async () => {
    const f = fixture('agent', false, 'fact');
    const targets = f.source.autoTutorTargets as { expectations: { category?: string }[] };
    delete targets.expectations[0]!.category;
    await assert.rejects(f.answer(), /requires category/);
    for (const id of [SPARC_CATEGORIZED_AGENT_POLICY_ID, SPARC_CATEGORIZED_STUDENT_POLICY_ID]) {
      assert.equal(sparcPolicyForAccount(true, id), id);
      assert.throws(() => sparcPolicyForAccount(false, id), /admin account/);
    }
  });
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
    assert.ok(f.rows.findIndex(row => transition(row).transitionId.endsWith(':feedback')) > f.rows.findIndex(row => transition(row).transitionId.endsWith(':assessment')));
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
  it('continues interrupted established instruction on document reload without rescoring or repeating saved feedback and support', async () => {
    for (const version of ['agent', 'student'] as const) {
      const f = fixture(version, false, 'model-rule');
      if (version === 'student') { await f.answer(); f.fail(true); await assert.rejects(f.choice('explanation-rich-question.text', 100), /question failed/); }
      else { f.fail(true); await assert.rejects(f.answer(100), /question failed/); }
      const accepted = f.requests.at(-1)!;
      const counts = () => ({ scores: f.calls(), feedback: f.rows.filter(row => transition(row).transitionId.endsWith(':feedback')).length,
        support: f.rows.filter(row => transition(row).transitionId.endsWith(':primitive:richContent')).length });
      const before = counts(); f.fail(false); await f.submit();
      assert.deepEqual(counts(), before);
      assert.equal(f.requests.at(-1)!.selectedAction.snapshotId, accepted.selectedAction.snapshotId);
      assert.equal(f.requests.at(-1)!.action, accepted.action);
      assert.ok(f.requests.at(-1)!.realizedInstruction?.richContent);
      const rows = f.rows.length; await f.submit(); assert.equal(f.rows.length, rows);
    }
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
    const combined = { ...transition(f.rows[0]!), writes: f.rows.filter(row => /:assessment(?::score:|:model:|$)/.test(transition(row).transitionId)).flatMap(row => transition(row).writes) };
    assert.ok(Buffer.byteLength(JSON.stringify({ ...(f.rows[0]!.sparc as object), stateTransition: combined })) > 16384);
  });
});
