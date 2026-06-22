import type { CanonicalHistoryRecord } from './historyEnvelope';
import {
  assertModelPracticeHistoryIdentity,
  isModelPracticeHistoryRecord,
  type ModelPracticeHistoryIdentity,
} from './historyStimulusIdentity';
import {
  modelPracticeEnvelopeMatches,
  normalizeClusterKC,
  resolveSharedModelPracticeKey,
  sharedModelPracticeKeyMatches,
  type ModelPracticeContext,
  type SharedModelPracticeKey,
} from './sharedModelPracticeIdentity';

export type SharedModelPracticeEvent = {
  readonly record: CanonicalHistoryRecord;
  readonly identity: ModelPracticeHistoryIdentity;
  readonly sharedKey: SharedModelPracticeKey;
  readonly time: number;
  readonly problemStartTime: number;
  readonly outcome: string;
  readonly responseValue: unknown;
  readonly input: unknown;
  readonly displayedStimulus: unknown;
  readonly practiceDurationMs?: number;
};

function readOptionalResponse(record: CanonicalHistoryRecord): ModelPracticeHistoryIdentity['response'] | undefined {
  if (record.responseKC === undefined && record.responseKey === undefined) {
    return undefined;
  }
  return {
    responseKC: record.responseKC as string | number,
    responseKey: String(record.responseKey ?? ''),
  };
}

export function readModelPracticeIdentity(record: CanonicalHistoryRecord): ModelPracticeHistoryIdentity {
  assertModelPracticeHistoryIdentity(record);
  const identity: ModelPracticeHistoryIdentity = {
    stimuliSetId: record.stimuliSetId as string | number,
    stimulusKC: record.stimulusKC as string | number,
    clusterKC: record.clusterKC as string | number,
    KCId: record.KCId as string | number,
    KCDefault: record.KCDefault as string | number,
    KCCluster: record.KCCluster as string | number,
  };
  const response = readOptionalResponse(record);
  if (response) {
    identity.response = response;
  }
  if (typeof record.stimulusRecordId === 'string') {
    identity.stimulusRecordId = record.stimulusRecordId;
  }
  return identity;
}

export function readModelPracticeDuration(record: CanonicalHistoryRecord): number | undefined {
  if (Number.isFinite(Number(record.responseDuration))) {
    return Number(record.responseDuration);
  }
  if (Number.isFinite(Number(record.practiceDurationMs))) {
    return Number(record.practiceDurationMs);
  }
  if (record.sparc && typeof record.sparc === 'object' && !Array.isArray(record.sparc)) {
    const observation = (record.sparc as Record<string, unknown>).practiceObservation;
    if (observation && typeof observation === 'object' && !Array.isArray(observation)) {
      const practiceDurationMs = (observation as Record<string, unknown>).practiceDurationMs;
      if (Number.isFinite(Number(practiceDurationMs))) {
        return Number(practiceDurationMs);
      }
    }
  }
  return undefined;
}

export function readSharedModelPracticeEvent(
  record: CanonicalHistoryRecord,
  modelContext?: ModelPracticeContext,
): SharedModelPracticeEvent | null {
  if (!isModelPracticeHistoryRecord(record)) {
    return null;
  }
  const practiceDurationMs = readModelPracticeDuration(record);
  const identity = readModelPracticeIdentity(record);
  return {
    record,
    identity,
    sharedKey: resolveSharedModelPracticeKey(
      record.userId,
      modelContext ?? resolveModelPracticeContextFromRecord(record),
      identity,
    ),
    time: Number(record.time),
    problemStartTime: Number(record.problemStartTime),
    outcome: String(record.outcome ?? 'unknown'),
    responseValue: record.responseValue,
    input: record.input,
    displayedStimulus: record.displayedStimulus,
    ...(practiceDurationMs !== undefined ? { practiceDurationMs } : {}),
  };
}

export function readSharedModelPracticeEvents(
  records: Iterable<CanonicalHistoryRecord>,
  modelContext?: ModelPracticeContext,
): SharedModelPracticeEvent[] {
  const events: SharedModelPracticeEvent[] = [];
  for (const record of records) {
    const event = readSharedModelPracticeEvent(record, modelContext);
    if (event) {
      events.push(event);
    }
  }
  return events;
}

export function modelPracticeIdentityMatches(
  left: ModelPracticeHistoryIdentity,
  right: ModelPracticeHistoryIdentity,
): boolean {
  return modelPracticeEnvelopeMatches(left, right);
}

function resolveModelPracticeContextFromRecord(record: CanonicalHistoryRecord): ModelPracticeContext {
  const courseAssignment = record.courseAssignment;
  if (courseAssignment && typeof courseAssignment === 'object' && !Array.isArray(courseAssignment)) {
    const courseId = (courseAssignment as Record<string, unknown>).courseId;
    if (typeof courseId === 'string' && courseId.trim()) {
      return { contextKind: 'course', contextId: courseId.trim() };
    }
  }
  if (typeof record.TDFId === 'string' && record.TDFId.trim()) {
    return { contextKind: 'tdf', contextId: record.TDFId.trim() };
  }
  throw new Error('Model practice history record missing model context');
}

export function sharedModelPracticeIdentityMatches(params: {
  readonly target: ModelPracticeHistoryIdentity;
  readonly targetUserId: unknown;
  readonly targetContext: ModelPracticeContext;
  readonly event: SharedModelPracticeEvent;
}): boolean {
  const targetKey = resolveSharedModelPracticeKey(
    params.targetUserId,
    params.targetContext,
    { clusterKC: normalizeClusterKC(params.target.clusterKC) },
  );
  return sharedModelPracticeKeyMatches(targetKey, params.event.sharedKey);
}
