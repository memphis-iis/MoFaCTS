import { SPARC_INSTRUCTIONAL_COMPETITION_MODULE } from '../../../../../../learning-components/units/sparcsession/sparcCompetitiveSelection';
import { resolveSparcAccountPolicy } from './sparcController';
import { SPARC_INSTRUCTIONAL_POLICY_IDS } from '../../../../../../learning-components/runtime/sparcInstructionalPolicies';
import { currentSparcMenu } from '../../../../../../learning-components/units/sparcsession/sparcInstructionalCycle';
import { strict as assert } from 'node:assert';
import { commitSparcAutoTutorSubmit, commitSparcAutoTutorDocumentLoad } from './sparcAutoTutorRuleCommit';
import { clearSparcRuntimeState, hydrateSparcRuntimeHistory, readSparcResumeSnapshot } from './sparcRuntimeState';
import { buildSparcAutoTutorProgressSnapshot } from './sparcAutoTutorProgress';
import { SparcStaleQuestionError } from '../../../../../../learning-components/units/sparcsession/sparcMultipleChoiceQuestion';
import type { SparcStaleQuestionWarning } from '../../../../../common/recoverableWarnings';
import { commitSparcTrialDisplayAutoTutorRules } from '../../../../../../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge';
import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import type { SparcInstructionComponents } from '../../../../../../learning-components/units/sparcsession/sparcInstructionalPrimitives';

function instructionFixture(request: SparcUtteranceRequest): SparcInstructionComponents {
  const components = request.moveDefinition.components!;
  const format = request.moveDefinition.responseFormat!;
  const questions = {
    text: 'Which case meets the condition?',
    cloze: 'The case meeting the condition is _____.',
    'multiple-choice': 'Which case meets the condition?',
    'true-false': 'Case A meets the condition.',
  };
  return {
    explanation: components.includes('explanation') ? 'An explanation of the condition.' : null,
    richContent: components.includes('richContent') ? 'A complete worked example.' : null,
    question: questions[format],
    ...(format === 'true-false' ? { choices: [
      { id: 'true', label: 'True', correct: true }, { id: 'false', label: 'False', correct: false },
    ] } : format === 'multiple-choice' ? { choices: [
      { id: 'a', label: 'Case A', correct: true }, { id: 'b', label: 'Case B', correct: false }, { id: 'c', label: 'Neither case', correct: false },
    ] } : {}),
  };
}

describe('SPARC app instructional commit', () => {
  it('publishes the accepted instruction while its question is pending, only after a successful save', async () => {
    for (const rejectAcceptance of [true, false]) {
      clearSparcRuntimeState();
      const display = { pageKey: 'early-instruction', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
        instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'dynamic-instruction-agent-v2', policyVersion: 1 },
        autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A', category: 'model-rule' }], misconceptions: [] },
        clusterTargets: [{ clusterIndex: 0, clusterKC: 'a' }],
        workingMemoryFacts: [{ factType: 'dialogue.source', slots: { topic: 'Explain the synthetic lesson.' } },
          { factType: 'kcGraph.node', slots: { clusterKC: 'a', centrality: 1 } }],
        nodes: [{ id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input', readOnly: true },
          { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit', readOnly: true }],
      };
      const rows: CanonicalHistoryRecord[] = [];
      let published: Record<string, unknown> = {};
      let releaseQuestion!: () => void;
      let signalAccepted!: () => void;
      const questionGate = new Promise<void>(resolve => { releaseQuestion = resolve; });
      const accepted = new Promise<void>(resolve => { signalAccepted = resolve; });
      let questionStarted = false;
      const pending = commitSparcAutoTutorDocumentLoad({
        engine: { commitSparcTrialDisplayAutoTutorRules: (params: Parameters<typeof commitSparcTrialDisplayAutoTutorRules>[0]) =>
          commitSparcTrialDisplayAutoTutorRules({ ...params, document: { ...params.document!,
            productionRules: params.document!.productionRules!.filter(rule => rule.module !== SPARC_INSTRUCTIONAL_COMPETITION_MODULE
              || rule.id.includes('instruction.dynamic.explanation-rich-question.text')),
          } }) } as unknown as Parameters<typeof commitSparcAutoTutorDocumentLoad>[0]['engine'],
        currentDisplay: display, tdfId: 'early-instruction-tdf', userId: 'u', attemptId: 'attempt', levelUnit: 0,
        scoreLearnerResponse: () => { throw new Error('No assessment on initial load'); },
        generateTutorUtterance: async request => {
          const output = instructionFixture(request);
          assert.ok(output.explanation && output.richContent, 'This opening move must include both instruction components');
          const content = { text: output.explanation, support: { text: output.richContent } };
          await request.onInstructionCheckpoint!({ stage: 'composed', content });
          assert.ok(!JSON.stringify(published).includes(output.explanation), 'Draft instruction must remain hidden');
          await request.onInstructionCheckpoint!({ stage: 'accepted', content });
          questionStarted = true;
          signalAccepted();
          await questionGate;
          await request.onInstructionComponent!('question', output.question!, undefined, output.choices ? { choices: output.choices } : {});
          return output;
        },
        onNodeValues: values => {
          assert.ok(rows.some(row => (row.sparc as { stateTransition: { transitionId: string } }).stateTransition.transitionId.endsWith(':instruction:accepted')),
            'Instruction must be durably accepted before it is displayed');
          published = values;
        },
        deps: { getUserId: () => 'u', getIsAdmin: () => true, writeHistory: async row => {
          const id = (row.sparc as { stateTransition: { transitionId: string } }).stateTransition.transitionId;
          if (rejectAcceptance && id.endsWith(':instruction:accepted')) throw new Error('Instruction save rejected');
          rows.push(row);
        } },
      });
      if (rejectAcceptance) {
        await assert.rejects(pending, /Instruction save rejected/);
        assert.equal(questionStarted, false);
        assert.deepEqual(published, {});
      } else {
        await Promise.race([accepted, pending]);
        try {
          assert.equal(questionStarted, true);
          const visible = JSON.stringify(published);
          assert.ok(visible.includes('An explanation of the condition.'), 'Accepted explanation must appear before the question finishes');
          assert.ok(visible.includes('A complete worked example.'), 'Matched support must appear with its explanation');
          assert.ok(!visible.includes('Which case meets the condition?'), 'Question is still pending');
          assert.ok(!rows.some(row => (row.sparc as { stateTransition: { transitionId: string } }).stateTransition.transitionId.endsWith(':cycle')));
        } finally { releaseQuestion(); await pending; }
      }
    }
    clearSparcRuntimeState();
  });

  it('reports stale-question state without answer text and preserves rejection when reporting fails', async () => {
    for (const reportingFails of [false, true]) {
      clearSparcRuntimeState();
      const reports: SparcStaleQuestionWarning[] = [];
      const error = new SparcStaleQuestionError({ submittedNodeId: 'old:question:answer:b', submittedQuestionId: 'old:question',
        currentQuestionId: 'new:question', submittedQuestionTurnEventId: 'old', currentCycleEventId: 'new',
        questionIsLatest: false, questionMatchesCycle: false, questionAlreadyAnswered: true, transitionCount: 12 });
      const presentation = { displayedQuestionId: 'new:question', submittedButtonPresent: true,
        submittedButtonDisabled: false, submittedButtonSelected: false, submissionPending: false };
      const args: Parameters<typeof commitSparcAutoTutorSubmit>[0] = {
        engine: { commitSparcTrialDisplayAutoTutorRules: async () => { throw error; } } as unknown as Parameters<typeof commitSparcAutoTutorSubmit>[0]['engine'],
        currentDisplay: { pageKey: 'diagnostic', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
          instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'dynamic-instruction-agent-v2', policyVersion: 1 },
          autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A', category: 'rule' }], misconceptions: [] },
          clusterTargets: [{ clusterKC: 'a', clusterIndex: 0 }],
          workingMemoryFacts: [{ factType: 'dialogue.source', slots: { topic: 'Explain the synthetic lesson.' } },
            { factType: 'kcGraph.node', slots: { clusterKC: 'a', centrality: 1 } }],
          nodes: [{ id: 'opening-tutor-message', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Explain A.' }] },
        tdfId: 'tdf', userId: 'u', attemptId: 'attempt', levelUnit: 0, submissionPresentation: presentation,
        sparcResult: { submittedNodes: { 'learner-response-input': 'SECRET-LEARNER-TEXT' }, triggeredBy: 'old:question:answer:b', timestamp: 1 },
        scoreLearnerResponse: () => { throw new Error('No scoring expected'); }, generateTutorUtterance: () => { throw new Error('No generation expected'); },
        deps: { getUserId: () => 'u', getIsAdmin: () => true, reportWarning: warning => {
          reports.push(warning); if (reportingFails) throw new Error('Diagnostic sink unavailable');
        } },
      };
      await assert.rejects(commitSparcAutoTutorSubmit(args), caught => caught === error);
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.deepEqual(reports, [{ code: 'sparc.staleQuestion', tdfId: 'tdf', pageKey: 'diagnostic', diagnostic: error.diagnostic, presentation }]);
      assert.ok(!JSON.stringify(reports).includes('SECRET-LEARNER-TEXT'));
      await assert.rejects(commitSparcAutoTutorSubmit({ ...args, engine: {
        commitSparcTrialDisplayAutoTutorRules: async () => { throw new Error('Unrelated provider error'); },
      } as unknown as typeof args.engine }), /Unrelated provider error/);
      assert.equal(reports.length, 1);
    }
    clearSparcRuntimeState();
  });
  it('uses the configured chain or reference anchor policy and resumes its accepted decision without injected candidate options', async () => {
    for (const chain of [false, true]) for (const preceding of ['a', 'd']) {
      clearSparcRuntimeState();
      const ids = ['a', 'b', 'c', 'd'];
      const strengths: Readonly<Record<string, number>> = { ab: .9, ac: .1, ad: .2, bc: .3, bd: .1, cd: .9 };
      const strength = (a: string, b: string) => strengths[[a, b].sort().join('')]!;
      const display = resolveSparcAccountPolicy({ pageKey: 'anchor-cycle', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
        instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'dynamic-instruction-agent-v2', policyVersion: 1 },
        autoTutorTargets: { expectations: ids.map(clusterKC => ({ clusterKC, text: `Recognize ${clusterKC}`, category: 'fact' })), misconceptions: [] },
        clusterTargets: ids.map((clusterKC, clusterIndex) => ({ clusterKC, clusterIndex })),
        workingMemoryFacts: [
          ...(chain ? [
            { factType: 'controller.targetSelectionPolicy', slots: { startingKC: 'a' } },
            { factType: 'kcGraph.chain', slots: { startingKC: 'a', order: ['a', 'b', 'c', 'd'] } },
          ] : []),
          ...ids.map(clusterKC => ({ factType: 'kcGraph.node', slots: { clusterKC, centrality: ids.filter(other => other !== clusterKC).reduce((sum, other) => sum + strength(clusterKC, other), 0) / 3 } })),
          ...ids.flatMap(source => ids.filter(target => source !== target).map(target => ({ factType: 'kcGraph.relationship', slots: { sourceClusterKC: source, targetClusterKC: target, strength: strength(source, target) } }))),
          { factType: 'dialogue.source', slots: { topic: 'Anchor selection test' } },
          { factType: 'dialogue.utterance', factId: 'opening:question', slots: { speaker: 'tutor', component: 'question', eventId: 'opening', targetType: 'learningTarget', targetId: preceding, text: 'Recognize the preceding KC.' } },
        ],
        nodes: [{ id: 'opening-tutor-message', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Recognize the preceding KC.' },
          { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input' },
          { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit' }],
      }, true)!;
      const rows: CanonicalHistoryRecord[] = [];
      const targets: string[] = [];
      let evaluations = 0;
      let fail = true;
      const args = { engine: { commitSparcTrialDisplayAutoTutorRules } as unknown as Parameters<typeof commitSparcAutoTutorSubmit>[0]['engine'],
        currentDisplay: display, tdfId: 'anchor-tdf', userId: 'u', attemptId: 'attempt', levelUnit: 0,
        sparcResult: { submittedNodes: { 'learner-response-input': 'The preceding KC is understood.' }, triggeredBy: 'learner-response-submit', timestamp: 100 },
        scoreLearnerResponse: () => { evaluations++; return { learningTargetScores: ids.map(clusterKC => ({ clusterKC, coverage: clusterKC === 'a' || clusterKC === 'd' ? .8 : .2 })) }; },
        generateTutorUtterance: (request: SparcUtteranceRequest) => {
          if (request.action === 'instruction.feedback') return 'That is correct.';
          targets.push(request.targetId!);
          if (fail) throw new Error('instruction interrupted');
          return instructionFixture(request);
        },
        deps: { getUserId: () => 'u', getIsAdmin: () => true, writeHistory: async (row: CanonicalHistoryRecord) => { rows.push(row); }, writeHistoryBatch: async (records: readonly CanonicalHistoryRecord[]) => { rows.push(...records); } },
      };
      const expected = chain || preceding === 'a' ? 'b' : 'c';
      await assert.rejects(commitSparcAutoTutorSubmit(args), /instruction interrupted/);
      assert.deepEqual(targets, [expected]);
      const scope = { userId: 'u', TDFId: 'anchor-tdf', levelUnit: 0, pageKey: display.pageKey, display };
      const accepted = readSparcResumeSnapshot(scope).replayState;
      clearSparcRuntimeState(); hydrateSparcRuntimeHistory(JSON.parse(JSON.stringify(rows)));
      assert.deepEqual(readSparcResumeSnapshot(scope).replayState, JSON.parse(JSON.stringify(accepted)));
      fail = false;
      const resumed = await commitSparcAutoTutorSubmit({ ...args, attemptId: 'reopened' });
      assert.equal(resumed.committed, true);
      assert.deepEqual(targets, [expected, expected]);
      assert.equal(evaluations, 1);
    }
    clearSparcRuntimeState();
  });

  it('publishes accepted assessment progress before feedback and instruction, but never after a failed save', async () => {
    clearSparcRuntimeState();
    const display = resolveSparcAccountPolicy({ pageKey: 'dynamic-surface', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
      instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'dynamic-instruction-agent-v2', policyVersion: 1 },
      autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A', category: 'model-rule' }], misconceptions: [] },
      clusterTargets: [{ clusterIndex: 0, clusterKC: 'a' }],
      workingMemoryFacts: [{ factType: 'dialogue.source', slots: { topic: 'Explain the lesson concepts.' } }, { factType: 'kcGraph.node', slots: { clusterKC: 'a', centrality: .5 } },
        { factType: 'dialogue.utterance', factId: 'opening:question', slots: { speaker: 'tutor', component: 'question',
          eventId: 'opening', targetType: 'learningTarget', targetId: 'a', text: 'Explain the topic.' } }],
      nodes: [{ id: 'opening-tutor-message', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Explain the topic.' },
        { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input' },
        { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit' }],
    }, true)!;
    let publishedFeedback = false;
    let batchAccepted = false;
    let rejectBatch = true;
    let publications = 0;
    let publishedCoverage = 0;
    const args: Parameters<typeof commitSparcAutoTutorSubmit>[0] = { engine: { commitSparcTrialDisplayAutoTutorRules } as unknown as Parameters<typeof commitSparcAutoTutorSubmit>[0]['engine'],
      currentDisplay: display, tdfId: 'dynamic-tdf', userId: 'u', attemptId: 'attempt', levelUnit: 0,
      sparcResult: { submittedNodes: { 'learner-response-input': 'An answer.' }, triggeredBy: 'learner-response-submit', timestamp: 101 },
      scoreLearnerResponse: () => ({ learningTargetScores: [{ clusterKC: 'a', coverage: .2 }] }),
      onNodeValues: values => {
        if (!batchAccepted) {
          const progress = buildSparcAutoTutorProgressSnapshot({ display, runtimeNodeValues: values });
          assert.equal(progress.turnCount, 0);
          assert.equal(progress.coveredExpectations, 0);
          assert.ok(JSON.stringify(values).includes('An answer.'));
          return;
        }
        assert.equal(batchAccepted, true, 'Only durably accepted scores may be displayed');
        publications++;
        const progress = buildSparcAutoTutorProgressSnapshot({ display, runtimeNodeValues: values });
        publishedCoverage = progress.coveredExpectations;
        assert.equal(progress.turnCount, 1);
        publishedFeedback = JSON.stringify(values).includes('Here is the correction.');
      },
      generateTutorUtterance: request => {
        assert.equal(publishedCoverage, .2, 'Assessment credit must be visible before any generation');
        if (request.action === 'instruction.feedback') return 'Here is the correction.';
        assert.equal(publishedFeedback, true);
        return instructionFixture(request);
      },
      deps: { getIsAdmin: () => true, getUserId: () => 'u', writeHistory: async () => {}, writeHistoryBatch: async () => {
        if (rejectBatch) throw new Error('Assessment storage unavailable');
        batchAccepted = true;
      } },
    };
    await assert.rejects(commitSparcAutoTutorSubmit(args), /Assessment storage unavailable/);
    assert.equal(publications, 0);
    rejectBatch = false;
    await commitSparcAutoTutorSubmit(args);
    assert.ok(publications > 1, 'Assessment and later tutor content are published separately');
    clearSparcRuntimeState();
  });
  it('uses the package choice for admins and preserves the deterministic non-admin route', () => {
    for (const policyId of SPARC_INSTRUCTIONAL_POLICY_IDS) {
      const display = { nodes: [], unitType: 'sparc-autotutor-dialogue', instructionalController: { adapterId: 'sparc-autotutor-v1', policyVersion: 1, policyId } };
      const admin = resolveSparcAccountPolicy(display, true)!;
      assert.equal(admin.instructionalController?.policyId, policyId);
      assert.equal(resolveSparcAccountPolicy(admin, true)?.instructionalController?.policyId, admin.instructionalController?.policyId);
      assert.equal(resolveSparcAccountPolicy(display, false)?.instructionalController?.policyId, policyId);
      assert.equal(display.instructionalController.policyId, policyId);
    }
  });

  it('commits non-admin student menu choices and restores own expectation progression', async () => {
    clearSparcRuntimeState();
    const display = resolveSparcAccountPolicy({ pageKey: 'student-cycle', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
      instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'dynamic-instruction-student-v2', policyVersion: 1 },
      autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A', category: 'model-rule' }, { clusterKC: 'b', text: 'Explain B', category: 'model-rule' }], misconceptions: [] },
      clusterTargets: [{ clusterIndex: 0, clusterKC: 'a' }, { clusterIndex: 1, clusterKC: 'b' }],
      workingMemoryFacts: [{ factType: 'dialogue.source', slots: { topic: 'Explain the lesson concepts.' } }, { factType: 'dialogue.utterance', factId: 'opening:question', slots: { speaker: 'tutor', component: 'question', eventId: 'opening', targetType: 'learningTarget', targetId: 'a', text: 'Explain A?' } },
        ...['a', 'b'].map((clusterKC) => ({ factType: 'kcGraph.node', slots: { clusterKC, centrality: 0.5 } })),
        ...['a', 'b'].map(source => ({ factType: 'kcGraph.relationship', slots: { sourceClusterKC: source, targetClusterKC: source === 'a' ? 'b' : 'a', strength: .5 } })),
      ],
      nodes: [{ id: 'opening-tutor-message', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Explain the topic.' },
        { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input' },
        { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit' }],
    }, true)!;
    const rows: CanonicalHistoryRecord[] = [];
    const requests: SparcUtteranceRequest[] = [];
    let evaluations = 0;
    const args = { engine: { commitSparcTrialDisplayAutoTutorRules } as unknown as Parameters<typeof commitSparcAutoTutorSubmit>[0]['engine'], currentDisplay: display,
      tdfId: 'student-tdf', userId: 'u', attemptId: 'attempt', levelUnit: 0,
      scoreLearnerResponse: () => { evaluations++; return { learningTargetScores: ['a', 'b'].map((clusterKC) => ({ clusterKC, coverage: 0.2 })) }; },
      generateTutorUtterance: (request: SparcUtteranceRequest) => { requests.push(request); return request.action === 'instruction.feedback' ? 'Here is feedback.' : instructionFixture(request); },
      deps: { getUserId: () => 'u', getIsAdmin: () => false, writeHistory: async (row: CanonicalHistoryRecord) => { rows.push(row); }, writeHistoryBatch: async (records: readonly CanonicalHistoryRecord[]) => { rows.push(...records); } },
    };
    const scope = { userId: 'u', TDFId: 'student-tdf', levelUnit: 0, pageKey: 'student-cycle', display };
    const menu = () => currentSparcMenu(readSparcResumeSnapshot(scope).replayState)!;
    const answer = { submittedNodes: { 'learner-response-input': 'An answer.' }, triggeredBy: 'learner-response-submit', timestamp: 10 };
    await commitSparcAutoTutorSubmit({ ...args, sparcResult: answer });
    assert.equal(requests.length, 1);
    assert.equal((menu().slots?.options as unknown[]).length, 17);
    const target = () => (menu().slots?.options as { targetId: string }[])[0]!.targetId;
    const firstTarget = target();
    const choose = (id: string, timestamp: number) => {
      const node = `${String(menu().slots?.menuId)}:${id}`;
      return commitSparcAutoTutorSubmit({ ...args, sparcResult: { submittedNodes: { [node]: id }, triggeredBy: node, timestamp } });
    };
    await choose('next-target', 20);
    assert.notEqual(target(), firstTarget);
    const selectedTarget = target();
    const savedSnapshot = readSparcResumeSnapshot(scope);
    assert.equal(savedSnapshot.nodeValues['student-cycle:response:opening:learner::correctness'], 'correct');
    clearSparcRuntimeState(); hydrateSparcRuntimeHistory(JSON.parse(JSON.stringify(rows)));
    const loadedSnapshot = readSparcResumeSnapshot(scope);
    assert.deepEqual(loadedSnapshot.replayState, JSON.parse(JSON.stringify(savedSnapshot.replayState)));
    assert.deepEqual(loadedSnapshot.expectationProbabilities, savedSnapshot.expectationProbabilities);
    assert.deepEqual(loadedSnapshot.nodeValues, JSON.parse(JSON.stringify(savedSnapshot.nodeValues)));
    await choose('question.text', 30);
    assert.equal(evaluations, 1);
    assert.equal(requests.at(-1)!.action, 'instruction.dynamic.question.text');
    assert.equal(requests.at(-1)!.targetId, selectedTarget);
    assert.equal(resolveSparcAccountPolicy(display, false)?.instructionalController?.policyId, 'dynamic-instruction-student-v2');
    clearSparcRuntimeState();
  });

  it('keeps accepted selection on output-limit exhaustion and resumes it without another answer or assessment', async () => {
    clearSparcRuntimeState();
    const display = { type: 'sparc', pageKey: 'app-cycle', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
      instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'dynamic-instruction-agent-v2', policyVersion: 1 },
      autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A', category: 'model-rule' }], misconceptions: [] },
      clusterTargets: [{ clusterIndex: 0, clusterKC: 'a' }],
      workingMemoryFacts: [{ factType: 'dialogue.source', slots: { topic: 'Explain the lesson concepts.' } }, { factType: 'dialogue.utterance', factId: 'opening:question', slots: { speaker: 'tutor', component: 'question', eventId: 'opening', targetType: 'learningTarget', targetId: 'a', text: 'Explain A?' } }, { factType: 'kcGraph.node', slots: { clusterKC: 'a', centrality: 1 } }],
      nodes: [{ id: 'opening-tutor-message', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Explain A.' },
        { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input', value: '' },
        { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit' }],
    };
    assert.equal(resolveSparcAccountPolicy(display, true)?.instructionalController?.policyId, 'dynamic-instruction-agent-v2');
    assert.equal(resolveSparcAccountPolicy(display, false)?.instructionalController?.policyId, 'dynamic-instruction-agent-v2');
    const rows: CanonicalHistoryRecord[] = [];
    let evaluations = 0; let fail = true;
    const args = { engine: { commitSparcTrialDisplayAutoTutorRules } as unknown as Parameters<typeof commitSparcAutoTutorSubmit>[0]['engine'], currentDisplay: display,
      tdfId: 'tdf', userId: 'u', attemptId: 'attempt', levelUnit: 0,
      scoreLearnerResponse: () => { evaluations++; return { learningTargetScores: [{ clusterKC: 'a', coverage: 0.2 }] }; },
      generateTutorUtterance: (request: SparcUtteranceRequest) => { if (request.action === 'instruction.feedback') return 'Feedback.'; if (fail) throw new Error('Synthetic provider failure'); return instructionFixture(request); },
      deps: { getUserId: () => 'u', getIsAdmin: () => false, writeHistory: async (row: CanonicalHistoryRecord) => { rows.push(row); }, writeHistoryBatch: async (records: readonly CanonicalHistoryRecord[]) => { rows.push(...records); } },
    };
    const scope = { userId: 'u', TDFId: 'tdf', levelUnit: 0, pageKey: display.pageKey, display };
    const choice = { submittedNodes: { 'learner-response-input': 'An answer.' }, timestamp: 10 };
    await assert.rejects(commitSparcAutoTutorSubmit({ ...args, sparcResult: choice }), /Synthetic provider failure/);
    assert.equal(evaluations, 1);
    const accepted = readSparcResumeSnapshot(scope);
    assert.ok(accepted.replayState.transitions.some((transition) => transition.transitionId.endsWith(':decision')));
    const acceptedRows = rows.slice();
    clearSparcRuntimeState(); hydrateSparcRuntimeHistory(JSON.parse(JSON.stringify(rows)));
    fail = false;
    const result = await commitSparcAutoTutorDocumentLoad({ ...args, attemptId: 'reopened' });
    assert.equal(result.committed, true); assert.equal(evaluations, 1);
    assert.equal(result.sparcNodeValues['learner-response-input'], '');
    assert.ok(rows.every((row) => row.sessionID === rows[0]!.sessionID));
    assert.deepEqual(rows.slice(0, acceptedRows.length), acceptedRows);
    const transitions = rows.map(row => (row.sparc as { stateTransition: { transitionId: string } }).stateTransition.transitionId);
    assert.equal(new Set(transitions).size, transitions.length, 'Retry must not duplicate feedback, assessment, selection, or components');
    await assert.rejects(commitSparcAutoTutorSubmit({ ...args, userId: 'another', sparcResult: choice }), /authenticated user/);
    clearSparcRuntimeState();
  });
});
