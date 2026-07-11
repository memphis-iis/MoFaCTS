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
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2, addressed: true }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.1, addressed: true }),
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

describe('evaluateSparcControllerDialogueTurn', function() {
  it('plans the move, requests constrained utterance text, and returns replayable dialogue writes', async function() {
    const result = await evaluateSparcControllerDialogueTurn({
      document: document(),
      event,
      learnerResponseScore: {
        learningTargetScores: [{
          clusterKC: 'kc-b',
          coverage: 0.6, addressed: true,
        }],
      },
      targetSelectionOptions: {
        anchorClusterKC: 'kc-a',
      },
      generateTutorUtterance: (request) => {
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
      learnerResponseScore: {
        learningTargetScores: [{
          clusterKC: 'kc-b',
          coverage: 0.6, addressed: true,
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
      learnerResponseScore: {
        learningTargetScores: [{
          clusterKC: 'kc-b',
          coverage: 0.6, addressed: true,
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
          coverage: 0.2, addressed: false,
        }, {
          clusterKC: 'kc-b',
          coverage: 0.7, addressed: true,
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
