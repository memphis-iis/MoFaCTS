import {
  createAdaptiveLogisticUnitEngine,
  type CreateAdaptiveLogisticUnitEngineDeps,
} from '../../models/adaptive-logistic/AdaptiveLogisticUnitEngine';
import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import { normalizeClusterKC } from '../../runtime/sharedModelPracticeIdentity';
import { SPARC_SESSION_UNIT_TYPE } from '../unitTypes';
import {
  processAndCommitSparcAuthoredResponseOutcome,
} from './sparcResponseOutcomePipeline';
import {
  commitSparcAuthoredProductionRuleEvent,
  evaluateSparcAuthoredProductionRules,
} from './sparcProductionRuleCommit';
import {
  commitSparcControllerDialogueTurn,
  type SparcUtteranceGenerator,
} from './sparcControllerDialogueTurn';
import type { SparcLearnerResponseScoringResult } from './sparcLearnerResponseScoring';
import {
  commitSparcTrialDisplayControllerDialogueTurn,
  commitSparcTrialDisplayProductionRuleEvents,
  evaluateSparcTrialDisplayProductionRuleEvents,
  type SparcTrialDisplayDialogueTurnScorer,
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
  SparcAutoTutorExpectation,
  SparcAutoTutorMisconception,
  SparcAuthoredDocument,
  SparcInterfaceEvent,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';
import type {
  SparcResponseOutcomeInput,
} from './sparcResponseOutcomeProcessor';
import type { SparcReplayState } from './sparcStateReplay';
import type { SparcLearningTargetSelectionOptions } from './sparcTargetSelection';
import type {
  SparcTrialDisplay,
  SparcTrialResult,
} from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import {
  resolveSparcSessionPageId,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
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
  const clusterKC = cluster.clusterKC ?? stim.clusterKC;
  if (clusterKC === undefined || clusterKC === null || clusterKC === '') {
    throw new Error(`SPARC page references cluster ${params.clusterIndex}, but its first stimulus is missing clusterKC`);
  }
  const resolvedClusterKC = normalizeClusterKC(clusterKC);
  const resolvedStimulusKC = stimulusKC === undefined || stimulusKC === null || stimulusKC === ''
    ? resolvedClusterKC
    : stimulusKC;
  const responseKC = stim.responseKC;
  return {
    clusterIndex: params.clusterIndex,
    label: String(stim.textStimulus || stim.text || stim.correctResponse || `Cluster ${params.clusterIndex}`),
    stimuliSetId: stim.stimuliSetId ?? params.deps.getSessionValue('currentStimuliSetId'),
    stimulusKC: resolvedStimulusKC,
    clusterKC: resolvedClusterKC,
    KCId: resolvedStimulusKC,
    KCDefault: resolvedStimulusKC,
    KCCluster: resolvedClusterKC,
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

function createAutoTutorExpectationFromCluster(params: {
  readonly deps: CreateSparcSessionUnitEngineDeps;
  readonly clusterIndex: number;
  readonly pageDisplay?: SparcTrialDisplay;
}): SparcAutoTutorExpectation {
  const cluster = params.deps.getStimCluster(params.clusterIndex);
  const firstStim = Array.isArray(cluster?.stims) ? cluster.stims[0] : null;
  if (!firstStim || typeof firstStim !== 'object') {
    throw new Error(`SPARC AutoTutor page references cluster ${params.clusterIndex}, but that cluster has no expectation stim`);
  }
  const stim = firstStim as Record<string, unknown>;
  const clusterKC = cluster.clusterKC ?? stim.clusterKC;
  if (clusterKC === undefined || clusterKC === null || clusterKC === '') {
    throw new Error(`SPARC AutoTutor page references cluster ${params.clusterIndex}, but that cluster is missing clusterKC`);
  }
  const normalizedClusterKC = normalizeClusterKC(clusterKC);
  const authoredExpectation = cleanExpectationsFromDisplay(params.pageDisplay).find(
    (expectation) => expectation.clusterKC === normalizedClusterKC,
  );
  const text = authoredExpectation?.text ||
    (typeof stim.text === 'string' && stim.text.trim() ? stim.text.trim() : '') ||
    (typeof stim.textStimulus === 'string' && stim.textStimulus.trim() ? stim.textStimulus.trim() : '');
  if (!text) {
    throw new Error(`SPARC AutoTutor page references cluster ${params.clusterIndex}, but that cluster is missing expectation text`);
  }
  return {
    clusterKC: normalizedClusterKC,
    text,
  };
}

function createCleanAutoTutorClusterTarget(params: {
  readonly deps: CreateSparcSessionUnitEngineDeps;
  readonly clusterIndex: number;
}): Record<string, unknown> {
  const cluster = params.deps.getStimCluster(params.clusterIndex);
  const firstStim = Array.isArray(cluster?.stims) ? cluster.stims[0] : null;
  const stimClusterKC = firstStim && typeof firstStim === 'object'
    ? (firstStim as Record<string, unknown>).clusterKC
    : undefined;
  const clusterKC = cluster.clusterKC ?? stimClusterKC;
  if (clusterKC === undefined || clusterKC === null || clusterKC === '') {
    throw new Error(`SPARC AutoTutor page references cluster ${params.clusterIndex}, but that cluster is missing clusterKC`);
  }
  return {
    clusterIndex: params.clusterIndex,
    clusterKC: normalizeClusterKC(clusterKC),
  };
}

function cleanMisconceptionsFromDisplay(display: SparcTrialDisplay): readonly SparcAutoTutorMisconception[] {
  const table = isRecord(display.misconceptionTable) ? display.misconceptionTable : {};
  const misconceptions = Array.isArray(table.misconceptions) ? table.misconceptions : [];
  return misconceptions.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`SPARC AutoTutor misconceptionTable.misconceptions[${index}] must be an object`);
    }
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : '';
    const text = typeof entry.text === 'string' && entry.text.trim() ? entry.text.trim() : '';
    if (!id || !text) {
      throw new Error(`SPARC AutoTutor misconceptionTable.misconceptions[${index}] requires id and text`);
    }
    return { id, text };
  });
}

function cleanExpectationsFromDisplay(display?: SparcTrialDisplay): readonly SparcAutoTutorExpectation[] {
  const targets = isRecord(display?.autoTutorTargets) ? display.autoTutorTargets : {};
  const expectations = Array.isArray(targets.expectations) ? targets.expectations : [];
  return expectations.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`SPARC AutoTutor autoTutorTargets.expectations[${index}] must be an object`);
    }
    const clusterKC = typeof entry.clusterKC === 'string' && entry.clusterKC.trim()
      ? normalizeClusterKC(entry.clusterKC)
      : '';
    const text = typeof entry.text === 'string' && entry.text.trim() ? entry.text.trim() : '';
    if (!clusterKC || !text) {
      throw new Error(`SPARC AutoTutor autoTutorTargets.expectations[${index}] requires clusterKC and text`);
    }
    return { clusterKC, text };
  });
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

function collectDisplayClusterTargets(display: SparcTrialDisplay, references: Set<number>): void {
  const targets = (display as Record<string, unknown>).clusterTargets;
  for (const [index, target] of (Array.isArray(targets) ? targets : []).entries()) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      throw new Error(`SPARC page clusterTargets[${index}] must be an object`);
    }
    const clusterIndex = Number((target as Record<string, unknown>).clusterIndex);
    if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
      throw new Error(`SPARC page clusterTargets[${index}].clusterIndex is invalid`);
    }
    references.add(clusterIndex);
  }
}

function collectSparcPageClusterIndices(display: SparcTrialDisplay): number[] {
  const references = new Set<number>();
  collectDisplayClusterTargets(display, references);
  for (const node of Array.isArray(display.nodes) ? display.nodes : []) {
    collectNodeClusterReferences(node, references);
  }
  collectProductionRuleClusterReferences(display, references);
  if (references.size === 0) {
    throw new Error(`SPARC page "${display.pageId || display.documentId || ''}" does not declare any model cluster references`);
  }
  return Array.from(references).sort((a, b) => a - b);
}

function resolveSparcPage(
  deps: CreateSparcSessionUnitEngineDeps,
  unit: unknown,
): { pageId: string; documentId: string; pageDisplay: SparcTrialDisplay } {
  const tdf = deps.findTdfById(deps.getSessionValue('currentTdfId'));
  const sparcPages = tdf?.rawStimuliFile?.setspec?.sparcPages;
  if (!Array.isArray(sparcPages)) {
    throw new Error(`SPARC session requires active TDF rawStimuliFile.setspec.sparcPages for TDF ${String(deps.getSessionValue('currentTdfId') || '')}`);
  }
  if (sparcPages.length === 0) {
    throw new Error('SPARC session requires at least one rawStimuliFile.setspec.sparcPages entry');
  }
  const configuredPageId = resolveSparcSessionPageId(unit as { sparcsession?: Record<string, unknown> | null });
  if (!configuredPageId && sparcPages.length > 1) {
    throw new Error('SPARC session with multiple rawStimuliFile.setspec.sparcPages entries requires sparcsession.pageId');
  }
  const matches = configuredPageId
    ? sparcPages.filter((page: SparcPageRecord) => page?.pageId === configuredPageId)
    : [sparcPages[0] as SparcPageRecord];
  const pageId = configuredPageId || String(matches[0]?.pageId || '').trim();
  if (!pageId) {
    throw new Error('Single-page SPARC session requires rawStimuliFile.setspec.sparcPages[0].pageId');
  }
  if (matches.length === 0) {
    throw new Error(`SPARC page "${configuredPageId}" was not found in rawStimuliFile.setspec.sparcPages`);
  }
  if (matches.length > 1) {
    throw new Error(`SPARC page "${configuredPageId}" is duplicated in rawStimuliFile.setspec.sparcPages`);
  }
  const page = matches[0] as SparcPageRecord;
  if (!page?.display || typeof page.display !== 'object' || Array.isArray(page.display)) {
    throw new Error(`SPARC page "${pageId}" must define a display object`);
  }
  const pageDisplay = cloneRecord(page.display as SparcTrialDisplay);
  const documentId = typeof pageDisplay.documentId === 'string' && pageDisplay.documentId.trim()
    ? pageDisplay.documentId.trim()
    : pageId;
  return { pageId, documentId, pageDisplay };
}

function resolveSparcPageClusterListSource(
  deps: CreateSparcSessionUnitEngineDeps,
  unit: unknown,
): string {
  const { pageId, documentId, pageDisplay } = resolveSparcPage(deps, unit);
  return collectSparcPageClusterIndices({ ...pageDisplay, pageId, documentId }).join(' ');
}

function resolveSparcPageDisplay(
  deps: CreateSparcSessionUnitEngineDeps,
  unit: unknown,
): SparcTrialDisplay {
  const { pageId, documentId, pageDisplay } = resolveSparcPage(deps, unit);
  const clusterListIndices = collectSparcPageClusterIndices({ ...pageDisplay, pageId, documentId });
  const isAutoTutor = pageDisplay.unitType === 'sparc-autotutor-dialogue';
  return {
    ...pageDisplay,
    pageId,
    documentId,
    clusterTargets: clusterListIndices.map((clusterIndex) =>
      isAutoTutor
        ? createCleanAutoTutorClusterTarget({ deps, clusterIndex })
        : createClusterTargetFromFirstStim({ deps, clusterIndex }),
    ),
    ...(isAutoTutor
      ? {
          autoTutorTargets: {
            expectations: clusterListIndices.map((clusterIndex) =>
              createAutoTutorExpectationFromCluster({ deps, clusterIndex, pageDisplay }),
            ),
            misconceptions: cleanMisconceptionsFromDisplay(pageDisplay),
          },
        }
      : {}),
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
  readonly event: SparcInterfaceEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly maxCycles?: number;
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
};

export type SparcControllerDialogueTurnRuntimeParams = {
  readonly core: SparcPracticeHistoryCore;
  readonly document: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly event: SparcInterfaceEvent;
  readonly extraFacts?: readonly SparcWorkingMemoryFact[];
  readonly learnerResponseScore?: SparcLearnerResponseScoringResult;
  readonly targetSelectionOptions?: SparcLearningTargetSelectionOptions;
  readonly maxProductionRuleCycles?: number;
  readonly generateTutorUtterance: SparcUtteranceGenerator;
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

export type SparcTrialDisplayControllerDialogueTurnRuntimeParams = {
  readonly core: SparcPracticeHistoryCore;
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
  readonly document?: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly scoreLearnerResponse: SparcTrialDisplayDialogueTurnScorer;
  readonly generateTutorUtterance: SparcUtteranceGenerator;
  readonly targetSelectionOptions?: SparcLearningTargetSelectionOptions;
  readonly maxProductionRuleCycles?: number;
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
    resolveUnitClusterListSource: (unit) => resolveSparcPageClusterListSource(deps, unit),
    resolveModelPreparationClusterListSource: (unit) => resolveSparcPageClusterListSource(deps, unit),
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
          modelState: {
            queryModelPracticeState: adaptiveEngine.queryModelPracticeState,
          },
          history: params.history,
        },
      });
    },

    async commitSparcControllerDialogueTurn(
      params: SparcControllerDialogueTurnRuntimeParams,
    ) {
      return await commitSparcControllerDialogueTurn({
        core: params.core,
        document: params.document,
        ...(params.replayState ? { replayState: params.replayState } : {}),
        event: params.event,
        ...(params.extraFacts ? { extraFacts: params.extraFacts } : {}),
        ...(params.learnerResponseScore ? { learnerResponseScore: params.learnerResponseScore } : {}),
        ...(params.targetSelectionOptions ? { targetSelectionOptions: params.targetSelectionOptions } : {}),
        ...(params.maxProductionRuleCycles !== undefined ? { maxProductionRuleCycles: params.maxProductionRuleCycles } : {}),
        generateTutorUtterance: params.generateTutorUtterance,
        runtime: {
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

    async commitSparcTrialDisplayControllerDialogueTurn(
      params: SparcTrialDisplayControllerDialogueTurnRuntimeParams,
    ) {
      return await commitSparcTrialDisplayControllerDialogueTurn({
        core: params.core,
        documentId: params.documentId,
        display: params.display,
        result: params.result,
        priorHistoryRecords: params.priorHistoryRecords,
        ...(params.document ? { document: params.document } : {}),
        ...(params.replayState ? { replayState: params.replayState } : {}),
        scoreLearnerResponse: params.scoreLearnerResponse,
        generateTutorUtterance: params.generateTutorUtterance,
        ...(params.targetSelectionOptions ? { targetSelectionOptions: params.targetSelectionOptions } : {}),
        ...(params.maxProductionRuleCycles !== undefined ? { maxProductionRuleCycles: params.maxProductionRuleCycles } : {}),
        history: params.history,
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
