import type { CanonicalHistoryRecord } from './historyEnvelope';
import {
  assertModelPracticeHistoryIdentity,
  isModelPracticeHistoryRecord,
  type ModelPracticeHistoryIdentity,
} from './historyStimulusIdentity';

export type SharedModelPracticeEvent = {
  readonly record: CanonicalHistoryRecord;
  readonly identity: ModelPracticeHistoryIdentity;
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
): SharedModelPracticeEvent | null {
  if (!isModelPracticeHistoryRecord(record)) {
    return null;
  }
  const practiceDurationMs = readModelPracticeDuration(record);
  return {
    record,
    identity: readModelPracticeIdentity(record),
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
): SharedModelPracticeEvent[] {
  const events: SharedModelPracticeEvent[] = [];
  for (const record of records) {
    const event = readSharedModelPracticeEvent(record);
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
  return String(left.stimuliSetId) === String(right.stimuliSetId)
    && String(left.stimulusKC) === String(right.stimulusKC)
    && String(left.clusterKC) === String(right.clusterKC)
    && String(left.KCId) === String(right.KCId)
    && String(left.KCDefault) === String(right.KCDefault)
    && String(left.KCCluster) === String(right.KCCluster)
    && (!left.response || (
      right.response !== undefined
      && String(left.response.responseKC) === String(right.response.responseKC)
      && String(left.response.responseKey) === String(right.response.responseKey)
    ));
}
