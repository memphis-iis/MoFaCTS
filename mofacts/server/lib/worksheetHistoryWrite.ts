import { createHash } from 'node:crypto';

type RecordValue = Record<string, unknown>;
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
export function worksheetHistoryWriteId(record: RecordValue): string | undefined {
  const sparc = record.sparc as RecordValue | undefined;
  const event = sparc?.worksheet as RecordValue | undefined;
  if (!event) return undefined;
  if (record.eventType !== 'sparc' || typeof sparc?.pageKey !== 'string'
    || !['start', 'answer', 'review', 'exposure', 'complete'].includes(String(event.kind))
    || typeof event.attemptId !== 'string' || !event.attemptId || event.attemptId.length > 160
    || typeof event.writeId !== 'string' || !event.writeId || event.writeId.length > 160
    || !Number.isInteger(event.sequence) || Number(event.sequence) < 1
    || !Number.isInteger(event.checkpointIndex) || Number(event.checkpointIndex) < -1) {
    throw new Error('Invalid worksheet history identity');
  }
  if (event.kind === 'answer' ? record.levelUnitType !== 'model' : record.levelUnitType !== 'sparc') {
    throw new Error('Worksheet answer and non-answer record kinds do not match');
  }
  if (event.kind !== 'answer' && (sparc.practiceObservation !== undefined || record.outcome !== 'unknown'
    || record.responseValue !== '' || record.input !== '')) {
    throw new Error('Worksheet lifecycle events cannot carry an answer observation');
  }
  if (event.kind === 'start' && (!Array.isArray(event.order) || event.order.length < 1 || event.order.length > 500
    || event.order.some((id) => typeof id !== 'string' || !id) || new Set(event.order).size !== event.order.length)) {
    throw new Error('Invalid worksheet question order');
  }
  if (['start', 'review'].includes(String(event.kind)) && !Number.isFinite(event.deadline)) {
    throw new Error('Invalid worksheet deadline');
  }
  const course = record.courseAssignment as RecordValue | undefined;
  // One start per resumable page/checkpoint scope; competing starts fail rather than merge answers.
  return `worksheet:${digest([record.userId, record.TDFId, record.levelUnit, course?.courseId ?? null, course?.assignmentId ?? null,
    sparc.pageKey, event.checkpointIndex, event.kind === 'start' ? 'start' : [event.attemptId, event.sequence]])}`;
}
export function sameWorksheetWrite(saved: RecordValue, incoming: RecordValue): boolean {
  const payload = (record: RecordValue) => Object.fromEntries(Object.entries(record).filter(([key]) =>
    !['_id', 'eventId', 'recordedServerTime', 'dynamicTagFields'].includes(key)));
  return digest(payload(saved)) === digest(payload(incoming));
}
