import type {
  SparcAddressReference,
  SparcAuthoredDocument,
  SparcAuthoredNode,
  SparcDocumentAddress,
  SparcModelTargetIdentity,
  SparcClusterModelTarget,
} from './sparcSessionContracts';
import { assertModelPracticeHistoryIdentity } from '../../runtime/historyStimulusIdentity';
import { MODEL_PRACTICE_METRICS } from '../../runtime/modelPracticeStateQueries';

export type SparcResolvedAddress = {
  readonly document: SparcAuthoredDocument;
  readonly node: SparcAuthoredNode;
};

export type SparcReferenceValidationIssue = {
  readonly sourceNodeId: string;
  readonly reference: SparcAddressReference;
  readonly message: string;
};

export type SparcReferenceValidationResult = {
  readonly valid: boolean;
  readonly issues: readonly SparcReferenceValidationIssue[];
};

function collectNodes(
  node: SparcAuthoredNode,
  nodes = new Map<string, SparcAuthoredNode>(),
): Map<string, SparcAuthoredNode> {
  if (nodes.has(node.id)) {
    throw new Error(`SPARC document contains duplicate node id "${node.id}"`);
  }
  nodes.set(node.id, node);
  for (const child of node.children ?? []) {
    collectNodes(child, nodes);
  }
  return nodes;
}

export function resolveSparcDocumentAddress(
  document: SparcAuthoredDocument,
  address: SparcDocumentAddress,
): SparcResolvedAddress {
  if (address.pageKey !== document.id) {
    throw new Error(`SPARC address document "${address.pageKey}" does not match authored document "${document.id}"`);
  }
  const nodes = collectNodes(document.root);
  const node = nodes.get(address.nodeId);
  if (!node) {
    throw new Error(`SPARC address node "${address.nodeId}" not found in document "${document.id}"`);
  }
  return {
    document,
    node,
  };
}

function validateNodeReferences(
  document: SparcAuthoredDocument,
  sourceNode: SparcAuthoredNode,
  issues: SparcReferenceValidationIssue[],
): void {
  for (const reference of sourceNode.refs ?? []) {
    try {
      resolveSparcDocumentAddress(document, reference.target);
    } catch (error) {
      issues.push({
        sourceNodeId: sourceNode.id,
        reference,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (
      reference.stateKey !== undefined
      && (typeof reference.stateKey !== 'string' || reference.stateKey.trim().length === 0)
    ) {
      issues.push({
        sourceNodeId: sourceNode.id,
        reference,
        message: `SPARC node "${sourceNode.id}" reference stateKey is required when declared`,
      });
    }
    if (
      reference.modelMetric !== undefined
      && !(MODEL_PRACTICE_METRICS as readonly string[]).includes(String(reference.modelMetric))
    ) {
      issues.push({
        sourceNodeId: sourceNode.id,
        reference,
        message: `SPARC node "${sourceNode.id}" reference modelMetric "${String(reference.modelMetric)}" is not recognized`,
      });
    }
  }
  for (const child of sourceNode.children ?? []) {
    validateNodeReferences(document, child, issues);
  }
}

function validateInitialStateReferences(
  document: SparcAuthoredDocument,
  issues: SparcReferenceValidationIssue[],
): void {
  for (const [index, write] of (document.initialState ?? []).entries()) {
    try {
      resolveSparcDocumentAddress(document, write.target);
    } catch (error) {
      issues.push({
        sourceNodeId: `initial-state:${index}`,
        reference: {
          relation: 'controls',
          target: write.target,
        },
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (typeof write.key !== 'string' || write.key.trim().length === 0) {
      issues.push({
        sourceNodeId: `initial-state:${index}`,
        reference: {
          relation: 'controls',
          target: write.target,
        },
        message: `SPARC authored initialState[${index}].key is required`,
      });
    }
  }
}

function modelTargetAddressForNode(
  document: SparcAuthoredDocument,
  node: SparcAuthoredNode,
): SparcDocumentAddress {
  return {
    pageKey: document.id,
    nodeId: node.id,
  };
}

function modelTargetReferenceAddress(
  target: SparcModelTargetIdentity,
): SparcDocumentAddress {
  return {
    pageKey: target.sparcPageKey,
    nodeId: target.sparcNodeId,
  };
}

function validateModelTargetIdentity(params: {
  readonly target: SparcModelTargetIdentity;
  readonly sourceNodeId: string;
  readonly issues: SparcReferenceValidationIssue[];
}): void {
  try {
    assertModelPracticeHistoryIdentity({
      levelUnitType: 'model',
      ...params.target,
    });
  } catch (error) {
    params.issues.push({
      sourceNodeId: params.sourceNodeId,
      reference: {
        relation: 'model-target',
        target: modelTargetReferenceAddress(params.target),
      },
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function modelTargetMatchesAuthoredAddress(
  target: SparcModelTargetIdentity,
  address: SparcDocumentAddress,
): boolean {
  return target.sparcPageKey === address.pageKey && target.sparcNodeId === address.nodeId;
}

function modelTargetAddressMessage(
  target: SparcModelTargetIdentity,
  address: SparcDocumentAddress,
): string {
  return `SPARC authored modelTarget for node "${address.nodeId}" must match authored address `
    + `${JSON.stringify(address)}; got ${JSON.stringify({
      sparcPageKey: target.sparcPageKey,
      sparcNodeId: target.sparcNodeId,
    })}`;
}

function validateAuthoredModelTargets(
  document: SparcAuthoredDocument,
  node: SparcAuthoredNode,
  issues: SparcReferenceValidationIssue[],
): void {
  if (node.modelTarget) {
    const address = modelTargetAddressForNode(document, node);
    validateModelTargetIdentity({
      target: node.modelTarget,
      sourceNodeId: node.id,
      issues,
    });
    if (!modelTargetMatchesAuthoredAddress(node.modelTarget, address)) {
      issues.push({
        sourceNodeId: node.id,
        reference: {
          relation: 'model-target',
          target: address,
        },
        message: modelTargetAddressMessage(node.modelTarget, address),
      });
    }
  }
  for (const child of node.children ?? []) {
    validateAuthoredModelTargets(document, child, issues);
  }
}

function modelTargetFromClusterEntry(
  document: SparcAuthoredDocument,
  entry: SparcClusterModelTarget,
): SparcModelTargetIdentity {
  return {
    stimuliSetId: entry.stimuliSetId,
    stimulusKC: entry.stimulusKC,
    clusterKC: entry.clusterKC,
    KCId: entry.KCId,
    KCDefault: entry.KCDefault,
    KCCluster: entry.KCCluster,
    ...(entry.response ? { response: entry.response } : {}),
    ...(entry.stimulusRecordId ? { stimulusRecordId: entry.stimulusRecordId } : {}),
    sparcPageKey: document.id,
    sparcNodeId: document.root.id,
  };
}

function validateClusterTargets(
  document: SparcAuthoredDocument,
  issues: SparcReferenceValidationIssue[],
): Set<number> {
  const ids = new Set<number>();
  for (const [index, entry] of (document.clusterTargets ?? []).entries()) {
    const sourceNodeId = `cluster-target:${index}`;
    if (!Number.isInteger(entry.clusterIndex) || entry.clusterIndex < 0) {
      issues.push({
        sourceNodeId,
        reference: {
          relation: 'model-target',
          target: {
            pageKey: document.id,
            nodeId: document.root.id,
          },
        },
        message: `SPARC clusterTargets[${index}].clusterIndex must be a non-negative integer`,
      });
    } else if (ids.has(entry.clusterIndex)) {
      issues.push({
        sourceNodeId,
        reference: {
          relation: 'model-target',
          target: {
            pageKey: document.id,
            nodeId: document.root.id,
          },
        },
        message: `SPARC clusterTargets contains duplicate clusterIndex ${entry.clusterIndex}`,
      });
    } else {
      ids.add(entry.clusterIndex);
    }
    validateModelTargetIdentity({
      target: modelTargetFromClusterEntry(document, entry),
      sourceNodeId,
      issues,
    });
  }
  return ids;
}

function validateNodeStimulusAttachments(
  document: SparcAuthoredDocument,
  node: SparcAuthoredNode,
  clusterIndices: ReadonlySet<number>,
  issues: SparcReferenceValidationIssue[],
): void {
  for (const [index, clusterIndex] of (node.clusterIndices ?? []).entries()) {
    if (!Number.isInteger(clusterIndex) || clusterIndex < 0) {
      issues.push({
        sourceNodeId: node.id,
        reference: {
          relation: 'model-target',
          target: modelTargetAddressForNode(document, node),
        },
        message: `SPARC node "${node.id}" clusterIndices[${index}] must be a non-negative integer`,
      });
    } else if (!clusterIndices.has(clusterIndex)) {
      issues.push({
        sourceNodeId: node.id,
        reference: {
          relation: 'model-target',
          target: modelTargetAddressForNode(document, node),
        },
        message: `SPARC node "${node.id}" attaches unknown clusterIndex ${clusterIndex}`,
      });
    }
  }
  for (const child of node.children ?? []) {
    validateNodeStimulusAttachments(document, child, clusterIndices, issues);
  }
}

export function validateSparcDocumentReferences(
  document: SparcAuthoredDocument,
): SparcReferenceValidationResult {
  const issues: SparcReferenceValidationIssue[] = [];
  const clusterIndices = validateClusterTargets(document, issues);
  validateNodeReferences(document, document.root, issues);
  validateInitialStateReferences(document, issues);
  validateAuthoredModelTargets(document, document.root, issues);
  validateNodeStimulusAttachments(document, document.root, clusterIndices, issues);
  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertSparcDocumentReferences(document: SparcAuthoredDocument): void {
  const result = validateSparcDocumentReferences(document);
  if (result.valid) {
    return;
  }
  throw new Error(result.issues.map((issue) => issue.message).join('; '));
}
