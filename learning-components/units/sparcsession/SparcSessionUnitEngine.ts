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
import {
  commitSparcAuthoredProductionRuleEvent,
  evaluateSparcAuthoredProductionRules,
} from './sparcProductionRuleCommit';
import {
  commitSparcTrialDisplayProductionRuleEvents,
  evaluateSparcTrialDisplayProductionRuleEvents,
} from './sparcTrialDisplayRuntimeBridge';
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
  SparcReactiveEvent,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';
import type {
  SparcResponseOutcomeInput,
} from './sparcResponseOutcomeProcessor';
import type { SparcReplayState } from './sparcStateReplay';
import type {
  SparcTrialDisplay,
  SparcTrialResult,
} from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
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

export type SparcAuthoredProductionRuleRuntimeParams = {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcReactiveEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly maxCycles?: number;
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

export type SparcTrialDisplayProductionRuleRuntimeParams = {
  readonly core: SparcPracticeHistoryCore;
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

export type SparcTrialDisplayProductionRuleEvaluationRuntimeParams = {
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
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

    evaluateSparcAuthoredProductionRules,

    async commitSparcAuthoredProductionRuleEvent(
      params: SparcAuthoredProductionRuleRuntimeParams,
    ) {
      return await commitSparcAuthoredProductionRuleEvent({
        core: params.core,
        document: params.document,
        ...(params.replayState ? { replayState: params.replayState } : {}),
        event: params.event,
        ...(params.extraFacts ? { extraFacts: params.extraFacts } : {}),
        ...(params.maxCycles !== undefined ? { maxCycles: params.maxCycles } : {}),
        runtime: {
          adaptiveModel: {
            applyModelPracticeUpdate: adaptiveEngine.applyModelPracticeUpdate,
            queryModelPracticeState: adaptiveEngine.queryModelPracticeState,
          },
          history: params.history,
        },
      });
    },

    async commitSparcTrialDisplayProductionRuleEvents(
      params: SparcTrialDisplayProductionRuleRuntimeParams,
    ) {
      return await commitSparcTrialDisplayProductionRuleEvents({
        core: params.core,
        documentId: params.documentId,
        display: params.display,
        result: params.result,
        priorHistoryRecords: params.priorHistoryRecords,
        history: params.history,
        adaptiveModel: {
          applyModelPracticeUpdate: adaptiveEngine.applyModelPracticeUpdate,
          queryModelPracticeState: adaptiveEngine.queryModelPracticeState,
        },
      });
    },

    evaluateSparcTrialDisplayProductionRuleEvents(
      params: SparcTrialDisplayProductionRuleEvaluationRuntimeParams,
    ) {
      return evaluateSparcTrialDisplayProductionRuleEvents({
        documentId: params.documentId,
        display: params.display,
        result: params.result,
        priorHistoryRecords: params.priorHistoryRecords,
      });
    },

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
