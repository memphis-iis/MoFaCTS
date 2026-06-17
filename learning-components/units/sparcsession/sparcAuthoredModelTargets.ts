import { resolveSparcDocumentAddress } from './sparcDocumentAddressing';
import type {
  SparcAuthoredDocument,
  SparcDocumentAddress,
  SparcModelTargetIdentity,
  SparcStimulusRegistryEntry,
} from './sparcSessionContracts';

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function findStimulusEntry(
  document: SparcAuthoredDocument,
  stimulusId: string,
): SparcStimulusRegistryEntry {
  const normalizedStimulusId = requireNonBlank(stimulusId, 'SPARC stimulusId');
  const matches = (document.stimulusRegistry ?? []).filter((entry) => entry.stimulusId === normalizedStimulusId);
  if (matches.length === 0) {
    throw new Error(`SPARC stimulusRegistry does not define stimulus "${normalizedStimulusId}"`);
  }
  if (matches.length > 1) {
    throw new Error(`SPARC stimulusRegistry defines duplicate stimulus "${normalizedStimulusId}"`);
  }
  const entry = matches[0];
  if (!entry) {
    throw new Error(`SPARC stimulusRegistry does not define stimulus "${normalizedStimulusId}"`);
  }
  return entry;
}

function modelTargetFromStimulus(
  stimulus: SparcStimulusRegistryEntry,
  address: SparcDocumentAddress,
): SparcModelTargetIdentity {
  return {
    stimuliSetId: stimulus.stimuliSetId,
    stimulusKC: stimulus.stimulusKC,
    clusterKC: stimulus.clusterKC,
    KCId: stimulus.KCId,
    KCDefault: stimulus.KCDefault,
    KCCluster: stimulus.KCCluster,
    ...(stimulus.response ? { response: stimulus.response } : {}),
    ...(stimulus.stimulusRecordId ? { stimulusRecordId: stimulus.stimulusRecordId } : {}),
    sparcDocumentId: address.documentId,
    sparcNodeId: address.nodeId,
  };
}

export function resolveSparcStimulusRegistryTarget(
  document: SparcAuthoredDocument,
  stimulusId: string,
  provenanceAddress: SparcDocumentAddress,
): SparcModelTargetIdentity {
  if (provenanceAddress.documentId !== document.id) {
    throw new Error(
      `SPARC provenance document "${provenanceAddress.documentId}" does not match authored document "${document.id}"`,
    );
  }
  return modelTargetFromStimulus(findStimulusEntry(document, stimulusId), provenanceAddress);
}

export function resolveSparcAuthoredModelTarget(
  document: SparcAuthoredDocument,
  address: SparcDocumentAddress,
): SparcModelTargetIdentity | undefined {
  const resolved = resolveSparcDocumentAddress(document, address);
  const stimulusIds = resolved.node.stimulusIds ?? [];
  if (stimulusIds.length === 1) {
    return resolveSparcStimulusRegistryTarget(document, stimulusIds[0] ?? '', address);
  }
  if (stimulusIds.length > 1) {
    throw new Error(
      `SPARC node "${address.nodeId}" is attached to ${stimulusIds.length} stimuli; model target is ambiguous`,
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
  readonly stimulusId?: string;
  readonly nodeId?: string;
}): SparcModelTargetIdentity {
  if (params.stimulusId) {
    const provenanceAddress = {
      documentId: params.sourceAddress.documentId,
      nodeId: params.nodeId || params.sourceAddress.nodeId,
    };
    resolveSparcDocumentAddress(params.document, provenanceAddress);
    return resolveSparcStimulusRegistryTarget(params.document, params.stimulusId, provenanceAddress);
  }
  const nodeAddress = {
    documentId: params.sourceAddress.documentId,
    nodeId: params.nodeId || params.sourceAddress.nodeId,
  };
  const resolved = resolveSparcDocumentAddress(params.document, nodeAddress);
  const stimulusIds = resolved.node.stimulusIds ?? [];
  if (stimulusIds.length === 1) {
    return resolveSparcStimulusRegistryTarget(params.document, stimulusIds[0] ?? '', nodeAddress);
  }
  if (stimulusIds.length > 1) {
    throw new Error(
      `SPARC node "${nodeAddress.nodeId}" is attached to ${stimulusIds.length} stimuli; model target is ambiguous`,
    );
  }
  if (resolved.node.modelTarget) {
    throw new Error(
      `SPARC production rule model-practice effect for node "${nodeAddress.nodeId}" must resolve through stimulusRegistry attachment, not node modelTarget`,
    );
  }
  throw new Error(
    `SPARC production rule model-practice effect for node "${nodeAddress.nodeId}" did not resolve a stimulus`,
  );
}
