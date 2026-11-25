import { historyWriteDigest } from './historyWriteIdentity';
import { assertSimulationActivityHistory } from '../../common/simulationActivityHistory';

/** The existing Mongo _id index arbitrates retries, including competing writes. */
export function sparcHistoryWriteId(record: Record<string, unknown>): string | undefined {
  if (record.eventType !== 'sparc') return undefined;
  const extension = record.sparc as Record<string, unknown> | undefined;
  if (extension?.simulationActivity !== undefined && !extension.stateTransition) {
    const activity = extension.simulationActivity;
    assertSimulationActivityHistory(activity);
    const trace = extension.traceStep as { traceId?: string } | undefined;
    return `sparc:${historyWriteDigest([record.userId, record.TDFId, record.levelUnit, record.sessionID,
      extension.pageKey, activity.attemptId, activity.sourceEventId, trace?.traceId ?? activity.eventName])}`;
  }
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
