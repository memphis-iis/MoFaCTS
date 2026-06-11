import type { CanonicalHistoryRecord } from './historyEnvelope';
import type {
  ModelPracticeStateProvider,
  ModelPracticeStateQuery,
} from './modelPracticeStateQueries';
import type {
  ModelPracticeHistoryCore,
  ModelPracticeUpdateRequest,
} from './modelPracticeUpdates';

export type AppliedModelPracticeUpdate = {
  readonly record: CanonicalHistoryRecord;
  readonly modelResult?: unknown;
};

export type ModelPracticeRuntime = ModelPracticeStateProvider & {
  readonly applyModelPracticeUpdate: (
    core: ModelPracticeHistoryCore,
    request: ModelPracticeUpdateRequest,
    extensionFields?: Record<string, unknown>,
  ) => Promise<AppliedModelPracticeUpdate> | AppliedModelPracticeUpdate;
};

export type CreateModelPracticeRuntimeParams = {
  readonly applyUpdate: (request: ModelPracticeUpdateRequest) => Promise<unknown> | unknown;
  readonly queryState: (query: ModelPracticeStateQuery) => unknown;
  readonly createHistoryRecord: (
    core: ModelPracticeHistoryCore,
    request: ModelPracticeUpdateRequest,
    extensionFields?: Record<string, unknown>,
  ) => CanonicalHistoryRecord;
};

export function createModelPracticeRuntime(
  params: CreateModelPracticeRuntimeParams,
): ModelPracticeRuntime {
  return {
    queryModelPracticeState(query) {
      return params.queryState(query);
    },

    async applyModelPracticeUpdate(core, request, extensionFields) {
      const modelResult = await params.applyUpdate(request);
      const record = params.createHistoryRecord(core, request, extensionFields);
      return {
        record,
        ...(modelResult !== undefined ? { modelResult } : {}),
      };
    },
  };
}
