import { assertModelPracticeHistoryIdentity } from './historyStimulusIdentity';

export type CanonicalHistoryRecord = Record<string, unknown>;

export const CANONICAL_HISTORY_SCHEMA_VERSION = 1;
export const DEFAULT_HISTORY_WIRE_PAYLOAD_BUDGET_BYTES = 32 * 1024;
export const DEFAULT_HISTORY_EXTENSION_FIELD_BUDGET_BYTES = 16 * 1024;
export const HISTORY_EVENT_TYPES = [
  '',
  'instruct',
  'video',
  'h5p',
  'autotutor-turn',
] as const;

export type HistoryEventType = typeof HISTORY_EVENT_TYPES[number];

export const CANONICAL_HISTORY_CORE_FIELDS = [
  'historySchemaVersion',
  'TDFId',
  'sessionID',
  'levelUnit',
  'levelUnitType',
  'time',
  'problemStartTime',
  'selection',
  'action',
  'outcome',
  'typeOfResponse',
  'responseValue',
  'input',
  'displayedStimulus',
  'eventType',
] as const;

const REQUIRED_CORE_FIELDS = CANONICAL_HISTORY_CORE_FIELDS;

const RUNTIME_SNAPSHOT_FIELD_NAMES = new Set([
  'currentExperimentState',
  'experimentState',
  'runtimeState',
  'sessionSnapshot',
  'sessionState',
  'fullState',
]);

const COMPONENT_EXTENSION_FIELD_NAMES = [
  'CFNote',
  'h5p',
] as const;

const HISTORY_EVENT_TYPE_SET = new Set<string>(HISTORY_EVENT_TYPES);

export type HistoryEnvelopeValidationOptions = {
  maxWirePayloadBytes?: number;
  maxExtensionFieldBytes?: number;
};

export type HistoryEnvelopeValidationResult = {
  schemaVersion: typeof CANONICAL_HISTORY_SCHEMA_VERSION;
  wirePayloadBytes: number;
};

export function withCanonicalHistorySchemaVersion(record: CanonicalHistoryRecord): CanonicalHistoryRecord {
  if ('historySchemaVersion' in record) {
    return record;
  }
  return Object.assign({}, record, {
    historySchemaVersion: CANONICAL_HISTORY_SCHEMA_VERSION,
  });
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);
}

function getUtf8ByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function assertNoRuntimeSnapshotFields(record: CanonicalHistoryRecord): void {
  const presentSnapshotFields = Object.keys(record).filter((key) => RUNTIME_SNAPSHOT_FIELD_NAMES.has(key));
  if (presentSnapshotFields.length > 0) {
    throw new Error(`History record contains per-trial runtime snapshot fields: ${presentSnapshotFields.join(', ')}`);
  }
}

function assertBoundedComponentExtensionFields(
  record: CanonicalHistoryRecord,
  options: HistoryEnvelopeValidationOptions = {},
): void {
  const maxExtensionFieldBytes = options.maxExtensionFieldBytes ?? DEFAULT_HISTORY_EXTENSION_FIELD_BUDGET_BYTES;
  for (const fieldName of COMPONENT_EXTENSION_FIELD_NAMES) {
    if (!(fieldName in record) || record[fieldName] === undefined || record[fieldName] === null || record[fieldName] === '') {
      continue;
    }
    const extensionFieldBytes = getUtf8ByteLength(record[fieldName]);
    if (extensionFieldBytes > maxExtensionFieldBytes) {
      throw new Error(
        `History extension field ${fieldName} exceeds ${maxExtensionFieldBytes} bytes: ${extensionFieldBytes} bytes`,
      );
    }
  }
}

function assertStableEventType(record: CanonicalHistoryRecord): void {
  if (typeof record.eventType !== 'string') {
    throw new Error('History record eventType must be a string');
  }
  if (!HISTORY_EVENT_TYPE_SET.has(record.eventType)) {
    throw new Error(`History record eventType "${record.eventType}" is not documented for schema ${CANONICAL_HISTORY_SCHEMA_VERSION}`);
  }
}

export function assertCanonicalHistoryEnvelope(
  record: CanonicalHistoryRecord,
  options: HistoryEnvelopeValidationOptions = {},
): void {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('History record must be an object');
  }

  const missingFields = REQUIRED_CORE_FIELDS.filter((field) => !(field in record));
  if (missingFields.length > 0) {
    throw new Error(`History record missing canonical core fields: ${missingFields.join(', ')}`);
  }

  const undefinedFields = REQUIRED_CORE_FIELDS.filter((field) => record[field] === undefined);
  if (undefinedFields.length > 0) {
    throw new Error(`History record has undefined canonical core fields: ${undefinedFields.join(', ')}`);
  }

  if (isBlank(record.userId) && isBlank(record.anonStudentId)) {
    throw new Error('History record requires userId or anonStudentId');
  }

  if (record.historySchemaVersion !== CANONICAL_HISTORY_SCHEMA_VERSION) {
    throw new Error(`History record historySchemaVersion must be ${CANONICAL_HISTORY_SCHEMA_VERSION}`);
  }

  for (const field of ['time', 'problemStartTime']) {
    if (!Number.isFinite(Number(record[field]))) {
      throw new Error(`History record ${field} must be a finite timestamp`);
    }
  }

  assertNoRuntimeSnapshotFields(record);
  assertStableEventType(record);
  assertModelPracticeHistoryIdentity(record);
  assertBoundedComponentExtensionFields(record, options);
}

export function validateHistoryWirePayload(
  wireRecord: CanonicalHistoryRecord,
  options: HistoryEnvelopeValidationOptions = {},
): HistoryEnvelopeValidationResult {
  const wirePayloadBytes = getUtf8ByteLength(wireRecord);
  const maxWirePayloadBytes = options.maxWirePayloadBytes ?? DEFAULT_HISTORY_WIRE_PAYLOAD_BUDGET_BYTES;
  if (wirePayloadBytes > maxWirePayloadBytes) {
    throw new Error(
      `History wire payload exceeds ${maxWirePayloadBytes} bytes: ${wirePayloadBytes} bytes`,
    );
  }

  return {
    schemaVersion: CANONICAL_HISTORY_SCHEMA_VERSION,
    wirePayloadBytes,
  };
}
