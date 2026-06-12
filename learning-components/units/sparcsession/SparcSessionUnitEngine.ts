import {
  createAdaptiveLogisticUnitEngine,
  type CreateAdaptiveLogisticUnitEngineDeps,
} from '../../models/adaptive-logistic/AdaptiveLogisticUnitEngine';
import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import { SPARC_SESSION_UNIT_TYPE } from '../unitTypes';
import {
  processAndCommitSparcAuthoredResponseOutcome,
} from './sparcResponseOutcomePipeline';
import { replaySparcDocumentHistory } from './sparcDocumentReplay';
import {
  validateSparcDocumentReferences,
} from './sparcDocumentAddressing';
import {
  validateSparcAuthoredDocument,
} from './sparcDocumentValidation';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import type {
  SparcAuthoredDocument,
} from './sparcSessionContracts';
import type {
  SparcResponseOutcomeInput,
} from './sparcResponseOutcomeProcessor';
import {
  resolveSparcSessionClusterListSource,
  resolveSparcSessionModelPreparationClusterListSource,
  resolveSparcSessionProbabilitySource,
  resolveSparcSessionRuntimeConfig,
  resolveSparcSessionUnitMode,
} from './sparcSessionRuntimeConfig';

export { SPARC_SESSION_UNIT_TYPE };

export type CreateSparcSessionUnitEngineDeps = CreateAdaptiveLogisticUnitEngineDeps;

export type SparcAuthoredResponseOutcomeRuntimeParams = {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly input: SparcResponseOutcomeInput;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

export async function createSparcSessionUnitEngine(
  deps: CreateSparcSessionUnitEngineDeps,
): Promise<any> {
  const adaptiveEngine = await createAdaptiveLogisticUnitEngine(deps, {
    unitType: SPARC_SESSION_UNIT_TYPE,
    unitLabel: 'SPARC session',
    resolveRuntimeConfig: resolveSparcSessionRuntimeConfig,
    resolveUnitMode: resolveSparcSessionUnitMode,
    resolveProbabilitySource: resolveSparcSessionProbabilitySource,
    resolveUnitClusterListSource: (unit) => resolveSparcSessionClusterListSource(unit),
    resolveModelPreparationClusterListSource: resolveSparcSessionModelPreparationClusterListSource,
  });
  return {
    ...adaptiveEngine,

    validateSparcAuthoredDocument,

    validateSparcDocumentReferences,

    replaySparcDocumentHistory,

    async processAndCommitSparcAuthoredResponseOutcome(
      params: SparcAuthoredResponseOutcomeRuntimeParams,
    ) {
      return await processAndCommitSparcAuthoredResponseOutcome({
        core: params.core,
        document: params.document,
        input: params.input,
        priorHistoryRecords: params.priorHistoryRecords,
        runtime: {
          adaptiveModel: {
            applyModelPracticeUpdate: adaptiveEngine.applyModelPracticeUpdate,
            queryModelPracticeState: adaptiveEngine.queryModelPracticeState,
          },
          history: params.history,
        },
      });
    },
  };
}
