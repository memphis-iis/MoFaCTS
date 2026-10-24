import type { SparcRetainedEvidence } from './sparcEvidenceHistory';
import { strict as assert } from 'node:assert';
import { SPARC_CATEGORIZED_AGENT_POLICY_ID, SPARC_CATEGORIZED_STUDENT_POLICY_ID, sparcPolicyForAccount } from '../../runtime/sparcInstructionalPolicies';
import { SPARC_TARGET_CATEGORIES, isSparcChoiceFormat, type SparcTargetCategory } from '../../runtime/sparcTargetCategories';
import { createSparcDynamicInstructionRules, SPARC_CATEGORIZED_MENU_OPTIONS } from './sparcDynamicInstructionRules';
import { SPARC_CATEGORIZED_MOVE_DEFINITIONS } from './sparcMoveDefinitions';
import { savedSparcQuestions, sparcQuestionAnswerNodes, projectSparcAnsweredQuestionOperations, projectSparcResponseCorrectness, SparcStaleQuestionError } from './sparcMultipleChoiceQuestion';
import { buildSparcDialogueHistory } from './sparcUtteranceRequest';
import { progressiveDialogueFacts } from './sparcWorkingMemoryFacts';
import { createSparcAuthoredDocumentFromTrialDisplay, commitSparcTrialDisplayAutoTutorRules } from './sparcTrialDisplayRuntimeBridge';
import { currentSparcMenu, projectSparcMenuOperations } from './sparcInstructionalCycle';
import { projectSparcInstructionMessages } from './sparcInstructionalPrimitives';
import { applySparcProgressiveNodeOperations, collectSparcProgressiveNodeOperations } from '../../trial-displays/sparc/sparcProgressiveNodes';
import { createEmptySparcReplayState, replaySparcHistory } from './sparcStateReplay';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import { logistic, targetExpectancy } from './sparcCompetitiveSelection';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import type { SparcTrialDisplay, SparcTrialResult } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import type { SparcAuthoredDocument, SparcWorkingMemoryFact, SparcStateTransition } from './sparcSessionContracts';

const transition = (row: CanonicalHistoryRecord) => (row.sparc as { stateTransition: SparcStateTransition }).stateTransition;

function fixture(version: 'student' | 'agent', longIdentities = false, category: SparcTargetCategory = 'model-rule', targetCount = 7, misconceptionCount = 3) {
  const rows: CanonicalHistoryRecord[] = [];
  const requests: SparcUtteranceRequest[] = [];
  const scoredResponses: { learnerText: string; event: SparcStateTransition['event'] }[] = [];
  const ids = Array.from({ length: targetCount }, (_, i) => String.fromCharCode(97 + i)).map(id => longIdentities ? `dynamic.biology-species-speciation-hlw4e-ch21-001.kc.${id}` : id);
  const misconceptionIds = Array.from({ length: misconceptionCount }, (_, i) => `m${i + 1}`);
  const pageKey = longIdentities ? 'sparc-dynamic-confidence-interval-agent-with-seven-long-target-identities' : 'dynamic-cycle';
  const source: SparcTrialDisplay = {
    pageKey, schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
    instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: version === 'student' ? SPARC_CATEGORIZED_STUDENT_POLICY_ID : SPARC_CATEGORIZED_AGENT_POLICY_ID, policyVersion: 1 },
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
  let failScoring = false;
  let failSubmission = false;
  let loseSubmissionAck = false;
  let evidence: SparcRetainedEvidence[] = [];
  let feedbackGate: Promise<void> | undefined;
  let instructionStarted: (() => void) | undefined;
  let beforeQuestion: (() => Promise<void>) | undefined;
  const submit = (result?: SparcTrialResult) => commitSparcTrialDisplayAutoTutorRules({
    core: { userId: 'u', TDFId: 'dynamic', sessionID: 'session', levelUnit: 0 }, pageKey, display: source,
    ...(result ? { result } : {}), priorHistoryRecords: JSON.parse(JSON.stringify(rows)),
    scoreLearnerResponse: response => { calls++; scoredResponses.push({ learnerText: response.learnerText, event: response.event });
      assert.ok(rows.some(row => transition(row).transitionId === `${response.event.eventId}:submission`));
      assert.ok(!response.replayState.transitions.some(entry => entry.event.eventId === response.event.eventId), 'Scoring receives the pre-response context');
      if (failScoring) throw new Error('assessment provider interrupted');
      return { learningTargetScores: ids.map(clusterKC => ({ clusterKC, coverage: clusterKC === ids[0] ? firstCoverage ?? coverage : coverage })),
      evidence, diagnosticMisconceptionScores: misconceptionIds.map(id => ({ id, supportStrength: id === 'm1' ? support : 0 })) }; },
    generateTutorUtterance: async request => {
      requests.push(request);
      if (request.action === 'instruction.feedback') {
        assert.ok(request.plannerState);
        assert.equal(request.targetType, 'feedback');
        assert.ok(rows.some(row => transition(row).transitionId.endsWith(':assessment')));
        await feedbackGate;
        return 'Your answer identifies the relevant idea; here is the correction.';
      }
      instructionStarted?.();
      if (request.learnerText && version === 'student') {
        assert.ok(rows.some(row => transition(row).transitionId.endsWith(':feedback')));
        assert.ok(request.dialogueHistory?.some(entry => String(entry.text).includes('here is the correction')));
      }
      const explanation = request.moveDefinition.components!.includes('explanation') ? request.realizedInstruction?.explanation ?? 'An explanation of the target.' : null;
      const richContent = request.moveDefinition.components!.includes('richContent') ? request.realizedInstruction?.richContent ?? 'In the worked case, apply the rule to get 4.' : null;
      if (explanation && !request.instructionCheckpoint) await request.onInstructionCheckpoint?.({ stage: 'accepted', content: { text: explanation, ...(richContent ? { support: { text: richContent } } : {}) } });
      await beforeQuestion?.();
      if (failQuestion) throw new Error('question failed');
      const question = request.realizedInstruction?.question ?? (request.moveDefinition.responseFormat === 'cloze' ? 'The condition determines whether the _____ applies.' : 'How does the rule apply to the new case?');
      const choices = request.realizedInstruction?.choices ?? (request.moveDefinition.responseFormat === 'true-false' ? [
        { id: 'true', label: 'True', correct: false }, { id: 'false', label: 'False', correct: true },
      ] : request.moveDefinition.responseFormat === 'multiple-choice' ? [
        { id: 'b', label: 'The rule holds under every condition.', correct: false },
        { id: 'c', label: 'The rule never holds.', correct: false },
        { id: 'a', label: 'The rule holds under its specified conditions.', correct: true },
      ] : undefined);
      if (!request.realizedInstruction?.question) await request.onInstructionComponent?.('question', question, undefined, choices ? { choices } : undefined);
      return { explanation, richContent, question, ...(choices ? { choices } : {}) };
    },
    history: { writeCanonicalHistoryBatch: async records => {
      if (failBatch) throw new Error('assessment write interrupted');
      rows.push(...records);
    }, writeCanonicalHistory: async record => {
      if (failSubmission && transition(record).transitionId.endsWith(':submission')) throw new Error('submission storage unavailable');
      if (transition(record).transitionId.includes(':assessment:model:') && failModelAfter !== undefined
        && rows.filter(row => transition(row).transitionId.includes(':assessment:model:')).length >= failModelAfter) throw new Error('model write interrupted');
      rows.push(record);
      if (loseSubmissionAck && transition(record).transitionId.endsWith(':submission')) throw new Error('submission acknowledgement lost');
    } },
  });
  const menu = () => currentSparcMenu(replaySparcHistory(rows));
  const answers = new Map<number, SparcTrialResult>();
  const answer = (time = timestamp++) => {
    const accepted = answers.get(time);
    if (accepted) return submit(accepted);
    const question = isSparcChoiceFormat(requests.at(-1)?.moveDefinition.responseFormat)
      ? savedSparcQuestions(replaySparcHistory(rows)).at(-1) : undefined;
    const optionId = requests.at(-1)?.moveDefinition.responseFormat === 'true-false' ? 'false' : 'a';
    const node = question ? `${String(question.id)}:answer:${optionId}` : 'learner-response-input';
    const result = { submittedNodes: { [node]: question ? optionId : longIdentities ? 'A learner response about constructing and interpreting a confidence interval. '.repeat(8) : 'An answer.' }, triggeredBy: question ? node : 'learner-response-submit', timestamp: time };
    answers.set(time, result);
    return submit(result);
  };
  const choice = (id: string, time = timestamp++, nextKC = false) => {
    const node = `${String(menu()?.slots?.menuId)}:${id}`;
    return submit({ submittedNodes: { [node]: id, ...(nextKC ? { [`${String(menu()?.slots?.menuId)}:next-target`]: 'next-target' } : {}) }, triggeredBy: node, timestamp: time });
  };
  const facts = () => Object.values(replaySparcHistory(rows).cells).map(cell => cell.value as SparcWorkingMemoryFact);
  const mcAnswer = (id: string, time = timestamp++) => {
    const question = savedSparcQuestions(replaySparcHistory(rows)).at(-1)!;
    const node = `${String(question.id)}:answer:${id}`;
    return submit({ submittedNodes: { [node]: id }, triggeredBy: node, timestamp: time });
  };
  return { source, rows, requests, scoredResponses, submit, answer, choice, mcAnswer, menu, facts, evidence: (value: SparcRetainedEvidence[]) => { evidence = value; }, calls: () => calls,
    scores: (value: number, misconception = 0) => { coverage = value; support = misconception; }, firstTarget: (value: number) => { firstCoverage = value; },
    fail: (value: boolean) => { failQuestion = value; }, failModel: (after?: number) => { failModelAfter = after; },
    failBatch: (value: boolean) => { failBatch = value; },
    failScoring: (value: boolean) => { failScoring = value; }, failSubmission: (value: boolean) => { failSubmission = value; },
    loseSubmissionAck: (value: boolean) => { loseSubmissionAck = value; },
    overlap: (gate: Promise<void>, started: () => void) => { feedbackGate = gate; instructionStarted = started; },
    beforeQuestion: (gate: () => Promise<void>) => { beforeQuestion = gate; } };
}

describe('Dynamic instruction production cycles', () => {
  it('recovers a persisted submission after its acknowledgement is lost without saving it twice', async () => {
    const f = fixture('agent'); f.loseSubmissionAck(true);
    await assert.rejects(f.answer(), /acknowledgement lost/);
    assert.equal(f.calls(), 0); assert.equal(f.rows.length, 1);
    f.loseSubmissionAck(false); await f.submit();
    assert.equal(f.calls(), 1);
    assert.equal(f.rows.filter(row => transition(row).transitionId.endsWith(':submission')).length, 1);
  });
  it('resumes existing assessment-owned answers without rewriting their history', async () => {
    const f = fixture('agent'); f.fail(true);
    await assert.rejects(f.answer(), /question failed/);
    const submission = transition(f.rows.find(row => transition(row).transitionId.endsWith(':submission'))!);
    // Representative pre-checkpoint history: the assessment owns the learner node.
    const older = f.rows.filter(row => !transition(row).transitionId.endsWith(':submission')).map(row => {
      if (!transition(row).transitionId.endsWith(':assessment')) return row;
      return { ...row, sparc: { ...row.sparc as object, stateTransition: {
        ...transition(row), writes: [...transition(row).writes, submission.writes[0]!],
      } } };
    });
    f.rows.splice(0, f.rows.length, ...JSON.parse(JSON.stringify(older)));
    const original = JSON.stringify(f.rows);
    f.fail(false); await f.submit();
    assert.equal(f.calls(), 1);
    assert.equal(JSON.stringify(f.rows.slice(0, older.length)), original);
    assert.ok(!f.rows.some(row => transition(row).transitionId.endsWith(':submission')));
    assert.equal(progressiveDialogueFacts(replaySparcHistory(f.rows)).filter(fact => fact.slots?.speaker === 'learner').length, 1);
  });
  for (const version of ['agent', 'student'] as const) {
    it(`restores a submitted text answer before assessment and resumes it on document load (${version})`, async () => {
      const f = fixture(version);
      f.failSubmission(true);
      await assert.rejects(f.answer(100), /submission storage unavailable/);
      assert.equal(f.calls(), 0); assert.equal(f.rows.length, 0);
      f.failSubmission(false); f.failScoring(true);
      await assert.rejects(f.answer(100), /assessment provider interrupted/);
      assert.equal(f.rows.length, 1);
      const submission = transition(f.rows[0]!);
      assert.equal(submission.event.payload?.input, 'An answer.');
      const restored = replaySparcHistory(JSON.parse(JSON.stringify(f.rows)));
      assert.equal(progressiveDialogueFacts(restored).filter(f => f.slots?.speaker === 'learner').length, 1);
      assert.ok(!Object.values(restored.cells).some(cell => (cell.value as SparcWorkingMemoryFact)?.factType === 'session.turnState'));
      await assert.rejects(f.submit({ submittedNodes: { 'learner-response-input': 'Changed answer' }, timestamp: 101 }), /Conflicting submission/);
      f.failScoring(false);
      await f.submit();
      assert.equal(f.calls(), 2, 'Only the interrupted evaluation is repeated');
      assert.equal(f.rows.filter(row => transition(row).transitionId.endsWith(':submission')).length, 1);
      assert.equal(progressiveDialogueFacts(replaySparcHistory(f.rows)).filter(f => f.slots?.speaker === 'learner').length, 1);
      assert.equal(f.facts().find(f => f.factType === 'session.turnState')?.slots?.turnCount, 1);
      const count = f.rows.length;
      await f.submit();
      assert.equal(f.rows.length, count); assert.equal(f.calls(), 2);
    });
  }
  it('restores an accepted choice and its support while assessment is unfinished', async () => {
    const f = fixture('student', false, 'rule');
    await f.answer(); await f.choice('explanation-rich-question.multiple-choice');
    const before = savedSparcQuestions(replaySparcHistory(f.rows));
    const question = before.at(-1)!;
    f.failScoring(true);
    await assert.rejects(f.mcAnswer('b'), /assessment provider interrupted/);
    const replay = replaySparcHistory(JSON.parse(JSON.stringify(f.rows)));
    assert.deepEqual(savedSparcQuestions(replay), before);
    const shown = projectSparcAnsweredQuestionOperations(replay).find(op => 'node' in op && op.node.id === question.id)!;
    assert.ok('node' in shown);
    assert.equal(shown.node.selectedChoiceId, 'b'); assert.equal(shown.node.readOnly, true);
    const accepted = f.rows.slice();
    f.failScoring(false); await f.submit();
    assert.deepEqual(f.rows.slice(0, accepted.length), accepted);
    assert.equal(f.scoredResponses.at(-1)!.event.payload?.questionId, question.id);
    assert.equal(f.scoredResponses.at(-1)!.learnerText, 'The rule holds under every condition.');
  });
  it('diagnoses a rejected old choice after an MC-to-cloze transition without retaining response text', async () => {
    const f = fixture('student', false, 'rule');
    await f.answer(); await f.choice('explanation-rich-question.multiple-choice');
    const old = savedSparcQuestions(replaySparcHistory(f.rows)).at(-1)!;
    await f.mcAnswer('a'); await f.choice('explanation-rich-question.cloze');
    const replay = replaySparcHistory(f.rows);
    const current = savedSparcQuestions(replay).at(-1)!;
    const nodeId = `${String(old.id)}:answer:b`;
    const count = f.rows.length;
    await assert.rejects(f.submit({ submittedNodes: { [nodeId]: 'b' }, triggeredBy: nodeId, timestamp: 500 }), error => {
      assert.ok(error instanceof SparcStaleQuestionError);
      assert.equal(error.message, 'Stale multiple-choice question');
      assert.deepEqual(error.diagnostic, { submittedNodeId: nodeId, submittedQuestionId: old.id,
        currentQuestionId: current.id, submittedQuestionTurnEventId: old.turnEventId,
        currentCycleEventId: current.turnEventId, questionIsLatest: false, questionMatchesCycle: false,
        questionAlreadyAnswered: true, transitionCount: replay.transitions.length });
      return true;
    });
    assert.equal(f.rows.length, count);
  });
  for (const version of ['agent', 'student'] as const) for (const targetCount of [1, 7, 32]) for (const startup of [false, true]) for (const resumedFirst of [false, true]) {
    it(`journals identical overlapping ${version} ${startup ? 'startup' : 'response'} continuations with ${targetCount} targets when ${resumedFirst ? 'resume' : 'original'} finishes first`, async () => {
      const f = fixture(version, false, 'model-rule', targetCount, targetCount === 32 ? 24 : 0);
      f.scores(.4); f.firstTarget(.45);
      for (const fact of f.source.workingMemoryFacts as SparcWorkingMemoryFact[]) {
        const slots = fact.slots as Record<string, unknown>;
        if (fact.factType === 'kcGraph.node') slots.centrality = (String(slots.clusterKC).charCodeAt(0) % 7 + 1) / 10;
        if (fact.factType === 'kcGraph.relationship') slots.strength = ((String(slots.sourceClusterKC).charCodeAt(0) + String(slots.targetClusterKC).charCodeAt(0)) % 8 + 1) / 10;
      }
      const releases: (() => void)[] = [];
      const waiters: (() => void)[] = [];
      const waitFor = async (count: number) => { while (releases.length < count) await new Promise<void>(resolve => waiters.push(resolve)); };
      if (version === 'student') await (startup ? f.submit() : f.answer());
      f.beforeQuestion(() => new Promise<void>(resolve => { releases.push(resolve); waiters.shift()?.(); }));
      const original = version === 'student' ? f.choice('explanation-question.cloze') : startup ? f.submit() : f.answer();
      await waitFor(1);
      const resumed = f.submit();
      try {
        await waitFor(2);
        releases[resumedFirst ? 1 : 0]!();
        await (resumedFirst ? resumed : original);
        releases[resumedFirst ? 0 : 1]!();
        await Promise.all([original, resumed]);
        const accepted = new Map<string, CanonicalHistoryRecord>();
        const repeated: string[] = [];
        for (const row of f.rows) {
          const id = transition(row).transitionId;
          const prior = accepted.get(id);
          if (prior) { assert.deepEqual(row, prior, `Retry must preserve the entire ${id} history record`); repeated.push(id); }
          else accepted.set(id, row);
        }
        assert.equal(repeated.filter(id => id.endsWith(':primitive:question')).length, 1);
        assert.equal(repeated.filter(id => id.endsWith(':cycle')).length, 1);
        assert.equal(f.calls(), startup ? 0 : 1, 'Resume must not assess the response again');
        assert.doesNotThrow(() => replaySparcHistory(f.rows));
      } finally {
        for (const release of releases) release();
        await Promise.allSettled([original, resumed]);
      }
    });
  }

  it('starts agent instruction while feedback runs and saves feedback before instruction', async () => {
    const f = fixture('agent');
    let release!: () => void;
    let started!: () => void;
    const instruction = new Promise<void>(resolve => { started = resolve; });
    f.overlap(new Promise<void>(resolve => { release = resolve; }), started);
    const turn = f.answer();
    try {
      await instruction;
      assert.equal(f.rows.some(row => transition(row).transitionId.endsWith(':feedback')), false);
      assert.equal(f.rows.some(row => transition(row).transitionId.includes(':primitive:')), false);
    } finally { release(); }
    await turn;
    const feedback = f.rows.findIndex(row => transition(row).transitionId.endsWith(':feedback'));
    const primitive = f.rows.findIndex(row => transition(row).transitionId.includes(':primitive:'));
    assert.ok(feedback >= 0 && primitive > feedback);
  });
  it('keeps instruction hidden after feedback fails and resumes the saved decision without rescoring', async () => {
    const f = fixture('agent');
    let rejectFeedback!: (error: Error) => void;
    let started!: () => void;
    const instruction = new Promise<void>(resolve => { started = resolve; });
    f.overlap(new Promise<void>((_resolve, reject) => { rejectFeedback = reject; }), started);
    const turn = f.answer(100);
    await instruction;
    rejectFeedback(new Error('feedback unavailable'));
    await assert.rejects(turn, /feedback unavailable/);
    assert.equal(f.rows.some(row => transition(row).transitionId.includes(':primitive:')), false);
    const selected = f.requests.find(request => request.action !== 'instruction.feedback')!;
    f.overlap(Promise.resolve(), () => {});
    await f.answer(100);
    assert.equal(f.calls(), 1);
    assert.equal(f.requests.at(-1)!.action, selected.action);
    assert.equal(f.requests.at(-1)!.targetId, selected.targetId);
  });
  it('binds typed cloze completions to the saved statement and retains raw evidence and format across replay', async () => {
    const f = fixture('student', false, 'fact'); await f.answer(); await f.choice('question.cloze');
    const question = savedSparcQuestions(replaySparcHistory(f.rows)).at(-1)!;
    await assert.rejects(f.submit({ submittedNodes: { 'learner-response-input': '   ' }, triggeredBy: 'learner-response-submit', timestamp: 400 }), /exactly one answerable/);
    await f.submit({ submittedNodes: { 'learner-response-input': 'polymorhpism' }, triggeredBy: 'learner-response-submit', timestamp: 401 });
    assert.equal(f.scoredResponses.at(-1)!.learnerText, 'polymorhpism');
    assert.equal(f.scoredResponses.at(-1)!.event.payload!.questionId, question.id);
    assert.equal(f.scoredResponses.at(-1)!.event.payload!.responseFormat, 'cloze');
    const history = buildSparcDialogueHistory(progressiveDialogueFacts(replaySparcHistory(JSON.parse(JSON.stringify(f.rows)))));
    const learner = history.filter(entry => entry.role === 'student').at(-1)!;
    assert.equal(learner.responseFormat, 'cloze'); assert.equal(learner.text, 'polymorhpism');
    assert.equal(history.find(entry => entry.responseId === question.id)!.responseFormat, 'cloze');
  });
  it('binds both true/false judgments by ID and restores their fixed order and selected state', async () => {
    for (const id of ['true', 'false']) {
      const f = fixture('student', false, 'rule'); await f.answer(); await f.choice('question.true-false');
      const question = savedSparcQuestions(replaySparcHistory(f.rows)).at(-1)!;
      await assert.rejects(f.submit({ submittedNodes: { 'learner-response-input': 'False' }, triggeredBy: 'learner-response-submit', timestamp: 400 }), /Select an option/);
      await f.mcAnswer(id, 401);
      const response = f.scoredResponses.at(-1)!;
      assert.equal(response.learnerText, id === 'true' ? 'True' : 'False');
      assert.equal(response.event.payload!.responseFormat, 'true-false');
      assert.equal(response.event.payload!.correct, id === 'false');
      const replay = replaySparcHistory(JSON.parse(JSON.stringify(f.rows)));
      const operation = projectSparcAnsweredQuestionOperations(replay).find(op => 'node' in op && op.node.id === question.id)!;
      assert.ok('node' in operation);
      if ('node' in operation) {
        const buttons = sparcQuestionAnswerNodes(operation.node, true).children as Record<string, unknown>[];
        assert.deepEqual(buttons.map(button => button.label), ['True', 'False']);
        assert.equal(buttons.find(button => button.selected)!.value, id);
        const review = projectSparcResponseCorrectness(createSparcAuthoredDocumentFromTrialDisplay({ pageKey: f.source.pageKey!, display: f.source }), replay);
        assert.equal(review[`${String(question.id)}:answer:${id}::correctness`], id === 'false' ? 'correct' : 'incorrect');

      }
      assert.equal(buildSparcDialogueHistory(progressiveDialogueFacts(replay)).filter(entry => entry.role === 'student').at(-1)!.responseFormat, 'true-false');
      await f.choice('question.true-false');
      const staleId = id === 'true' ? 'false' : 'true';
      const staleNode = `${String(question.id)}:answer:${staleId}`;
      await assert.rejects(f.submit({ submittedNodes: { [staleNode]: staleId }, triggeredBy: staleNode, timestamp: 402 }), /Stale/);
    }
  });
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
    const question = savedSparcQuestions(replay).at(-1)!;
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
    const questions = savedSparcQuestions(restored);
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
    f.scores(.3);
    f.failBatch(true);
    await assert.rejects(f.answer(100), /assessment write interrupted/);
    assert.equal(f.rows.length, 1);
    assert.ok(transition(f.rows[0]!).transitionId.endsWith(':submission'), 'The answer survives without any partial assessment');
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
  it('builds all 560 automatic variants with exact category conditions and the shared assistance values for written and visual support', () => {
    const rules = createSparcDynamicInstructionRules('agent').filter(rule => rule.module === 'dialogue.instructional-competition');
    assert.equal(rules.length, 560);
    assert.equal(new Set(rules.map(rule => rule.id)).size, 560);
    for (const category of SPARC_TARGET_CATEGORIES) {
      const variants = rules.filter(rule => rule.id.endsWith(`.${category}`));
      assert.equal(variants.length, 80);
      assert.ok(variants.every(rule => rule.when.some(condition => 'factType' in condition
        && ['autotutor.expectation', 'autotutor.misconception'].includes(condition.factType)
        && JSON.stringify(condition.slots?.category) === JSON.stringify({ type: 'literal', value: category }))));
    }
    assert.deepEqual(SPARC_CATEGORIZED_MOVE_DEFINITIONS.map(move => move.assistance), [.5, .75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 2.5, 2.75, 3, 3.25]);
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
      assert.ok(request.moveDefinition.promptPolicy.includes('The KC text identifies the knowledge; its assigned KLI category supplies the learning-process focus'));
      assert.ok(request.moveDefinition.promptPolicy.includes('Combine every selected category focus'));
      assert.equal(f.calls(), 1);
      await f.answer();
      assert.equal(f.calls(), 2);
      await f.choice('next-target'); assert.equal(f.calls(), 2);
    }
  });
  it('binds MC answers to saved option identities and meanings, rejects stale/modified answers and restores the selected option', async () => {
    for (const id of ['a', 'b']) {
      const f = fixture('student', false, 'model-rule'); await f.answer(); await f.choice('question.multiple-choice');
      assert.equal((f.menu()!.slots!.options as unknown[]).length, 17);
      await assert.rejects(f.submit({ submittedNodes: { 'learner-response-input': 'A typed answer.' }, triggeredBy: 'learner-response-submit', timestamp: 999 }), /Select an option/);
      const before = JSON.stringify(savedSparcQuestions(replaySparcHistory(f.rows)));
      await f.mcAnswer(id);
      assert.equal(f.calls(), 2);
      assert.equal(JSON.stringify(savedSparcQuestions(replaySparcHistory(f.rows))), before);
      const replay = replaySparcHistory(JSON.parse(JSON.stringify(f.rows)));
      const restored = projectSparcAnsweredQuestionOperations(replay).find(operation => 'node' in operation && operation.node.choices)!;
      assert.ok('node' in restored);
      if ('node' in restored) {
        const answers = sparcQuestionAnswerNodes(restored.node, true).children as Record<string, unknown>[];
        assert.deepEqual(answers.map(choice => choice.value), ['b', 'c', 'a']);
        assert.equal(answers.find(choice => choice.selected)?.value, id);
        assert.ok(answers.every(choice => choice.readOnly));
        assert.equal(answers.find(choice => choice.selected)?.label, id === 'a' ? 'The rule holds under its specified conditions.' : 'The rule holds under every condition.');
      }
      const response = replay.transitions.find(entry => entry.event.payload?.choiceId === id)!.event;
      const review = projectSparcResponseCorrectness(createSparcAuthoredDocumentFromTrialDisplay({ pageKey: f.source.pageKey!, display: f.source }), replay);
      assert.equal(review[`${String(restored.node.id)}:answer:${id}::correctness`], id === 'a' ? 'correct' : 'incorrect');
      assert.equal(review[`${response.eventId}:learner::correctness`], undefined);
      assert.equal(Object.keys(review).filter(key => key.includes(':answer:')).length, 1);

      const original = collectSparcProgressiveNodeOperations(replay.transitions);
      const projected = projectSparcAnsweredQuestionOperations(replay);
      assert.ok(original.some(operation => 'node' in operation && operation.node.id === `${response.eventId}:learner`), 'Canonical learner evidence remains recorded');
      assert.deepEqual(projected.map(operation => 'node' in operation ? operation.node.id : operation), original
        .filter(operation => !('node' in operation) || operation.node.id !== `${response.eventId}:learner`)
        .map(operation => 'node' in operation ? operation.node.id : operation));
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
      const respond = () => f.answer();
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
  it('keeps next-KC navigation separate from instruction and evaluation', async () => {
    const f = fixture('student'); await f.answer();
    const first = (f.menu()!.slots!.options as { targetId: string }[])[0]!.targetId;
    await f.choice('next-target');
    const next = (f.menu()!.slots!.options as { targetId: string }[])[0]!.targetId;
    assert.notEqual(next, first); assert.equal(f.calls(), 1); assert.equal(f.requests.length, 1);
    await f.choice('question.text'); assert.equal(f.requests.at(-1)!.targetId, next);
  });
  it('generates every chosen move on the offered next KC in one event, without another menu or assessment', async () => {
    for (const option of SPARC_CATEGORIZED_MENU_OPTIONS.filter(entry => entry.id !== 'next-target')) {
      const f = fixture('student'); await f.submit();
      const offered = f.menu()!.slots!.options as { id: string; targetId: string }[];
      const next = offered.find(entry => entry.id === 'next-target')!.targetId;
      assert.notEqual(next, offered[0]!.targetId);
      await f.choice(option.id, 100, true);
      assert.equal(f.calls(), 0);
      assert.equal(f.requests.length, 1);
      assert.equal(f.requests[0]!.action, option.action);
      assert.equal(f.requests[0]!.targetId, next);
      assert.equal(f.menu()!.slots!.status, 'consumed');
      await f.submit();
      assert.equal(f.requests.length, 1, 'Completed combined choice must not generate twice on reload');
    }
  });
  it('restores and retries the chosen move and next KC after generation fails', async () => {
    const f = fixture('student'); await f.submit();
    const next = (f.menu()!.slots!.options as { id: string; targetId: string }[]).find(entry => entry.id === 'next-target')!.targetId;
    f.fail(true);
    await assert.rejects(f.choice('explanation-rich-question.text', 100, true), /question failed/);
    const projected = projectSparcMenuOperations(replaySparcHistory(f.rows));
    const menu = projected.find(operation => operation.type === 'insert-node' && operation.node.id === 'instructional-choice-menu');
    assert.ok(menu && menu.type === 'insert-node');
    const selected = menu.node.children as { optionId: string; selected: boolean }[];
    assert.deepEqual(selected.filter(option => option.selected).map(option => option.optionId), ['explanation-rich-question.text', 'next-target']);
    await assert.rejects(f.choice('explanation-rich-question.text', 101, false), /Conflicting instructional choice target/);
    f.fail(false); await f.submit();
    assert.equal(f.requests.at(-1)!.targetId, next);
    assert.equal(f.requests.at(-1)!.action, 'instruction.dynamic.explanation-rich-question.text');
    assert.equal(f.calls(), 0);
  });
  it('uses fixed 80 percent competition, keeps the floor, and does not ramp OET', async () => {
    const f = fixture('agent'); f.scores(0); await f.answer();
    const request = f.requests.at(-1)!;
    assert.ok(Math.abs(request.competition!.oetLogit! - Math.log(4)) < 1e-9);
    assert.ok(Math.abs(logistic(targetExpectancy(f.facts(), 'expectation:a')) - .2) < 1e-9);
    assert.equal(f.facts().some(fact => fact.factType === 'instructional.oet' && Number(fact.slots?.logit) > -Math.log(4)), false);
    if (request.moveDefinition.responseFormat === 'multiple-choice') await f.mcAnswer('a'); else await f.answer();
    assert.equal(f.requests.at(-1)!.competition!.oetLogit, request.competition!.oetLogit);
  });
  it('automatically advances from a covered expectation to an unfinished expectation', async () => {
    const f = fixture('student'); await f.answer(); await f.choice('question.text');
    f.firstTarget(.9); await f.answer();
    assert.equal((f.menu()!.slots!.options as { targetId: string }[])[0]!.targetId, 'b');
    await f.choice('question.text'); assert.equal(f.requests.at(-1)!.targetId, 'b');
  });
  it('excludes covered expectations when selecting the first expectation after feedback', async () => {
    const f = fixture('student'); f.firstTarget(1); await f.answer();
    assert.equal((f.menu()!.slots!.options as { targetId: string }[])[0]!.targetId, 'b');
  });
  it('presents each composite as one message and preserves selected buttons between feedback and instruction after replay', async () => {
    const f = fixture('student'); await f.answer(); await f.choice('explanation-rich-question.text');
    const replay = replaySparcHistory(JSON.parse(JSON.stringify(f.rows)));
    const nodes = applySparcProgressiveNodeOperations([], [
      ...collectSparcProgressiveNodeOperations(replay.transitions), ...projectSparcMenuOperations(replay),
    ]) as Record<string, unknown>[];
    const messages = projectSparcInstructionMessages(nodes.filter(node => node.atomType === 'dialogue-utterance'
      || node.atomType === 'html-block' || node.groupType === 'button-group'));
    const index = messages.findIndex(node => node.action === 'instruction.dynamic.explanation-rich-question.text');
    assert.equal(messages.filter(node => node.action === 'instruction.dynamic.explanation-rich-question.text').length, 1);
    assert.equal((messages[index]!.children as unknown[]).length, 3);
    assert.ok(String(messages[index - 1]!.id).endsWith(':selected'), JSON.stringify(messages.map(node => node.id)));
    const button = (messages[index - 1]!.children as Record<string, unknown>[])[0]!;
    assert.equal(button.label, 'Explanation with written example or comparison and question (text answer)');
    assert.equal(button.selected, true); assert.equal(button.readOnly, true);
    await f.answer(); await f.choice('next-target'); await f.choice('question.text');
    const markers = projectSparcMenuOperations(replaySparcHistory(f.rows)).filter(operation => operation.type === 'insert-node' && String(operation.node.id).endsWith(':selected'));
    assert.equal(markers.length, 3);
  });
  it('reconstructs completed same/next KC choices from saved offers and event targets without rewriting history', async () => {
    for (const nextKC of [false, true]) {
      const f = fixture('student'); await f.submit();
      await f.choice('explanation-visual-question.cloze', 100, nextKC);
      await f.answer();
      const saved = JSON.parse(JSON.stringify(f.rows));
      const before = JSON.stringify(saved);
      const operations = projectSparcMenuOperations(replaySparcHistory(saved));
      const marker = operations.find(operation => operation.type === 'insert-node' && String(operation.node.id).endsWith(':selected'));
      assert.ok(marker && marker.type === 'insert-node');
      const choices = marker.node.children as { value: string; selected: boolean; readOnly: boolean }[];
      assert.deepEqual(choices.map(choice => choice.value), ['explanation-visual-question.cloze', ...(nextKC ? ['next-target'] : [])]);
      assert.ok(choices.every(choice => choice.selected && choice.readOnly));
      assert.equal(JSON.stringify(saved), before);
    }
  });
  it('displays explanation before support even when support was realized and saved first', () => {
    const action = 'instruction.dynamic.explanation-rich-question.text';
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
      if (version === 'student') await f.choice('question.text');
      f.scores(.2, .8); await f.answer();
      if (version === 'student') await f.choice('explanation-question.text');
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
  it('journals and replays the paired display nodes in one accepted instruction transition', async () => {
    const f = fixture('student'); await f.answer(); f.fail(true);
    await assert.rejects(f.choice('explanation-rich-question.text', 100), /question failed/);
    const accepted = f.rows.map(transition).filter(row => row.transitionId.endsWith(':instruction:accepted'));
    assert.equal(accepted.length, 1);
    const nodes = accepted[0]!.writes.filter(write => write.key !== 'instructionalComposition').map(write => (write.value as { node: { component: string } }).node);
    assert.deepEqual(nodes.map(node => node.component), ['explanation', 'richContent']);
    assert.ok(!f.rows.some(row => /:primitive:(explanation|richContent)$/.test(transition(row).transitionId)));
    f.fail(false); await f.submit();
    assert.equal(f.rows.filter(row => transition(row).transitionId.endsWith(':instruction:accepted')).length, 1);
    assert.equal(f.requests.at(-1)!.instructionCheckpoint?.stage, 'accepted');
  });
  it('resumes the selected components and feedback without another score or selection', async () => {
    const f = fixture('agent'); f.fail(true);
    await assert.rejects(f.answer(100), /question failed/);
    const original = f.requests.at(-1)!;
    const savedComponents = original.moveDefinition.components!.filter(component => component !== 'question');
    if (savedComponents.length) assert.equal(f.rows.filter(row => transition(row).transitionId.endsWith(':instruction:accepted')).length, 1);
    f.fail(false); await f.answer(100);
    assert.equal(f.calls(), 1);
    assert.equal(f.requests.filter(request => request.action === 'instruction.feedback').length, 1);
    assert.equal(f.requests.at(-1)!.action, original.action);
    for (const component of savedComponents) {
      assert.ok(f.requests.at(-1)!.realizedInstruction?.[component]);
      assert.equal(f.rows.filter(row => transition(row).transitionId.endsWith(':instruction:accepted')).length, 1);
    }
  });
  it('continues interrupted established instruction on document reload without rescoring or repeating saved feedback and support', async () => {
    for (const version of ['agent', 'student'] as const) {
      const f = fixture(version, false, 'model-rule');
      if (version === 'student') { await f.answer(); f.fail(true); await assert.rejects(f.choice('explanation-rich-question.text', 100), /question failed/); }
      else { f.fail(true); await assert.rejects(f.answer(100), /question failed/); }
      const accepted = f.requests.at(-1)!;
      const counts = () => ({ scores: f.calls(), feedback: f.rows.filter(row => transition(row).transitionId.endsWith(':feedback')).length,
        support: f.rows.filter(row => transition(row).transitionId.endsWith(':instruction:accepted')).length });
      const before = counts(); f.fail(false); await f.submit();
      assert.deepEqual(counts(), before);
      assert.equal(f.requests.at(-1)!.selectedAction.snapshotId, accepted.selectedAction.snapshotId);
      assert.equal(f.requests.at(-1)!.action, accepted.action);
      for (const component of accepted.moveDefinition.components!.filter(component => component !== 'question')) {
        assert.ok(f.requests.at(-1)!.realizedInstruction?.[component]);
      }
      const rows = f.rows.length; await f.submit(); assert.equal(f.rows.length, rows);
    }
  });
  it('retains the selected history button and permits retry only of the accepted student choice after failure', async () => {
    const f = fixture('student'); await f.answer(); f.fail(true);
    await assert.rejects(f.choice('explanation-rich-question.text', 100), /question failed/);
    const operations = projectSparcMenuOperations(replaySparcHistory(f.rows));
    const active = operations.find(operation => operation.type === 'insert-node' && operation.node.id === 'instructional-choice-menu');
    assert.ok(active && active.type === 'insert-node');
    const buttons = active.node.children as Record<string, unknown>[];
    assert.deepEqual(buttons.filter(button => !button.readOnly).map(button => button.value), ['explanation-rich-question.text']);
    f.fail(false); await f.choice('explanation-rich-question.text', 100);
    assert.equal(f.calls(), 1);
    assert.equal(projectSparcMenuOperations(replaySparcHistory(f.rows)).filter(operation => operation.type === 'insert-node' && String(operation.node.id).endsWith(':selected')).length, 1);
  });
  it('bounds seven-target model updates and resumes interrupted persistence without rescoring or duplicate gains', async () => {
    const f = fixture('agent', true); f.scores(.3); f.failModel(2);
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


describe('SPARC historical response review', () => {
  const document: SparcAuthoredDocument = { id: 'review', schemaVersion: 2,
    root: { id: 'root', kind: 'document', children: [] },
    workingMemoryFacts: [
      { factType: 'learningTarget.score', slots: { clusterKC: 'kc', coverage: .4 } },
      { factType: 'diagnostic.misconceptionScore', slots: { id: 'm', supportStrength: .7 } },
    ] };
  const score = (kind: 'expectation' | 'misconception', value: number) => ({ target: { pageKey: 'review', nodeId: 'root' },
    key: `workingMemoryFact:${kind}`, value: kind === 'expectation'
      ? { factType: 'learningTarget.score', slots: { clusterKC: 'kc', coverage: value } }
      : { factType: 'diagnostic.misconceptionScore', slots: { id: 'm', supportStrength: value } } });
  const response = (id: string, suffix: string, writes: SparcStateTransition['writes'], format = 'text'): SparcStateTransition => ({
    transitionId: `${id}:${suffix}`, event: { eventId: id, type: 'response-submitted', time: 1,
      source: { pageKey: 'review', nodeId: 'learner-response-input' }, payload: { input: 'Synthetic answer', responseFormat: format } }, writes });
  const review = (transitions: SparcStateTransition[]) => projectSparcResponseCorrectness(document, { ...createEmptySparcReplayState(), transitions });
  it('colors any positive gain, repairs, unchanged and worsening assessments by their own saved values', () => {
    const transitions = [
      response('small', 'assessment:score:expectation:kc', [score('expectation', .401)]),
      response('small', 'assessment', []),
      response('same', 'assessment', []),
      response('repair', 'dialogue-turn', [score('expectation', .401), score('misconception', .6)], 'cloze'),
      response('worse', 'assessment:score:misconception:m', [score('misconception', .8)]),
      response('worse', 'assessment', []),
      response('later', 'assessment', [score('expectation', .9)]),
    ];
    const expected = { 'small:learner::correctness': 'correct', 'same:learner::correctness': 'incorrect',
      'repair:learner::correctness': 'correct', 'worse:learner::correctness': 'incorrect', 'later:learner::correctness': 'correct' };
    assert.deepEqual(review(transitions), expected);
    assert.deepEqual(review(JSON.parse(JSON.stringify(transitions))), expected);
    assert.deepEqual(review(transitions.slice(0, -1)), Object.fromEntries(Object.entries(expected).filter(([key]) => !key.startsWith('later:'))));
  });
  it('leaves pending and unassessed history neutral and colors the atomic checkpoint after retry', () => {
    const pending = response('pending', 'decision', []);
    const changed = response('pending', 'assessment:score:expectation:kc', [score('expectation', .5)]);
    assert.deepEqual(review([pending]), {});
    assert.deepEqual(review([pending, changed]), {});
    assert.deepEqual(review([response('old', 'dialogue-turn', [])]), {});
    assert.deepEqual(review([pending, changed, response('pending', 'assessment', [])]), { 'pending:learner::correctness': 'correct' });
  });
  it('uses authored initial scores and treats missing first-response scores as the runtime zero baseline', () => {
    assert.deepEqual(review([response('initial', 'dialogue-turn', [score('expectation', .4), score('misconception', .7)])]), { 'initial:learner::correctness': 'incorrect' });
    const fresh = { ...document, workingMemoryFacts: [] };
    assert.deepEqual(projectSparcResponseCorrectness(fresh, { ...createEmptySparcReplayState(), transitions: [response('fresh', 'dialogue-turn', [score('expectation', .01)])] }), { 'fresh:learner::correctness': 'correct' });
  });
});
