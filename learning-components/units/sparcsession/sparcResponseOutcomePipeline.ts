import {
  createHistoryBackedModelPracticeStateProvider,
  type ModelPracticeStateProvider,
} from '../../runtime/modelPracticeStateQueries';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import {
  commitSparcAuthoredProductionRuleEvent,
} from './sparcProductionRuleCommit';
import { replaySparcDocumentHistory } from './sparcDocumentReplay';
import {
  commitSparcProcessedResponseOutcome,
  type SparcCommittedResponseOutcome,
  type SparcResponseOutcomeCommitRuntime,
} from './sparcResponseOutcomeCommit';
import { processSparcAuthoredResponseOutcome } from './sparcAuthoredResponseOutcome';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import type {
  SparcCommittedProductionRuleEvaluation,
} from './sparcProductionRuleCommit';
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

function createRuleModelQueryProvider(params: {
  readonly historyRecords: readonly CanonicalHistoryRecord[];
  readonly liveModelQueries: ModelPracticeStateProvider;
}): ModelPracticeStateProvider {
  const historyBackedProvider = createHistoryBackedModelPracticeStateProvider(params.historyRecords);
  return {
    queryModelPracticeState(query) {
      if (query.metric === 'probability') {
        return params.liveModelQueries.queryModelPracticeState(query);
      }
      return historyBackedProvider.queryModelPracticeState(query);
    },
  };
}

export type SparcResponseOutcomePipelineResult = {
  readonly responseCommit: SparcCommittedResponseOutcome;
  readonly productionCommit: SparcCommittedProductionRuleEvaluation;
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
  const authoredRuleEvent = {
    eventId: `${params.processed.observation.observationId}:authored-rules`,
    type: responseCommit.usedAdaptiveModel ? 'model-updated' as const : 'outcome-recorded' as const,
    source: params.processed.observation.sourceAddress,
    time: params.processed.observation.time,
    payload: {
      outcome: params.processed.observation.outcome,
      responseValue: params.processed.observation.responseValue,
      ...(params.processed.observation.input !== undefined ? { input: params.processed.observation.input } : {}),
    },
    practiceObservation: params.processed.observation,
  };
  const productionCommit = await commitSparcAuthoredProductionRuleEvent({
    core: params.core,
    document: params.document,
    event: authoredRuleEvent,
    replayState: replayStateAfterResponse,
    extraFacts: [],
    runtime: {
      adaptiveModel: params.runtime.adaptiveModel,
      modelState: createRuleModelQueryProvider({
        historyRecords: [
          ...(params.priorModelHistoryRecords ?? []),
          responseCommit.historyRecord,
        ],
        liveModelQueries: params.runtime.adaptiveModel,
      }),
      history: params.runtime.history,
    },
  });
  const replayStateAfterProduction = productionCommit.historyRecord
    ? replaySparcHistory([productionCommit.historyRecord], replayStateAfterResponse)
    : replayStateAfterResponse;

  return {
    responseCommit,
    productionCommit,
    replayStateAfterResponse,
    finalReplayState: replayStateAfterProduction,
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
