import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import type { ModelPracticeRuntime } from '../../runtime/modelPracticeRuntime';
import {
  MODEL_PRACTICE_METRICS,
  type ModelPracticeMetric,
  type ModelPracticeStateProvider,
} from '../../runtime/modelPracticeStateQueries';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import {
  processSparcResponseOutcome,
  type SparcProcessedResponseOutcome,
} from './sparcResponseOutcomeProcessor';
import { commitSparcProcessedResponseOutcome } from './sparcResponseOutcomeCommit';
import { runSparcProductionRules } from './sparcProductionRuleEvaluator';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import { createSparcWorkingMemoryFactStateWrite } from './sparcWorkingMemoryState';
import {
  resolveSparcAuthoredModelTarget,
  resolveSparcProductionRuleModelTarget,
} from './sparcAuthoredModelTargets';
import type { SparcReplayState } from './sparcStateReplay';
import type {
  SparcAuthoredDocument,
  SparcCanonicalHistoryRecord,
  SparcFactPattern,
  SparcFactSlotPattern,
  SparcProductionRuleCondition,
  SparcProductionRuleExecution,
  SparcInterfaceEvent,
  SparcStateWrite,
  SparcStateTransition,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export type SparcProductionRuleCommitRuntime = {
  readonly adaptiveModel?: ModelPracticeRuntime;
  readonly modelState?: ModelPracticeStateProvider;
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

export type SparcCommittedProductionRuleEvaluation = {
  readonly execution: SparcProductionRuleExecution;
  readonly transition?: SparcStateTransition;
  readonly historyRecord?: SparcCanonicalHistoryRecord;
  readonly modelHistoryRecords?: readonly SparcCanonicalHistoryRecord[];
};

type ResolvedModelPracticeObservation = {
  readonly processed: SparcProcessedResponseOutcome;
};

type ModelStateFactRequest = {
  readonly documentId: string;
  readonly nodeId: string;
  readonly metric: ModelPracticeMetric;
};

function productionRuleEventPayload(
  execution: SparcProductionRuleExecution,
): Record<string, unknown> {
  return {
    productionRuleFirings: execution.firings.map((firing) => ({
      ruleId: firing.ruleId,
      bindings: firing.bindings,
      messages: firing.messages,
      classifications: firing.classifications,
      credits: firing.credits,
      assertedFacts: firing.assertedFacts,
      persistentAssertedFacts: firing.persistentAssertedFacts,
      writeCount: firing.writes.length,
    })),
    productionRuleCycles: execution.cycles,
  };
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function literalSlotValue(
  pattern: SparcFactSlotPattern | undefined,
): unknown {
  return pattern?.type === 'literal' ? pattern.value : undefined;
}

function isModelPracticeMetric(value: unknown): value is ModelPracticeMetric {
  return (MODEL_PRACTICE_METRICS as readonly unknown[]).includes(value);
}

function patternForCondition(condition: SparcProductionRuleCondition): SparcFactPattern {
  if ('type' in condition && condition.type === 'not') {
    return condition.pattern;
  }
  return condition as SparcFactPattern;
}

function collectModelStateFactRequestsFromCondition(params: {
  readonly condition: SparcProductionRuleCondition;
  readonly event: SparcInterfaceEvent;
  readonly requests: Map<string, ModelStateFactRequest>;
}): void {
  const pattern = patternForCondition(params.condition);
  if (pattern.factType !== 'model-state') {
    return;
  }
  const metric = literalSlotValue(pattern.slots?.metric);
  if (!isModelPracticeMetric(metric)) {
    throw new Error('SPARC model-state production-rule condition requires literal metric');
  }
  const documentId = nonBlankString(literalSlotValue(pattern.slots?.documentId))
    || params.event.source.documentId;
  const nodeId = nonBlankString(literalSlotValue(pattern.slots?.node))
    || nonBlankString(literalSlotValue(pattern.slots?.nodeId))
    || params.event.source.nodeId;
  const key = `${documentId}\u0000${nodeId}\u0000${metric}`;
  params.requests.set(key, {
    documentId,
    nodeId,
    metric,
  });
}

function collectModelStateFactRequests(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
}): readonly ModelStateFactRequest[] {
  const requests = new Map<string, ModelStateFactRequest>();
  for (const rule of params.document.productionRules ?? []) {
    for (const condition of rule.when) {
      collectModelStateFactRequestsFromCondition({
        condition,
        event: params.event,
        requests,
      });
    }
  }
  return [...requests.values()];
}

function createModelStateFacts(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly provider: ModelPracticeStateProvider;
}): readonly SparcWorkingMemoryFact[] {
  return collectModelStateFactRequests({
    document: params.document,
    event: params.event,
  }).map((request) => {
    const address = {
      documentId: request.documentId,
      nodeId: request.nodeId,
    };
    const target = resolveSparcAuthoredModelTarget(params.document, address)
      ?? resolveSparcProductionRuleModelTarget({
        document: params.document,
        sourceAddress: params.event.source,
        nodeId: request.nodeId,
      });
    return {
      factType: 'model-state',
      slots: {
        documentId: request.documentId,
        node: request.nodeId,
        metric: request.metric,
        value: params.provider.queryModelPracticeState({
          target,
          metric: request.metric,
        }),
      },
    };
  });
}

function eventHasNonEmptyInput(event: SparcInterfaceEvent): boolean {
  const input = event.payload?.input;
  if (input === undefined || input === null) {
    return false;
  }
  return typeof input !== 'string' || input.trim().length > 0;
}

function firingWritesCorrectnessForEvent(
  firing: SparcProductionRuleExecution['firings'][number],
  event: SparcInterfaceEvent,
): boolean {
  return firing.writes.some((write) => (
    write.key === 'correctness'
    && write.target.documentId === event.source.documentId
    && write.target.nodeId === event.source.nodeId
  ));
}

function createUnhandledIncorrectWrites(params: {
  readonly event: SparcInterfaceEvent;
  readonly execution: SparcProductionRuleExecution;
}): SparcStateWrite[] {
  if (
    params.event.type !== 'response-submitted'
    || params.event.payload?.sparcAnswerable !== true
    || !eventHasNonEmptyInput(params.event)
  ) {
    return [];
  }

  const handled = params.execution.firings.some((firing) => (
    firing.classifications.length > 0
    || firingWritesCorrectnessForEvent(firing, params.event)
  ));
  if (handled) {
    return [];
  }

  const defaultIncorrectMessage = nonBlankString(params.event.payload?.sparcDefaultIncorrectMessage)
    || 'No, this is not correct.';
  const feedbackNodeId = nonBlankString(params.event.payload?.sparcDefaultIncorrectFeedbackNodeId);
  return [{
    target: params.event.source,
    key: 'correctness',
    value: 'incorrect',
  }, ...(feedbackNodeId ? [{
    target: {
      documentId: params.event.source.documentId,
      nodeId: feedbackNodeId,
    },
    key: 'message',
    value: defaultIncorrectMessage,
  }] : [])];
}

function firingTargetsMessageNode(
  firing: SparcProductionRuleExecution['firings'][number],
  documentId: string,
  nodeId: string,
): boolean {
  return firing.messages.some((message) => (
    message.target?.documentId === documentId
    && message.target.nodeId === nodeId
  )) || firing.writes.some((write) => (
    (write.key === 'message' || write.key === 'text' || write.key === 'value')
    && write.target.documentId === documentId
    && write.target.nodeId === nodeId
  ));
}

function firingMarksEventCorrect(
  firing: SparcProductionRuleExecution['firings'][number],
  event: SparcInterfaceEvent,
): boolean {
  return firing.classifications.includes('correct')
    || firing.writes.some((write) => (
      write.key === 'correctness'
      && write.value === 'correct'
      && write.target.documentId === event.source.documentId
      && write.target.nodeId === event.source.nodeId
    ));
}

function createCorrectFeedbackClearWrites(params: {
  readonly event: SparcInterfaceEvent;
  readonly execution: SparcProductionRuleExecution;
}): SparcStateWrite[] {
  if (
    params.event.type !== 'response-submitted'
    || params.event.payload?.sparcAnswerable !== true
    || !eventHasNonEmptyInput(params.event)
  ) {
    return [];
  }

  const feedbackNodeId = nonBlankString(params.event.payload?.sparcDefaultIncorrectFeedbackNodeId);
  if (!feedbackNodeId) {
    return [];
  }

  const hasCorrectClassification = params.execution.firings.some((firing) => (
    firingMarksEventCorrect(firing, params.event)
  ));
  if (!hasCorrectClassification) {
    return [];
  }

  const authoredMessageForFeedbackNode = params.execution.firings.some((firing) => (
    firingTargetsMessageNode(firing, params.event.source.documentId, feedbackNodeId)
  ));
  if (authoredMessageForFeedbackNode) {
    return [];
  }

  return [{
    target: {
      documentId: params.event.source.documentId,
      nodeId: feedbackNodeId,
    },
    key: 'message',
    value: '',
  }];
}

function createProductionRuleTransition(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly execution: SparcProductionRuleExecution;
}): SparcStateTransition | undefined {
  const workingMemoryTarget = {
    documentId: params.event.source.documentId,
    nodeId: params.document.root.id,
  };
  const correctnessWrites = params.execution.firings.flatMap((firing) => (
    firing.writes.some((write) => (
      write.key === 'correctness'
      && write.target.documentId === params.event.source.documentId
      && write.target.nodeId === params.event.source.nodeId
    ))
      ? []
      : firing.classifications.map((classification) => ({
        target: params.event.source,
        key: 'correctness',
        value: classification,
      }))
  ));
  const writes = params.execution.firings.flatMap((firing) => [
    ...firing.writes,
    ...firing.persistentAssertedFacts.map((fact) => createSparcWorkingMemoryFactStateWrite({
      target: workingMemoryTarget,
      fact,
    })),
  ]).concat(
    correctnessWrites,
    createCorrectFeedbackClearWrites({
      event: params.event,
      execution: params.execution,
    }),
    createUnhandledIncorrectWrites({
      event: params.event,
      execution: params.execution,
    }),
  );
  if (writes.length === 0) {
    return undefined;
  }
  return {
    transitionId: `${params.event.eventId}:production-rules`,
    event: {
      ...params.event,
      payload: {
        ...(params.event.payload ?? {}),
        ...productionRuleEventPayload(params.execution),
      },
    },
    writes,
  };
}

export function evaluateSparcAuthoredProductionRules(params: {
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly maxCycles?: number;
}): SparcCommittedProductionRuleEvaluation {
  const facts = buildSparcWorkingMemoryFacts({
    document: params.document,
    event: params.event,
    ...(params.replayState ? { replayState: params.replayState } : {}),
    ...(params.extraFacts ? { extraFacts: params.extraFacts } : {}),
  });
  const execution = runSparcProductionRules({
    facts,
    rules: params.document.productionRules ?? [],
    ...(params.maxCycles !== undefined ? { maxCycles: params.maxCycles } : {}),
  });
  const transition = createProductionRuleTransition({
    document: params.document,
    event: params.event,
    execution,
  });
  return {
    execution,
    ...(transition ? { transition } : {}),
  };
}

export async function commitSparcAuthoredProductionRuleEvent(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly maxCycles?: number;
  readonly runtime: SparcProductionRuleCommitRuntime;
}): Promise<SparcCommittedProductionRuleEvaluation> {
  const modelStateFacts = params.runtime.modelState
    ? createModelStateFacts({
      document: params.document,
      event: params.event,
      provider: params.runtime.modelState,
    })
    : [];
  const evaluation = evaluateSparcAuthoredProductionRules({
    document: params.document,
    event: params.event,
    ...(params.replayState ? { replayState: params.replayState } : {}),
    extraFacts: [
      ...(params.extraFacts ?? []),
      ...modelStateFacts,
    ],
    ...(params.maxCycles !== undefined ? { maxCycles: params.maxCycles } : {}),
  });

  if (!evaluation.transition) {
    if (evaluation.execution.firings.some((firing) => firing.modelPracticeObservations.length > 0)) {
      return {
        ...evaluation,
        modelHistoryRecords: await commitProductionRuleModelPracticeObservations(params, evaluation),
      };
    }
    return evaluation;
  }

  const modelHistoryRecords = await commitProductionRuleModelPracticeObservations(params, evaluation);
  const historyRecord = createSparcStateTransitionHistoryRecord({
    core: params.core,
    transition: evaluation.transition,
    action: 'sparc-production-rule',
  });
  await params.runtime.history.writeCanonicalHistory(historyRecord);
  return {
    ...evaluation,
    historyRecord,
    ...(modelHistoryRecords.length > 0 ? { modelHistoryRecords } : {}),
  };
}

async function commitProductionRuleModelPracticeObservations(
  params: {
    readonly core: SparcPracticeHistoryCore;
    readonly document: SparcAuthoredDocument;
    readonly event: SparcInterfaceEvent;
    readonly runtime: SparcProductionRuleCommitRuntime;
  },
  evaluation: SparcCommittedProductionRuleEvaluation,
): Promise<SparcCanonicalHistoryRecord[]> {
  const observations = evaluation.execution.firings.flatMap((firing) => firing.modelPracticeObservations);
  if (observations.length === 0) {
    return [];
  }
  if (!params.runtime.adaptiveModel) {
    throw new Error('SPARC production rule model-practice effect requires adaptive model runtime support');
  }
  const resolvedObservations: ResolvedModelPracticeObservation[] = observations.map((observation, index) => {
    const nodeId = observation.nodeId || params.event.source.nodeId;
    const modelTarget = resolveSparcProductionRuleModelTarget({
      document: params.document,
      sourceAddress: params.event.source,
      ...(observation.clusterIndex !== undefined ? { clusterIndex: observation.clusterIndex } : {}),
      nodeId,
    });
    const processed = processSparcResponseOutcome(params.core, {
      observationId: `${params.event.eventId}:model-practice:${index}`,
      sourceAddress: {
        documentId: params.event.source.documentId,
        nodeId,
      },
      time: params.event.time,
      problemStartTime: params.event.time,
      outcome: observation.outcome,
      responseValue: observation.responseValue ?? params.event.payload?.input ?? observation.outcome,
      ...(observation.input !== undefined ? { input: observation.input } : {}),
      displayedStimulus: {
        documentId: params.event.source.documentId,
        nodeId,
        clusterIndex: observation.clusterIndex ?? null,
      },
      modelTarget,
    });
    return { processed };
  });

  const committed: SparcCanonicalHistoryRecord[] = [];
  for (const { processed } of resolvedObservations) {
    const committedOutcome = await commitSparcProcessedResponseOutcome(
      params.core,
      processed,
      {
        adaptiveModel: params.runtime.adaptiveModel,
        history: params.runtime.history,
      },
    );
    committed.push(committedOutcome.historyRecord);
  }
  return committed;
}
