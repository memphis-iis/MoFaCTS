import { assertCanonicalHistoryEnvelope } from '../../runtime/historyEnvelope';
import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import type { ModelPracticeRuntime } from '../../runtime/modelPracticeRuntime';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import type {
  SparcCanonicalHistoryRecord,
} from './sparcSessionContracts';
import type {
  SparcProcessedResponseOutcome,
} from './sparcResponseOutcomeProcessor';

export type SparcResponseOutcomeCommitRuntime = {
  readonly adaptiveModel: ModelPracticeRuntime;
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

export type SparcCommittedResponseOutcome = {
  readonly historyRecord: SparcCanonicalHistoryRecord;
  readonly usedAdaptiveModel: boolean;
  readonly modelResult?: unknown;
};

export async function commitSparcProcessedResponseOutcome(
  core: SparcPracticeHistoryCore,
  processed: SparcProcessedResponseOutcome,
  runtime: SparcResponseOutcomeCommitRuntime,
): Promise<SparcCommittedResponseOutcome> {
  if (!processed.modelUpdateRequest) {
    assertCanonicalHistoryEnvelope(processed.historyRecord);
    await runtime.history.writeCanonicalHistory(processed.historyRecord);
    return {
      historyRecord: processed.historyRecord,
      usedAdaptiveModel: false,
    };
  }

  const appliedModelUpdate = await runtime.adaptiveModel.applyModelPracticeUpdate(
    core,
    processed.modelUpdateRequest,
    {
      sparc: processed.historyRecord.sparc,
    },
  );
  const historyRecord = appliedModelUpdate.record as SparcCanonicalHistoryRecord;
  assertCanonicalHistoryEnvelope(historyRecord);
  await runtime.history.writeCanonicalHistory(historyRecord);
  return {
    historyRecord,
    usedAdaptiveModel: true,
    ...(appliedModelUpdate.modelResult !== undefined ? { modelResult: appliedModelUpdate.modelResult } : {}),
  };
}
