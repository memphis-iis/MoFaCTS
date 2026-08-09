import type {
  LearnerAnalyticsActivityDay,
  LearnerAnalyticsPeriodSnapshot,
} from '../../common/learnerAnalytics.contracts';

export type LearnerAnalyticsHistoryRow = {
  _id?: unknown;
  TDFId?: unknown;
  levelUnit?: unknown;
  levelUnitType?: unknown;
  modelEvidenceSource?: unknown;
  outcome?: unknown;
  recordedServerTime?: unknown;
  time?: unknown;
  CFEndLatency?: unknown;
  CFFeedbackLatency?: unknown;
  stimuliSetId?: unknown;
  stimulusKC?: unknown;
  KCId?: unknown;
  KCDefault?: unknown;
};

type AggregationResult = {
  periods: {
    '7d': LearnerAnalyticsPeriodSnapshot;
    '30d': LearnerAnalyticsPeriodSnapshot;
    all: LearnerAnalyticsPeriodSnapshot;
  };
  latest28Days: LearnerAnalyticsActivityDay[];
  lastPracticedAt: string | null;
};

function normalizeIdentity(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function rowTimestamp(row: LearnerAnalyticsHistoryRow): number {
  const value = row.recordedServerTime ?? row.time;
  const timestamp = new Date(value as string | number | Date).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function localDateKey(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function recentDateKeys(nowMs: number, timeZone: string, count: number): string[] {
  const today = localDateKey(nowMs, timeZone);
  const [year, month, day] = today.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Cannot construct an analytics calendar date for ${today}.`);
  }
  const anchor = Date.UTC(year, month - 1, day);
  return Array.from({ length: count }, (_, index) => (
    new Date(anchor - (count - index - 1) * 86_400_000).toISOString().slice(0, 10)
  ));
}

function countable(row: LearnerAnalyticsHistoryRow): boolean {
  return !(row.levelUnitType === 'model' && row.modelEvidenceSource === 'assessment');
}

function itemIdentity(row: LearnerAnalyticsHistoryRow): string | null {
  const stimulusKC = normalizeIdentity(row.stimulusKC);
  if (row.levelUnitType === 'autotutor') {
    const autoTutorIdentity = stimulusKC
      || normalizeIdentity(row.KCId)
      || normalizeIdentity(row.KCDefault);
    const tdfId = normalizeIdentity(row.TDFId);
    const unit = normalizeIdentity(row.levelUnit);
    return autoTutorIdentity && tdfId && unit
      ? `autotutor:${tdfId}:${unit}:${autoTutorIdentity}`
      : null;
  }
  const stimuliSetId = normalizeIdentity(row.stimuliSetId);
  return stimuliSetId && stimulusKC ? `${stimuliSetId}:${stimulusKC}` : null;
}

function summarize(
  rows: LearnerAnalyticsHistoryRow[],
  dateKeys: Set<string> | null,
  timeZone: string,
  computePracticeTimeMs: (end: unknown, feedback: unknown) => number,
): LearnerAnalyticsPeriodSnapshot {
  let attempts = 0;
  let correct = 0;
  let incorrect = 0;
  let activeMs = 0;
  const items = new Set<string>();
  const days = new Set<string>();

  for (const row of rows) {
    if (!countable(row)) continue;
    const timestamp = rowTimestamp(row);
    if (timestamp <= 0) continue;
    const dateKey = localDateKey(timestamp, timeZone);
    if (dateKeys && !dateKeys.has(dateKey)) continue;
    attempts += 1;
    activeMs += computePracticeTimeMs(row.CFEndLatency, row.CFFeedbackLatency);
    days.add(dateKey);
    const identity = itemIdentity(row);
    if (identity) items.add(identity);
    if (row.levelUnitType !== 'autotutor') {
      if (row.outcome === 'correct') correct += 1;
      if (row.outcome === 'incorrect') incorrect += 1;
    }
  }

  const answered = correct + incorrect;
  return {
    attempts,
    ...(answered > 0 ? { accuracy: { correct, total: answered } } : {}),
    uniqueItems: items.size,
    practiceDays: days.size,
    activeMinutes: Math.round(activeMs / 60_000),
  };
}

export function buildLearnerAnalyticsAggregates(params: {
  rows: LearnerAnalyticsHistoryRow[];
  nowMs: number;
  timeZone: string;
  computePracticeTimeMs: (end: unknown, feedback: unknown) => number;
}): AggregationResult {
  const rows = params.rows.filter(countable);
  const dates30 = recentDateKeys(params.nowMs, params.timeZone, 30);
  const dates28 = dates30.slice(-28);
  const dates7 = dates30.slice(-7);
  const activityByDate = new Map<string, LearnerAnalyticsHistoryRow[]>();
  for (const date of dates28) activityByDate.set(date, []);
  let lastPracticedTimestamp = 0;
  for (const row of rows) {
    const timestamp = rowTimestamp(row);
    if (timestamp > lastPracticedTimestamp) lastPracticedTimestamp = timestamp;
    if (timestamp <= 0) continue;
    const date = localDateKey(timestamp, params.timeZone);
    activityByDate.get(date)?.push(row);
  }

  return {
    periods: {
      '7d': summarize(rows, new Set(dates7), params.timeZone, params.computePracticeTimeMs),
      '30d': summarize(rows, new Set(dates30), params.timeZone, params.computePracticeTimeMs),
      all: summarize(rows, null, params.timeZone, params.computePracticeTimeMs),
    },
    latest28Days: dates28.map((date) => {
      const summary = summarize(
        activityByDate.get(date) || [],
        new Set([date]),
        params.timeZone,
        params.computePracticeTimeMs,
      );
      return { date, attempts: summary.attempts, activeMinutes: summary.activeMinutes };
    }),
    lastPracticedAt: lastPracticedTimestamp > 0
      ? new Date(lastPracticedTimestamp).toISOString()
      : null,
  };
}

export function assertValidAnalyticsTimeZone(timeZone: unknown): string {
  const normalized = typeof timeZone === 'string' ? timeZone.trim() : '';
  if (!normalized) throw new Error('Analytics refresh requires an IANA time zone');
  new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date());
  return normalized;
}
