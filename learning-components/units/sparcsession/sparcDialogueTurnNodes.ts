import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import { SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY } from '../../trial-displays/sparc/sparcProgressiveNodes';
import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import { createSparcWorkingMemoryFactStateWrite } from './sparcWorkingMemoryState';
import type {
  SparcAuthoredDocument,
  SparcCanonicalHistoryRecord,
  SparcInterfaceEvent,
  SparcStateTransition,
  SparcStateWrite,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export type SparcDialogueTurnNodeOptions = {
  readonly boxId?: string;
  readonly afterNodeId?: string;
};

export type SparcCommittedDialogueTurn = {
  readonly transition: SparcStateTransition;
  readonly historyRecord?: SparcCanonicalHistoryRecord;
};

export type SparcDialogueTurnRuntime = {
  readonly history?: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function utteranceNode(params: {
  readonly id: string;
  readonly speaker: 'learner' | 'tutor';
  readonly text: string;
  readonly turnEventId: string;
  readonly action?: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly productionRuleId?: string;
  readonly productionRuleName?: string;
  readonly promptId?: string;
  readonly promptVersion?: string;
  readonly outputSchemaId?: string;
  readonly outputSchemaVersion?: string;
  readonly renderer?: string;
  readonly historyAction?: string;
}): Record<string, unknown> {
  return {
    id: params.id,
    nodeType: 'atomic',
    atomType: 'dialogue-utterance',
    speaker: params.speaker,
    value: params.text,
    turnEventId: params.turnEventId,
    ...(params.action ? { action: params.action } : {}),
    ...(params.targetType ? { targetType: params.targetType } : {}),
    ...(params.targetId ? { targetId: params.targetId } : {}),
    ...(params.productionRuleId ? { productionRuleId: params.productionRuleId } : {}),
    ...(params.productionRuleName ? { productionRuleName: params.productionRuleName } : {}),
    ...(params.promptId ? { promptId: params.promptId } : {}),
    ...(params.promptVersion ? { promptVersion: params.promptVersion } : {}),
    ...(params.outputSchemaId ? { outputSchemaId: params.outputSchemaId } : {}),
    ...(params.outputSchemaVersion ? { outputSchemaVersion: params.outputSchemaVersion } : {}),
    ...(params.renderer ? { renderer: params.renderer } : {}),
    ...(params.historyAction ? { historyAction: params.historyAction } : {}),
  };
}

function appendDialogueNodeWrite(params: {
  readonly pageKey: string;
  readonly boxId: string;
  readonly node: Record<string, unknown>;
  readonly afterNodeId?: string;
}): SparcStateWrite {
  return {
    target: {
      pageKey: params.pageKey,
      nodeId: 'root',
    },
    key: SPARC_PROGRESSIVE_NODE_OPERATION_STATE_KEY,
    value: {
      type: params.afterNodeId ? 'insert-node' : 'append-node',
      boxId: params.boxId,
      ...(params.afterNodeId ? { afterNodeId: params.afterNodeId } : {}),
      node: params.node,
    },
  };
}

function dialogueUtteranceFact(params: {
  readonly id: string;
  readonly speaker: 'learner' | 'tutor';
  readonly text: string;
  readonly event: SparcInterfaceEvent;
  readonly action?: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly productionRuleId?: string;
  readonly productionRuleName?: string;
  readonly promptId?: string;
  readonly promptVersion?: string;
  readonly outputSchemaId?: string;
  readonly outputSchemaVersion?: string;
  readonly renderer?: string;
  readonly historyAction?: string;
}): SparcWorkingMemoryFact {
  return {
    factId: params.id,
    factType: 'dialogue.utterance',
    slots: {
      utteranceId: params.id,
      speaker: params.speaker,
      text: params.text,
      pageKey: params.event.source.pageKey,
      sourceNode: params.event.source.nodeId,
      eventId: params.event.eventId,
      time: params.event.time,
      ...(params.action ? { action: params.action } : {}),
      ...(params.targetType ? { targetType: params.targetType } : {}),
      ...(params.targetId ? { targetId: params.targetId } : {}),
      ...(params.productionRuleId ? { productionRuleId: params.productionRuleId } : {}),
      ...(params.productionRuleName ? { productionRuleName: params.productionRuleName } : {}),
      ...(params.promptId ? { promptId: params.promptId } : {}),
      ...(params.promptVersion ? { promptVersion: params.promptVersion } : {}),
      ...(params.outputSchemaId ? { outputSchemaId: params.outputSchemaId } : {}),
      ...(params.outputSchemaVersion ? { outputSchemaVersion: params.outputSchemaVersion } : {}),
      ...(params.renderer ? { renderer: params.renderer } : {}),
      ...(params.historyAction ? { historyAction: params.historyAction } : {}),
    },
  };
}

export function createSparcDialogueTurnTransition(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly learnerText: string;
  readonly utteranceRequest: SparcUtteranceRequest;
  readonly tutorText: string;
  readonly options?: SparcDialogueTurnNodeOptions;
}): SparcStateTransition {
  const pageKey = requireNonBlank(params.document.id, 'SPARC dialogue document id');
  if (params.event.source.pageKey !== pageKey) {
    throw new Error(
      `SPARC dialogue event pageKey "${params.event.source.pageKey}" does not match document "${pageKey}"`,
    );
  }
  const eventId = requireNonBlank(params.event.eventId, 'SPARC dialogue eventId');
  const learnerText = requireNonBlank(params.learnerText, 'SPARC learner dialogue text');
  const tutorText = requireNonBlank(params.tutorText, 'SPARC tutor dialogue text');
  const boxId = requireNonBlank(params.options?.boxId ?? 'dialogue-flow', 'SPARC dialogue boxId');
  const productionRuleId = params.utteranceRequest.sourceRuleId;
  const productionRuleName = [
    ...params.utteranceRequest.responseModifiers
      .map((modifier) => modifier.sourceRuleId)
      .filter((sourceRuleId): sourceRuleId is string => Boolean(sourceRuleId)),
    ...(params.utteranceRequest.sourceRuleId ? [params.utteranceRequest.sourceRuleId] : []),
  ].join(' → ');
  const moveDefinitionMetadata = {
    promptId: params.utteranceRequest.moveDefinition.promptId,
    promptVersion: params.utteranceRequest.moveDefinition.promptVersion,
    outputSchemaId: params.utteranceRequest.moveDefinition.outputSchemaId,
    outputSchemaVersion: params.utteranceRequest.moveDefinition.outputSchemaVersion,
    renderer: params.utteranceRequest.moveDefinition.renderer,
    historyAction: params.utteranceRequest.moveDefinition.historyAction,
  };
  const productionRuleMetadata = {
    ...(productionRuleId ? { productionRuleId } : {}),
    ...(productionRuleName ? { productionRuleName } : {}),
  };
  const learnerNodeId = `${eventId}:learner`;
  const tutorNodeId = `${eventId}:tutor`;
  const learnerFact = dialogueUtteranceFact({
    id: learnerNodeId,
    speaker: 'learner',
    text: learnerText,
    event: params.event,
  });
  const tutorFact = dialogueUtteranceFact({
    id: tutorNodeId,
    speaker: 'tutor',
    text: tutorText,
    event: params.event,
    action: params.utteranceRequest.action,
    targetType: params.utteranceRequest.targetType,
    targetId: params.utteranceRequest.targetId,
    ...productionRuleMetadata,
    ...moveDefinitionMetadata,
  });
  const rootTarget = {
    pageKey,
    nodeId: params.document.root.id,
  };

  return {
    transitionId: `${eventId}:dialogue-turn`,
    event: params.event,
    writes: [
      appendDialogueNodeWrite({
        pageKey,
        boxId,
        ...(params.options?.afterNodeId ? { afterNodeId: params.options.afterNodeId } : {}),
        node: utteranceNode({
          id: learnerNodeId,
          speaker: 'learner',
          text: learnerText,
          turnEventId: eventId,
        }),
      }),
      appendDialogueNodeWrite({
        pageKey,
        boxId,
        afterNodeId: learnerNodeId,
        node: utteranceNode({
          id: tutorNodeId,
          speaker: 'tutor',
          text: tutorText,
          turnEventId: eventId,
          action: params.utteranceRequest.action,
          targetType: params.utteranceRequest.targetType,
          targetId: params.utteranceRequest.targetId,
          ...productionRuleMetadata,
          ...moveDefinitionMetadata,
        }),
      }),
      createSparcWorkingMemoryFactStateWrite({
        target: rootTarget,
        fact: learnerFact,
      }),
      createSparcWorkingMemoryFactStateWrite({
        target: rootTarget,
        fact: tutorFact,
      }),
    ],
  };
}

export async function commitSparcDialogueTurnTransition(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly learnerText: string;
  readonly utteranceRequest: SparcUtteranceRequest;
  readonly tutorText: string;
  readonly options?: SparcDialogueTurnNodeOptions;
  readonly runtime: SparcDialogueTurnRuntime;
}): Promise<SparcCommittedDialogueTurn> {
  const transition = createSparcDialogueTurnTransition(params);
  const historyRecord = createSparcStateTransitionHistoryRecord({
    core: params.core,
    transition,
    action: 'sparc-dialogue-turn',
    outcome: 'unknown',
    responseValue: params.learnerText,
  });
  if (params.runtime.history) {
    await params.runtime.history.writeCanonicalHistory(historyRecord);
  }
  return {
    transition,
    historyRecord,
  };
}
