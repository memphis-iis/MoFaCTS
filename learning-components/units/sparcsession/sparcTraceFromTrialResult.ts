import type {
  SparcTraceExpectation,
  SparcTrialDisplay,
  SparcTrialResult,
} from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import type {
  SparcDocumentAddress,
  SparcOutcome,
  SparcTraceStep,
} from './sparcSessionContracts';

export type SparcTraceGenerationParams = {
  readonly documentId: string;
  readonly display: SparcTrialDisplay;
  readonly result: SparcTrialResult;
  readonly time?: number;
};

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function scoredNodeOrder(display: SparcTrialDisplay): string[] {
  const response = display.response;
  if (!response) {
    throw new Error('SPARC trace generation requires response metadata');
  }
  const scoredNodes = Array.isArray(response.scoredNodes) ? response.scoredNodes.filter(Boolean) : [];
  if (scoredNodes.length > 0) {
    return scoredNodes;
  }
  const intentNodes = Array.isArray(response.intentByNode)
    ? response.intentByNode.map((entry) => entry.node).filter(Boolean)
    : [];
  if (intentNodes.length > 0) {
    return intentNodes;
  }
  throw new Error('SPARC trace generation requires scoredNodes or intentByNode');
}

function traceMetadataByNode(display: SparcTrialDisplay): Map<string, SparcTraceExpectation[]> {
  const traceByNode = display.response?.traceByNode ?? [];
  const traceMap = new Map<string, SparcTraceExpectation[]>();
  for (const entry of traceByNode) {
    if (!entry.node) {
      continue;
    }
    const entries = traceMap.get(entry.node) ?? [];
    traceMap.set(entry.node, [...entries, entry]);
  }
  return traceMap;
}

function outcomeForNode(nodeId: string, display: SparcTrialDisplay, result: SparcTrialResult): SparcOutcome {
  const intent = display.response?.intentByNode?.find((entry) => entry.node === nodeId);
  if (!intent) {
    return 'unknown';
  }
  return result.submittedNodes[nodeId] === intent.expected ? 'correct' : 'incorrect';
}

function sourceAddress(documentId: string, nodeId: string): SparcDocumentAddress {
  return {
    documentId,
    nodeId,
  };
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return String(left) === String(right);
}

function selectTraceMetadata(
  nodeId: string,
  submittedValue: unknown,
  traceMap: Map<string, SparcTraceExpectation[]>,
): SparcTraceExpectation {
  const candidates = traceMap.get(nodeId) ?? [];
  if (candidates.length === 0) {
    throw new Error(`SPARC trace generation missing trace metadata for node "${nodeId}"`);
  }
  if (candidates.length === 1 && !('submittedValue' in candidates[0]!)) {
    return candidates[0]!;
  }
  const matched = candidates.find((candidate) => (
    'submittedValue' in candidate && valuesMatch(candidate.submittedValue, submittedValue)
  ));
  if (!matched) {
    throw new Error(`SPARC trace generation missing trace metadata for node "${nodeId}" submitted value "${String(submittedValue)}"`);
  }
  return matched;
}

export function createSparcTraceFromTrialResult(
  params: SparcTraceGenerationParams,
): SparcTraceStep[] {
  const documentId = requireNonBlank(params.documentId, 'documentId');
  const nodes = scoredNodeOrder(params.display);
  const traceMap = traceMetadataByNode(params.display);
  return nodes.map((nodeId, index) => {
    const traceMetadata = selectTraceMetadata(
      nodeId,
      params.result.submittedNodes[nodeId],
      traceMap,
    );
    const productionRuleId = requireNonBlank(
      traceMetadata.productionRuleId,
      `traceByNode.${nodeId}.productionRuleId`,
    );
    const actionId = requireNonBlank(traceMetadata.actionId, `traceByNode.${nodeId}.actionId`);
    const details: Record<string, unknown> = {};
    if (traceMetadata.productionRuleName !== undefined) {
      details.productionRuleName = traceMetadata.productionRuleName;
    }
    if (traceMetadata.productionSet !== undefined) {
      details.productionSet = traceMetadata.productionSet;
    }
    if (traceMetadata.stimulusKC !== undefined) {
      details.stimulusKC = traceMetadata.stimulusKC;
    }
    if (traceMetadata.responseKC !== undefined) {
      details.responseKC = traceMetadata.responseKC;
    }
    return {
      traceId: `${documentId}:${nodeId}:${index}`,
      sourceAddress: sourceAddress(documentId, nodeId),
      productionRuleId,
      actionId,
      outcome: outcomeForNode(nodeId, params.display, params.result),
      time: params.time ?? params.result.timestamp,
      ...(Object.keys(details).length > 0 ? { details } : {}),
    };
  });
}
