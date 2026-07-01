import { strict as assert } from 'node:assert';
import { collectSparcProgressiveNodeOperations } from '../../trial-displays/sparc/sparcProgressiveNodes';
import { commitSparcTrialDisplayControllerDialogueTurn } from './sparcTrialDisplayRuntimeBridge';
import type { SparcTrialDisplay } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

function literal(value: unknown) {
  return { type: 'literal' as const, value };
}

function variable(name: string) {
  return { type: 'variable' as const, name };
}

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

function dialogueDisplay(): SparcTrialDisplay {
  return {
    type: 'sparc',
    documentId: 'dialogue-doc',
    nodes: [{
      id: 'dialogue-thread',
      nodeType: 'group',
      groupType: 'dialogue-thread',
      children: [{
        id: 'opening-message',
        nodeType: 'atomic',
        atomType: 'dialogue-utterance',
        speaker: 'tutor',
        value: 'Tell me about the topic.',
      }],
    }, {
      id: 'learner-response-input',
      nodeType: 'atomic',
      atomType: 'text-input',
      value: '',
    }, {
      id: 'learner-response-submit',
      nodeType: 'atomic',
      atomType: 'button',
      label: 'Submit',
      value: 'submit',
    }],
    workingMemoryFacts: [
      fact('controller.targetSelectionPolicy', {
        policy: 'kc-graph-priority',
        coverageThreshold: 0.8,
      }),
      fact('learningTarget.source', { clusterKC: 'kc-a' }),
      fact('learningTarget.source', { clusterKC: 'kc-b' }),
      fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.1 }),
      fact('kcGraph.node', { clusterKC: 'kc-b', centrality: 0.8 }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-a', targetClusterKC: 'kc-b', strength: 0.9 }),
      fact('kcGraph.relationship', { sourceClusterKC: 'kc-b', targetClusterKC: 'kc-a', strength: 0.9 }),
      fact('dialogue.moveContent', {
        targetType: 'learningTarget',
        clusterKC: 'kc-b',
        action: 'hint',
        text: 'Use the second idea.',
      }),
      fact('dialogue.moveContent', {
        targetType: 'learningTarget',
        clusterKC: 'kc-a',
        action: 'hint',
        text: 'Return to the first idea.',
      }),
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
      }],
      then: [{
        type: 'assert-fact',
        persist: true,
        fact: {
          factType: 'controller.selectedAction',
          slots: {
            targetType: literal('learningTarget'),
            clusterKC: variable('targetClusterKC'),
            action: literal('hint'),
          },
        },
      }, {
        type: 'terminate-production-phase',
        reason: 'move-selected',
      }],
    }],
    clusterTargets: [{
      clusterIndex: 0,
      stimulusKC: 'stim-a',
      clusterKC: 'kc-a',
      KCId: 'stim-a',
      KCDefault: 'stim-a',
      KCCluster: 'kc-a',
    }, {
      clusterIndex: 1,
      stimulusKC: 'stim-b',
      clusterKC: 'kc-b',
      KCId: 'stim-b',
      KCDefault: 'stim-b',
      KCCluster: 'kc-b',
    }],
  };
}

describe('SPARC trial display controller dialogue bridge', function() {
  it('commits one scored dialogue submit through ordinary SPARC history', async function() {
    const historyRecords: CanonicalHistoryRecord[] = [];
    const display = dialogueDisplay();
    let scorerLearnerText = '';
    let generatorTargetId = '';

    const result = await commitSparcTrialDisplayControllerDialogueTurn({
      core: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      },
      documentId: 'dialogue-doc',
      display,
      result: {
        submittedNodes: {
          'learner-response-input': 'Here is my partial answer.',
          'learner-response-submit': 'submit',
        },
        triggeredBy: 'learner-response-submit',
        timestamp: 1234,
      },
      priorHistoryRecords: [],
      targetSelectionOptions: {
        anchorClusterKC: 'kc-a',
      },
      scoreLearnerResponse: ({ learnerText }) => {
        scorerLearnerText = learnerText;
        return {
          learningTargetScores: [{
            clusterKC: 'kc-a',
            coverage: 0.2,
          }, {
            clusterKC: 'kc-b',
            coverage: 0.1,
          }],
          answerQuality: 'partial',
        };
      },
      generateTutorUtterance: (request) => {
        generatorTargetId = request.targetId;
        return request.contentTexts[0]!;
      },
      history: {
        async writeCanonicalHistory(historyRecord) {
          historyRecords.push(historyRecord);
        },
      },
    });

    assert.equal(scorerLearnerText, 'Here is my partial answer.');
    assert.equal(result.learnerText, 'Here is my partial answer.');
    assert.equal(result.event.source.nodeId, 'learner-response-input');
    assert.equal(generatorTargetId, 'kc-b');
    assert.equal(result.dialogueTurn.utteranceRequest.action, 'hint');
    assert.equal(historyRecords.length, 1);
    assert.equal(historyRecords[0]?.action, 'sparc-dialogue-turn');

    const operations = collectSparcProgressiveNodeOperations([
      result.dialogueTurn.transition,
    ]);
    assert.deepEqual(operations.map((operation) => operation.type), ['append-node', 'insert-node']);
    assert.deepEqual(
      operations.flatMap((operation) => ('node' in operation ? [operation.node.speaker] : [])),
      ['learner', 'tutor'],
    );
  });

  it('resumes from prior SPARC dialogue history without redoing completed-turn LLM work', async function() {
    const historyRecords: CanonicalHistoryRecord[] = [];
    const display = dialogueDisplay();

    await commitSparcTrialDisplayControllerDialogueTurn({
      core: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      },
      documentId: 'dialogue-doc',
      display,
      result: {
        submittedNodes: {
          'learner-response-input': 'Here is my partial answer.',
          'learner-response-submit': 'submit',
        },
        triggeredBy: 'learner-response-submit',
        timestamp: 1234,
      },
      priorHistoryRecords: [],
      targetSelectionOptions: {
        anchorClusterKC: 'kc-a',
      },
      scoreLearnerResponse: () => ({
        learningTargetScores: [{
          clusterKC: 'kc-a',
          coverage: 0.2,
        }, {
          clusterKC: 'kc-b',
          coverage: 0.1,
        }],
        answerQuality: 'partial',
      }),
      generateTutorUtterance: (request) => request.contentTexts[0]!,
      history: {
        async writeCanonicalHistory(historyRecord) {
          historyRecords.push(historyRecord);
        },
      },
    });

    let secondScorerCalls = 0;
    let secondGeneratorCalls = 0;
    const _secondTurn = await commitSparcTrialDisplayControllerDialogueTurn({
      core: {
        TDFId: 'tdf-1',
        sessionID: 'session-1',
        levelUnit: 2,
        userId: 'user-1',
      },
      documentId: 'dialogue-doc',
      display,
      result: {
        submittedNodes: {
          'learner-response-input': 'Another answer for the next turn.',
          'learner-response-submit': 'submit',
        },
        triggeredBy: 'learner-response-submit',
        timestamp: 2234,
      },
      priorHistoryRecords: historyRecords,
      targetSelectionOptions: {
        anchorClusterKC: 'kc-b',
      },
      scoreLearnerResponse: ({ replayState }) => {
        secondScorerCalls += 1;
        assert.equal(replayState.transitions.some((transition) => transition.transitionId.endsWith(':dialogue-turn')), true);
        assert.equal(replayState.traceSteps.length, 0);
        return {
          learningTargetScores: [{
            clusterKC: 'kc-b',
            coverage: 0.9,
          }],
          answerQuality: 'partial',
        };
      },
      generateTutorUtterance: (request) => {
        secondGeneratorCalls += 1;
        return request.contentTexts[0]!;
      },
      history: {
        async writeCanonicalHistory(historyRecord) {
          historyRecords.push(historyRecord);
        },
      },
    });

    assert.equal(secondScorerCalls, 1);
    assert.equal(secondGeneratorCalls, 1);
    assert.equal(historyRecords.length, 2);
    assert.equal(historyRecords.filter((record) => record.action === 'sparc-dialogue-turn').length, 2);
    assert.equal(historyRecords.filter((record) => record.action === 'sparc-production-rule-trace').length, 0);
  });

  it('rejects ambiguous dialogue submits instead of guessing a learner response', async function() {
    await assert.rejects(
      () => commitSparcTrialDisplayControllerDialogueTurn({
        core: {
          TDFId: 'tdf-1',
          sessionID: 'session-1',
          levelUnit: 2,
          userId: 'user-1',
        },
        documentId: 'dialogue-doc',
        display: dialogueDisplay(),
        result: {
          submittedNodes: {
            'learner-response-submit': 'submit',
          },
          triggeredBy: 'learner-response-submit',
          timestamp: 1234,
        },
        priorHistoryRecords: [],
        scoreLearnerResponse: () => ({ answerQuality: 'partial' }),
        generateTutorUtterance: () => 'Tutor message.',
        history: {
          async writeCanonicalHistory() {},
        },
      }),
      /SPARC dialogue submit requires exactly one answerable submitted node; found 0/,
    );
  });
});
