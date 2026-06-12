import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import type {
  SparcCanonicalHistoryExtension,
  SparcDocumentAddress,
  SparcPracticeObservation,
  SparcStateTransition,
  SparcStateWrite,
  SparcTraceStep,
} from './sparcSessionContracts';

export type SparcReplayCell = {
  readonly address: SparcDocumentAddress;
  readonly key: string;
  readonly value: unknown;
  readonly transitionId: string;
  readonly eventId: string;
  readonly time: number;
};

export type SparcReplayState = {
  readonly cells: Readonly<Record<string, SparcReplayCell>>;
  readonly observations: readonly SparcPracticeObservation[];
  readonly traceSteps: readonly SparcTraceStep[];
  readonly transitions: readonly SparcStateTransition[];
};

export function createEmptySparcReplayState(): SparcReplayState {
  return {
    cells: {},
    observations: [],
    traceSteps: [],
    transitions: [],
  };
}

export function createSparcStateCellKey(
  address: SparcDocumentAddress,
  key: string,
): string {
  return JSON.stringify([
    address.documentId,
    address.nodeId,
    key,
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertAddress(value: SparcDocumentAddress, label: string): void {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (typeof value.documentId !== 'string' || value.documentId.trim().length === 0) {
    throw new Error(`${label}.documentId is required`);
  }
  if (typeof value.nodeId !== 'string' || value.nodeId.trim().length === 0) {
    throw new Error(`${label}.nodeId is required`);
  }
}

function assertStateWrite(value: SparcStateWrite, label: string): void {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertAddress(value.target, `${label}.target`);
  if (typeof value.key !== 'string' || value.key.trim().length === 0) {
    throw new Error(`${label}.key is required`);
  }
}

function assertSameDocument(
  actualDocumentId: string,
  expectedDocumentId: string,
  label: string,
): void {
  if (actualDocumentId !== expectedDocumentId) {
    throw new Error(`${label}.documentId "${actualDocumentId}" does not match SPARC history document "${expectedDocumentId}"`);
  }
}

function addressKey(address: SparcDocumentAddress): string {
  return JSON.stringify([
    address.documentId,
    address.nodeId,
  ]);
}

function assertSameAddress(
  actualAddress: SparcDocumentAddress,
  expectedAddress: SparcDocumentAddress,
  label: string,
): void {
  if (addressKey(actualAddress) !== addressKey(expectedAddress)) {
    throw new Error(
      `${label} ${JSON.stringify(actualAddress)} does not match SPARC sourceAddress ${JSON.stringify(expectedAddress)}`,
    );
  }
}

function assertStateTransition(
  value: SparcStateTransition,
  label: string,
  documentId: string,
): void {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (typeof value.transitionId !== 'string' || value.transitionId.trim().length === 0) {
    throw new Error(`${label}.transitionId is required`);
  }
  if (!isRecord(value.event)) {
    throw new Error(`${label}.event must be an object`);
  }
  if (typeof value.event.eventId !== 'string' || value.event.eventId.trim().length === 0) {
    throw new Error(`${label}.event.eventId is required`);
  }
  assertAddress(value.event.source, `${label}.event.source`);
  assertSameDocument(value.event.source.documentId, documentId, `${label}.event.source`);
  if (!Number.isFinite(Number(value.event.time))) {
    throw new Error(`${label}.event.time must be a finite timestamp`);
  }
  if (!Array.isArray(value.writes)) {
    throw new Error(`${label}.writes must be an array`);
  }
  value.writes.forEach((write, index) => {
    assertStateWrite(write, `${label}.writes[${index}]`);
    assertSameDocument(write.target.documentId, documentId, `${label}.writes[${index}].target`);
  });
}

function assertPracticeObservation(
  value: SparcPracticeObservation,
  label: string,
  documentId: string,
): void {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (typeof value.observationId !== 'string' || value.observationId.trim().length === 0) {
    throw new Error(`${label}.observationId is required`);
  }
  assertAddress(value.sourceAddress, `${label}.sourceAddress`);
  assertSameDocument(value.sourceAddress.documentId, documentId, `${label}.sourceAddress`);
}

function assertTraceStep(
  value: SparcTraceStep,
  label: string,
  documentId: string,
): void {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (typeof value.traceId !== 'string' || value.traceId.trim().length === 0) {
    throw new Error(`${label}.traceId is required`);
  }
  assertAddress(value.sourceAddress, `${label}.sourceAddress`);
  assertSameDocument(value.sourceAddress.documentId, documentId, `${label}.sourceAddress`);
}

function readSparcExtension(record: CanonicalHistoryRecord): SparcCanonicalHistoryExtension | null {
  if (record.eventType !== 'sparc') {
    return null;
  }
  if (!isRecord(record.sparc)) {
    throw new Error('SPARC history record missing sparc extension');
  }
  const extension = record.sparc as SparcCanonicalHistoryExtension;
  if (typeof extension.documentId !== 'string' || extension.documentId.trim().length === 0) {
    throw new Error('sparc.documentId is required');
  }
  assertAddress(extension.sourceAddress, 'sparc.sourceAddress');
  assertSameDocument(extension.sourceAddress.documentId, extension.documentId, 'sparc.sourceAddress');
  return extension;
}

export function applySparcHistoryRecord(
  state: SparcReplayState,
  record: CanonicalHistoryRecord,
): SparcReplayState {
  const extension = readSparcExtension(record);
  if (!extension) {
    return state;
  }

  let nextCells: Record<string, SparcReplayCell> | null = null;
  let nextTransitions = state.transitions;

  if (extension.stateTransition) {
    assertStateTransition(extension.stateTransition, 'sparc.stateTransition', extension.documentId);
    assertSameAddress(
      extension.stateTransition.event.source,
      extension.sourceAddress,
      'sparc.stateTransition.event.source',
    );
    nextCells = { ...state.cells };
    for (const write of extension.stateTransition.writes) {
      const cellKey = createSparcStateCellKey(write.target, write.key);
      nextCells[cellKey] = {
        address: write.target,
        key: write.key,
        value: write.value,
        transitionId: extension.stateTransition.transitionId,
        eventId: extension.stateTransition.event.eventId,
        time: Number(extension.stateTransition.event.time),
      };
    }
    nextTransitions = [...state.transitions, extension.stateTransition];
  }

  if (extension.practiceObservation) {
    assertPracticeObservation(extension.practiceObservation, 'sparc.practiceObservation', extension.documentId);
    assertSameAddress(
      extension.practiceObservation.sourceAddress,
      extension.sourceAddress,
      'sparc.practiceObservation.sourceAddress',
    );
  }
  if (extension.traceStep) {
    assertTraceStep(extension.traceStep, 'sparc.traceStep', extension.documentId);
    assertSameAddress(
      extension.traceStep.sourceAddress,
      extension.sourceAddress,
      'sparc.traceStep.sourceAddress',
    );
  }

  const observations = extension.practiceObservation
    ? [...state.observations, extension.practiceObservation]
    : state.observations;
  const traceSteps = extension.traceStep
    ? [...state.traceSteps, extension.traceStep]
    : state.traceSteps;

  if (!nextCells && observations === state.observations && traceSteps === state.traceSteps) {
    return state;
  }

  return {
    cells: nextCells ?? state.cells,
    observations,
    traceSteps,
    transitions: nextTransitions,
  };
}

export function applySparcStateTransition(
  state: SparcReplayState,
  transition: SparcStateTransition,
): SparcReplayState {
  const documentId = transition.event.source.documentId;
  assertStateTransition(transition, 'sparc.stateTransition', documentId);
  const nextCells: Record<string, SparcReplayCell> = { ...state.cells };
  for (const write of transition.writes) {
    const cellKey = createSparcStateCellKey(write.target, write.key);
    nextCells[cellKey] = {
      address: write.target,
      key: write.key,
      value: write.value,
      transitionId: transition.transitionId,
      eventId: transition.event.eventId,
      time: Number(transition.event.time),
    };
  }
  return {
    ...state,
    cells: nextCells,
    transitions: [...state.transitions, transition],
  };
}

export function replaySparcHistory(
  records: Iterable<CanonicalHistoryRecord>,
  initialState: SparcReplayState = createEmptySparcReplayState(),
): SparcReplayState {
  let state = initialState;
  for (const record of records) {
    state = applySparcHistoryRecord(state, record);
  }
  return state;
}
