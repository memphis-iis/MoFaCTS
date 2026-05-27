import { HISTORY_KEY_MAP } from './Definitions';
import { CANONICAL_HISTORY_CORE_FIELDS } from './historyEnvelope';

export type HistoryWireRecord = Record<string, unknown>;

const canonicalHistoryCoreFieldSet = new Set<string>(CANONICAL_HISTORY_CORE_FIELDS);

export function normalizeHistoryValueForWire(value: unknown, preserveBlank = false): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (!preserveBlank && (value === '' || value === null)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    const compacted: HistoryWireRecord = {};
    for (const [nestedKey, nestedValue] of Object.entries(value as HistoryWireRecord)) {
      if (nestedKey === 'attribution') {
        continue;
      }
      const normalizedNestedValue = normalizeHistoryValueForWire(nestedValue);
      if (normalizedNestedValue !== undefined) {
        compacted[nestedKey] = normalizedNestedValue;
      }
    }
    return Object.keys(compacted).length > 0 ? compacted : undefined;
  }
  return value;
}

export function compressHistoryRecord(historyRecord: HistoryWireRecord): HistoryWireRecord {
  const compressedRecord: HistoryWireRecord = {};
  const reverseMap: Record<string, string> = {};
  for (const [code, fieldName] of Object.entries(HISTORY_KEY_MAP)) {
    reverseMap[fieldName] = code;
  }

  for (const [key, value] of Object.entries(historyRecord)) {
    const normalizedValue = normalizeHistoryValueForWire(
      value,
      canonicalHistoryCoreFieldSet.has(key),
    );
    if (normalizedValue === undefined) {
      continue;
    }

    compressedRecord[reverseMap[key] || key] = normalizedValue;
  }

  return compressedRecord;
}

export function decompressHistoryRecord(historyRecord: HistoryWireRecord): HistoryWireRecord {
  const decompressedRecord: HistoryWireRecord = {};
  for (const [key, value] of Object.entries(historyRecord)) {
    decompressedRecord[HISTORY_KEY_MAP[key] || key] = value;
  }

  return decompressedRecord;
}
