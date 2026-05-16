import { HISTORY_KEY_MAP } from '../../common/Definitions';
import { meteorCallAsync } from './meteorAsync';

type HistoryWireRecord = Record<string, unknown>;

function normalizeHistoryValueForWire(value: unknown): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value === 0 ? undefined : value;
  }
  if (value === '' || value === null || value === false) {
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

function compressHistoryRecord(historyRecord: HistoryWireRecord): HistoryWireRecord {
  const compressedRecord: HistoryWireRecord = {};
  const reverseMap: Record<string, string> = {};
  for (const [code, fieldName] of Object.entries(HISTORY_KEY_MAP)) {
    reverseMap[fieldName] = code;
  }

  for (const [key, value] of Object.entries(historyRecord)) {
    const normalizedValue = normalizeHistoryValueForWire(value);
    if (normalizedValue === undefined) {
      continue;
    }

    compressedRecord[reverseMap[key] || key] = normalizedValue;
  }

  return compressedRecord;
}

async function insertCompressedHistory(historyRecord: HistoryWireRecord): Promise<void> {
  await meteorCallAsync('insertHistory', compressHistoryRecord(historyRecord));
}

export { compressHistoryRecord, insertCompressedHistory, normalizeHistoryValueForWire };
