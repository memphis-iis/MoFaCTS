import { Session } from 'meteor/session';
import type { CourseAssignmentHistoryContext } from '../../common/courseAssignments.contracts';

const COURSE_ASSIGNMENT_LAUNCH_CONTEXT_KEY = 'courseAssignmentLaunchContext';

export function setCourseAssignmentLaunchContext(context: CourseAssignmentHistoryContext | null) {
  Session.set(COURSE_ASSIGNMENT_LAUNCH_CONTEXT_KEY, context);
}

export function getCourseAssignmentLaunchContext(): CourseAssignmentHistoryContext | null {
  const context = Session.get(COURSE_ASSIGNMENT_LAUNCH_CONTEXT_KEY) as CourseAssignmentHistoryContext | null | undefined;
  if (!context) return null;
  if (
    context.launchSource !== 'courses' ||
    !context.assignmentId ||
    !context.courseId ||
    !context.TDFId
  ) {
    throw new Error('[CourseLaunch] Invalid course assignment launch context');
  }
  return context;
}

export function applyCourseAssignmentLaunchContext<T extends Record<string, unknown>>(historyRecord: T): T {
  const context = getCourseAssignmentLaunchContext();
  if (!context) return historyRecord;
  const tdfId = String(historyRecord.TDFId || '');
  const rootTdfId = String(Session.get('currentRootTdfId') || '');
  const currentTdfId = String(Session.get('currentTdfId') || rootTdfId);
  const matchesAssignedTdf = tdfId === context.TDFId;
  const matchesActiveResolvedTdf = rootTdfId === context.TDFId && tdfId === currentTdfId;
  if (!matchesAssignedTdf && !matchesActiveResolvedTdf) {
    throw new Error('[CourseLaunch] History TDFId does not match course assignment launch context');
  }
  return {
    ...historyRecord,
    courseAssignment: context,
  };
}
