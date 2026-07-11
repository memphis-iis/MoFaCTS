import type {
  CourseAssignmentEditorSnapshot,
  CourseAssignmentSummary,
} from '../../../common/courseAssignments.contracts';

export type AssignableTdf = CourseAssignmentEditorSnapshot['assignableTdfs'][number];

export type AssignmentEditorRow = CourseAssignmentSummary & {
  fileName: string;
  tags: string[];
};

export function assignmentToEditorRow(
  assignment: CourseAssignmentSummary,
  tdf: AssignableTdf | undefined,
): AssignmentEditorRow {
  return {
    ...assignment,
    fileName: tdf?.fileName || '',
    tags: tdf?.tags || [],
    releaseAt: assignment.releaseAt ? new Date(assignment.releaseAt) : null,
    dueAt: assignment.dueAt ? new Date(assignment.dueAt) : null,
  };
}

export function rowsFromAssignmentSnapshot(snapshot: CourseAssignmentEditorSnapshot): AssignmentEditorRow[] {
  const tdfById = new Map(snapshot.assignableTdfs.map((tdf) => [tdf.TDFId, tdf]));
  return snapshot.assignments.map((assignment, order) => ({
    ...assignmentToEditorRow(assignment, tdfById.get(assignment.TDFId)),
    order,
  }));
}

export function orderedRows(rows: AssignmentEditorRow[]): AssignmentEditorRow[] {
  return rows.map((row, order) => ({ ...row, order }));
}

export function validateAssignmentRows(
  rows: AssignmentEditorRow[],
  message: (key: string, values?: Record<string, unknown>) => string,
): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.TDFId)) {
      return message('courseAssignments.duplicateLesson', { title: row.title });
    }
    seen.add(row.TDFId);
    const releaseTime = row.releaseAt ? new Date(row.releaseAt).getTime() : null;
    const dueTime = row.dueAt ? new Date(row.dueAt).getTime() : null;
    if (releaseTime !== null && !Number.isFinite(releaseTime)) {
      return message('courseAssignments.invalidVisibleDate', { title: row.title });
    }
    if (dueTime !== null && !Number.isFinite(dueTime)) {
      return message('courseAssignments.invalidDueDate', { title: row.title });
    }
    if (releaseTime !== null && dueTime !== null && dueTime < releaseTime) {
      return message('courseAssignments.dueAfterVisibleDate', { title: row.title });
    }
  }
  return null;
}

export function filterAssignableTdfs(
  assignableTdfs: AssignableTdf[],
  rows: AssignmentEditorRow[],
  query: string,
): AssignableTdf[] {
  const normalizedQuery = query.toLowerCase();
  const selected = new Set(rows.map((row) => row.TDFId));
  return assignableTdfs
    .filter((tdf) => !selected.has(tdf.TDFId))
    .filter((tdf) => {
      const haystack = `${tdf.displayName} ${tdf.fileName} ${(tdf.tags || []).join(' ')}`.toLowerCase();
      return !normalizedQuery || haystack.includes(normalizedQuery);
    });
}
