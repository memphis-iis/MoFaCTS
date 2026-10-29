import { createHash } from 'node:crypto';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function historyWriteDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function sameHistoryWrite(saved: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  const payload = (record: Record<string, unknown>) => Object.fromEntries(Object.entries(record).filter(([key]) =>
    !['_id', 'eventId', 'recordedServerTime', 'dynamicTagFields', 'historySequence'].includes(key)));
  return historyWriteDigest(payload(saved)) === historyWriteDigest(payload(incoming));
}
