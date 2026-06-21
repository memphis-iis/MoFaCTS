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
  resolveSparcSessionPageId,
  resolveSparcSessionModelPreparationClusterListSource,
  resolveSparcSessionProbabilitySource,
  resolveSparcSessionRuntimeConfig,
  resolveSparcSessionUnitMode,
} from './sparcSessionRuntimeConfig';

export { SPARC_SESSION_UNIT_TYPE };

export type CreateSparcSessionUnitEngineDeps = CreateAdaptiveLogisticUnitEngineDeps;

type SparcPageRecord = {
  readonly pageId?: unknown;
  readonly display?: unknown;
};

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function requirePageId(unit: unknown): string {
  const pageId = resolveSparcSessionPageId(unit as { sparcsession?: Record<string, unknown> | null });
  if (!pageId) {
    throw new Error('SPARC session requires sparcsession.pageId');
  }
  return pageId;
}

function collectClusterListIndices(
  deps: CreateSparcSessionUnitEngineDeps,
  unit: unknown,
): number[] {
  const source = resolveSparcSessionClusterListSource(unit as { sparcsession?: Record<string, unknown> | null });
  const fields: unknown[] = [];
  deps.extractDelimFields(source || '', fields);
  const indices: number[] = [];
  for (const field of fields) {
    const range = deps.rangeVal(field);
    const fieldIndices = range.length > 0 ? range : [deps.legacyInt(field)];
    for (const candidate of fieldIndices) {
      const index = deps.legacyInt(candidate);
      if (!Number.isInteger(index) || index < 0) {
        throw new Error(`SPARC session clusterlist contains invalid cluster index "${String(candidate)}"`);
      }
      indices.push(index);
    }
  }
  if (indices.length === 0) {
    throw new Error('SPARC session requires sparcsession.clusterlist');
  }
  return indices;
}

function responseKeyForStim(stim: Record<string, unknown>): string {
  return String(stim.correctResponse ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function createClusterTargetFromFirstStim(params: {
  readonly deps: CreateSparcSessionUnitEngineDeps;
  readonly clusterIndex: number;
}): Record<string, unknown> {
  const cluster = params.deps.getStimCluster(params.clusterIndex);
  const firstStim = Array.isArray(cluster?.stims) ? cluster.stims[0] : null;
  if (!firstStim || typeof firstStim !== 'object') {
    throw new Error(`SPARC page references cluster ${params.clusterIndex}, but that cluster has no first stimulus`);
  }
  const stim = firstStim as Record<string, unknown>;
  const stimulusKC = stim.stimulusKC;
  const clusterKC = stim.clusterKC ?? cluster.clusterKC;
  if (stimulusKC === undefined || stimulusKC === null || stimulusKC === '') {
    throw new Error(`SPARC page references cluster ${params.clusterIndex}, but its first stimulus is missing stimulusKC`);
  }
  if (clusterKC === undefined || clusterKC === null || clusterKC === '') {
    throw new Error(`SPARC page references cluster ${params.clusterIndex}, but its first stimulus is missing clusterKC`);
  }
  const responseKC = stim.responseKC;
  return {
    clusterIndex: params.clusterIndex,
    label: String(stim.textStimulus || stim.text || stim.correctResponse || `Cluster ${params.clusterIndex}`),
    stimuliSetId: stim.stimuliSetId ?? params.deps.getSessionValue('currentStimuliSetId'),
    stimulusKC,
    clusterKC,
    KCId: stimulusKC,
    KCDefault: stimulusKC,
    KCCluster: clusterKC,
    ...(responseKC !== undefined && responseKC !== null
      ? {
          response: {
            responseKC,
            responseKey: responseKeyForStim(stim),
          },
        }
      : {}),
  };
}

function collectNodeClusterReferences(node: unknown, references: Set<number>): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return;
  }
  const record = node as Record<string, unknown>;
  if (record.clusterIndex !== undefined) {
    const clusterIndex = Number(record.clusterIndex);
    if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
      throw new Error(`SPARC page node "${String(record.id ?? '')}" has invalid clusterIndex ${String(record.clusterIndex)}`);
    }
    references.add(clusterIndex);
  }
  if (Array.isArray(record.clusterIndices)) {
    for (const [index, value] of record.clusterIndices.entries()) {
      const clusterIndex = Number(value);
      if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
        throw new Error(`SPARC page node "${String(record.id ?? '')}" has invalid clusterIndices[${index}] ${String(value)}`);
      }
      references.add(clusterIndex);
    }
  }
  for (const child of Array.isArray(record.children) ? record.children : []) {
    collectNodeClusterReferences(child, references);
  }
  for (const panel of Array.isArray(record.panels) ? record.panels : []) {
    const children = panel && typeof panel === 'object' && !Array.isArray(panel)
      ? (panel as Record<string, unknown>).children
      : undefined;
    for (const child of Array.isArray(children) ? children : []) {
      collectNodeClusterReferences(child, references);
    }
  }
}

function collectProductionRuleClusterReferences(display: SparcTrialDisplay, references: Set<number>): void {
  for (const rule of Array.isArray(display.productionRules) ? display.productionRules : []) {
    const effects = rule && typeof rule === 'object' && !Array.isArray(rule)
      ? (rule as Record<string, unknown>).then
      : undefined;
    for (const effect of Array.isArray(effects) ? effects : []) {
      if (!effect || typeof effect !== 'object' || Array.isArray(effect)) {
        continue;
      }
      const record = effect as Record<string, unknown>;
      if (record.type !== 'model-practice' || record.clusterIndex === undefined || typeof record.clusterIndex === 'object') {
        continue;
      }
      const clusterIndex = Number(record.clusterIndex);
      if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
        throw new Error(`SPARC production rule model-practice clusterIndex ${String(record.clusterIndex)} is invalid`);
      }
      references.add(clusterIndex);
    }
  }
}

function validateSparcPageClusterReferences(
  display: SparcTrialDisplay,
  allowedClusterIndices: ReadonlySet<number>,
): void {
  const references = new Set<number>();
  for (const node of Array.isArray(display.nodes) ? display.nodes : []) {
    collectNodeClusterReferences(node, references);
  }
  collectProductionRuleClusterReferences(display, references);
  for (const clusterIndex of references) {
    if (!allowedClusterIndices.has(clusterIndex)) {
      throw new Error(`SPARC page "${display.pageId || display.documentId || ''}" references cluster ${clusterIndex}, which is outside sparcsession.clusterlist`);
    }
  }
}

function resolveSparcPageDisplay(
  deps: CreateSparcSessionUnitEngineDeps,
  unit: unknown,
): SparcTrialDisplay {
  const pageId = requirePageId(unit);
  const tdf = deps.findTdfById(deps.getSessionValue('currentTdfId'));
  const sparcPages = tdf?.rawStimuliFile?.setspec?.sparcPages;
  if (!Array.isArray(sparcPages)) {
    throw new Error('SPARC session pageId requires rawStimuliFile.setspec.sparcPages');
  }
  const matches = sparcPages.filter((page: SparcPageRecord) => page?.pageId === pageId);
  if (matches.length === 0) {
    throw new Error(`SPARC page "${pageId}" was not found in rawStimuliFile.setspec.sparcPages`);
  }
  if (matches.length > 1) {
    throw new Error(`SPARC page "${pageId}" is duplicated in rawStimuliFile.setspec.sparcPages`);
  }
  const page = matches[0] as SparcPageRecord;
  if (!page?.display || typeof page.display !== 'object' || Array.isArray(page.display)) {
    throw new Error(`SPARC page "${pageId}" must define a display object`);
  }
  const pageDisplay = cloneRecord(page.display as SparcTrialDisplay);
  const documentId = typeof pageDisplay.documentId === 'string' && pageDisplay.documentId.trim()
    ? pageDisplay.documentId.trim()
    : pageId;
  const clusterListIndices = collectClusterListIndices(deps, unit);
  const allowedClusterIndices = new Set(clusterListIndices);
  validateSparcPageClusterReferences({ ...pageDisplay, pageId, documentId }, allowedClusterIndices);
  return {
    ...pageDisplay,
    type: 'sparc',
    pageId,
    documentId,
    clusterTargets: clusterListIndices.map((clusterIndex) =>
      createClusterTargetFromFirstStim({ deps, clusterIndex }),
    ),
  };
}

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
  readonly document?: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

export type SparcTrialDisplayProductionRuleEvaluationRuntimeParams = {
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
  readonly document?: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
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
  const buildAdaptivePreparedCard = adaptiveEngine.buildPreparedCardQuestionAndAnswerGlobals.bind(adaptiveEngine);
  return {
    ...adaptiveEngine,

    async buildPreparedCardQuestionAndAnswerGlobals(
      cardIndex: unknown,
      whichStim: unknown,
      probFunctionParameters: unknown,
      buildOptions?: unknown,
    ) {
      const preparedState = await buildAdaptivePreparedCard(
        cardIndex,
        whichStim,
        probFunctionParameters,
        buildOptions,
      );
      return {
        ...preparedState,
        currentDisplay: resolveSparcPageDisplay(deps, this.curUnit),
        currentAnswer: '__SPARC_COMPLETED__',
        newExperimentState: {
          ...(preparedState?.newExperimentState ?? {}),
          originalAnswer: '__SPARC_COMPLETED__',
        },
      };
    },

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
        ...(params.document ? { document: params.document } : {}),
        ...(params.replayState ? { replayState: params.replayState } : {}),
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
        ...(params.document ? { document: params.document } : {}),
        ...(params.replayState ? { replayState: params.replayState } : {}),
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
