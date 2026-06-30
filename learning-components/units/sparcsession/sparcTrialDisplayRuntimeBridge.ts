import type {
  SparcTrialDisplay,
  SparcTrialResult,
} from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import { sparcTrialDisplayAdapter } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import type { HistoryRuntime } from '../../runtime/LearningComponentContext';
import type { ModelPracticeRuntime } from '../../runtime/modelPracticeRuntime';
import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import {
  commitSparcAuthoredProductionRuleEvent,
  evaluateSparcAuthoredProductionRules,
  type SparcCommittedProductionRuleEvaluation,
} from './sparcProductionRuleCommit';
import {
  commitSparcControllerDialogueTurn,
  type SparcControllerDialogueTurnResult,
  type SparcUtteranceGenerator,
} from './sparcControllerDialogueTurn';
import { replaySparcDocumentHistory } from './sparcDocumentReplay';
import {
  applySparcStateTransition,
  replaySparcHistory,
  type SparcReplayState,
} from './sparcStateReplay';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import type { SparcLearnerResponseScoringResult } from './sparcLearnerResponseScoring';
import type {
  SparcAuthoredDocument,
  SparcOutcome,
  SparcAuthoredNode,
  SparcClusterModelTarget,
  SparcProductionRule,
  SparcInterfaceEvent,
  SparcStateWrite,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';
import type { SparcLearningTargetSelectionOptions } from './sparcTargetSelection';

type DisplayNodeRecord = {
  readonly id?: unknown;
  readonly nodeType?: unknown;
  readonly atomType?: unknown;
  readonly children?: unknown;
  readonly panels?: unknown;
  readonly clusterIndex?: unknown;
  readonly clusterIndices?: unknown;
};

type SaiResponseRecord = {
  readonly selection?: unknown;
  readonly action?: unknown;
  readonly input?: unknown;
  readonly nodeRef?: unknown;
};

export type SparcTrialDisplayProductionRuleCommit = {
  readonly event: SparcInterfaceEvent;
  readonly historyRecord?: CanonicalHistoryRecord;
};

export type SparcTrialDisplayProductionRuleCommitResult = {
  readonly document: SparcAuthoredDocument;
  readonly commits: readonly SparcTrialDisplayProductionRuleCommit[];
  readonly evaluations: readonly SparcCommittedProductionRuleEvaluation[];
};

export type SparcTrialDisplayProductionRuleEvaluationResult = {
  readonly document: SparcAuthoredDocument;
  readonly events: readonly SparcInterfaceEvent[];
  readonly evaluations: readonly SparcCommittedProductionRuleEvaluation[];
  readonly classifications: readonly (SparcOutcome | 'buggy')[];
  readonly messages: readonly {
    readonly messageType: 'hint' | 'buggy' | 'success' | 'feedback';
    readonly text: string;
  }[];
  readonly credits: readonly string[];
};

export type SparcTrialDisplayDialogueTurnScorer = (params: {
  readonly document: SparcAuthoredDocument;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
  readonly event: SparcInterfaceEvent;
  readonly learnerText: string;
  readonly replayState: SparcReplayState;
}) => Promise<SparcLearnerResponseScoringResult> | SparcLearnerResponseScoringResult;

export type SparcTrialDisplayControllerDialogueTurnCommitResult = {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly learnerText: string;
  readonly dialogueTurn: SparcControllerDialogueTurnResult;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function requireOptionalClusterIndex(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return numberValue;
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
    case 'panel-selector':
    case 'html-block':
    case 'learning-progress':
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
  const nodeId = requireNonBlank(node.id, 'SPARC display node id');
  const clusterIndices = Array.isArray(node.clusterIndices)
    ? node.clusterIndices.map((value, index) => requireOptionalClusterIndex(
        value,
        `SPARC display node "${nodeId}" clusterIndices[${index}]`,
      ))
    : (node.clusterIndex !== undefined
        ? [requireOptionalClusterIndex(node.clusterIndex, `SPARC display node "${nodeId}" clusterIndex`)]
        : []);
  return {
    id: nodeId,
    kind: nodeKind(node),
    ...(clusterIndices.length > 0 ? { clusterIndices } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

function normalizeClusterTargets(display: SparcTrialDisplay): readonly SparcClusterModelTarget[] {
  if (!Array.isArray((display as Record<string, unknown>).clusterTargets)) {
    return [];
  }
  return ((display as Record<string, unknown>).clusterTargets as unknown[])
    .filter(isRecord)
    .map((entry, index) => ({
      clusterIndex: requireOptionalClusterIndex(entry.clusterIndex, `SPARC clusterTargets[${index}].clusterIndex`),
      ...(typeof entry.label === 'string' && entry.label.trim() ? { label: entry.label.trim() } : {}),
      stimuliSetId: entry.stimuliSetId as string | number,
      stimulusKC: entry.stimulusKC as string | number,
      clusterKC: entry.clusterKC as string | number,
      KCId: entry.KCId as string | number,
      KCDefault: entry.KCDefault as string | number,
      KCCluster: entry.KCCluster as string | number,
      ...(isRecord(entry.response)
        ? {
            response: {
              responseKC: entry.response.responseKC as string | number,
              responseKey: String(entry.response.responseKey ?? ''),
            },
          }
        : {}),
      ...(typeof entry.stimulusRecordId === 'string' && entry.stimulusRecordId.trim()
        ? { stimulusRecordId: entry.stimulusRecordId.trim() }
        : {}),
    }));
}

export function createSparcAuthoredDocumentFromTrialDisplay(params: {
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
}): SparcAuthoredDocument {
  const display = sparcTrialDisplayAdapter.normalizeDisplay(params.display);
  const authoredFacts = Array.isArray(display.workingMemoryFacts)
    ? display.workingMemoryFacts as readonly SparcWorkingMemoryFact[]
    : [];
  if (isRecord(display.behavior) && Array.isArray(display.behavior.authoredProductionRules)) {
    throw new Error('SPARC behavior.authoredProductionRules is not executable; use top-level productionRules');
  }
  const directProductionRules = Array.isArray(display.productionRules)
    ? display.productionRules as readonly SparcProductionRule[]
    : [];
  const initialState = Array.isArray(display.initialState)
    ? display.initialState as readonly SparcStateWrite[]
    : [];
  return {
    id: requireNonBlank(params.documentId, 'SPARC document id'),
    schemaVersion: 1,
    layout: {
      scrollAxis: 'vertical',
      layoutMode: 'document',
    },
    clusterTargets: normalizeClusterTargets(display),
    ...(initialState.length > 0 ? { initialState } : {}),
    workingMemoryFacts: authoredFacts,
    productionRules: directProductionRules,
    root: {
      id: 'root',
      kind: 'document',
      children: display.nodes.filter(isRecord).map((node) => authoredNodeFromDisplayNode(node)),
    },
  };
}

function collectResponseMappingsFromBehavior(
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

function selectMappedResponse(
  candidates: readonly SaiResponseRecord[],
  submittedValue: unknown,
): SaiResponseRecord | undefined {
  const exact = candidates.find((candidate) => String(candidate.input) === String(submittedValue));
  return exact ?? candidates[0];
}

function focusedNodePayload(
  focusedNodeId: string | undefined,
  responsesByNode: ReadonlyMap<string, readonly SaiResponseRecord[]>,
): Record<string, unknown> {
  const normalizedNodeId = typeof focusedNodeId === 'string' ? focusedNodeId.trim() : '';
  if (!normalizedNodeId) {
    return {};
  }
  const focusedSelection = responsesByNode.get(normalizedNodeId)
    ?.map((response) => stringOrUndefined(response.selection))
    .find((selection): selection is string => Boolean(selection));
  return {
    focusedNodeId: normalizedNodeId,
    ...(focusedSelection ? { focusedSelection } : {}),
  };
}

function collectDisplayNodesById(nodes: readonly unknown[] | undefined, nodesById = new Map<string, DisplayNodeRecord>()): Map<string, DisplayNodeRecord> {
  for (const node of nodes ?? []) {
    if (!isRecord(node)) {
      continue;
    }
    const nodeId = stringOrUndefined(node.id);
    if (nodeId) {
      nodesById.set(nodeId, node);
    }
    if (Array.isArray(node.children)) {
      collectDisplayNodesById(node.children, nodesById);
    }
    if (Array.isArray(node.panels)) {
      for (const panel of node.panels) {
        if (isRecord(panel) && Array.isArray(panel.children)) {
          collectDisplayNodesById(panel.children, nodesById);
        }
      }
    }
  }
  return nodesById;
}

function nodeIsAnswerable(node: DisplayNodeRecord | undefined): boolean {
  switch (node?.atomType) {
    case 'text-input':
    case 'fraction-input':
    case 'select':
    case 'dropdown':
    case 'checkbox':
      return true;
    default:
      return false;
  }
}

function isCompletionButtonAction(
  display: SparcTrialDisplay,
  selection: string | undefined,
  action: string | undefined,
): boolean {
  if (!selection || !action || !isRecord(display.response)) {
    return false;
  }
  const completion = display.response.completion;
  if (!isRecord(completion)) {
    return false;
  }
  return completion.doneSelection === selection
    && (completion.doneAction ?? 'ButtonPressed') === action;
}

function collectFirstMessageBoxId(nodes: readonly unknown[] | undefined): string | undefined {
  for (const node of nodes ?? []) {
    if (!isRecord(node)) {
      continue;
    }
    const nodeId = stringOrUndefined(node.id);
    if (nodeId && node.atomType === 'message-box') {
      return nodeId;
    }
    const childMessageBoxId = collectFirstMessageBoxId(Array.isArray(node.children) ? node.children : []);
    if (childMessageBoxId) {
      return childMessageBoxId;
    }
    if (Array.isArray(node.panels)) {
      for (const panel of node.panels) {
        if (isRecord(panel)) {
          const panelMessageBoxId = collectFirstMessageBoxId(Array.isArray(panel.children) ? panel.children : []);
          if (panelMessageBoxId) {
            return panelMessageBoxId;
          }
        }
      }
    }
  }
  return undefined;
}

function directSparcActionForNode(node: DisplayNodeRecord, submittedValue: unknown): {
  readonly selection: string;
  readonly action: string;
  readonly input: unknown;
} | undefined {
  const nodeId = stringOrUndefined(node.id);
  if (!nodeId) {
    return undefined;
  }
  switch (node.atomType) {
    case 'button':
      return {
        selection: nodeId,
        action: 'ButtonPressed',
        input: submittedValue,
      };
    case 'select':
    case 'dropdown':
      return {
        selection: nodeId,
        action: 'UpdateComboBox',
        input: submittedValue,
      };
    case 'checkbox':
      return {
        selection: nodeId,
        action: 'UpdateCheckbox',
        input: submittedValue,
      };
    case 'text-input':
    case 'fraction-input':
    default:
      return {
        selection: nodeId,
        action: 'UpdateTextField',
        input: submittedValue,
      };
  }
}

export function createSparcProductionRuleEventsFromTrialResult(params: {
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
}): readonly SparcInterfaceEvent[] {
  const responsesByNode = collectResponseMappingsFromBehavior(params.display.behavior);
  const nodesById = collectDisplayNodesById(params.display.nodes);
  const defaultIncorrectFeedbackNodeId = collectFirstMessageBoxId(params.display.nodes);
  const focusPayload = focusedNodePayload(params.result.focusedNodeId, responsesByNode);
  const events: SparcInterfaceEvent[] = [];
  let index = 0;
  const submittedEntries = Object.entries(params.result.submittedNodes);
  if (params.result.eventType === 'focus-changed' && submittedEntries.length === 0) {
    const nodeId = typeof params.result.triggeredBy === 'string' ? params.result.triggeredBy.trim() : '';
    if (nodeId) {
      events.push({
        eventId: `${params.documentId}:${nodeId}:focus:trial-display`,
        type: 'focus-changed',
        source: {
          documentId: params.documentId,
          nodeId,
        },
        time: params.result.timestamp,
        payload: {
          selection: nodeId,
          action: 'Focus',
          input: '',
          triggeredBy: nodeId,
          ...focusedNodePayload(nodeId, responsesByNode),
        },
      });
    }
    return events;
  }
  for (const [nodeId, submittedValue] of submittedEntries) {
    if (submittedValue === undefined || submittedValue === null || submittedValue === '') {
      continue;
    }
    const response = selectMappedResponse(responsesByNode.get(nodeId) ?? [], submittedValue);
    const node = nodesById.get(nodeId);
    if (!response && !node) {
      throw new Error(`SPARC submitted node "${nodeId}" not found in display`);
    }
    const directAction = response ? undefined : directSparcActionForNode(node!, submittedValue);
    const selection = stringOrUndefined(response?.selection) ?? directAction?.selection;
    const action = stringOrUndefined(response?.action) ?? directAction?.action;
    const mappedAction = stringOrUndefined(response?.action);
    const input = response && mappedAction === 'ButtonPressed'
      ? response.input
      : (response ? submittedValue : directAction?.input);
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
        input,
        triggeredBy: params.result.triggeredBy ?? null,
        ...focusPayload,
        sparcAnswerable: nodeIsAnswerable(node) || isCompletionButtonAction(params.display, selection, action),
        sparcDefaultIncorrectMessage: 'No, this is not correct.',
        ...(defaultIncorrectFeedbackNodeId ? { sparcDefaultIncorrectFeedbackNodeId: defaultIncorrectFeedbackNodeId } : {}),
      },
    });
    index += 1;
  }
  return events;
}

function createSparcDialogueEventFromTrialResult(params: {
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
}): { readonly event: SparcInterfaceEvent; readonly learnerText: string } {
  const nodesById = collectDisplayNodesById(params.display.nodes);
  const answerEntries = Object.entries(params.result.submittedNodes)
    .map(([nodeId, submittedValue]) => ({
      nodeId,
      submittedValue,
      node: nodesById.get(nodeId),
      text: typeof submittedValue === 'string' ? submittedValue.trim() : String(submittedValue ?? '').trim(),
    }))
    .filter((entry) => entry.text && nodeIsAnswerable(entry.node));
  if (answerEntries.length !== 1) {
    throw new Error(`SPARC dialogue submit requires exactly one answerable submitted node; found ${answerEntries.length}`);
  }
  const entry = answerEntries[0]!;
  return {
    learnerText: entry.text,
    event: {
      eventId: `${params.documentId}:${entry.nodeId}:dialogue:${params.result.timestamp}`,
      type: 'response-submitted',
      source: {
        documentId: params.documentId,
        nodeId: entry.nodeId,
      },
      time: params.result.timestamp,
      payload: {
        selection: entry.nodeId,
        action: 'SubmitDialogueResponse',
        input: entry.text,
        triggeredBy: params.result.triggeredBy ?? null,
      },
    },
  };
}

export async function commitSparcTrialDisplayControllerDialogueTurn(params: {
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
}): Promise<SparcTrialDisplayControllerDialogueTurnCommitResult> {
  const document = params.document ?? createSparcAuthoredDocumentFromTrialDisplay({
    documentId: params.documentId,
    display: params.display,
  });
  const replayState = params.replayState ?? replaySparcDocumentHistory(document, params.priorHistoryRecords);
  const { event, learnerText } = createSparcDialogueEventFromTrialResult({
    documentId: params.documentId,
    display: params.display,
    result: params.result,
  });
  const learnerResponseScore = await params.scoreLearnerResponse({
    document,
    display: params.display,
    result: params.result,
    event,
    learnerText,
    replayState,
  });
  const dialogueTurn = await commitSparcControllerDialogueTurn({
    core: params.core,
    document,
    replayState,
    event,
    learnerResponseScore,
    ...(params.targetSelectionOptions ? { targetSelectionOptions: params.targetSelectionOptions } : {}),
    ...(params.maxProductionRuleCycles !== undefined ? { maxProductionRuleCycles: params.maxProductionRuleCycles } : {}),
    generateTutorUtterance: params.generateTutorUtterance,
    runtime: {
      history: params.history,
    },
  });
  return {
    document,
    event,
    learnerText,
    dialogueTurn,
  };
}

export async function commitSparcTrialDisplayProductionRuleEvents(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
  readonly document?: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
  readonly history: Pick<HistoryRuntime, 'writeCanonicalHistory'>;
  readonly adaptiveModel?: ModelPracticeRuntime;
}): Promise<SparcTrialDisplayProductionRuleCommitResult> {
  const document = params.document ?? createSparcAuthoredDocumentFromTrialDisplay({
    documentId: params.documentId,
    display: params.display,
  });
  let replayState = params.replayState ?? replaySparcDocumentHistory(document, params.priorHistoryRecords);
  const commits: SparcTrialDisplayProductionRuleCommit[] = [];
  const evaluations: SparcCommittedProductionRuleEvaluation[] = [];
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
        ...(params.adaptiveModel ? { adaptiveModel: params.adaptiveModel } : {}),
        ...(params.adaptiveModel ? { modelState: params.adaptiveModel } : {}),
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
    evaluations.push(commit);
  }
  return {
    document,
    commits,
    evaluations,
  };
}

export function evaluateSparcTrialDisplayProductionRuleEvents(params: {
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
  readonly priorHistoryRecords: readonly CanonicalHistoryRecord[];
  readonly document?: SparcAuthoredDocument;
  readonly replayState?: SparcReplayState;
}): SparcTrialDisplayProductionRuleEvaluationResult {
  const document = params.document ?? createSparcAuthoredDocumentFromTrialDisplay({
    documentId: params.documentId,
    display: params.display,
  });
  let replayState = params.replayState ?? replaySparcDocumentHistory(document, params.priorHistoryRecords);
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
