import { expect } from 'chai';
import { createTdfRuntimeLifecycleHelpers } from './tdfRuntimeLifecycle';

describe('tdfRuntimeLifecycle', function() {
  it('invalidates course snapshots when deleting assigned TDF runtime data', async function() {
    const removedSelectors: Array<{ collection: string; selector: Record<string, unknown> }> = [];
    const invalidatedAssignments: Array<{ assignmentId: string; reason: string }> = [];
    const invalidatedCourses: Array<{ courseId: string; reason: string }> = [];
    const helpers = createTdfRuntimeLifecycleHelpers({
      Assignments: {
        find: () => ({
          fetchAsync: async () => [
            { _id: 'assignment-a', courseId: 'course-a' },
            { _id: 'assignment-b', courseId: 'course-a' },
            { _id: 'assignment-c', courseId: 'course-b' },
          ],
        }),
        removeAsync: async (selector) => {
          removedSelectors.push({ collection: 'Assignments', selector });
          return 3;
        },
      },
      Histories: {
        removeAsync: async (selector) => {
          removedSelectors.push({ collection: 'Histories', selector });
          return 4;
        },
      },
      GlobalExperimentStates: {
        removeAsync: async (selector) => {
          removedSelectors.push({ collection: 'GlobalExperimentStates', selector });
          return 2;
        },
      },
      invalidateCourseSnapshotsForAssignment: async (assignmentId, reason) => {
        invalidatedAssignments.push({ assignmentId, reason });
      },
      invalidateCourseSnapshotsForCourse: async (courseId, reason) => {
        invalidatedCourses.push({ courseId, reason });
      },
    });

    await helpers.deleteTdfRuntimeData('tdf-1');

    expect(removedSelectors).to.deep.equal([
      { collection: 'Assignments', selector: { TDFId: 'tdf-1' } },
      { collection: 'Histories', selector: { TDFId: 'tdf-1' } },
      { collection: 'GlobalExperimentStates', selector: { TDFId: 'tdf-1' } },
    ]);
    expect(invalidatedAssignments).to.deep.equal([
      { assignmentId: 'assignment-a', reason: 'tdf-deleted' },
      { assignmentId: 'assignment-b', reason: 'tdf-deleted' },
      { assignmentId: 'assignment-c', reason: 'tdf-deleted' },
    ]);
    expect(invalidatedCourses).to.deep.equal([
      { courseId: 'course-a', reason: 'tdf-deleted' },
      { courseId: 'course-b', reason: 'tdf-deleted' },
    ]);
  });
});
