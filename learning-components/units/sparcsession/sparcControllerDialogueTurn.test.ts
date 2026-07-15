import { strict as assert } from 'node:assert';
import {
  applySparcProgressiveNodeOperations,
  collectSparcProgressiveNodeOperations,
} from '../../trial-displays/sparc/sparcProgressiveNodes';
import { applySparcHistoryRecord, createEmptySparcReplayState } from './sparcStateReplay';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import {
  commitSparcControllerDialogueTurn,
  evaluateSparcControllerDialogueTurn,
} from './sparcControllerDialogueTurn';
import type {
  SparcAuthoredDocument,
  SparcInterfaceEvent,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';
import { createSparcProgressiveScaffoldingRules } from './sparcProgressiveScaffoldingRules';

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

function document(): SparcAuthoredDocument {
  return {
    id: 'sparc-dialogue-controller-doc',
    schemaVersion: 2,
    instructionalController: {
      adapterId: 'sparc-autotutor-v1',
      policyId: 'progressive-scaffolding-v1',
      policyVersion: 1,
      parameters: { minimumProgress: 0.05 },
    },
    workingMemoryFacts: [
      fact('controller.targetSelectionPolicy', {
        policy: 'kc-graph-priority',
        coverageThreshold: 0.8,
        frontierWeight: 0.5,
        coherenceWeight: 0.3,
        centralityWeight: 0.2,
      }),
      fact('autotutor.expectation', { clusterKC: 'kc-a', text: 'Return to A.' }),
      fact('autotutor.expectation', { clusterKC: 'kc-b', text: 'Use the relationship between A and B.' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.1 }),
      fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.1, description: 'A' }),
      fact('kcGraph.node', { clusterKC: 'kc-b', centrality: 0.8, description: 'B' }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-a', targetClusterKC: 'kc-b', strength: 0.9 }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-b', targetClusterKC: 'kc-a', strength: 0.9 }),
      fact('dialogue.learnerWordCount', { cumulative: 2 }),
      fact('session.turnState', { turnCount: 1 }),
    ],
    productionRules: createSparcProgressiveScaffoldingRules(),
    root: {
      id: 'root',
      kind: 'document',
      children: [{
        id: 'learner-input',
        kind: 'input',
      }],
    },
  };
}

const event: SparcInterfaceEvent = {
  eventId: 'event-dialogue-controller',
  type: 'response-submitted',
  source: {
    pageKey: 'sparc-dialogue-controller-doc',
    nodeId: 'learner-input',
  },
  time: 2000,
  payload: {
    input: 'three more words',
  },
};

const problemStatement = 'Explain how A and B are related.';

describe('evaluateSparcControllerDialogueTurn', function() {
  it('plans the move, requests constrained utterance text, and returns replayable dialogue writes', async function() {
    const result = await evaluateSparcControllerDialogueTurn({
      document: document(),
      event,
      problemStatement,
      learnerResponseScore: {
        learningTargetScores: [{
          clusterKC: 'kc-b',
          coverage: 0.6,
        }],
      },
      targetSelectionOptions: {
        anchorClusterKC: 'kc-a',
      },
      generateTutorUtterance: (request) => {
        assert.equal(request.problemStatement, problemStatement);
        assert.equal(request.targetType, 'learningTarget');
        assert.equal(request.targetId, 'kc-a');
        assert.equal(request.action, 'pump');
        assert.deepEqual(request.contentTexts, ['Return to A.']);
        return { text: 'Think about how B depends on A.' };
      },
    });

    assert.equal(result.planning.targetSelection.selectedClusterKC, 'kc-a');
    assert.ok(result.learnerResponseScoreFacts.some((fact) => (
      fact.factType === 'learningTarget.score'
      && fact.slots?.clusterKC === 'kc-b'
      && fact.slots.coverage === 0.6
    )));
    assert.equal(result.moveSelectionAudit.selected?.ruleId, 'dialogue.scaffold.pump');
    assert.equal(result.moveSelectionAudit.selected?.action, 'pump');
    assert.equal(result.utteranceRequest.action, 'pump');
    assert.equal(result.tutorText, 'Think about how B depends on A.');

    const nodes = applySparcProgressiveNodeOperations(
      [],
      collectSparcProgressiveNodeOperations([result.transition]),
    );
    assert.deepEqual(nodes.map((node) => (node as { speaker?: string }).speaker), ['learner', 'tutor']);
    assert.equal((nodes[1] as { value?: string }).value, 'Think about how B depends on A.');
    assert.equal((nodes[1] as { productionRuleName?: string }).productionRuleName, 'dialogue.scaffold.pump');
    assert.equal(result.transition.writes.some((write) => (
      write.value
      && typeof write.value === 'object'
      && (write.value as { type?: string; node?: { readOnly?: boolean } }).type === 'insert-node'
      && (write.value as { node?: { readOnly?: boolean } }).node?.readOnly === true
    )), false);
  });

  it('selects summary and locks dialogue controls at max turns even when a misconception remains active', async function() {
    const baseDocument = document();
    const sourceDocument: SparcAuthoredDocument = {
      ...baseDocument,
      workingMemoryFacts: [
        ...(baseDocument.workingMemoryFacts ?? []),
        fact('dialogue.graduation', { requiredTargetCount: 2, maxActiveMisconceptions: 0, maxTurns: 2 }),
        fact('autotutor.misconception', { id: 'm1', text: 'Incorrect belief.' }),
        fact('diagnostic.misconceptionScore', { id: 'm1', confidence: 0.7 }),
      ],
    };

    const result = await evaluateSparcControllerDialogueTurn({
      document: sourceDocument,
      event,
      problemStatement,
      learnerResponseScore: {},
      generateTutorUtterance: (request) => {
        assert.equal(request.targetType, 'completion');
        assert.equal(request.action, 'summary');
        return 'Here is what you established and what remains unresolved.';
      },
    });

    assert.equal(result.planning.derivedFacts.find((entry) => entry.factType === 'controller.completionState')?.slots?.reason, 'max-turns');
    assert.equal(result.transition.writes.filter((write) => (
      write.value
      && typeof write.value === 'object'
      && (write.value as { type?: string; node?: { readOnly?: boolean } }).type === 'insert-node'
      && (write.value as { node?: { readOnly?: boolean } }).node?.readOnly === true
    )).length, 2);
  });

  it('chains a legitimate learner-question deferral into the current scaffold move without locking dialogue controls', async function() {
    const result = await evaluateSparcControllerDialogueTurn({
      document: document(),
      event: {
        ...event,
        payload: { input: 'Can you just tell me how A and B are related?' },
      },
      problemStatement,
      learnerResponseScore: {
        learnerContribution: { type: 'question', confidence: 0.95 },
        learnerQuestion: { contentFocused: true },
      },
      generateTutorUtterance: (request) => {
        assert.equal(request.targetType, 'learningTarget');
        assert.equal(request.action, 'pump');
        assert.equal(request.responseModifiers[0]?.action, 'question-deferral');
        return 'Let us work with it a little longer first. What relationship seems possible to you?';
      },
    });

    assert.deepEqual(result.planning.productionRuleEvaluation.execution.firings.map((firing) => firing.ruleId), [
      'dialogue.question.defer',
      'dialogue.scaffold.pump',
    ]);
    assert.equal(result.moveSelectionAudit.selected?.ruleId, 'dialogue.scaffold.pump');
    assert.equal(result.utteranceRequest.action, 'pump');
    assert.equal(result.transition.writes.some((write) => (
      write.value
      && typeof write.value === 'object'
      && (write.value as { type?: string; node?: { readOnly?: boolean } }).type === 'insert-node'
      && (write.value as { node?: { readOnly?: boolean } }).node?.readOnly === true
    )), false);
    const preservedScaffold = result.transition.writes.find((write) => (
      write.value
      && typeof write.value === 'object'
      && (write.value as { factType?: string }).factType === 'scaffold.state'
    ));
    assert.equal((preservedScaffold?.value as { slots?: { stage?: string } })?.slots?.stage, 'PUMP');
  });

  it('routes an off-topic learner question to the dedicated scope-refusal move', async function() {
    const result = await evaluateSparcControllerDialogueTurn({
      document: document(),
      event: {
        ...event,
        payload: { input: 'Tell me about something unrelated.' },
      },
      problemStatement,
      learnerResponseScore: {
        learnerContribution: { type: 'question', confidence: 0.95 },
        learnerQuestion: { contentFocused: false },
      },
      generateTutorUtterance: (request) => {
        assert.equal(request.targetType, 'learnerQuestion');
        assert.equal(request.action, 'question-scope-refusal');
        return 'I can only discuss this learning activity. Let us return to A and B.';
      },
    });

    assert.equal(result.moveSelectionAudit.selected?.ruleId, 'dialogue.question.scope-refusal');
    assert.equal(result.utteranceRequest.action, 'question-scope-refusal');
  });

  it('does not reuse a prior learner-question routing fact on the next answer turn', async function() {
    const sourceDocument = document();
    const questionTurn = await commitSparcControllerDialogueTurn({
      core: {
        TDFId: 'tdf-dialogue-controller',
        sessionID: 'session-dialogue-controller',
        anonStudentId: 'anon-dialogue-controller',
        levelUnit: 1,
        levelUnitName: 'Dialogue Controller Unit',
      },
      document: sourceDocument,
      event: {
        ...event,
        payload: { input: 'Can you tell me the answer?' },
      },
      problemStatement,
      learnerResponseScore: {
        learnerContribution: { type: 'question' },
        learnerQuestion: { contentFocused: true },
      },
      generateTutorUtterance: () => 'Let us work with it a little longer first.',
      runtime: {},
    });
    const replayState = applySparcHistoryRecord(createEmptySparcReplayState(), questionTurn.historyRecord!);

    const answerTurn = await evaluateSparcControllerDialogueTurn({
      document: sourceDocument,
      replayState,
      event: {
        ...event,
        eventId: 'event-after-question',
        time: 3000,
        payload: { input: 'I think B depends on A.' },
      },
      problemStatement,
      learnerResponseScore: {
        learnerContribution: { type: 'answer' },
        learningTargetScores: [{ clusterKC: 'kc-b', coverage: 0.6 }],
      },
      generateTutorUtterance: (request) => {
        assert.notEqual(request.targetType, 'learnerQuestion');
        assert.equal(request.action, 'pump');
        return 'Okay. Say more about that relationship.';
      },
    });

    assert.equal(answerTurn.utteranceRequest.action, 'pump');
  });

  it('commits the planned dialogue turn through canonical SPARC history', async function() {
    const sourceDocument = document();
    const writtenRecords: unknown[] = [];
    const result = await commitSparcControllerDialogueTurn({
      core: {
        TDFId: 'tdf-dialogue-controller',
        sessionID: 'session-dialogue-controller',
        anonStudentId: 'anon-dialogue-controller',
        levelUnit: 1,
        levelUnitName: 'Dialogue Controller Unit',
      },
      document: sourceDocument,
      event,
      problemStatement,
      learnerResponseScore: {
        learningTargetScores: [{
          clusterKC: 'kc-b',
          coverage: 0.6,
        }],
      },
      targetSelectionOptions: {
        anchorClusterKC: 'kc-a',
      },
      generateTutorUtterance: () => 'Think about how B depends on A.',
      runtime: {
        history: {
          writeCanonicalHistory: async (record) => {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(result.historyRecord?.action, 'sparc-dialogue-turn');
    assert.equal(writtenRecords.length, 1);
    assert.equal((writtenRecords[0] as { action?: string })?.action, 'sparc-dialogue-turn');

    const replayState = applySparcHistoryRecord(createEmptySparcReplayState(), result.historyRecord!);
    const facts = buildSparcWorkingMemoryFacts({
      document: sourceDocument,
      replayState,
    });
    assert.ok(facts.some((entry) => (
      entry.factType === 'dialogue.utterance'
      && entry.slots?.speaker === 'tutor'
      && entry.slots?.targetId === 'kc-a'
    )));
    assert.ok(facts.some((entry) => (
      entry.factType === 'learningTarget.selected'
      && entry.slots?.clusterKC === 'kc-a'
    )));
    assert.ok(facts.some((entry) => (
      entry.factType === 'controller.selectedAction'
      && entry.slots?.action === 'pump'
      && entry.slots.targetId === 'kc-a'
    )));
    assert.ok(facts.some((entry) => (
      entry.factType === 'session.turnState'
      && entry.slots?.turnCount === 2
    )));
    assert.equal(facts.some((entry) => entry.factType === 'controller.moveSelectionAudit'), false);
  });

  it('fails clearly when the utterance generator returns blank text', async function() {
    await assert.rejects(
      () => evaluateSparcControllerDialogueTurn({
        document: document(),
        event,
        problemStatement,
        targetSelectionOptions: {
          anchorClusterKC: 'kc-a',
        },
        generateTutorUtterance: () => '   ',
      }),
      /SPARC generated tutor utterance text is required/,
    );
  });

  it('resumes a second turn from replayed stable SPARC controller state', async function() {
    const sourceDocument = document();
    const firstTurn = await commitSparcControllerDialogueTurn({
      core: {
        TDFId: 'tdf-dialogue-controller',
        sessionID: 'session-dialogue-controller',
        anonStudentId: 'anon-dialogue-controller',
        levelUnit: 1,
        levelUnitName: 'Dialogue Controller Unit',
      },
      document: sourceDocument,
      event,
      problemStatement,
      learnerResponseScore: {
        learningTargetScores: [{
          clusterKC: 'kc-b',
          coverage: 0.6,
        }],
      },
      targetSelectionOptions: {
        anchorClusterKC: 'kc-a',
      },
      generateTutorUtterance: () => 'Think about how B depends on A.',
      runtime: {},
    });
    const replayState = applySparcHistoryRecord(createEmptySparcReplayState(), firstTurn.historyRecord!);
    let secondTurnUtteranceCalls = 0;
    const secondTurn = await evaluateSparcControllerDialogueTurn({
      document: sourceDocument,
      replayState,
      problemStatement,
      event: {
        ...event,
        eventId: 'event-dialogue-controller-2',
        time: 3000,
        payload: {
          input: 'four more learner words',
        },
      },
      learnerResponseScore: {
        learningTargetScores: [{
          clusterKC: 'kc-a',
          coverage: 0.2,
        }, {
          clusterKC: 'kc-b',
          coverage: 0.7,
        }],
      },
      targetSelectionOptions: {
        anchorClusterKC: 'kc-b',
      },
      generateTutorUtterance: (request) => {
        secondTurnUtteranceCalls += 1;
        assert.equal(request.targetId, 'kc-a');
        return 'Return to A.';
      },
    });

    assert.equal(secondTurnUtteranceCalls, 1);
    assert.equal(secondTurn.planning.targetSelection.selectedClusterKC, 'kc-a');
    assert.equal(secondTurn.utteranceRequest.targetId, 'kc-a');
    assert.ok(secondTurn.transition.writes.some((write) => (
      write.value
      && typeof write.value === 'object'
      && (write.value as { factType?: string; slots?: { targetId?: string } }).factType === 'controller.selectedAction'
      && (write.value as { slots?: { targetId?: string } }).slots?.targetId === 'kc-a'
    )));
  });
});
