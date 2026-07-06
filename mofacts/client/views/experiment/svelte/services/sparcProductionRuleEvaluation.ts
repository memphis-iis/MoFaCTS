import type {
  SparcControllerDisplay,
  SparcControllerResult,
} from './sparcController';
import {
  evaluateSparcControllerResponse,
  resolveSparcControllerDisplay,
} from './sparcController';
import {
  createEmptySparcProductionRuleReplaySession,
  readSparcProductionRuleReplaySession,
} from './sparcProductionRuleHistoryCache';
import {
  getSparcControllerRuntimeContext,
} from './sparcControllerRuntimeContextCache';
import {
  SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY,
  collectSparcProgressiveNodeOperations,
} from '../../../../../../learning-components/trial-displays/sparc/sparcProgressiveNodes';
import type {
  SparcTrialDisplayProductionRuleEvaluationResult,
} from '../../../../../../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge';
import type {
  SparcTrialDisplayProductionRuleEvaluationRuntimeParams,
} from '../../../../../../learning-components/units/sparcsession/SparcSessionUnitEngine';

type ServiceRecord = Record<string, unknown>;

export interface SparcAnswerEvaluationContext extends ServiceRecord {
  sparcResult?: SparcControllerResult | null | undefined;
  engine?: ServiceRecord | null;
  currentDisplay?: {
    type?: string;
    documentId?: string;
    nodes?: unknown[];
    productionRules?: unknown[];
    behaviorRefs?: Record<string, string>;
    behavior?: {
      feedback?: Array<Record<string, unknown>>;
    };
    response?: {
      gradingMode?: string;
      scoredNodes?: string[];
      intentByNode?: Array<{ node?: string; expected?: unknown; acceptedValues?: unknown[]; type?: string }>;
      intentByPath?: Array<{
        path?: string;
        intentByNode?: Array<{ node?: string; expected?: unknown; acceptedValues?: unknown[]; type?: string }>;
      }>;
      evaluation?: {
        trimWhitespace?: boolean;
        caseNormalize?: boolean;
        mathNormalize?: boolean;
        allowScientificNotation?: boolean;
      };
    };
  };
  tdfId?: unknown;
  sessionId?: unknown;
}

type SparcProductionRuleEvaluationEngineLike = ServiceRecord & {
  evaluateSparcTrialDisplayProductionRuleEvents?: (
    params: SparcTrialDisplayProductionRuleEvaluationRuntimeParams
  ) => SparcTrialDisplayProductionRuleEvaluationResult;
};

function hasSparcProductionRuleSource(
  display: SparcAnswerEvaluationContext['currentDisplay'],
): display is SparcControllerDisplay & { documentId: string } {
  if (!display || !Array.isArray(display.nodes)) {
    return false;
  }
  const sparcDisplay = resolveSparcControllerDisplay(display, '[SPARC] Production-rule evaluation');
  const hasDirectRules = Array.isArray(sparcDisplay?.productionRules);
  if (!sparcDisplay || !hasDirectRules) {
    return false;
  }
  const documentId = typeof sparcDisplay.documentId === 'string' ? sparcDisplay.documentId.trim() : '';
  if (!documentId) {
    throw new Error('[SPARC] Production-rule display requires documentId');
  }
  if (!Array.isArray(sparcDisplay.nodes)) {
    throw new Error('[SPARC] Production-rule display requires nodes array');
  }
  return true;
}

function collectSparcMessageNodeIds(
  nodes: readonly unknown[] | undefined,
  ids = new Set<string>(),
): Set<string> {
  for (const node of nodes ?? []) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      continue;
    }
    const record = node as Record<string, unknown>;
    const nodeId = typeof record.id === 'string' ? record.id.trim() : '';
    if (nodeId && record.atomType === 'message-box') {
      ids.add(nodeId);
    }
    if (Array.isArray(record.children)) {
      collectSparcMessageNodeIds(record.children, ids);
    }
  }
  return ids;
}

function extractCurrentSparcMessageNodeValues(
  display: SparcAnswerEvaluationContext['currentDisplay'],
  result: SparcTrialDisplayProductionRuleEvaluationResult,
): Record<string, unknown> {
  const nodeValues: Record<string, unknown> = {};
  for (const nodeId of collectSparcMessageNodeIds(display?.nodes)) {
    nodeValues[nodeId] = '';
  }
  for (const evaluation of result.evaluations) {
    for (const firing of evaluation.execution?.firings ?? []) {
      for (const message of firing.messages ?? []) {
        const nodeId = typeof message.target?.nodeId === 'string' ? message.target.nodeId.trim() : '';
        if (nodeId) {
          nodeValues[nodeId] = message.text;
        }
      }
    }
  }
  return nodeValues;
}

function extractSparcNodeValuesFromEvaluation(
  display: SparcAnswerEvaluationContext['currentDisplay'],
  result: SparcTrialDisplayProductionRuleEvaluationResult,
  priorHistoryRecords: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
  const nodeValues: Record<string, unknown> = extractCurrentSparcMessageNodeValues(display, result);
  const progressiveOperations = collectSparcProgressiveNodeOperations([
    ...priorHistoryRecords.map((record) => (
      record.sparc
      && typeof record.sparc === 'object'
      && !Array.isArray(record.sparc)
      && 'stateTransition' in record.sparc
      && record.sparc.stateTransition
      && typeof record.sparc.stateTransition === 'object'
      && !Array.isArray(record.sparc.stateTransition)
        ? record.sparc.stateTransition as { writes?: readonly { key?: string; value?: unknown }[] }
        : {}
    )),
    ...result.evaluations.map((evaluation) => evaluation.transition ?? {}),
  ]);
  if (progressiveOperations.length > 0) {
    nodeValues[SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY] = progressiveOperations;
  }
  for (const evaluation of result.evaluations) {
    for (const write of evaluation.transition?.writes ?? []) {
      if (!write?.target?.nodeId || !write.key) {
        continue;
      }
      if (write.key === 'value' || write.key === 'message' || write.key === 'text') {
        nodeValues[write.target.nodeId] = write.value;
      } else if (write.key === 'correctness') {
        nodeValues[`${write.target.nodeId}::correctness`] = write.value;
      } else if (write.key === 'visible') {
        nodeValues[`${write.target.nodeId}::visible`] = write.value;
      }
    }
  }
  return nodeValues;
}

export function evaluateSparcProductionRuleOutcome(context: SparcAnswerEvaluationContext) {
  const display = context.currentDisplay;
  if (!hasSparcProductionRuleSource(display)) {
    return null;
  }
  if (!context.sparcResult) {
    throw new Error('[SPARC] Production-rule evaluation requires sparcResult');
  }
  const engine = context.engine as SparcProductionRuleEvaluationEngineLike | null | undefined;
  if (typeof engine?.evaluateSparcTrialDisplayProductionRuleEvents !== 'function') {
    throw new Error('[SPARC] Production-rule display requires SPARC session engine evaluation support');
  }
  const sparcReplaySession = readSparcProductionRuleReplaySession({
    tdfId: context.tdfId,
    sessionId: context.sessionId,
    documentId: display.documentId,
  }) ?? createEmptySparcProductionRuleReplaySession({
    tdfId: context.tdfId,
    sessionId: context.sessionId,
    documentId: display.documentId,
  });
  const sparcRuntimeContext = getSparcControllerRuntimeContext({
    TDFId: String(context.tdfId),
    sessionID: String(context.sessionId),
    documentId: display.documentId,
    display,
    replaySession: sparcReplaySession,
  });
  const priorHistoryRecords = sparcReplaySession.retainedHistoryRecords;
  const result = engine.evaluateSparcTrialDisplayProductionRuleEvents({
    documentId: display.documentId,
    display,
    result: context.sparcResult,
    document: sparcRuntimeContext.document,
    replayState: sparcRuntimeContext.replayState,
    priorHistoryRecords,
  });
  const lastClassification = result.classifications[result.classifications.length - 1];
  const lastMessage = result.messages[result.messages.length - 1];
  const isCorrect = lastClassification === 'correct';
  const matchText = lastClassification
    ? (isCorrect ? '1' : '0')
    : '';
  const sparcNodeValues = extractSparcNodeValuesFromEvaluation(display, result, priorHistoryRecords);
  return {
    isCorrect,
    matchText: lastMessage?.text || matchText,
    ...(Object.keys(sparcNodeValues).length > 0 ? { sparcNodeValues } : {}),
    ...(lastMessage ? {
      sparcFeedbackMessage: lastMessage.text,
      sparcFeedbackType: lastMessage.messageType,
    } : {}),
    ...(lastClassification ? { sparcClassification: lastClassification } : {}),
  };
}

export function evaluateSparcNodeIntent(context: SparcAnswerEvaluationContext) {
  const sparcResult = context.sparcResult;
  if (!context.currentDisplay?.response || !sparcResult) {
    return null;
  }
  return evaluateSparcControllerResponse({
    display: context.currentDisplay as SparcControllerDisplay,
    result: sparcResult,
  });
}
