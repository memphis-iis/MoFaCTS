import { resolveSparcDocumentAddress } from './sparcDocumentAddressing';
import type {
  SparcAuthoredDocument,
  SparcClusterModelTarget,
  SparcDocumentAddress,
  SparcModelTargetIdentity,
} from './sparcSessionContracts';

function requireClusterIndex(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return numberValue;
}

function findClusterTarget(
  document: SparcAuthoredDocument,
  clusterIndex: number,
): SparcClusterModelTarget {
  const matches = (document.clusterTargets ?? []).filter((entry) => entry.clusterIndex === clusterIndex);
  if (matches.length === 0) {
    throw new Error(`SPARC clusterTargets does not define clusterIndex ${clusterIndex}`);
  }
  if (matches.length > 1) {
    throw new Error(`SPARC clusterTargets defines duplicate clusterIndex ${clusterIndex}`);
  }
  const entry = matches[0];
  if (!entry) {
    throw new Error(`SPARC clusterTargets does not define clusterIndex ${clusterIndex}`);
  }
  return entry;
}

function modelTargetFromCluster(
  cluster: SparcClusterModelTarget,
  address: SparcDocumentAddress,
): SparcModelTargetIdentity {
  return {
    stimuliSetId: cluster.stimuliSetId,
    stimulusKC: cluster.stimulusKC,
    clusterKC: cluster.clusterKC,
    KCId: cluster.KCId,
    KCDefault: cluster.KCDefault,
    KCCluster: cluster.KCCluster,
    ...(cluster.response ? { response: cluster.response } : {}),
    ...(cluster.stimulusRecordId ? { stimulusRecordId: cluster.stimulusRecordId } : {}),
    sparcDocumentId: address.documentId,
    sparcNodeId: address.nodeId,
  };
}

export function resolveSparcClusterTarget(
  document: SparcAuthoredDocument,
  clusterIndex: number,
  provenanceAddress: SparcDocumentAddress,
): SparcModelTargetIdentity {
  if (provenanceAddress.documentId !== document.id) {
    throw new Error(
      `SPARC provenance document "${provenanceAddress.documentId}" does not match authored document "${document.id}"`,
    );
  }
  return modelTargetFromCluster(findClusterTarget(document, clusterIndex), provenanceAddress);
}

export function resolveSparcAuthoredModelTarget(
  document: SparcAuthoredDocument,
  address: SparcDocumentAddress,
): SparcModelTargetIdentity | undefined {
  const resolved = resolveSparcDocumentAddress(document, address);
  const clusterIndices = resolved.node.clusterIndices ?? [];
  if (clusterIndices.length === 1) {
    return resolveSparcClusterTarget(document, clusterIndices[0] ?? -1, address);
  }
  if (clusterIndices.length > 1) {
    throw new Error(
      `SPARC node "${address.nodeId}" is attached to ${clusterIndices.length} clusters; model target is ambiguous`,
    );
  }
  if (resolved.node.modelTarget) {
    return resolved.node.modelTarget;
  }

  return undefined;
}

export function resolveSparcProductionRuleModelTarget(params: {
  readonly document: SparcAuthoredDocument;
  readonly sourceAddress: SparcDocumentAddress;
  readonly clusterIndex?: number;
  readonly nodeId?: string;
}): SparcModelTargetIdentity {
  if (params.clusterIndex !== undefined) {
    const clusterIndex = requireClusterIndex(params.clusterIndex, 'SPARC production rule model-practice clusterIndex');
    const provenanceAddress = {
      documentId: params.sourceAddress.documentId,
      nodeId: params.nodeId || params.sourceAddress.nodeId,
    };
    resolveSparcDocumentAddress(params.document, provenanceAddress);
    return resolveSparcClusterTarget(params.document, clusterIndex, provenanceAddress);
  }
  const nodeAddress = {
    documentId: params.sourceAddress.documentId,
    nodeId: params.nodeId || params.sourceAddress.nodeId,
  };
  const resolved = resolveSparcDocumentAddress(params.document, nodeAddress);
  const clusterIndices = resolved.node.clusterIndices ?? [];
  if (clusterIndices.length === 1) {
    return resolveSparcClusterTarget(params.document, clusterIndices[0] ?? -1, nodeAddress);
  }
  if (clusterIndices.length > 1) {
    throw new Error(
      `SPARC node "${nodeAddress.nodeId}" is attached to ${clusterIndices.length} clusters; model target is ambiguous`,
    );
  }
  if (resolved.node.modelTarget) {
    throw new Error(
      `SPARC production rule model-practice effect for node "${nodeAddress.nodeId}" must resolve through cluster attachment, not node modelTarget`,
    );
  }
  throw new Error(
    `SPARC production rule model-practice effect for node "${nodeAddress.nodeId}" did not resolve a cluster`,
  );
}
