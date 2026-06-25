import type {
  LearnerCourseSnapshotAssignment,
  LearnerCourseSnapshotCourse,
  LearnerCoursesSnapshot,
} from '../../../common/courseAssignments.contracts';

export type CourseTreeSection = 'assignedCourses' | 'publicCourses';
export type CourseTreeSort = 'course' | 'due' | 'recent';

export type CourseAssignmentDisplayRow = LearnerCourseSnapshotAssignment & {
  rowType: 'assignment';
  rowId: string;
  parentRowId: string;
  courseName: string;
  teacherDisplayName: string;
  visibility: LearnerCourseSnapshotCourse['visibility'];
  beginDate: LearnerCourseSnapshotCourse['beginDate'];
  endDate: LearnerCourseSnapshotCourse['endDate'];
  timezone: string;
  membership: LearnerCourseSnapshotCourse['membership'];
};

export type CourseTreeCourseRow = Omit<LearnerCourseSnapshotCourse, 'assignments'> & {
  rowType: 'course';
  rowId: string;
  section: CourseTreeSection;
  expanded: boolean;
  assignmentCount: number;
  visibleAssignmentCount: number;
  assignmentCountLabel: string;
  assignments: CourseAssignmentDisplayRow[];
};

export type BuildCourseTreeOptions = {
  query: string;
  sort: CourseTreeSort;
  expandedCourseIds: Set<string>;
};

const FAR_FUTURE = 8640000000000000;

function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

function courseSearchText(course: LearnerCourseSnapshotCourse) {
  return `${course.courseName} ${course.teacherDisplayName} ${course.membership} ${course.timezone}`.toLowerCase();
}

function assignmentSearchText(assignment: LearnerCourseSnapshotAssignment) {
  return `${assignment.title} ${assignment.fileName} ${(assignment.tags || []).join(' ')}`.toLowerCase();
}

function dateTime(value: unknown, emptyValue: number) {
  if (!value) return emptyValue;
  const time = new Date(value as string | number | Date).getTime();
  return Number.isFinite(time) ? time : emptyValue;
}

function nearestDueTime(assignments: CourseAssignmentDisplayRow[]) {
  return assignments.reduce((nearest, assignment) => Math.min(nearest, dateTime(assignment.dueAt, FAR_FUTURE)), FAR_FUTURE);
}

function latestPracticeTime(assignments: CourseAssignmentDisplayRow[]) {
  return assignments.reduce((latest, assignment) => Math.max(latest, Number(assignment.progress?.lastPracticedTimestamp || 0)), 0);
}

function assignmentCountLabel(visibleAssignmentCount: number, assignmentCount: number, query: string) {
  const visibleLabel = `${visibleAssignmentCount} assignment${visibleAssignmentCount === 1 ? '' : 's'}`;
  if (query && visibleAssignmentCount !== assignmentCount) {
    return `${visibleLabel} shown of ${assignmentCount}`;
  }
  return visibleLabel;
}

export function normalizeCourseTreeSort(value: string): CourseTreeSort {
  return value === 'due' || value === 'recent' ? value : 'course';
}

export function buildCourseTreeRows(
  snapshot: LearnerCoursesSnapshot | null,
  section: CourseTreeSection,
  options: BuildCourseTreeOptions,
): CourseTreeCourseRow[] {
  const query = normalizeQuery(options.query);
  const courses = snapshot?.[section] || [];
  const rows = courses.flatMap((course): CourseTreeCourseRow[] => {
    const courseMatches = Boolean(query && courseSearchText(course).includes(query));
    const visibleAssignments = course.assignments
      .filter((assignment) => !query || courseMatches || assignmentSearchText(assignment).includes(query))
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

    if (query && !courseMatches && visibleAssignments.length === 0) {
      return [];
    }

    const rowId = `course-tree-${section}-${course.courseId}`;
    return [{
      rowType: 'course',
      rowId,
      section,
      courseId: course.courseId,
      courseName: course.courseName,
      visibility: course.visibility,
      beginDate: course.beginDate,
      endDate: course.endDate,
      timezone: course.timezone,
      teacherUserId: course.teacherUserId,
      teacherDisplayName: course.teacherDisplayName,
      membership: course.membership,
      expanded: Boolean(query) || options.expandedCourseIds.has(course.courseId),
      assignmentCount: course.assignments.length,
      visibleAssignmentCount: visibleAssignments.length,
      assignmentCountLabel: assignmentCountLabel(visibleAssignments.length, course.assignments.length, query),
      assignments: visibleAssignments.map((assignment): CourseAssignmentDisplayRow => ({
        ...assignment,
        rowType: 'assignment',
        rowId: `${rowId}-assignment-${assignment.assignmentId}`,
        parentRowId: rowId,
        courseName: course.courseName,
        teacherDisplayName: course.teacherDisplayName,
        visibility: course.visibility,
        beginDate: course.beginDate,
        endDate: course.endDate,
        timezone: course.timezone,
        membership: course.membership,
      })),
    }];
  });

  return rows.sort((a, b) => {
    if (options.sort === 'due') {
      return nearestDueTime(a.assignments) - nearestDueTime(b.assignments) || a.courseName.localeCompare(b.courseName);
    }
    if (options.sort === 'recent') {
      return latestPracticeTime(b.assignments) - latestPracticeTime(a.assignments) || a.courseName.localeCompare(b.courseName);
    }
    return a.courseName.localeCompare(b.courseName);
  });
}
