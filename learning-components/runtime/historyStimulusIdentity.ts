export type StimulusIdentityValue = string | number;

export type StimulusSetIdentity = {
  stimuliSetId: StimulusIdentityValue;
};

export type StimulusItemIdentity = StimulusSetIdentity & {
  stimulusKC: StimulusIdentityValue;
};

export type StimulusClusterIdentity = StimulusSetIdentity & {
  clusterKC: StimulusIdentityValue;
};

export type ResponseIdentity = {
  responseKC: StimulusIdentityValue;
  responseKey: string;
};

export type StimulusRecordIdentity = StimulusItemIdentity & StimulusClusterIdentity & {
  response?: ResponseIdentity;
  stimulusRecordId?: string;
};

export type ModelPracticeHistoryIdentity = StimulusRecordIdentity & {
  KCId: StimulusIdentityValue;
  KCDefault: StimulusIdentityValue;
  KCCluster: StimulusIdentityValue;
};

export function isBlankIdentityValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);
}

export function isModelPracticeHistoryRecord(record: Record<string, unknown>): boolean {
  return record.levelUnitType === 'model';
}

function identityValuesMatch(left: unknown, right: unknown): boolean {
  return !isBlankIdentityValue(left) && !isBlankIdentityValue(right) && String(left) === String(right);
}

function requireIdentityField(record: Record<string, unknown>, fieldName: string): void {
  if (isBlankIdentityValue(record[fieldName])) {
    throw new Error(`Model practice history record missing ${fieldName}`);
  }
}

export function assertModelPracticeHistoryIdentity(record: Record<string, unknown>): void {
  if (!isModelPracticeHistoryRecord(record)) {
    return;
  }

  for (const fieldName of ['stimuliSetId', 'stimulusKC', 'clusterKC', 'KCId', 'KCDefault', 'KCCluster']) {
    requireIdentityField(record, fieldName);
  }

  if (!identityValuesMatch(record.KCId, record.stimulusKC)) {
    throw new Error('Model practice history identity mismatch: KCId must equal stimulusKC');
  }
  if (!identityValuesMatch(record.KCDefault, record.stimulusKC)) {
    throw new Error('Model practice history identity mismatch: KCDefault must equal stimulusKC');
  }
  if (!identityValuesMatch(record.KCCluster, record.clusterKC)) {
    throw new Error('Model practice history identity mismatch: KCCluster must equal clusterKC');
  }
}

export function createStimulusKey(identity: StimulusItemIdentity): string {
  if (isBlankIdentityValue(identity.stimuliSetId)) {
    throw new Error('Stimulus identity missing stimuliSetId');
  }
  if (isBlankIdentityValue(identity.stimulusKC)) {
    throw new Error('Stimulus identity missing stimulusKC');
  }
  return `${String(identity.stimuliSetId)}:${String(identity.stimulusKC)}`;
}
