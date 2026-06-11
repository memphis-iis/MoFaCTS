import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import {
  evaluateSparcAuthoredReactiveRules,
  type SparcReactiveRuleEvaluation,
} from './sparcReactiveRuleEvaluator';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import type { SparcConditionEvaluationContext } from './sparcConditionEvaluator';
import type {
  SparcAuthoredDocument,
  SparcCanonicalHistoryRecord,
  SparcReactiveEvent,
} from './sparcSessionContracts';

export type SparcReactiveRuleCommitRuntime = {
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

export type SparcCommittedReactiveRuleEvaluation = {
  readonly evaluation: SparcReactiveRuleEvaluation;
  readonly historyRecord?: SparcCanonicalHistoryRecord;
};

export async function commitSparcAuthoredReactiveEvent(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly event: SparcReactiveEvent;
  readonly context: SparcConditionEvaluationContext;
  readonly runtime: SparcReactiveRuleCommitRuntime;
}): Promise<SparcCommittedReactiveRuleEvaluation> {
  const evaluation = evaluateSparcAuthoredReactiveRules({
    document: params.document,
    event: params.event,
    context: params.context,
  });

  if (!evaluation.transition) {
    return { evaluation };
  }

  const historyRecord = createSparcStateTransitionHistoryRecord({
    core: params.core,
    transition: evaluation.transition,
    action: 'sparc-reactive-rule',
  });
  await params.runtime.history.writeCanonicalHistory(historyRecord);
  return {
    evaluation,
    historyRecord,
  };
}
