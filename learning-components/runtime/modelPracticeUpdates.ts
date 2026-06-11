import {
  assertCanonicalHistoryEnvelope,
  type CanonicalHistoryRecord,
  type HistoryEventType,
  withCanonicalHistorySchemaVersion,
} from './historyEnvelope';
import type { ModelPracticeHistoryIdentity } from './historyStimulusIdentity';

export type ModelPracticeHistoryCore = {
  readonly TDFId: string;
  readonly sessionID: string;
  readonly levelUnit: number;
  readonly levelUnitName?: string;
  readonly userId?: string;
  readonly anonStudentId?: string;
};

export type ModelPracticeUpdateRequest<TTarget extends ModelPracticeHistoryIdentity = ModelPracticeHistoryIdentity> = {
  readonly observationId: string;
  readonly target: TTarget;
  readonly outcome: string;
  readonly practiceDurationMs?: number;
  readonly responseValue: unknown;
  readonly input?: unknown;
  readonly displayedStimulus?: unknown;
  readonly time: number;
  readonly problemStartTime: number;
  readonly selection: string;
  readonly action: string;
  readonly typeOfResponse: string;
  readonly eventType?: HistoryEventType;
};

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

export function copyModelPracticeIdentityToRecord(
  record: Record<string, unknown>,
  target: ModelPracticeHistoryIdentity,
): void {
  record.stimuliSetId = target.stimuliSetId;
  record.stimulusKC = target.stimulusKC;
  record.clusterKC = target.clusterKC;
  record.KCId = target.KCId;
  record.KCDefault = target.KCDefault;
  record.KCCluster = target.KCCluster;
  if (target.response) {
    record.responseKC = target.response.responseKC;
    record.responseKey = target.response.responseKey;
  }
  if (target.stimulusRecordId) {
    record.stimulusRecordId = target.stimulusRecordId;
  }
}

export function createCanonicalModelPracticeHistoryRecord(
  core: ModelPracticeHistoryCore,
  request: ModelPracticeUpdateRequest,
  extensionFields: Record<string, unknown> = {},
): CanonicalHistoryRecord {
  const TDFId = requireNonBlank(core.TDFId, 'TDFId');
  const sessionID = requireNonBlank(core.sessionID, 'sessionID');
  if (!core.userId && !core.anonStudentId) {
    throw new Error('Model practice history requires userId or anonStudentId');
  }

  const record: Record<string, unknown> = {
    TDFId,
    sessionID,
    userId: core.userId,
    anonStudentId: core.anonStudentId,
    levelUnit: core.levelUnit,
    levelUnitName: core.levelUnitName ?? '',
    levelUnitType: 'model',
    time: request.time,
    problemStartTime: request.problemStartTime,
    selection: request.selection,
    action: request.action,
    outcome: request.outcome,
    typeOfResponse: request.typeOfResponse,
    responseValue: request.responseValue,
    input: request.input ?? request.responseValue,
    displayedStimulus: request.displayedStimulus ?? request.selection,
    eventType: request.eventType ?? '',
    ...extensionFields,
  };
  if (request.practiceDurationMs !== undefined) {
    record.responseDuration = request.practiceDurationMs;
  }
  copyModelPracticeIdentityToRecord(record, request.target);
  const versioned = withCanonicalHistorySchemaVersion(record);
  assertCanonicalHistoryEnvelope(versioned);
  return versioned;
}
