import { strict as assert } from 'node:assert';
import { createSparcDialogueOpenRouterAdapter, type SparcDialogueAdapterRuntime } from './sparcDialogueOpenRouterAdapter';
import { requireActiveSparcMoveDefinition } from './sparcMoveDefinitions';
import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';
import type { SparcTrialDisplayDialogueTurnScorer } from './sparcTrialDisplayRuntimeBridge';
import { createEmptySparcReplayState } from './sparcStateReplay';
import { normalizeEmbeddingVector } from '../../runtime/vectorSimilarity';

function injectedRuntime(overrides: Partial<SparcDialogueAdapterRuntime> = {}): SparcDialogueAdapterRuntime {
  const unavailable = async () => { throw new Error('Unexpected external operation in SPARC domain test'); };
  return {
    callResolvedJson: unavailable,
    callGeneratedJson: unavailable,
    loadNormalizedAssessmentVectors: unavailable,
    generateImage: unavailable,
    resolveVisual: unavailable,
    realizePrimitive: unavailable,
    summarizeCitation: citation => ({ quoteCharacters: typeof citation.quote === 'string' ? citation.quote.length : 0 }),
    log: () => undefined,
    reportCitationMismatch: () => undefined,
    imageDisplayWidth: { minDisplayWidth: 240, maxDisplayWidth: 640 },
    ...overrides,
  };
}

function instructionRequest(): SparcUtteranceRequest {
  const definition = requireActiveSparcMoveDefinition('instruction.dynamic.explanation-question.text');
  return { problemStatement: 'A fixed annual interest rate applies to the accumulated balance.',
    targetType: 'learningTarget', targetId: 'kc-0', action: definition.moveId,
    contentTexts: ['Interest applies to principal and accumulated interest.'],
    targetContent: { clusterKC: 'kc-0', text: 'Interest applies to principal and accumulated interest.' },
    selectedAction: { snapshotId: 'synthetic-event', targetType: 'learningTarget', clusterKC: 'kc-0', action: definition.moveId },
    moveDefinition: definition, responseModifiers: [] };
}

function scoreContext(): Parameters<SparcTrialDisplayDialogueTurnScorer>[0] {
  const expectations = Array.from({ length: 5 }, (_, index) => ({ clusterKC: `kc-${index}`, text: `Expectation ${index}` }));
  const misconceptions = Array.from({ length: 6 }, (_, index) => ({ id: `mis-${index}`, text: `Misconception ${index}` }));
  const facts: SparcWorkingMemoryFact[] = [
    { factType: 'instructional.activeCycle', slots: { targetKind: 'expectation', targetId: 'kc-0', status: 'active' } },
    ...expectations.slice(1).map((target, index) => ({ factType: 'kcGraph.relationship', slots: {
      sourceClusterKC: 'kc-0', targetClusterKC: target.clusterKC, strength: .9 - index * .1,
    } })),
  ];
  return { document: { id: 'synthetic-page', schemaVersion: 2, autoTutorTargets: { expectations, misconceptions }, workingMemoryFacts: facts,
      root: { id: 'root', kind: 'document' } },
    display: { nodes: [], autoTutorTargets: { expectations, misconceptions } },
    result: { submittedNodes: {}, timestamp: 1 },
    event: { eventId: 'synthetic-response', type: 'response-submitted', source: { pageKey: 'synthetic-page', nodeId: 'response' }, time: 1 },
    problemStatement: 'Synthetic assessment context', learnerText: 'Private learner contribution.', replayState: createEmptySparcReplayState() };
}

describe('SPARC dialogue domain adapter with explicit runtime dependencies', () => {
  it('selects graph-neighbor KCs and closest misconceptions using only injected authored target vectors', async () => {
    const context = scoreContext();
    const embedded: string[][] = [];
    const adapter = createSparcDialogueOpenRouterAdapter({}, injectedRuntime({
      async loadNormalizedAssessmentVectors(texts) {
        embedded.push(texts);
        return texts.map(text => normalizeEmbeddingVector(text.startsWith('Expectation') ? [1, 0] : [Number(text.at(-1)) + 1, 1]));
      },
      async callResolvedJson(request) {
        const input = JSON.parse(request.messages[1]!.content as string);
        assert.deepEqual(input.learningTargets.map((target: { clusterKC: string }) => target.clusterKC), ['kc-0', 'kc-1', 'kc-2', 'kc-3']);
        assert.deepEqual(input.misconceptions.map((target: { id: string }) => target.id), ['mis-5', 'mis-4', 'mis-3', 'mis-2']);
        return { parsedContent: { learningTargetEvaluations: [], diagnosticMisconceptionEvaluations: [], learnerContribution: { type: 'other' } } };
      },
    }));
    await adapter.prepareAssessment(context.display);
    const score = await adapter.scoreLearnerResponse(context);
    assert.deepEqual(score.learningTargetScores, []);
    assert.equal(embedded.length, 2);
    assert.ok(embedded.every(texts => texts.length === 11 && !texts.includes(context.learnerText)));
  });

  it('awaits a composed checkpoint and acceptance before requesting the question', async () => {
    const order: string[] = [];
    let releaseCheckpoint!: () => void;
    const checkpointGate = new Promise<void>(resolve => { releaseCheckpoint = resolve; });
    let checkpointReached!: () => void;
    const reached = new Promise<void>(resolve => { checkpointReached = resolve; });
    const adapter = createSparcDialogueOpenRouterAdapter({}, injectedRuntime({
      async callGeneratedJson(_request, operation, onResult) {
        order.push(`generate:${operation}`);
        const result = { parsedContent: { tutorMessage: operation === 'instruction' ? 'Interest also applies to accumulated interest.' : 'What balance receives interest next year?' } };
        onResult(result);
        return result;
      },
    }));
    const pending = adapter.generateTutorUtterance({ ...instructionRequest(),
      onInstructionCheckpoint: async checkpoint => {
        order.push(`persist:${checkpoint.stage}`);
        if (checkpoint.stage === 'composed') { checkpointReached(); await checkpointGate; }
      },
      onInstructionComponent: async kind => { order.push(`persist:${kind}`); },
    });
    await reached;
    assert.deepEqual(order, ['generate:instruction', 'persist:composed']);
    releaseCheckpoint();
    const result = await pending;
    assert.equal(typeof result, 'object');
    assert.deepEqual(order, ['generate:instruction', 'persist:composed', 'persist:accepted', 'generate:question', 'persist:question']);
  });

  it('propagates a failed composition save without starting the question or substituting another move', async () => {
    const calls: string[] = [];
    const failure = new Error('Synthetic checkpoint persistence failure');
    const adapter = createSparcDialogueOpenRouterAdapter({}, injectedRuntime({
      async callGeneratedJson(_request, operation, onResult) {
        calls.push(operation);
        const result = { parsedContent: { tutorMessage: 'Interest applies to accumulated interest.' } };
        onResult(result);
        return result;
      },
    }));
    await assert.rejects(async () => adapter.generateTutorUtterance({ ...instructionRequest(),
      onInstructionCheckpoint: async () => { throw failure; },
    }), error => error === failure);
    assert.deepEqual(calls, ['instruction']);
  });

  it('reports citation mismatch metadata through injected diagnostics without exposing dialogue text', async () => {
    const context = scoreContext();
    context.display.autoTutorTargets = { expectations: [{ clusterKC: 'kc-0', text: 'Expectation 0' }], misconceptions: [] };
    const logs: unknown[][] = [];
    const warnings: unknown[] = [];
    const adapter = createSparcDialogueOpenRouterAdapter({ tdfId: 'synthetic-lesson' }, injectedRuntime({
      async callResolvedJson() {
        return { parsedContent: { learningTargetEvaluations: [{ clusterKC: 'kc-0', evidenceDirection: 'supports', evidenceStrength: .5,
          summary: null, learnerEvidence: [{ source: 'learnerText', dialogueHistoryIndex: null, quote: 'Private mismatched quote.' }] }],
        diagnosticMisconceptionEvaluations: [], learnerContribution: { type: 'answer' } } };
      },
      log: (_level, ...args) => { logs.push(args); },
      reportCitationMismatch: warning => { warnings.push(warning); },
    }));
    const score = await adapter.scoreLearnerResponse(context);
    await Promise.resolve();
    assert.equal(score.learningTargetScores?.length, 1);
    assert.deepEqual(warnings, [{ code: 'autotutor.citationMismatch', tdfId: 'synthetic-lesson', mismatchCount: 1 }]);
    assert.equal(logs.length, 1);
    assert.ok(!JSON.stringify(logs).includes('Private'));
  });
});
