import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import type { ModelPracticeRuntime } from '../../runtime/modelPracticeRuntime';
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
import { resolveSparcProductionRuleModelTarget } from './sparcAuthoredModelTargets';
import type { SparcReplayState } from './sparcStateReplay';
import type {
  SparcAuthoredDocument,
  SparcCanonicalHistoryRecord,
  SparcProductionRuleExecution,
  SparcReactiveEvent,
  SparcStateTransition,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export type SparcProductionRuleCommitRuntime = {
  readonly adaptiveModel?: ModelPracticeRuntime;
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

function createProductionRuleTransition(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcReactiveEvent;
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
  ]).concat(correctnessWrites);
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
  readonly event: SparcReactiveEvent;
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
  readonly event: SparcReactiveEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly maxCycles?: number;
  readonly runtime: SparcProductionRuleCommitRuntime;
}): Promise<SparcCommittedProductionRuleEvaluation> {
  const evaluation = evaluateSparcAuthoredProductionRules({
    document: params.document,
    event: params.event,
    ...(params.replayState ? { replayState: params.replayState } : {}),
    ...(params.extraFacts ? { extraFacts: params.extraFacts } : {}),
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
    readonly event: SparcReactiveEvent;
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
      ...(observation.stimulusId ? { stimulusId: observation.stimulusId } : {}),
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
        stimulusId: observation.stimulusId ?? null,
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
