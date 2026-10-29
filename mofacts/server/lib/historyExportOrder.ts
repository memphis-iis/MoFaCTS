function toSortableNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.POSITIVE_INFINITY;
}

function studentKey(history: Record<string, unknown>): string {
  return String(history.userId ?? history.anonStudentId ?? history.userIdTDFId ?? '');
}

function transactionTime(history: Record<string, unknown>): number {
  const start = history.problemStartTime ?? history.time;
  if (history.problemStartTime !== undefined && history.problemStartTime !== null) return toSortableNumber(history.time);
  const outcome = typeof history.outcome === 'string' ? history.outcome.trim().toLowerCase() : '';
  if (outcome === 'study') return toSortableNumber(start);
  const numericStart = toSortableNumber(start);
  const latency = toSortableNumber(history.CFStartLatency);
  if (Number.isFinite(numericStart) && Number.isFinite(latency) && latency >= 0) return numericStart + latency;
  return toSortableNumber(history.time);
}

/** The established instructor export order, including Array.sort's NaN-as-tie behavior. */
export function compareHistoryExportRecords(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const student = studentKey(a).localeCompare(studentKey(b));
  if (student !== 0) return student;
  const time = transactionTime(a) - transactionTime(b);
  if (time !== 0) return time;
  const serverTime = toSortableNumber(a.recordedServerTime) - toSortableNumber(b.recordedServerTime);
  if (serverTime !== 0) return serverTime;
  return toSortableNumber(a.eventId) - toSortableNumber(b.eventId);
}
