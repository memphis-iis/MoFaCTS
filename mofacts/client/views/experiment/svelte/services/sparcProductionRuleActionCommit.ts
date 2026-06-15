import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import type {
  SparcTrialDisplay,
  SparcTrialResult,
} from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';
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
  readSparcProductionRuleHistoryRecords,
  rememberSparcProductionRuleHistoryRecord,
} from './sparcProductionRuleHistoryCache';

type SparcActionDisplay = SparcTrialDisplay & {
  documentId: string;
};

type SparcProductionRuleActionEngine = UnitEngineLike & {
  commitSparcTrialDisplayProductionRuleEvents?: (
    params: SparcTrialDisplayProductionRuleRuntimeParams
  ) => Promise<{
    evaluations?: readonly SparcCommittedProductionRuleEvaluation[];
  }>;
};

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
  if (!isRecord(display) || display.type !== 'sparc' || !hasSparcProductionRuleSource(display)) {
    return null;
  }
  const documentId = nonBlankString(display.documentId);
  if (!documentId) {
    throw new Error('[SPARC] Production-rule action display requires documentId');
  }
  if (!Array.isArray(display.nodes)) {
    throw new Error('[SPARC] Production-rule action display requires nodes array');
  }
  return display as unknown as SparcActionDisplay;
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
): Record<string, unknown> {
  const nodeValues: Record<string, unknown> = extractCurrentMessageNodeValues(display, evaluations);
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
      }
    }
  }
  return nodeValues;
}

export async function commitSparcProductionRuleAction(params: {
  readonly engine: UnitEngineLike | null | undefined;
  readonly currentDisplay: unknown;
  readonly sparcResult: SparcTrialResult;
  readonly tdfId: unknown;
  readonly sessionId: unknown;
  readonly levelUnit: unknown;
}): Promise<{ readonly sparcNodeValues: Record<string, unknown> }> {
  const sparcDisplay = resolveSparcActionDisplay(params.currentDisplay);
  if (!sparcDisplay) {
    return { sparcNodeValues: {} };
  }

  const tdfId = nonBlankString(params.tdfId);
  const sessionId = nonBlankString(params.sessionId);
  if (!tdfId || !sessionId) {
    throw new Error('[SPARC] Production-rule action history requires TDFId and sessionID');
  }
  const levelUnit = Number(params.levelUnit);
  if (!Number.isFinite(levelUnit)) {
    throw new Error('[SPARC] Production-rule action history requires finite levelUnit');
  }

  const engine = params.engine as SparcProductionRuleActionEngine | null | undefined;
  if (typeof engine?.commitSparcTrialDisplayProductionRuleEvents !== 'function') {
    throw new Error('[SPARC] Production-rule action requires SPARC session engine commit support');
  }
  const priorHistoryRecords = readSparcProductionRuleHistoryRecords({
    TDFId: tdfId,
    sessionID: sessionId,
    documentId: sparcDisplay.documentId,
  });

  const result = await engine.commitSparcTrialDisplayProductionRuleEvents({
    core: {
      TDFId: tdfId,
      sessionID: sessionId,
      levelUnit,
      userId: sessionId,
    },
    documentId: sparcDisplay.documentId,
    display: sparcDisplay,
    result: params.sparcResult,
    priorHistoryRecords,
    history: {
      async writeCanonicalHistory(historyRecord: CanonicalHistoryRecord) {
        await insertCompressedHistory(historyRecord as Record<string, unknown>);
        rememberSparcProductionRuleHistoryRecord(historyRecord);
      },
    },
  });

  return {
    sparcNodeValues: extractSparcNodeValues(sparcDisplay, result.evaluations, priorHistoryRecords),
  };
}
