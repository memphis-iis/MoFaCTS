import { Session } from 'meteor/session';
import { getCourseAssignmentLaunchContext } from './courseAssignmentLaunchContext';
import {
  buildLessonRouteLocation,
  type LessonRouteLocation,
  type LessonRouteSurface,
} from './lessonRoute';
import { getPracticeLaunchMode } from './practiceLaunchMode';

export function buildActiveLessonRouteLocation(surface: LessonRouteSurface): LessonRouteLocation {
  const rootTdfId = Session.get('currentRootTdfId');
  if (typeof rootTdfId !== 'string' || rootTdfId.trim().length === 0) {
    throw new Error('[Lesson Route] Active learner flow is missing currentRootTdfId');
  }
  return buildLessonRouteLocation(surface, {
    rootTdfId,
    practiceLaunchMode: getPracticeLaunchMode(),
    courseAssignment: getCourseAssignmentLaunchContext(),
  });
}
