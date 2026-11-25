import type { ClassReportingTiming } from '../../../common/lib/courseReportingTime';

export type ReportingCourse = {
  _id: string;
  courseName?: string;
};

export type ReportingAssignment = {
  assignmentId?: string | null;
  TDFId: string;
  displayName?: string;
};

export type ReportingAssignmentsByCourseId = Record<string, ReportingAssignment[]>;

export type ReportingPerformanceRow = {
  userId: string;
  username: string;
  count: number;
  numCorrect: number;
  totalTime: number;
  percentCorrect: string;
  totalTimeMins: string;
  exception?: string | false | null;
};

export type ReportingPerformanceReport = Readonly<{
  met: ReportingPerformanceRow[];
  notMet: ReportingPerformanceRow[];
  timing: ClassReportingTiming;
}>;

export type ReportingTotals = Readonly<{
  count: number;
  percentCorrect: string;
  totalTimeMins: string;
}>;

export function normalizePerformanceReport(raw: unknown): ReportingPerformanceReport {
  const timing = Array.isArray(raw) ? raw[2] : null;
  if (!Array.isArray(raw) || !Array.isArray(raw[0]) || !Array.isArray(raw[1]) || typeof timing?.timezone !== 'string'
    || (timing.assignmentDueAt !== null && !Number.isFinite(timing.assignmentDueAt))
    || (timing.cutoffAt !== null && !Number.isFinite(timing.cutoffAt))) {
    throw new Error('Invalid instructor report response');
  }
  return {
    met: raw[0] as ReportingPerformanceRow[],
    notMet: raw[1] as ReportingPerformanceRow[],
    timing: timing as ClassReportingTiming,
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

function formatReportingStats(count: number, numCorrect: number, totalTime: number): ReportingTotals {
  return {
    count,
    percentCorrect: `${(count > 0 ? 100 * numCorrect / count : 0).toFixed(2)}%`,
    totalTimeMins: (totalTime / 60000).toFixed(3),
  };
}

export function mergeReportingRows(rows: ReportingPerformanceRow[]): ReportingPerformanceRow[] {
  const byUser = new Map<string, ReportingPerformanceRow>();
  for (const row of rows) {
    const prior = byUser.get(row.userId);
    if (!prior) {
      byUser.set(row.userId, row);
      continue;
    }
    const numCorrect = prior.numCorrect + row.numCorrect;
    const totalTime = prior.totalTime + row.totalTime;
    byUser.set(row.userId, { ...prior, ...formatReportingStats(prior.count + row.count, numCorrect, totalTime), numCorrect, totalTime });
  }
  return [...byUser.values()];
}

export function getReportingTotals(rows: ReportingPerformanceRow[]): ReportingTotals {
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  const totalTime = rows.reduce((sum, row) => sum + row.totalTime, 0);
  const numCorrect = rows.reduce((sum, row) => sum + row.numCorrect, 0);
  return formatReportingStats(count, numCorrect, totalTime);
}
