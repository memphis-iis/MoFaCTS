import { Meteor } from 'meteor/meteor';
import { resolveBoundExperimentLessonIds } from './experimentTargetFamilyResolver';
import { participantConnectionRoot } from './participantSession';

type Context = Parameters<typeof participantConnectionRoot>[0];
type Lessons = Parameters<typeof resolveBoundExperimentLessonIds>[0];

export function participantProgressLessonIds(context: Context, lessons: Lessons): Promise<string[]> | null {
  const rootId = participantConnectionRoot(context);
  return rootId ? resolveBoundExperimentLessonIds(lessons, rootId) : null;
}

export async function requireParticipantProgressLesson(context: Context, lessons: Lessons, lessonId: string) {
  const scope = await participantProgressLessonIds(context, lessons);
  if (scope && !scope.includes(lessonId)) {
    throw new Meteor.Error(403, 'Progress is unavailable outside the current study');
  }
  return scope;
}

export function requireAccountProgressSession(context: Context) {
  if (participantConnectionRoot(context)) {
    throw new Meteor.Error(403, 'Account-wide progress is unavailable in a study session');
  }
}
