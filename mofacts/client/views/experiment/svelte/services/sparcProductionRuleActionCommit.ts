import { Meteor } from 'meteor/meteor';
import { clientConsole } from '../../../../lib/clientLogger';
import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import type {
  SparcControllerDisplay,
  SparcControllerResult,
} from './sparcController';
import {
  resolveSparcControllerDisplay,
} from './sparcController';
import type {
  SparcCommittedProductionRuleEvaluation,
} from '../../../../../../learning-components/units/sparcsession/sparcProductionRuleCommit';
import type {
  SparcTrialDisplayProductionRuleRuntimeParams,
} from '../../../../../../learning-components/units/sparcsession/SparcSessionUnitEngine';
import type { UnitEngineLike } from '../../../../../common/types';
import { insertCompressedHistory } from '../../../../lib/historyWire';
import {
  SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY,
  collectSparcProgressiveNodeOperations,
} from '../../../../../../learning-components/trial-displays/sparc/sparcProgressiveNodes';
import {
  createEmptySparcProductionRuleReplaySession,
  readSparcProductionRuleReplaySession,
  rememberSparcProductionRuleHistoryRecord,
} from './sparcProductionRuleHistoryCache';
import {
  getSparcControllerRuntimeContext,
} from './sparcControllerRuntimeContextCache';

type SparcActionDisplay = SparcControllerDisplay & {
  documentId: string;
};

type SparcProductionRuleActionEngine = UnitEngineLike & {
  commitSparcTrialDisplayProductionRuleEvents?: (
    params: SparcTrialDisplayProductionRuleRuntimeParams
  ) => Promise<{
    evaluations?: readonly SparcCommittedProductionRuleEvaluation[];
  }>;
};

const SPARC_RENDER_STATE_KEYS = new Set(['visible']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function hasSparcProductionRuleSource(display: Record<string, unknown>): boolean {
  return Array.isArray(display.productionRules);
}

function resolveSparcActionDisplay(display: unknown): SparcActionDisplay | null {
  const sparcDisplay = resolveSparcControllerDisplay(
    isRecord(display) ? display : undefined,
    '[SPARC] Production-rule action',
  );
  if (!sparcDisplay || !hasSparcProductionRuleSource(sparcDisplay)) {
    return null;
  }
  const documentId = nonBlankString(sparcDisplay.documentId);
  if (!documentId) {
    throw new Error('[SPARC] Production-rule action display requires documentId');
  }
  if (!Array.isArray(sparcDisplay.nodes)) {
    throw new Error('[SPARC] Production-rule action display requires nodes array');
  }
  return sparcDisplay as unknown as SparcActionDisplay;
}

function collectMessageNodeIds(nodes: readonly unknown[] | undefined, ids = new Set<string>()): Set<string> {
  for (const node of nodes ?? []) {
    if (!isRecord(node)) {
      continue;
    }
    const nodeId = nonBlankString(node.id);
    if (nodeId && node.atomType === 'message-box') {
      ids.add(nodeId);
    }
    if (Array.isArray(node.children)) {
      collectMessageNodeIds(node.children, ids);
    }
  }
  return ids;
}

function extractCurrentMessageNodeValues(
  display: SparcActionDisplay,
  evaluations: readonly SparcCommittedProductionRuleEvaluation[] | undefined,
): Record<string, unknown> {
  const nodeValues: Record<string, unknown> = {};
  for (const nodeId of collectMessageNodeIds(display.nodes)) {
    nodeValues[nodeId] = '';
  }
  for (const evaluation of evaluations ?? []) {
    for (const firing of evaluation.execution?.firings ?? []) {
      for (const message of firing.messages ?? []) {
        const nodeId = nonBlankString(message.target?.nodeId);
        if (nodeId) {
          nodeValues[nodeId] = message.text;
        }
      }
    }
  }
  return nodeValues;
}

function extractSparcNodeValues(
  display: SparcActionDisplay,
  evaluations: readonly SparcCommittedProductionRuleEvaluation[] | undefined,
  priorHistoryRecords: readonly CanonicalHistoryRecord[],
  replayStateCells: Record<string, { address?: { nodeId?: string }; key?: string; value?: unknown }> = {},
): Record<string, unknown> {
  const nodeValues: Record<string, unknown> = extractCurrentMessageNodeValues(display, evaluations);
  for (const cell of Object.values(replayStateCells)) {
    const nodeId = nonBlankString(cell.address?.nodeId);
    const key = nonBlankString(cell.key);
    if (nodeId && SPARC_RENDER_STATE_KEYS.has(key)) {
      nodeValues[`${nodeId}::${key}`] = cell.value;
    }
  }
  const progressiveOperations = collectSparcProgressiveNodeOperations([
    ...priorHistoryRecords.map((record) => (
      isRecord(record.sparc) && isRecord(record.sparc.stateTransition)
        ? record.sparc.stateTransition
        : {}
    )),
    ...(evaluations ?? []).map((evaluation) => evaluation.transition ?? {}),
  ]);
  if (progressiveOperations.length > 0) {
    nodeValues[SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY] = progressiveOperations;
  }
  for (const evaluation of evaluations ?? []) {
    for (const write of evaluation.transition?.writes ?? []) {
      const nodeId = write?.target?.nodeId;
      if (!nodeId || !write?.key) {
        continue;
      }
      if (write.key === 'value' || write.key === 'message' || write.key === 'text') {
        nodeValues[nodeId] = write.value;
      } else if (write.key === 'correctness') {
        nodeValues[`${nodeId}::correctness`] = write.value;
      } else if (SPARC_RENDER_STATE_KEYS.has(write.key)) {
        nodeValues[`${nodeId}::visible`] = write.value;
      }
    }
  }
  return nodeValues;
}

function sparcEvaluationCounts(
  evaluations: readonly SparcCommittedProductionRuleEvaluation[] | undefined,
): {
  readonly evaluationCount: number;
  readonly firingCount: number;
  readonly writeCount: number;
  readonly modelHistoryCount: number;
  readonly classificationCount: number;
  readonly messageCount: number;
} {
  let firingCount = 0;
  let writeCount = 0;
  let modelHistoryCount = 0;
  let classificationCount = 0;
  let messageCount = 0;
  for (const evaluation of evaluations ?? []) {
    modelHistoryCount += evaluation.modelHistoryRecords?.length ?? 0;
    writeCount += evaluation.transition?.writes?.length ?? 0;
    for (const firing of evaluation.execution?.firings ?? []) {
      firingCount += 1;
      writeCount += firing.writes?.length ?? 0;
      classificationCount += firing.classifications?.length ?? 0;
      messageCount += firing.messages?.length ?? 0;
    }
  }
  return {
    evaluationCount: evaluations?.length ?? 0,
    firingCount,
    writeCount,
    modelHistoryCount,
    classificationCount,
    messageCount,
  };
}

export async function commitSparcProductionRuleAction(params: {
  readonly engine: UnitEngineLike | null | undefined;
  readonly currentDisplay: unknown;
  readonly sparcResult: SparcControllerResult;
  readonly tdfId: unknown;
  readonly sessionId: unknown;
  readonly levelUnit: unknown;
}): Promise<{
  readonly classifications: readonly string[];
  readonly messages: readonly string[];
  readonly sparcNodeValues: Record<string, unknown>;
}> {
  const sparcDisplay = resolveSparcActionDisplay(params.currentDisplay);
  if (!sparcDisplay) {
    return { classifications: [], messages: [], sparcNodeValues: {} };
  }

  const tdfId = nonBlankString(params.tdfId);
  const sessionId = nonBlankString(params.sessionId);
  if (!tdfId || !sessionId) {
    throw new Error('[SPARC] Production-rule action history requires TDFId and sessionID');
  }
  const userId = Meteor.userId();
  if (!userId) {
    throw new Error('[SPARC] Production-rule action history requires an authenticated user');
  }
  const levelUnit = Number(params.levelUnit);
  if (!Number.isFinite(levelUnit)) {
    throw new Error('[SPARC] Production-rule action history requires finite levelUnit');
  }

  const engine = params.engine as SparcProductionRuleActionEngine | null | undefined;
  if (typeof engine?.commitSparcTrialDisplayProductionRuleEvents !== 'function') {
    throw new Error('[SPARC] Production-rule action requires SPARC session engine commit support');
  }
  const sparcReplaySession = readSparcProductionRuleReplaySession({
    TDFId: tdfId,
    sessionID: sessionId,
    documentId: sparcDisplay.documentId,
  }) ?? createEmptySparcProductionRuleReplaySession({
    TDFId: tdfId,
    sessionID: sessionId,
    documentId: sparcDisplay.documentId,
  });
  const sparcRuntimeContext = getSparcControllerRuntimeContext({
    TDFId: tdfId,
    sessionID: sessionId,
    documentId: sparcDisplay.documentId,
    display: sparcDisplay,
    replaySession: sparcReplaySession,
  });
  const priorHistoryRecords = sparcReplaySession.retainedHistoryRecords;
  const startedAt = Date.now();
  let writtenHistoryCount = 0;

  const result = await engine.commitSparcTrialDisplayProductionRuleEvents({
    core: {
      TDFId: tdfId,
      sessionID: sessionId,
      levelUnit,
      userId,
    },
    documentId: sparcDisplay.documentId,
    display: sparcDisplay,
    result: params.sparcResult,
    document: sparcRuntimeContext.document,
    replayState: sparcRuntimeContext.replayState,
    priorHistoryRecords,
    history: {
      async writeCanonicalHistory(historyRecord: CanonicalHistoryRecord) {
        await insertCompressedHistory(historyRecord as Record<string, unknown>);
        rememberSparcProductionRuleHistoryRecord(historyRecord);
        writtenHistoryCount += 1;
      },
    },
  });
  const counts = sparcEvaluationCounts(result.evaluations);
  clientConsole(2, '[SPARC][ProductionRules] committed action', {
    documentId: sparcDisplay.documentId,
    tdfId,
    levelUnit,
    triggeredBy: nonBlankString(params.sparcResult.triggeredBy) || undefined,
    submittedNodeCount: Object.keys(params.sparcResult.submittedNodes ?? {}).length,
    retainedHistoryCount: priorHistoryRecords.length,
    writtenHistoryCount,
    elapsedMs: Date.now() - startedAt,
    ...counts,
  });

  return {
    classifications: (result.evaluations ?? []).flatMap((evaluation) => (
      evaluation.execution?.firings ?? []
    ).flatMap((firing) => firing.classifications ?? [])),
    messages: (result.evaluations ?? []).flatMap((evaluation) => (
      evaluation.execution?.firings ?? []
    ).flatMap((firing) => (firing.messages ?? []).map((message) => message.text))),
    sparcNodeValues: extractSparcNodeValues(
      sparcDisplay,
      result.evaluations,
      priorHistoryRecords,
      sparcRuntimeContext.replayState.cells,
    ),
  };
}
