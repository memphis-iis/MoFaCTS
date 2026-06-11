import { assertCanonicalHistoryEnvelope } from '../../runtime/historyEnvelope';
import {
  createSparcPracticeHistoryBridge,
  type SparcPracticeHistoryCore,
} from './sparcPracticeHistoryBridge';
import type {
  SparcCanonicalHistoryRecord,
  SparcDocumentAddress,
  SparcModelUpdateRequest,
  SparcModelTargetIdentity,
  SparcOutcome,
  SparcPracticeObservation,
  SparcStateTransition,
  SparcStateWrite,
  SparcTraceStep,
} from './sparcSessionContracts';

export type SparcResponseOutcomeInput = {
  readonly observationId: string;
  readonly sourceAddress: SparcDocumentAddress;
  readonly time: number;
  readonly problemStartTime: number;
  readonly practiceDurationMs?: number;
  readonly outcome: SparcOutcome;
  readonly responseValue: unknown;
  readonly input?: unknown;
  readonly displayedStimulus?: unknown;
  readonly modelTarget?: SparcModelTargetIdentity;
  readonly stateWrites?: readonly SparcStateWrite[];
  readonly traceStep?: Omit<SparcTraceStep, 'sourceAddress' | 'outcome' | 'time'>;
  readonly context?: Record<string, unknown>;
};

export type SparcProcessedResponseOutcome = {
  readonly observation: SparcPracticeObservation;
  readonly stateTransition: SparcStateTransition;
  readonly modelUpdateRequest?: SparcModelUpdateRequest;
  readonly traceStep?: SparcTraceStep;
  readonly historyRecord: SparcCanonicalHistoryRecord;
};

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function defaultStateWrites(input: SparcResponseOutcomeInput): readonly SparcStateWrite[] {
  return [{
    target: input.sourceAddress,
    key: 'lastOutcome',
    value: input.outcome,
  }, {
    target: input.sourceAddress,
    key: 'lastResponseValue',
    value: input.responseValue,
  }];
}

function assertWritesStayInSourceDocument(
  sourceAddress: SparcDocumentAddress,
  writes: readonly SparcStateWrite[],
): void {
  for (const [index, write] of writes.entries()) {
    if (write.target.documentId !== sourceAddress.documentId) {
      throw new Error(
        `SPARC response outcome stateWrites[${index}] target documentId "${write.target.documentId}" `
          + `does not match source document "${sourceAddress.documentId}"`,
      );
    }
  }
}

function createObservation(input: SparcResponseOutcomeInput): SparcPracticeObservation {
  return {
    observationId: requireNonBlank(input.observationId, 'observationId'),
    sourceAddress: input.sourceAddress,
    time: input.time,
    problemStartTime: input.problemStartTime,
    outcome: input.outcome,
    responseValue: input.responseValue,
    ...(input.practiceDurationMs !== undefined ? { practiceDurationMs: input.practiceDurationMs } : {}),
    ...(input.input !== undefined ? { input: input.input } : {}),
    ...(input.displayedStimulus !== undefined ? { displayedStimulus: input.displayedStimulus } : {}),
    ...(input.modelTarget ? { modelTarget: input.modelTarget } : {}),
    ...(input.context ? { context: input.context } : {}),
  };
}

function createStateTransition(
  observation: SparcPracticeObservation,
  writes: readonly SparcStateWrite[],
): SparcStateTransition {
  return {
    transitionId: `${observation.observationId}:state`,
    event: {
      eventId: `${observation.observationId}:outcome`,
      type: 'outcome-recorded',
      source: observation.sourceAddress,
      time: observation.time,
      practiceObservation: observation,
    },
    writes,
  };
}

function createTraceStep(
  input: SparcResponseOutcomeInput,
): SparcTraceStep | undefined {
  if (!input.traceStep) {
    return undefined;
  }
  return {
    ...input.traceStep,
    sourceAddress: input.sourceAddress,
    outcome: input.outcome,
    time: input.time,
  };
}

function createModelUpdateRequest(
  observation: SparcPracticeObservation,
): SparcModelUpdateRequest | undefined {
  if (!observation.modelTarget) {
    return undefined;
  }
  return {
    observationId: observation.observationId,
    target: observation.modelTarget,
    outcome: observation.outcome,
    ...(observation.practiceDurationMs !== undefined ? { practiceDurationMs: observation.practiceDurationMs } : {}),
    responseValue: observation.responseValue,
    ...(observation.input !== undefined ? { input: observation.input } : {}),
    ...(observation.displayedStimulus !== undefined ? { displayedStimulus: observation.displayedStimulus } : {}),
    time: observation.time,
    problemStartTime: observation.problemStartTime,
    selection: `${observation.sourceAddress.documentId}:${observation.sourceAddress.nodeId}`,
    action: 'sparc-response-outcome',
    typeOfResponse: 'sparc',
    eventType: 'sparc',
    sourceAddress: observation.sourceAddress,
  };
}

export function processSparcResponseOutcome(
  core: SparcPracticeHistoryCore,
  input: SparcResponseOutcomeInput,
): SparcProcessedResponseOutcome {
  const observation = createObservation(input);
  const stateWrites = input.stateWrites ?? defaultStateWrites(input);
  assertWritesStayInSourceDocument(observation.sourceAddress, stateWrites);
  const stateTransition = createStateTransition(
    observation,
    stateWrites,
  );
  const traceStep = createTraceStep(input);
  const modelUpdateRequest = createModelUpdateRequest(observation);
  const bridge = createSparcPracticeHistoryBridge(core);
  const baseRecord = bridge.toCanonicalHistoryRecord(observation);
  const historyRecord: SparcCanonicalHistoryRecord = {
    ...baseRecord,
    action: 'sparc-response-outcome',
    sparc: {
      ...baseRecord.sparc,
      stateTransition,
      ...(traceStep ? { traceStep } : {}),
    },
  };

  assertCanonicalHistoryEnvelope(historyRecord);

  return {
    observation,
    stateTransition,
    ...(modelUpdateRequest ? { modelUpdateRequest } : {}),
    ...(traceStep ? { traceStep } : {}),
    historyRecord,
  };
}
