import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import { runSparcProductionRules } from './sparcProductionRuleEvaluator';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import { createSparcWorkingMemoryFactStateWrite } from './sparcWorkingMemoryState';
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
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

export type SparcCommittedProductionRuleEvaluation = {
  readonly execution: SparcProductionRuleExecution;
  readonly transition?: SparcStateTransition;
  readonly historyRecord?: SparcCanonicalHistoryRecord;
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
  const writes = params.execution.firings.flatMap((firing) => [
    ...firing.writes,
    ...firing.assertedFacts.map((fact) => createSparcWorkingMemoryFactStateWrite({
      target: workingMemoryTarget,
      fact,
    })),
  ]);
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
    return evaluation;
  }

  const historyRecord = createSparcStateTransitionHistoryRecord({
    core: params.core,
    transition: evaluation.transition,
    action: 'sparc-production-rule',
  });
  await params.runtime.history.writeCanonicalHistory(historyRecord);
  return {
    ...evaluation,
    historyRecord,
  };
}
