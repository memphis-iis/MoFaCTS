import type {
  SparcTrialDisplay,
  SparcTrialResult,
} from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import {
  commitSparcAuthoredProductionRuleEvent,
  evaluateSparcAuthoredProductionRules,
  type SparcCommittedProductionRuleEvaluation,
} from './sparcProductionRuleCommit';
import { replaySparcDocumentHistory } from './sparcDocumentReplay';
import { applySparcStateTransition, replaySparcHistory } from './sparcStateReplay';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import type {
  SparcAuthoredDocument,
  SparcOutcome,
  SparcAuthoredNode,
  SparcProductionRule,
  SparcReactiveEvent,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

type DisplayNodeRecord = {
  readonly id?: unknown;
  readonly nodeType?: unknown;
  readonly atomType?: unknown;
  readonly children?: unknown;
};

type SaiResponseRecord = {
  readonly selection?: unknown;
  readonly action?: unknown;
  readonly input?: unknown;
  readonly nodeRef?: unknown;
};

export type SparcTrialDisplayProductionRuleCommit = {
  readonly event: SparcReactiveEvent;
  readonly historyRecord?: CanonicalHistoryRecord;
};

export type SparcTrialDisplayProductionRuleCommitResult = {
  readonly document: SparcAuthoredDocument;
  readonly commits: readonly SparcTrialDisplayProductionRuleCommit[];
};

export type SparcTrialDisplayProductionRuleEvaluationResult = {
  readonly document: SparcAuthoredDocument;
  readonly events: readonly SparcReactiveEvent[];
  readonly evaluations: readonly SparcCommittedProductionRuleEvaluation[];
  readonly classifications: readonly (SparcOutcome | 'buggy')[];
  readonly messages: readonly {
    readonly messageType: 'hint' | 'buggy' | 'success' | 'feedback';
    readonly text: string;
  }[];
  readonly credits: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function nodeKind(node: DisplayNodeRecord): SparcAuthoredNode['kind'] {
  if (node.nodeType === 'group') {
    return 'panel';
  }
  switch (node.atomType) {
    case 'text-input':
    case 'select':
    case 'checkbox':
    case 'button':
      return 'input';
    case 'text-block':
    case 'static-text':
    case 'label':
      return 'output';
    default:
      return 'widget';
  }
}

function authoredNodeFromDisplayNode(node: DisplayNodeRecord): SparcAuthoredNode {
  const children = Array.isArray(node.children)
    ? node.children.filter(isRecord).map((child) => authoredNodeFromDisplayNode(child))
    : [];
  return {
    id: requireNonBlank(node.id, 'SPARC display node id'),
    kind: nodeKind(node),
    ...(children.length > 0 ? { children } : {}),
  };
}

export function createSparcAuthoredDocumentFromTrialDisplay(params: {
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
}): SparcAuthoredDocument {
  return {
    id: requireNonBlank(params.documentId, 'SPARC document id'),
    schemaVersion: 1,
    layout: {
      scrollAxis: 'vertical',
      layoutMode: 'document',
    },
    workingMemoryFacts: Array.isArray(params.display.workingMemoryFacts)
      ? params.display.workingMemoryFacts as readonly SparcWorkingMemoryFact[]
      : [],
    productionRules: Array.isArray(params.display.productionRules)
      ? params.display.productionRules as readonly SparcProductionRule[]
      : [],
    root: {
      id: 'root',
      kind: 'document',
      children: params.display.nodes.filter(isRecord).map((node) => authoredNodeFromDisplayNode(node)),
    },
  };
}

function collectSaiResponsesFromBehavior(
  behavior: unknown,
): Map<string, SaiResponseRecord[]> {
  const responsesByNode = new Map<string, SaiResponseRecord[]>();
  if (!isRecord(behavior) || !Array.isArray(behavior.steps)) {
    return responsesByNode;
  }

  function addResponse(response: unknown): void {
    if (!isRecord(response)) {
      return;
    }
    const nodeRef = stringOrUndefined(response.nodeRef);
    if (!nodeRef) {
      return;
    }
    const responses = responsesByNode.get(nodeRef) ?? [];
    responsesByNode.set(nodeRef, [...responses, response]);
  }

  for (const step of behavior.steps) {
    if (!isRecord(step) || !Array.isArray(step.responses)) {
      continue;
    }
    for (const response of step.responses) {
      addResponse(response);
    }
  }
  if (Array.isArray(behavior.paths)) {
    for (const path of behavior.paths) {
      if (!isRecord(path) || !Array.isArray(path.responses)) {
        continue;
      }
      for (const response of path.responses) {
        addResponse(response);
      }
    }
  }
  return responsesByNode;
}

function selectSaiResponse(
  candidates: readonly SaiResponseRecord[],
  submittedValue: unknown,
): SaiResponseRecord | undefined {
  const exact = candidates.find((candidate) => String(candidate.input) === String(submittedValue));
  return exact ?? candidates[0];
}

export function createSparcProductionRuleEventsFromTrialResult(params: {
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
}): readonly SparcReactiveEvent[] {
  const responsesByNode = collectSaiResponsesFromBehavior(params.display.behavior);
  const events: SparcReactiveEvent[] = [];
  let index = 0;
  for (const [nodeId, submittedValue] of Object.entries(params.result.submittedNodes)) {
    if (submittedValue === undefined || submittedValue === null || submittedValue === '') {
      continue;
    }
    const response = selectSaiResponse(responsesByNode.get(nodeId) ?? [], submittedValue);
    const selection = stringOrUndefined(response?.selection);
    const action = stringOrUndefined(response?.action);
    if (!selection || !action) {
      continue;
    }
    events.push({
      eventId: `${params.documentId}:${nodeId}:${index}:trial-display`,
      type: 'response-submitted',
      source: {
        documentId: params.documentId,
        nodeId,
      },
      time: params.result.timestamp,
      payload: {
        selection,
        action,
        input: submittedValue,
        triggeredBy: params.result.triggeredBy ?? null,
      },
    });
    index += 1;
  }
  return events;
}

export async function commitSparcTrialDisplayProductionRuleEvents(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
}): Promise<SparcTrialDisplayProductionRuleCommitResult> {
  const document = createSparcAuthoredDocumentFromTrialDisplay({
    documentId: params.documentId,
    display: params.display,
  });
  let replayState = replaySparcDocumentHistory(document, params.priorHistoryRecords);
  const commits: SparcTrialDisplayProductionRuleCommit[] = [];
  for (const event of createSparcProductionRuleEventsFromTrialResult({
    documentId: params.documentId,
    display: params.display,
    result: params.result,
  })) {
    const commit = await commitSparcAuthoredProductionRuleEvent({
      core: params.core,
      document,
      replayState,
      event,
      runtime: {
        history: params.history,
      },
    });
    if (commit.historyRecord) {
      replayState = replaySparcHistory([commit.historyRecord], replayState);
    }
    commits.push({
      event,
      ...(commit.historyRecord ? { historyRecord: commit.historyRecord } : {}),
    });
  }
  return {
    document,
    commits,
  };
}

export function evaluateSparcTrialDisplayProductionRuleEvents(params: {
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
}): SparcTrialDisplayProductionRuleEvaluationResult {
  const document = createSparcAuthoredDocumentFromTrialDisplay({
    documentId: params.documentId,
    display: params.display,
  });
  let replayState = replaySparcDocumentHistory(document, params.priorHistoryRecords);
  const events = createSparcProductionRuleEventsFromTrialResult({
    documentId: params.documentId,
    display: params.display,
    result: params.result,
  });
  const evaluations: SparcCommittedProductionRuleEvaluation[] = [];
  for (const event of events) {
    const evaluation = evaluateSparcAuthoredProductionRules({
      document,
      replayState,
      event,
    });
    if (evaluation.transition) {
      replayState = applySparcStateTransition(replayState, evaluation.transition);
    }
    evaluations.push(evaluation);
  }
  const firings = evaluations.flatMap((evaluation) => evaluation.execution.firings);
  return {
    document,
    events,
    evaluations,
    classifications: firings.flatMap((firing) => firing.classifications),
    messages: firings.flatMap((firing) => firing.messages),
    credits: firings.flatMap((firing) => firing.credits),
  };
}
