import { Meteor } from 'meteor/meteor';
import { requireAuthenticatedUser, type MethodAuthorizationDeps } from './methodAuthorization';
import type { CourseAssignmentHistoryContext } from '../../common/courseAssignments.contracts';

/** Lesson execution is separate from permission to manage the shared library. */
export async function requireSparcLessonAccess(deps: MethodAuthorizationDeps, actor: string | null | undefined, tdfId: unknown): Promise<string> {
  const userId = requireAuthenticatedUser(actor);
  if (await deps.userIsInRoleAsync(userId, ['admin'])) return userId;
  if (typeof tdfId !== 'string' || !tdfId.trim() || tdfId.length > 200) throw new Meteor.Error(400, 'Reopen this lesson: its identity is missing.');
  if (!deps.requireSparcLessonAccess) throw new Meteor.Error(403, 'You do not have access to this lesson. Open it from your course or demo entry.');
  await deps.requireSparcLessonAccess(userId, tdfId.trim());
  return userId;
}

export function createSparcLessonAuthorizer(deps: {
  readAssignmentContext(userId: string, tdfId: string): Promise<CourseAssignmentHistoryContext | null>;
  readAuthorizedLesson(userId: string, tdfId: string, assignment: CourseAssignmentHistoryContext | null): Promise<{ content?: { tdfs?: { tutor?: { unit?: Array<{ sparcsession?: unknown }> } } } } | null | undefined>;
  assertDemoExpiry(userId: string): Promise<void>;
}) {
  return async (userId: string, tdfId: string): Promise<void> => {
    const assignment = await deps.readAssignmentContext(userId, tdfId);
    const tdf = await deps.readAuthorizedLesson(userId, tdfId, assignment);
    if (!tdf) throw new Meteor.Error(404, 'This lesson is unavailable. Return to your course or demo entry.');
    if (!(tdf.content?.tdfs?.tutor?.unit ?? []).some((unit: { sparcsession?: unknown }) => unit.sparcsession)) throw new Meteor.Error(403, 'This lesson does not use SPARC instruction.');
    await deps.assertDemoExpiry(userId);
  };
}
