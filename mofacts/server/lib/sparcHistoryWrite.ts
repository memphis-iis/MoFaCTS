import { historyWriteDigest } from './historyWriteIdentity';

/** The existing Mongo _id index arbitrates retries, including competing writes. */
export function sparcHistoryWriteId(record: Record<string, unknown>): string | undefined {
  if (record.eventType !== 'sparc') return undefined;
  const extension = record.sparc as Record<string, unknown> | undefined;
  const transition = extension?.stateTransition as { transitionId?: unknown; event?: { eventId?: unknown; source?: { pageKey?: unknown } } } | undefined;
  if (!transition) return undefined;
  if (typeof extension?.pageKey !== 'string' || !extension.pageKey
    || typeof record.sessionID !== 'string' || !record.sessionID
    || typeof transition.transitionId !== 'string' || !transition.transitionId
    || typeof transition.event?.eventId !== 'string' || !transition.event.eventId
    || transition.event.source?.pageKey !== extension.pageKey) {
    throw new Error('Invalid SPARC transition history identity');
  }
  return `sparc:${historyWriteDigest([record.userId, record.TDFId, record.levelUnit, record.sessionID,
    extension.pageKey, transition.transitionId])}`;
}
