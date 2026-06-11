import {
  createHistoryBackedModelPracticeStateProvider,
} from '../../runtime/modelPracticeStateQueries';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import { commitSparcAuthoredReactiveEvent } from './sparcReactiveRuleCommit';
import { replaySparcDocumentHistory } from './sparcDocumentReplay';
import {
  commitSparcProcessedResponseOutcome,
  type SparcCommittedResponseOutcome,
  type SparcResponseOutcomeCommitRuntime,
} from './sparcResponseOutcomeCommit';
import { processSparcAuthoredResponseOutcome } from './sparcAuthoredResponseOutcome';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import type {
  SparcCommittedReactiveRuleEvaluation,
} from './sparcReactiveRuleCommit';
import type {
  SparcAuthoredDocument,
} from './sparcSessionContracts';
import type {
  SparcProcessedResponseOutcome,
  SparcResponseOutcomeInput,
} from './sparcResponseOutcomeProcessor';
import {
  replaySparcHistory,
  type SparcReplayState,
} from './sparcStateReplay';

export type SparcResponseOutcomePipelineResult = {
  readonly responseCommit: SparcCommittedResponseOutcome;
  readonly reactiveCommit: SparcCommittedReactiveRuleEvaluation;
  readonly replayStateAfterResponse: SparcReplayState;
  readonly finalReplayState: SparcReplayState;
};

export async function commitSparcResponseOutcomeWithAuthoredRules(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly processed: SparcProcessedResponseOutcome;
  readonly replayState: SparcReplayState;
  readonly priorModelHistoryRecords?: readonly CanonicalHistoryRecord[];
  readonly runtime: SparcResponseOutcomeCommitRuntime;
}): Promise<SparcResponseOutcomePipelineResult> {
  const responseCommit = await commitSparcProcessedResponseOutcome(
    params.core,
    params.processed,
    params.runtime,
  );
  const replayStateAfterResponse = replaySparcHistory(
    [responseCommit.historyRecord],
    params.replayState,
  );
  const reactiveCommit = await commitSparcAuthoredReactiveEvent({
    core: params.core,
    document: params.document,
    event: {
      eventId: `${params.processed.observation.observationId}:authored-rules`,
      type: responseCommit.usedAdaptiveModel ? 'model-updated' : 'outcome-recorded',
      source: params.processed.observation.sourceAddress,
      time: params.processed.observation.time,
      practiceObservation: params.processed.observation,
    },
    context: {
      replayState: replayStateAfterResponse,
      modelQueries: createHistoryBackedModelPracticeStateProvider([
        ...(params.priorModelHistoryRecords ?? []),
        responseCommit.historyRecord,
      ]),
    },
    runtime: {
      history: params.runtime.history,
    },
  });
  const finalReplayState = reactiveCommit.historyRecord
    ? replaySparcHistory([reactiveCommit.historyRecord], replayStateAfterResponse)
    : replayStateAfterResponse;

  return {
    responseCommit,
    reactiveCommit,
    replayStateAfterResponse,
    finalReplayState,
  };
}

export async function commitSparcResponseOutcomeFromDocumentHistory(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly processed: SparcProcessedResponseOutcome;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
  readonly runtime: SparcResponseOutcomeCommitRuntime;
}): Promise<SparcResponseOutcomePipelineResult> {
  return commitSparcResponseOutcomeWithAuthoredRules({
    core: params.core,
    document: params.document,
    processed: params.processed,
    replayState: replaySparcDocumentHistory(
      params.document,
      params.priorHistoryRecords,
    ),
    priorModelHistoryRecords: params.priorHistoryRecords,
    runtime: params.runtime,
  });
}

export async function processAndCommitSparcAuthoredResponseOutcome(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly input: SparcResponseOutcomeInput;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
  readonly runtime: SparcResponseOutcomeCommitRuntime;
}): Promise<SparcResponseOutcomePipelineResult> {
  const processed = processSparcAuthoredResponseOutcome(
    params.core,
    params.document,
    params.input,
  );
  return commitSparcResponseOutcomeFromDocumentHistory({
    core: params.core,
    document: params.document,
    processed,
    priorHistoryRecords: params.priorHistoryRecords,
    runtime: params.runtime,
  });
}
