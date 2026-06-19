import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';

type SparcHistoryKeyInput = {
  readonly TDFId?: unknown;
  readonly tdfId?: unknown;
  readonly sessionID?: unknown;
  readonly sessionId?: unknown;
  readonly documentId?: unknown;
};

function nonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function createCacheKey(input: SparcHistoryKeyInput): string {
  const TDFId = nonBlankString(input.TDFId) ?? nonBlankString(input.tdfId);
  const sessionID = nonBlankString(input.sessionID) ?? nonBlankString(input.sessionId);
  const documentId = nonBlankString(input.documentId);
  if (!TDFId || !sessionID || !documentId) {
    throw new Error('[SPARC] Production-rule history replay requires TDFId, sessionID, and documentId');
  }
  return JSON.stringify({ TDFId, sessionID, documentId });
}

function readSparcDocumentId(record: CanonicalHistoryRecord): string | null {
  const sparc = record.sparc;
  if (!sparc || typeof sparc !== 'object' || Array.isArray(sparc)) {
    return null;
  }
  return nonBlankString((sparc as Record<string, unknown>).documentId);
}

const sparcProductionRuleHistoryByKey = new Map<string, CanonicalHistoryRecord[]>();

export function readSparcProductionRuleHistoryRecords(
  input: SparcHistoryKeyInput,
): readonly CanonicalHistoryRecord[] {
  const key = createCacheKey(input);
  return [...(sparcProductionRuleHistoryByKey.get(key) ?? [])];
}

export function rememberSparcProductionRuleHistoryRecord(record: CanonicalHistoryRecord): void {
  if (record.eventType !== 'sparc') {
    return;
  }
  const documentId = readSparcDocumentId(record);
  if (!documentId) {
    throw new Error('[SPARC] Production-rule history record missing sparc.documentId');
  }
  const key = createCacheKey({
    TDFId: record.TDFId,
    sessionID: record.sessionID,
    documentId,
  });
  const records = sparcProductionRuleHistoryByKey.get(key) ?? [];
  sparcProductionRuleHistoryByKey.set(key, [...records, record]);
}

export function hydrateSparcProductionRuleHistoryCache(
  records: readonly CanonicalHistoryRecord[],
): void {
  const groupedRecords = new Map<string, CanonicalHistoryRecord[]>();
  for (const record of records) {
    if (record.eventType !== 'sparc') {
      throw new Error('[SPARC] Durable history hydration received a non-SPARC record');
    }
    const documentId = readSparcDocumentId(record);
    if (!documentId) {
      throw new Error('[SPARC] Durable history record missing sparc.documentId');
    }
    const key = createCacheKey({
      TDFId: record.TDFId,
      sessionID: record.sessionID,
      documentId,
    });
    groupedRecords.set(key, [...(groupedRecords.get(key) ?? []), record]);
  }
  for (const [key, grouped] of groupedRecords) {
    sparcProductionRuleHistoryByKey.set(key, grouped);
  }
}

export function clearSparcProductionRuleHistoryCache(): void {
  sparcProductionRuleHistoryByKey.clear();
}
