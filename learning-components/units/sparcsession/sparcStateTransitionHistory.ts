import {
  assertCanonicalHistoryEnvelope,
  withCanonicalHistorySchemaVersion,
} from '../../runtime/historyEnvelope';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';
import type {
  SparcCanonicalHistoryExtension,
  SparcCanonicalHistoryRecord,
  SparcStateTransition,
} from './sparcSessionContracts';

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

export function createSparcStateTransitionHistoryRecord(params: {
  readonly core: SparcPracticeHistoryCore;
  readonly transition: SparcStateTransition;
  readonly action?: string;
  readonly outcome?: string;
  readonly responseValue?: unknown;
}): SparcCanonicalHistoryRecord {
  const TDFId = requireNonBlank(params.core.TDFId, 'TDFId');
  const sessionID = requireNonBlank(params.core.sessionID, 'sessionID');
  if (!params.core.userId && !params.core.anonStudentId) {
    throw new Error('SPARC state-transition history requires userId or anonStudentId');
  }

  const sourceAddress = params.transition.event.source;
  const extension: SparcCanonicalHistoryExtension = {
    documentId: sourceAddress.documentId,
    sourceAddress,
    stateTransition: params.transition,
  };
  const record = withCanonicalHistorySchemaVersion({
    TDFId,
    sessionID,
    userId: params.core.userId,
    anonStudentId: params.core.anonStudentId,
    levelUnit: params.core.levelUnit,
    levelUnitName: params.core.levelUnitName ?? '',
    levelUnitType: 'sparc',
    time: params.transition.event.time,
    problemStartTime: params.transition.event.time,
    selection: `${sourceAddress.documentId}:${sourceAddress.nodeId}`,
    action: params.action ?? 'sparc-state-transition',
    outcome: params.outcome ?? 'unknown',
    typeOfResponse: 'sparc',
    responseValue: params.responseValue ?? '',
    input: params.responseValue ?? '',
    displayedStimulus: sourceAddress,
    eventType: 'sparc',
    sparc: extension,
  }) as SparcCanonicalHistoryRecord;

  assertCanonicalHistoryEnvelope(record);
  return record;
}
