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

function literal(value: unknown) {
  return { type: 'literal' as const, value };
}

function variable(name: string) {
  return { type: 'variable' as const, name };
}

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

function document(): SparcAuthoredDocument {
  return {
    id: 'sparc-dialogue-controller-doc',
    schemaVersion: 1,
    workingMemoryFacts: [
      fact('controller.targetSelectionPolicy', {
        policy: 'kc-graph-priority',
        coverageThreshold: 0.8,
        frontierWeight: 0.5,
        coherenceWeight: 0.3,
        centralityWeight: 0.2,
      }),
      fact('learningTarget.source', { clusterKC: 'kc-a' }),
      fact('learningTarget.source', { clusterKC: 'kc-b' }),
      fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0.1 }),
      fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.1, description: 'A' }),
      fact('kcGraph.node', { clusterKC: 'kc-b', centrality: 0.8, description: 'B' }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-a', targetClusterKC: 'kc-b', strength: 0.9 }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-b', targetClusterKC: 'kc-a', strength: 0.9 }),
      fact('dialogue.moveContent', {
        targetType: 'learningTarget',
        clusterKC: 'kc-b',
        action: 'hint',
        text: 'Use the relationship between A and B.',
      }),
      fact('dialogue.moveContent', {
        targetType: 'learningTarget',
        clusterKC: 'kc-a',
        action: 'hint',
        text: 'Return to A.',
      }),
      fact('dialogue.learnerWordCount', { cumulative: 2 }),
      fact('session.turnState', { turnCount: 1 }),
    ],
    productionRules: [{
      id: 'dialogue.move.test-hint',
      module: 'dialogue.move-selection',
      salience: 10,
      when: [{
        factType: 'learningTarget.selected',
        slots: {
          clusterKC: { type: 'bind', variable: 'targetClusterKC' },
        },
      }, {
        factType: 'learningTarget.coverageMean',
        slots: {
          scope: { type: 'literal', value: 'required' },
          value: { type: 'range', min: 0, max: 0.5 },
        },
      }, {
        factType: 'dialogue.learnerWordCount',
        slots: {
          cumulative: { type: 'range', min: 5 },
        },
      }],
      then: [{
        type: 'assert-fact',
        fact: {
          factType: 'controller.selectedAction',
          slots: {
            targetType: literal('learningTarget'),
            clusterKC: variable('targetClusterKC'),
            action: literal('hint'),
            sourceRuleId: literal('paper-rule-test-hint'),
          },
        },
      }, {
        type: 'terminate-production-phase',
        reason: 'move-selected',
      }],
    }],
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
    documentId: 'sparc-dialogue-controller-doc',
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
          coverage: 0.6,
        }],
        answerQuality: 'partial',
      },
      targetSelectionOptions: {
        anchorClusterKC: 'kc-a',
      },
      generateTutorUtterance: (request) => {
        assert.equal(request.targetType, 'learningTarget');
        assert.equal(request.targetId, 'kc-b');
        assert.equal(request.action, 'hint');
        assert.deepEqual(request.contentTexts, ['Use the relationship between A and B.']);
        return { text: 'Think about how B depends on A.' };
      },
    });

    assert.equal(result.planning.targetSelection.selectedClusterKC, 'kc-b');
    assert.ok(result.learnerResponseScoreFacts.some((fact) => (
      fact.factType === 'learningTarget.score'
      && fact.slots?.clusterKC === 'kc-b'
      && fact.slots.coverage === 0.6
    )));
    assert.equal(result.moveSelectionAudit.selected?.ruleId, 'dialogue.move.test-hint');
    assert.equal(result.moveSelectionAudit.selected?.action, 'hint');
    assert.equal(result.utteranceRequest.action, 'hint');
    assert.equal(result.tutorText, 'Think about how B depends on A.');

    const nodes = applySparcProgressiveNodeOperations(
      [],
      collectSparcProgressiveNodeOperations([result.transition]),
    );
    assert.deepEqual(nodes.map((node) => (node as { speaker?: string }).speaker), ['learner', 'tutor']);
    assert.equal((nodes[1] as { value?: string }).value, 'Think about how B depends on A.');
    assert.equal((nodes[1] as { productionRuleName?: string }).productionRuleName, 'paper-rule-test-hint');
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
          coverage: 0.6,
        }],
        answerQuality: 'partial',
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
      && entry.slots?.targetId === 'kc-b'
    )));
    assert.ok(facts.some((entry) => (
      entry.factType === 'learningTarget.selected'
      && entry.slots?.clusterKC === 'kc-b'
    )));
    assert.ok(facts.some((entry) => (
      entry.factType === 'controller.selectedAction'
      && entry.slots?.action === 'hint'
      && entry.slots.clusterKC === 'kc-b'
    )));
    assert.ok(facts.some((entry) => (
      entry.factType === 'session.turnState'
      && entry.slots?.turnCount === 2
    )));
    assert.ok(facts.some((entry) => (
      entry.factType === 'learnerResponse.answerQuality'
      && entry.slots?.value === 'partial'
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
          coverage: 0.6,
        }],
        answerQuality: 'partial',
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
          clusterKC: 'kc-b',
          coverage: 0.7,
        }],
        answerQuality: 'partial',
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
      && (write.value as { factType?: string; slots?: { clusterKC?: string } }).factType === 'controller.selectedAction'
      && (write.value as { slots?: { clusterKC?: string } }).slots?.clusterKC === 'kc-a'
    )));
  });
});
