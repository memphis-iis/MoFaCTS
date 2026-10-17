import { resolveSparcAccountPolicy } from './sparcController';
import { SPARC_INSTRUCTIONAL_POLICY_IDS, isSparcDynamicPolicy } from '../../../../../../learning-components/runtime/sparcInstructionalPolicies';
import { currentSparcMenu } from '../../../../../../learning-components/units/sparcsession/sparcInstructionalCycle';
import { strict as assert } from 'node:assert';
import { commitSparcAutoTutorSubmit } from './sparcAutoTutorRuleCommit';
import { clearSparcRuntimeState, hydrateSparcRuntimeHistory, readSparcResumeSnapshot } from './sparcRuntimeState';
import { commitSparcTrialDisplayAutoTutorRules } from '../../../../../../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge';
import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import { requireActiveSparcMoveDefinition } from '../../../../../../learning-components/units/sparcsession/sparcMoveDefinitions';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';

describe('SPARC app instructional commit', () => {
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
          const parts = request.moveDefinition.components!;
          return { explanation: parts.includes('explanation') ? 'An explanation.' : null, richContent: parts.includes('richContent') ? 'A worked example.' : null, question: 'Recognize the next KC.',
            ...(request.moveDefinition.responseFormat === 'multiple-choice' ? { choices: [{ id: 'yes', label: 'Correct case', correct: true }, { id: 'no', label: 'Incorrect case', correct: false }, { id: 'other', label: 'Unrelated case', correct: false }] } : {}) };
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

  it('publishes saved dynamic feedback to the surface before generating the next instruction', async () => {
    clearSparcRuntimeState();
    const display = resolveSparcAccountPolicy({ pageKey: 'dynamic-surface', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
      instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'dynamic-instruction-agent-v1', policyVersion: 1 },
      autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A' }], misconceptions: [] },
      clusterTargets: [{ clusterIndex: 0, clusterKC: 'a' }],
      workingMemoryFacts: [{ factType: 'kcGraph.node', slots: { clusterKC: 'a', centrality: .5 } },
        { factType: 'dialogue.utterance', factId: 'opening:question', slots: { speaker: 'tutor', component: 'question',
          eventId: 'opening', targetType: 'learningTarget', targetId: 'a', text: 'Explain the topic.' } }],
      nodes: [{ id: 'opening-tutor-message', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Explain the topic.' },
        { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input' },
        { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit' }],
    }, true)!;
    let publishedFeedback = false;
    await commitSparcAutoTutorSubmit({ engine: { commitSparcTrialDisplayAutoTutorRules } as unknown as Parameters<typeof commitSparcAutoTutorSubmit>[0]['engine'],
      currentDisplay: display, tdfId: 'dynamic-tdf', userId: 'u', attemptId: 'attempt', levelUnit: 0,
      sparcResult: { submittedNodes: { 'learner-response-input': 'An answer.' }, triggeredBy: 'learner-response-submit', timestamp: 101 },
      scoreLearnerResponse: () => ({ learningTargetScores: [{ clusterKC: 'a', coverage: .2 }] }),
      onNodeValues: values => { publishedFeedback = JSON.stringify(values).includes('Here is the correction.'); },
      generateTutorUtterance: request => {
        if (request.action === 'instruction.feedback') return 'Here is the correction.';
        assert.equal(publishedFeedback, true);
        return { explanation: 'An explanation.', richContent: 'A complete worked example.', question: 'How does the new case work?' };
      },
      deps: { getIsAdmin: () => true, getUserId: () => 'u', writeHistory: async () => {}, writeHistoryBatch: async () => {} },
    });
    clearSparcRuntimeState();
  });
  it('uses the package choice for admins and preserves the deterministic non-admin route', () => {
    for (const policyId of SPARC_INSTRUCTIONAL_POLICY_IDS) {
      const display = { nodes: [], unitType: 'sparc-autotutor-dialogue', instructionalController: { adapterId: 'sparc-autotutor-v1', policyVersion: 1, policyId } };
      const admin = resolveSparcAccountPolicy(display, true)!;
      assert.equal(admin.instructionalController?.policyId, policyId === 'student-selected-v2' || isSparcDynamicPolicy(policyId) ? policyId : 'oet-boltzmann-v2');
      assert.equal(resolveSparcAccountPolicy(admin, true)?.instructionalController?.policyId, admin.instructionalController?.policyId);
      if (isSparcDynamicPolicy(policyId)) assert.throws(() => resolveSparcAccountPolicy(display, false), /admin account/);
      else assert.equal(resolveSparcAccountPolicy(display, false)?.instructionalController?.policyId, 'progressive-scaffolding-v1');
      assert.equal(display.instructionalController.policyId, policyId);
    }
  });

  it('commits student menu choices and expectation progression through the admin app path', async () => {
    clearSparcRuntimeState();
    const display = resolveSparcAccountPolicy({ pageKey: 'student-cycle', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
      instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'student-selected-v2', policyVersion: 1 },
      autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A' }, { clusterKC: 'b', text: 'Explain B' }], misconceptions: [] },
      clusterTargets: [{ clusterIndex: 0, clusterKC: 'a' }, { clusterIndex: 1, clusterKC: 'b' }],
      workingMemoryFacts: [
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
      generateTutorUtterance: (request: SparcUtteranceRequest) => { requests.push(request); return 'Here is a hint.'; },
      deps: { getUserId: () => 'u', getIsAdmin: () => true, writeHistory: async (row: CanonicalHistoryRecord) => { rows.push(row); }, writeHistoryBatch: async (records: readonly CanonicalHistoryRecord[]) => { rows.push(...records); } },
    };
    const scope = { userId: 'u', TDFId: 'student-tdf', levelUnit: 0, pageKey: 'student-cycle', display };
    const menu = () => currentSparcMenu(readSparcResumeSnapshot(scope).replayState)!;
    const answer = { submittedNodes: { 'learner-response-input': 'An answer.' }, triggeredBy: 'learner-response-submit', timestamp: 10 };
    await commitSparcAutoTutorSubmit({ ...args, sparcResult: answer });
    assert.equal(requests.length, 0);
    assert.equal((menu().slots?.options as unknown[]).length, 6);
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
    clearSparcRuntimeState(); hydrateSparcRuntimeHistory(JSON.parse(JSON.stringify(rows)));
    const loadedSnapshot = readSparcResumeSnapshot(scope);
    assert.deepEqual(loadedSnapshot.replayState, savedSnapshot.replayState);
    assert.deepEqual(loadedSnapshot.expectationProbabilities, savedSnapshot.expectationProbabilities);
    assert.deepEqual(loadedSnapshot.nodeValues, savedSnapshot.nodeValues);
    await choose('hint', 30);
    assert.equal(evaluations, 1);
    assert.equal(requests[0]!.action, 'hint');
    assert.equal(requests[0]!.targetId, selectedTarget);
    await assert.rejects(commitSparcAutoTutorSubmit({ ...args, deps: { ...args.deps, getIsAdmin: () => false }, sparcResult: answer }), /account policy changed/);
    clearSparcRuntimeState();
  });

  it('keeps accepted selection on provider failure and restores it through the app resume service', async () => {
    clearSparcRuntimeState();
    const display = { type: 'sparc', pageKey: 'app-cycle', schema: 'tutorscript-sparc/2.0', unitType: 'sparc-autotutor-dialogue',
      instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: 'oet-boltzmann-v2', policyVersion: 1 },
      autoTutorTargets: { expectations: [{ clusterKC: 'a', text: 'Explain A' }], misconceptions: [] },
      clusterTargets: [{ clusterIndex: 0, clusterKC: 'a' }],
      workingMemoryFacts: [{ factType: 'kcGraph.node', slots: { clusterKC: 'a', centrality: 1 } }],
      nodes: [{ id: 'opening-tutor-message', nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor', value: 'Explain A.' },
        { id: 'learner-response-input', nodeType: 'atomic', atomType: 'text-input', value: '' },
        { id: 'learner-response-submit', nodeType: 'atomic', atomType: 'button', label: 'Submit' }],
    };
    assert.equal(resolveSparcAccountPolicy(display, true)?.instructionalController?.policyId, 'oet-boltzmann-v2');
    assert.equal(resolveSparcAccountPolicy(display, false)?.instructionalController?.policyId, 'progressive-scaffolding-v1');
    const rows: CanonicalHistoryRecord[] = [];
    let evaluations = 0; let fail = true;
    const args = { engine: { commitSparcTrialDisplayAutoTutorRules } as unknown as Parameters<typeof commitSparcAutoTutorSubmit>[0]['engine'], currentDisplay: display,
      tdfId: 'tdf', userId: 'u', attemptId: 'attempt', levelUnit: 0,
      scoreLearnerResponse: () => { evaluations++; return { learningTargetScores: [{ clusterKC: 'a', coverage: 0.2 }] }; },
      generateTutorUtterance: (request: SparcUtteranceRequest) => { if (fail) throw new Error('provider failed'); const parts = requireActiveSparcMoveDefinition(request.action).components; return parts ? { explanation: parts.includes('explanation') ? 'Explanation' : null, richContent: parts.includes('richContent') ? '<p>Example</p>' : null, question: 'What is A?' } : 'Tell me more.'; },
      deps: { getUserId: () => 'u', getIsAdmin: () => true, writeHistory: async (row: CanonicalHistoryRecord) => { rows.push(row); }, writeHistoryBatch: async (records: readonly CanonicalHistoryRecord[]) => { rows.push(...records); } },
    };
    const scope = { userId: 'u', TDFId: 'tdf', levelUnit: 0, pageKey: display.pageKey, display };
    const choice = { submittedNodes: { 'learner-response-input': 'An answer.' }, timestamp: 10 };
    await assert.rejects(commitSparcAutoTutorSubmit({ ...args, sparcResult: choice }), /provider failed/);
    await assert.rejects(commitSparcAutoTutorSubmit({ ...args, deps: {...args.deps, getIsAdmin: () => false}, sparcResult: choice }), /account policy changed/);
    const accepted = readSparcResumeSnapshot(scope);
    assert.ok(accepted.replayState.transitions.some((transition) => transition.transitionId.endsWith(':decision')));
    clearSparcRuntimeState(); hydrateSparcRuntimeHistory(JSON.parse(JSON.stringify(rows)));
    fail = false;
    const result = await commitSparcAutoTutorSubmit({ ...args, attemptId: 'reopened', sparcResult: choice });
    assert.equal(result.committed, true); assert.equal(evaluations, 1);
    assert.equal(result.sparcNodeValues['learner-response-input'], '');
    assert.ok(rows.every((row) => row.sessionID === rows[0]!.sessionID));
    await assert.rejects(commitSparcAutoTutorSubmit({ ...args, userId: 'another', sparcResult: choice }), /authenticated user/);
    clearSparcRuntimeState();
  });
});
