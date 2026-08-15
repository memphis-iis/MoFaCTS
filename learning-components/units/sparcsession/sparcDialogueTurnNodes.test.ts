import { strict as assert } from 'node:assert';
import {
  applySparcProgressiveNodeOperations,
  collectSparcProgressiveNodeOperations,
} from '../../trial-displays/sparc/sparcProgressiveNodes';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import {
  createEmptySparcReplayState,
  applySparcHistoryRecord,
  applySparcStateTransition,
} from './sparcStateReplay';
import {
  commitSparcDialogueTurnTransition,
  createSparcDialogueTurnTransition,
  SPARC_DIALOGUE_MAX_PERSISTED_MESSAGE_BYTES,
} from './sparcDialogueTurnNodes';
import { requireActiveSparcMoveDefinition } from './sparcMoveDefinitions';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import type { SparcAuthoredDocument, SparcInterfaceEvent } from './sparcSessionContracts';
import {
  DEFAULT_HISTORY_EXTENSION_FIELD_BUDGET_BYTES,
  getJsonUtf8ByteLength,
} from '../../runtime/historyEnvelope';

function document(): SparcAuthoredDocument {
  return {
    id: 'sparc-dialogue-doc',
    schemaVersion: 2,
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
  eventId: 'turn-3',
  type: 'response-submitted',
  source: {
    pageKey: 'sparc-dialogue-doc',
    nodeId: 'learner-input',
  },
  time: 3000,
  payload: {
    input: 'I think evaporation happens first.',
  },
};

const utteranceRequest = {
  problemStatement: 'Explain what happens before condensation.',
  targetType: 'learningTarget' as const,
  action: 'hint',
  targetId: 'kc-evaporation',
  contentTexts: ['Evaporation is the target.'],
  moveDefinition: requireActiveSparcMoveDefinition('hint'),
  responseModifiers: [],
  selectedAction: {
    targetType: 'learningTarget',
    clusterKC: 'kc-evaporation',
    action: 'hint',
    sourceRuleId: 'paper-rule-06-hint',
  },
  sourceRuleId: 'paper-rule-06-hint',
  selectionDiagnostic: {
    targetKind: 'expectation' as const,
    currentValue: 0.4,
    goalValue: 0.8,
    rankWithinKind: 1,
  },
};

describe('createSparcDialogueTurnTransition', function() {
  it('creates replayable progressive nodes for a learner and tutor utterance', function() {
    const transition = createSparcDialogueTurnTransition({
      document: document(),
      event,
      learnerText: 'I think evaporation happens first.',
      utteranceRequest,
      tutorText: 'Good start. What has to happen before water vapor can condense?',
    });

    const operations = collectSparcProgressiveNodeOperations([transition]);
    assert.equal(operations.length, 2);
    assert.equal(transition.writes.filter((write) => (
      write.value
      && typeof write.value === 'object'
      && (write.value as { factType?: unknown }).factType === 'dialogue.utterance'
    )).length, 0);

    const nodes = applySparcProgressiveNodeOperations([], operations);
    assert.deepEqual(nodes.map((node) => (node as { id: string }).id), [
      'turn-3:learner',
      'turn-3:tutor',
    ]);
    assert.equal((nodes[0] as { speaker?: string }).speaker, 'learner');
    assert.equal((nodes[1] as { speaker?: string }).speaker, 'tutor');
    assert.equal((nodes[1] as { action?: string }).action, 'hint');
    assert.equal((nodes[1] as { targetId?: string }).targetId, 'kc-evaporation');
    assert.equal((nodes[1] as { productionRuleName?: string }).productionRuleName, 'paper-rule-06-hint');
    assert.equal((nodes[1] as { selectionTargetKind?: string }).selectionTargetKind, 'expectation');
    assert.equal((nodes[1] as { selectionCurrentValue?: number }).selectionCurrentValue, 0.4);
    assert.equal((nodes[1] as { selectionGoalValue?: number }).selectionGoalValue, 0.8);
    assert.equal((nodes[1] as { selectionRankWithinKind?: number }).selectionRankWithinKind, 1);
    assert.equal((nodes[1] as { promptId?: string }).promptId, 'autotutor.hint');
    assert.equal((nodes[1] as { promptVersion?: string }).promptVersion, 'v3');
    assert.equal((nodes[1] as { outputSchemaId?: string }).outputSchemaId, 'autotutor.chat_utterance');
    assert.equal((nodes[1] as { outputSchemaVersion?: string }).outputSchemaVersion, 'v1');
    assert.equal((nodes[1] as { renderer?: string }).renderer, 'sparc.dialogue_utterance');
    assert.equal((nodes[1] as { historyAction?: string }).historyAction, 'sparc-dialogue-turn');
  });

  it('persists dialogue utterance facts through ordinary SPARC replay', function() {
    const sourceDocument = document();
    const transition = createSparcDialogueTurnTransition({
      document: sourceDocument,
      event,
      learnerText: 'I think evaporation happens first.',
      utteranceRequest,
      tutorText: 'Good start. What has to happen before water vapor can condense?',
    });

    const replayState = applySparcStateTransition(createEmptySparcReplayState(), transition);
    const facts = buildSparcWorkingMemoryFacts({
      document: sourceDocument,
      replayState,
    }).filter((fact) => fact.factType === 'dialogue.utterance');

    assert.equal(facts.length, 2);
    assert.deepEqual(facts.map((fact) => fact.slots?.speaker), ['learner', 'tutor']);
    assert.equal(facts[1]?.slots?.action, 'hint');
    assert.equal(facts[1]?.slots?.targetType, 'learningTarget');
    assert.equal(facts[1]?.slots?.targetId, 'kc-evaporation');
    assert.equal(facts[1]?.slots?.productionRuleName, 'paper-rule-06-hint');
    assert.equal(facts[1]?.slots?.selectionTargetKind, 'expectation');
    assert.equal(facts[1]?.slots?.selectionCurrentValue, 0.4);
    assert.equal(facts[1]?.slots?.selectionGoalValue, 0.8);
    assert.equal(facts[1]?.slots?.selectionRankWithinKind, 1);
    assert.equal(facts[1]?.slots?.promptId, 'autotutor.hint');
    assert.equal(facts[1]?.slots?.promptVersion, 'v3');
    assert.equal(facts[1]?.slots?.outputSchemaId, 'autotutor.chat_utterance');
    assert.equal(facts[1]?.slots?.outputSchemaVersion, 'v1');
    assert.equal(facts[1]?.slots?.renderer, 'sparc.dialogue_utterance');
    assert.equal(facts[1]?.slots?.historyAction, 'sparc-dialogue-turn');
  });

  it('fails clearly when the event belongs to another SPARC document', function() {
    assert.throws(
      () => createSparcDialogueTurnTransition({
        document: document(),
        event: {
          ...event,
          source: {
            ...event.source,
            pageKey: 'other-doc',
          },
        },
        learnerText: 'A response',
        utteranceRequest,
        tutorText: 'A tutor reply',
      }),
      /does not match document "sparc-dialogue-doc"/,
    );
  });

  it('rejects a dialogue message that cannot fit the durable per-message contract', function() {
    assert.throws(
      () => createSparcDialogueTurnTransition({
        document: document(),
        event,
        learnerText: 'a'.repeat(SPARC_DIALOGUE_MAX_PERSISTED_MESSAGE_BYTES),
        utteranceRequest,
        tutorText: 'A tutor reply',
      }),
      /SPARC learner dialogue text exceeds 2048 JSON UTF-8 bytes/,
    );
  });

  it('keeps maximum supported dialogue messages within the SPARC history extension budget', function() {
    const message = 'a'.repeat(SPARC_DIALOGUE_MAX_PERSISTED_MESSAGE_BYTES - 2);
    const transition = createSparcDialogueTurnTransition({
      document: document(),
      event,
      learnerText: message,
      utteranceRequest,
      tutorText: message,
    });
    const record = createSparcStateTransitionHistoryRecord({
      core: {
        TDFId: 'tdf-dialogue',
        sessionID: 'session-dialogue',
        anonStudentId: 'anon-dialogue',
        levelUnit: 1,
      },
      transition,
      action: 'sparc-dialogue-turn',
    });

    assert.ok(getJsonUtf8ByteLength(record.sparc) <= DEFAULT_HISTORY_EXTENSION_FIELD_BUDGET_BYTES);
  });

  it('commits the dialogue turn as a canonical SPARC history record', async function() {
    const sourceDocument = document();
    const writtenRecords: unknown[] = [];
    const result = await commitSparcDialogueTurnTransition({
      core: {
        TDFId: 'tdf-dialogue',
        sessionID: 'session-dialogue',
        anonStudentId: 'anon-dialogue',
        levelUnit: 1,
        levelUnitName: 'Dialogue Unit',
      },
      document: sourceDocument,
      event,
      learnerText: 'I think evaporation happens first.',
      utteranceRequest,
      tutorText: 'Good start. What has to happen before water vapor can condense?',
      runtime: {
        history: {
          writeCanonicalHistory: async (record) => {
            writtenRecords.push(record);
          },
        },
      },
    });

    assert.equal(result.historyRecord?.eventType, 'sparc');
    assert.equal(result.historyRecord?.action, 'sparc-dialogue-turn');
    assert.equal(result.historyRecord?.responseValue, 'I think evaporation happens first.');
    assert.equal(writtenRecords.length, 1);

    const replayState = applySparcHistoryRecord(createEmptySparcReplayState(), result.historyRecord!);
    const facts = buildSparcWorkingMemoryFacts({
      document: sourceDocument,
      replayState,
    });

    assert.ok(facts.some((fact) => (
      fact.factType === 'dialogue.utterance'
      && fact.slots?.speaker === 'tutor'
      && fact.slots.action === 'hint'
    )));
  });
});
