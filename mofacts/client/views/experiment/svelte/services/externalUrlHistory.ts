import { Meteor } from 'meteor/meteor';
import { insertCompressedHistory } from '../../../../lib/historyWire';
import { withCanonicalHistorySchemaVersion } from '../../../../../common/historyEnvelope';
import type { HistoryWireRecord } from '../../../../../common/historyCompression';
import { clientConsole } from '../../../../lib/clientLogger';
import {
  sanitizePsynaptixSessionSummary,
  serializePsynaptixSessionSummary,
} from '../../../../../common/psynaptixSessionSummary';

/**
 * External-url completion history (issue #240).
 *
 * On external-url-complete the result payload is logged to mofacts history
 * through the SAME wire the lesson flow uses (insertCompressedHistory ->
 * the canonical history envelope -> the server insertHistory method), so the
 * learner's record reflects the external session.
 *
 * "No active session" (e.g. a direct external launch with no mofacts
 * session) is a graceful no-op - the local history write is skipped.
 */

export interface ExternalSessionHistoryInput {
  /** The mofacts session id (the tdfId at lesson start). */
  sessionId: string | undefined;
  tdfId: string | undefined;
  unitId?: number;
  result?: unknown;
  /** The psynaptix event id (issue #559) when the completion carries one. */
  eventId?: string;
}

export function buildExternalSessionHistoryRecord(input: ExternalSessionHistoryInput): HistoryWireRecord {
  const now = Date.now();
  const result = sanitizePsynaptixSessionSummary(input.result);
  const resultJson = serializePsynaptixSessionSummary(input.result);
  const record: Record<string, unknown> = withCanonicalHistorySchemaVersion({
    userId: Meteor.userId() || undefined,
    anonStudentId: Meteor.user()?.username || '',
    TDFId: input.tdfId || undefined,
    sessionID: input.sessionId || '',
    levelUnit: Number.isFinite(input.unitId) ? Number(input.unitId) : 0,
    levelUnitType: 'instruction',
    problemName: 'External session',
    stepName: 'External session',
    time: now,
    problemStartTime: now,
    selection: 'session-summary',
    action: 'completed',
    outcome: 'completed',
    typeOfResponse: 'session-summary',
    responseValue: resultJson,
    input: resultJson,
    displayedStimulus: null,
    eventType: 'session-summary',
    source: 'psynaptix',
    ...(input.eventId ? { psynaptixEventId: input.eventId } : {}),
    result,
  } as Record<string, unknown>);
  return record as HistoryWireRecord;
}

/**
 * Best-effort history write. Returns false (and logs) when there is no
 * active session or the insert fails - the completion flow never breaks.
 */
export async function writeExternalSessionHistory(input: ExternalSessionHistoryInput): Promise<boolean> {
  if (!input.sessionId && !input.tdfId) {
    clientConsole(1, '[ExternalUrlSession] no active mofacts session - skipping the local history write');
    return false;
  }
  try {
    await insertCompressedHistory(buildExternalSessionHistoryRecord(input));
    return true;
  } catch (err) {
    clientConsole(1, '[ExternalUrlSession] history write failed:', err);
    return false;
  }
}
