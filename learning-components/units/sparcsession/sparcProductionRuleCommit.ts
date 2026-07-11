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
import { createSparcProductionRuleTraceHistoryRecords } from './sparcProductionRuleTraceHistory';
import { buildSparcWorkingMemoryFactsWithDerivations } from './sparcWorkingMemoryFacts';
import {
  createSparcStableWorkingMemoryFactStateWrite,
  createSparcWorkingMemoryFactStateWrite,
} from './sparcWorkingMemoryState';
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
  readonly derivedRuleExecution?: SparcProductionRuleExecution;
  readonly transition?: SparcStateTransition;
  readonly historyRecord?: SparcCanonicalHistoryRecord;
  readonly traceHistoryRecords?: readonly SparcCanonicalHistoryRecord[];
  readonly modelHistoryRecords?: readonly SparcCanonicalHistoryRecord[];
};

type ResolvedModelPracticeObservation = {
  readonly processed: SparcProcessedResponseOutcome;
};

type ModelStateFactRequest = {
  readonly pageKey: string;
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
      terminatesProductionPhase: firing.terminatesProductionPhase,
      terminalReason: firing.terminalReason,
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

function patternForCondition(condition: SparcProductionRuleCondition): SparcFactPattern | null {
  if ('type' in condition && condition.type === 'not') {
    return condition.pattern;
  }
  if ('type' in condition && condition.type === 'any') {
    return null;
  }
  return condition as SparcFactPattern;
}

function collectModelStateFactRequestsFromCondition(params: {
  readonly condition: SparcProductionRuleCondition;
  readonly event: SparcInterfaceEvent;
  readonly requests: Map<string, ModelStateFactRequest>;
}): void {
  const pattern = patternForCondition(params.condition);
  if (!pattern) {
    const branches = 'conditions' in params.condition && Array.isArray(params.condition.conditions)
      ? params.condition.conditions
      : [];
    for (const condition of branches) {
      collectModelStateFactRequestsFromCondition({
        condition,
        event: params.event,
        requests: params.requests,
      });
    }
    return;
  }
  if (pattern.factType !== 'model-state') {
    return;
  }
  const metric = literalSlotValue(pattern.slots?.metric);
  if (!isModelPracticeMetric(metric)) {
    throw new Error('SPARC model-state production-rule condition requires literal metric');
  }
  const pageKey = nonBlankString(literalSlotValue(pattern.slots?.pageKey))
    || params.event.source.pageKey;
  const nodeId = nonBlankString(literalSlotValue(pattern.slots?.node))
    || nonBlankString(literalSlotValue(pattern.slots?.nodeId))
    || params.event.source.nodeId;
  const key = `${pageKey}\u0000${nodeId}\u0000${metric}`;
  params.requests.set(key, {
    pageKey,
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
      pageKey: request.pageKey,
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
        pageKey: request.pageKey,
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
    && write.target.pageKey === event.source.pageKey
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
      pageKey: params.event.source.pageKey,
      nodeId: feedbackNodeId,
    },
    key: 'message',
    value: defaultIncorrectMessage,
  }] : [])];
}

function firingTargetsMessageNode(
  firing: SparcProductionRuleExecution['firings'][number],
  pageKey: string,
  nodeId: string,
): boolean {
  return firing.messages.some((message) => (
    message.target?.pageKey === pageKey
    && message.target.nodeId === nodeId
  )) || firing.writes.some((write) => (
    (write.key === 'message' || write.key === 'text' || write.key === 'value')
    && write.target.pageKey === pageKey
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
      && write.target.pageKey === event.source.pageKey
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
    firingTargetsMessageNode(firing, params.event.source.pageKey, feedbackNodeId)
  ));
  if (authoredMessageForFeedbackNode) {
    return [];
  }

  return [{
    target: {
      pageKey: params.event.source.pageKey,
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
    pageKey: params.event.source.pageKey,
    nodeId: params.document.root.id,
  };
  const correctnessWrites = params.execution.firings.flatMap((firing) => (
    firing.writes.some((write) => (
      write.key === 'correctness'
      && write.target.pageKey === params.event.source.pageKey
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
    ...firing.persistentAssertedFacts.map((fact, index) => {
      const identitySlots = firing.persistentAssertedFactIdentitySlots[index];
      return identitySlots
        ? createSparcStableWorkingMemoryFactStateWrite({
            target: workingMemoryTarget,
            fact,
            identitySlots,
          })
        : createSparcWorkingMemoryFactStateWrite({
            target: workingMemoryTarget,
            fact,
          });
    }),
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
  readonly factFilter?: (fact: SparcWorkingMemoryFact) => boolean;
}): SparcCommittedProductionRuleEvaluation {
  const builtFacts = buildSparcWorkingMemoryFactsWithDerivations({
    document: params.document,
    event: params.event,
    ...(params.replayState ? { replayState: params.replayState } : {}),
  });
  const baseFacts = builtFacts.facts.filter((fact) => (params.factFilter ? params.factFilter(fact) : true));
  const facts = [
    ...baseFacts,
    ...(params.extraFacts ?? []),
  ];
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
    ...(builtFacts.derivedRuleExecution ? { derivedRuleExecution: builtFacts.derivedRuleExecution } : {}),
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
      const modelHistoryRecords = await commitProductionRuleModelPracticeObservations(params, evaluation);
      const traceHistoryRecords = await commitProductionRuleTraceHistory(params, evaluation);
      return {
        ...evaluation,
        ...(traceHistoryRecords.length > 0 ? { traceHistoryRecords } : {}),
        ...(modelHistoryRecords.length > 0 ? { modelHistoryRecords } : {}),
      };
    }
    const traceHistoryRecords = await commitProductionRuleTraceHistory(params, evaluation);
    return {
      ...evaluation,
      ...(traceHistoryRecords.length > 0 ? { traceHistoryRecords } : {}),
    };
  }

  const modelHistoryRecords = await commitProductionRuleModelPracticeObservations(params, evaluation);
  const traceHistoryRecords = await commitProductionRuleTraceHistory(params, evaluation);
  const historyRecord = createSparcStateTransitionHistoryRecord({
    core: params.core,
    transition: evaluation.transition,
    action: 'sparc-production-rule',
  });
  await params.runtime.history.writeCanonicalHistory(historyRecord);
  return {
    ...evaluation,
    historyRecord,
    ...(traceHistoryRecords.length > 0 ? { traceHistoryRecords } : {}),
    ...(modelHistoryRecords.length > 0 ? { modelHistoryRecords } : {}),
  };
}

async function commitProductionRuleTraceHistory(
  params: {
    readonly core: SparcPracticeHistoryCore;
    readonly document: SparcAuthoredDocument;
    readonly event: SparcInterfaceEvent;
    readonly runtime: SparcProductionRuleCommitRuntime;
  },
  evaluation: SparcCommittedProductionRuleEvaluation,
): Promise<SparcCanonicalHistoryRecord[]> {
  const traceExecutions = [
    evaluation.derivedRuleExecution,
    evaluation.execution,
  ].filter((execution): execution is SparcProductionRuleExecution => Boolean(execution?.firings.length));
  if (traceExecutions.length === 0) {
    return [];
  }
  const records = traceExecutions.flatMap((execution) => createSparcProductionRuleTraceHistoryRecords({
    core: params.core,
    document: params.document,
    event: params.event,
    execution,
  }));
  for (const record of records) {
    await params.runtime.history.writeCanonicalHistory(record);
  }
  return records;
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
        pageKey: params.event.source.pageKey,
        nodeId,
      },
      time: params.event.time,
      problemStartTime: params.event.time,
      outcome: observation.outcome,
      responseValue: observation.responseValue ?? params.event.payload?.input ?? observation.outcome,
      ...(observation.input !== undefined ? { input: observation.input } : {}),
      displayedStimulus: {
        pageKey: params.event.source.pageKey,
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
