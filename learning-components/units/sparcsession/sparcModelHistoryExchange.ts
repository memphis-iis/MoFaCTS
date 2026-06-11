import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import {
  modelPracticeIdentityMatches,
  readSharedModelPracticeEvent,
  readSharedModelPracticeEvents,
  type SharedModelPracticeEvent,
} from '../../runtime/modelPracticeHistoryExchange';
import {
  type ModelPracticeHistoryIdentity,
} from '../../runtime/historyStimulusIdentity';
import type {
  SparcModelTargetIdentity,
  SparcOutcome,
  SparcPracticeObservation,
} from './sparcSessionContracts';

export type SparcReadableModelPracticeEvent = SharedModelPracticeEvent & {
  readonly outcome: SparcOutcome | string;
  readonly sparcObservation?: SparcPracticeObservation;
};

function readSparcObservation(record: CanonicalHistoryRecord): SparcPracticeObservation | undefined {
  if (!record.sparc || typeof record.sparc !== 'object' || Array.isArray(record.sparc)) {
    return undefined;
  }
  const observation = (record.sparc as Record<string, unknown>).practiceObservation;
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    return undefined;
  }
  return observation as SparcPracticeObservation;
}

export function readSparcReadableModelPracticeEvent(
  record: CanonicalHistoryRecord,
): SparcReadableModelPracticeEvent | null {
  const sharedEvent = readSharedModelPracticeEvent(record);
  if (!sharedEvent) {
    return null;
  }
  const sparcObservation = readSparcObservation(record);
  return {
    ...sharedEvent,
    outcome: sharedEvent.outcome as SparcOutcome | string,
    ...(sparcObservation ? { sparcObservation } : {}),
  };
}

export function readSparcReadableModelPracticeEvents(
  records: Iterable<CanonicalHistoryRecord>,
): SparcReadableModelPracticeEvent[] {
  return readSharedModelPracticeEvents(records).map((event) => {
    const sparcObservation = readSparcObservation(event.record);
    return {
      ...event,
      outcome: event.outcome as SparcOutcome | string,
      ...(sparcObservation ? { sparcObservation } : {}),
    };
  });
}

export function sparcModelTargetMatchesSharedIdentity(
  sparcTarget: SparcModelTargetIdentity,
  identity: ModelPracticeHistoryIdentity,
): boolean {
  return modelPracticeIdentityMatches(sparcTarget, identity);
}
