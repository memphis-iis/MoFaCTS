import {
  isBlankIdentityValue,
  type ModelPracticeHistoryIdentity,
  type StimulusIdentityValue,
} from './historyStimulusIdentity';

export type ModelPracticeEnvelopeIdentity = ModelPracticeHistoryIdentity;

export type ModelPracticeContext =
  | { readonly contextKind: 'course'; readonly contextId: string }
  | { readonly contextKind: 'tdf'; readonly contextId: string };

export type SharedModelPracticeKey = ModelPracticeContext & {
  readonly userId: string;
  readonly clusterKC: string;
};

function requireNonBlankIdentityValue(value: unknown, label: string): StimulusIdentityValue {
  if (isBlankIdentityValue(value)) {
    throw new Error(`Model practice identity missing ${label}`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Model practice identity ${label} must be finite`);
    }
    return value;
  }
  return String(value);
}

export function normalizeClusterKC(value: unknown): string {
  const identity = requireNonBlankIdentityValue(value, 'clusterKC');
  if (typeof identity === 'number') {
    return String(identity);
  }
  const normalized = identity.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Model practice identity missing clusterKC');
  }
  return normalized;
}

export function resolveModelPracticeEnvelope(params: {
  readonly stimuliSetId: unknown;
  readonly clusterKC: unknown;
  readonly stimulusKC: unknown;
  readonly response?: ModelPracticeHistoryIdentity['response'];
  readonly stimulusRecordId?: string;
}): ModelPracticeEnvelopeIdentity {
  const clusterKC = normalizeClusterKC(params.clusterKC);
  const stimulusKC = requireNonBlankIdentityValue(params.stimulusKC, 'stimulusKC');
  const envelope: ModelPracticeEnvelopeIdentity = {
    stimuliSetId: requireNonBlankIdentityValue(params.stimuliSetId, 'stimuliSetId'),
    clusterKC,
    stimulusKC,
    KCId: stimulusKC,
    KCDefault: stimulusKC,
    KCCluster: clusterKC,
  };
  if (params.response) {
    envelope.response = params.response;
  }
  if (params.stimulusRecordId) {
    envelope.stimulusRecordId = params.stimulusRecordId;
  }
  return envelope;
}

export function resolveSharedModelPracticeKey(
  userId: unknown,
  modelContext: ModelPracticeContext,
  envelope: Pick<ModelPracticeEnvelopeIdentity, 'clusterKC'>,
): SharedModelPracticeKey {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!normalizedUserId) {
    throw new Error('Shared model practice key requires userId');
  }
  const normalizedContextId = modelContext.contextId.trim();
  if (!normalizedContextId) {
    throw new Error('Shared model practice key requires contextId');
  }
  return {
    userId: normalizedUserId,
    contextKind: modelContext.contextKind,
    contextId: normalizedContextId,
    clusterKC: normalizeClusterKC(envelope.clusterKC),
  };
}

export function modelPracticeEnvelopeMatches(
  left: ModelPracticeEnvelopeIdentity,
  right: ModelPracticeEnvelopeIdentity,
): boolean {
  return String(left.stimuliSetId) === String(right.stimuliSetId)
    && String(left.stimulusKC) === String(right.stimulusKC)
    && normalizeClusterKC(left.clusterKC) === normalizeClusterKC(right.clusterKC)
    && String(left.KCId) === String(right.KCId)
    && String(left.KCDefault) === String(right.KCDefault)
    && normalizeClusterKC(left.KCCluster) === normalizeClusterKC(right.KCCluster)
    && (!left.response || (
      right.response !== undefined
      && String(left.response.responseKC) === String(right.response.responseKC)
      && String(left.response.responseKey) === String(right.response.responseKey)
    ));
}

export function sharedModelPracticeKeyMatches(
  left: SharedModelPracticeKey,
  right: SharedModelPracticeKey,
): boolean {
  return left.userId === right.userId
    && left.contextKind === right.contextKind
    && left.contextId === right.contextId
    && normalizeClusterKC(left.clusterKC) === normalizeClusterKC(right.clusterKC);
}
