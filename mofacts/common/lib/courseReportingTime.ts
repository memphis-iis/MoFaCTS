export type ClassReportingTiming = {
  assignmentDueAt: number | null;
  cutoffAt: number | null;
  timezone: string;
};

const COURSE_LOCAL_DATE_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/;

export function reportingTimestamp(value: unknown): number | null {
  if (!(value instanceof Date) && typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function parseCourseReportingDateTime(input: string, timezone: string): number | null {
  if (!COURSE_LOCAL_DATE_TIME.test(input)) return null;
  const local = input.length === 16 ? `${input}:00` : input;
  const utc = reportingTimestamp(`${local}Z`);
  if (utc === null || new Date(utc).toISOString().slice(0, 19) !== local) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, calendar: 'iso8601', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const zonedIso = (time: number): string => {
    const parts = Object.fromEntries(formatter.formatToParts(time).map(part => [part.type, part.value]));
    return `${parts.year!.padStart(4, '0')}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  };
  const day = 86400000;
  // Check the offsets on both sides of the local date. A skipped or repeated wall-clock time has no unique instant.
  const matches = new Set<number>();
  for (const sample of [utc - day, utc, utc + day]) {
    const zonedSample = reportingTimestamp(`${zonedIso(sample)}Z`);
    if (zonedSample === null) continue;
    const candidate = utc - (zonedSample - sample);
    if (zonedIso(candidate) === local) matches.add(candidate);
  }
  return matches.size === 1 ? matches.values().next().value! : null;
}

export function legacyLessonReportingDeadline(value: unknown, timezone: string): number | null {
  if (typeof value === 'string' && COURSE_LOCAL_DATE_TIME.test(value.trim())) {
    return parseCourseReportingDateTime(value.trim(), timezone);
  }
  return reportingTimestamp(value);
}
