export type ReportingCourse = {
  _id: string;
  courseName?: string;
};

export type ReportingAssignment = {
  assignmentId?: string | null;
  TDFId: string;
  displayName?: string;
  dueAt?: unknown;
};

export type ReportingAssignmentsByCourseId = Record<string, ReportingAssignment[]>;

export type ReportingTdfSummary = {
  _id: string;
  content?: {
    tdfs?: {
      tutor?: {
        setspec?: {
          duedate?: unknown;
        };
      };
    };
  };
};

export type ReportingPerformanceRow = {
  userId: string;
  username: string;
  count: number;
  percentCorrect: string;
  totalTimeMins: string;
  exception?: string | false | null;
};

export type ReportingPerformanceBuckets = Readonly<{
  met: ReportingPerformanceRow[];
  notMet: ReportingPerformanceRow[];
}>;

export type ReportingTotals = Readonly<{
  count: number;
  percentCorrect: string;
  totalTimeMins: string;
}>;

function finiteNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function parsePercent(value: unknown): number {
  if (typeof value === 'string') {
    return finiteNumber(value.replace('%', ''));
  }
  return finiteNumber(value);
}

export function normalizePerformanceBuckets(raw: unknown): ReportingPerformanceBuckets {
  const rows = Array.isArray(raw) ? raw : [];
  const met = Array.isArray(rows[0]) ? rows[0] : [];
  const notMet = Array.isArray(rows[1]) ? rows[1] : [];
  return {
    met: met as ReportingPerformanceRow[],
    notMet: notMet as ReportingPerformanceRow[],
  };
}

export function rowsHaveData(rows: ReportingPerformanceRow[]): boolean {
  return rows.length > 0;
}

export function getCourseAssignments(
  assignmentsByCourseId: ReportingAssignmentsByCourseId,
  courseId: string,
): ReportingAssignment[] {
  return assignmentsByCourseId[courseId] || [];
}

export function findAssignmentForTdf(
  assignmentsByCourseId: ReportingAssignmentsByCourseId,
  courseId: string,
  tdfId: string,
): ReportingAssignment | null {
  return getCourseAssignments(assignmentsByCourseId, courseId)
    .find((assignment) => String(assignment?.TDFId || '') === String(tdfId || '')) || null;
}

export function findTdfSummary(allTdfs: ReportingTdfSummary[], tdfId: string): ReportingTdfSummary | null {
  return allTdfs.find((tdf) => String(tdf?._id || '') === String(tdfId || '')) || null;
}

export function resolveSelectedDueDate(
  assignment: ReportingAssignment | null,
  tdf: ReportingTdfSummary | null,
): unknown {
  return assignment?.dueAt || tdf?.content?.tdfs?.tutor?.setspec?.duedate || null;
}

export function toDateInputValue(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value as string | number | Date);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toDateMillis(value: unknown): number | false {
  const text = typeof value === 'string' ? value.trim() : value;
  if (!text) return false;
  const time = new Date(text as string | number | Date).getTime();
  return Number.isFinite(time) ? time : false;
}

export function getReportingTotals(rows: ReportingPerformanceRow[]): ReportingTotals {
  const count = rows.reduce((sum, row) => sum + finiteNumber(row.count), 0);
  const totalTime = rows.reduce((sum, row) => sum + finiteNumber(row.totalTimeMins), 0);
  const weightedPercent = count > 0
    ? rows.reduce((sum, row) => sum + parsePercent(row.percentCorrect) * finiteNumber(row.count), 0) / count
    : 0;
  return {
    count,
    percentCorrect: `${weightedPercent.toFixed(2)}%`,
    totalTimeMins: totalTime.toFixed(3),
  };
}
