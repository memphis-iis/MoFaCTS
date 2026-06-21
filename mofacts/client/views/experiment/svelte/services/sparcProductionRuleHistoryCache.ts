import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import {
  applySparcHistoryRecord,
  createEmptySparcReplayState,
  replaySparcHistory,
  type SparcReplayState,
} from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';

type SparcHistoryKeyInput = {
  readonly TDFId?: unknown;
  readonly tdfId?: unknown;
  readonly sessionID?: unknown;
  readonly sessionId?: unknown;
  readonly documentId?: unknown;
};

export type SparcReplaySession = {
  readonly TDFId: string;
  readonly sessionID: string;
  readonly documentId: string;
  readonly replayState: SparcReplayState;
  readonly retainedHistoryRecords: readonly CanonicalHistoryRecord[];
};

function nonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeCacheKeyInput(input: SparcHistoryKeyInput): {
  readonly TDFId: string;
  readonly sessionID: string;
  readonly documentId: string;
} {
  const TDFId = nonBlankString(input.TDFId) ?? nonBlankString(input.tdfId);
  const sessionID = nonBlankString(input.sessionID) ?? nonBlankString(input.sessionId);
  const documentId = nonBlankString(input.documentId);
  if (!TDFId || !sessionID || !documentId) {
    throw new Error('[SPARC] Production-rule history replay requires TDFId, sessionID, and documentId');
  }
  return { TDFId, sessionID, documentId };
}

function createCacheKey(input: SparcHistoryKeyInput): string {
  return JSON.stringify(normalizeCacheKeyInput(input));
}

function readSparcDocumentId(record: CanonicalHistoryRecord): string | null {
  const sparc = record.sparc;
  if (!sparc || typeof sparc !== 'object' || Array.isArray(sparc)) {
    return null;
  }
  return nonBlankString((sparc as Record<string, unknown>).documentId);
}

function createReplaySession(
  input: SparcHistoryKeyInput,
  records: readonly CanonicalHistoryRecord[],
): SparcReplaySession {
  const key = normalizeCacheKeyInput(input);
  return {
    ...key,
    replayState: replaySparcHistory(records),
    retainedHistoryRecords: [...records],
  };
}

const sparcReplaySessionByKey = new Map<string, SparcReplaySession>();

export function readSparcProductionRuleReplaySession(
  input: SparcHistoryKeyInput,
): SparcReplaySession | null {
  const session = sparcReplaySessionByKey.get(createCacheKey(input));
  if (!session) {
    return null;
  }
  return {
    ...session,
    retainedHistoryRecords: [...session.retainedHistoryRecords],
  };
}

export function readSparcProductionRuleHistoryRecords(
  input: SparcHistoryKeyInput,
): readonly CanonicalHistoryRecord[] {
  return readSparcProductionRuleReplaySession(input)?.retainedHistoryRecords ?? [];
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
  const currentSession = sparcReplaySessionByKey.get(key);
  if (!currentSession) {
    sparcReplaySessionByKey.set(key, createReplaySession({
      TDFId: record.TDFId,
      sessionID: record.sessionID,
      documentId,
    }, [record]));
    return;
  }
  sparcReplaySessionByKey.set(key, {
    ...currentSession,
    replayState: applySparcHistoryRecord(currentSession.replayState, record),
    retainedHistoryRecords: [...currentSession.retainedHistoryRecords, record],
  });
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
    const firstRecord = grouped[0];
    if (!firstRecord) {
      throw new Error('[SPARC] Durable history hydration produced an empty document group');
    }
    const documentId = readSparcDocumentId(firstRecord);
    if (!documentId) {
      throw new Error('[SPARC] Durable history record missing sparc.documentId');
    }
    sparcReplaySessionByKey.set(key, createReplaySession({
      TDFId: firstRecord.TDFId,
      sessionID: firstRecord.sessionID,
      documentId,
    }, grouped));
  }
}

export function clearSparcProductionRuleHistoryCache(input?: SparcHistoryKeyInput): void {
  if (!input) {
    sparcReplaySessionByKey.clear();
    return;
  }
  sparcReplaySessionByKey.delete(createCacheKey(input));
}

export function createEmptySparcProductionRuleReplaySession(
  input: SparcHistoryKeyInput,
): SparcReplaySession {
  return {
    ...normalizeCacheKeyInput(input),
    replayState: createEmptySparcReplayState(),
    retainedHistoryRecords: [],
  };
}
