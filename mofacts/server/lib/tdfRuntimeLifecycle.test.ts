import { expect } from 'chai';
import { createTdfRuntimeLifecycleHelpers } from './tdfRuntimeLifecycle';

describe('tdfRuntimeLifecycle', function() {
  it('retains original data and makes repeated deletion idempotent', async () => {
    const rows: Array<Record<string, any>> = [
      { TDFId: 'deleted', userId: 'synthetic-user', outcome: 'correct' },
      { TDFId: 'active', userId: 'synthetic-user', outcome: 'incorrect' },
    ];
    const states: Array<Record<string, any>> = [{ TDFId: 'deleted', experimentState: { progress: 7 } }];
    const collection = (records: Array<Record<string, any>>) => ({
      updateAsync: async (selector: any, modifier: any) => {
        for (const row of records) if (row.TDFId === selector.TDFId && row.tdfDeletedAt === undefined) Object.assign(row, modifier.$set);
        return 1;
      },
    });
    const helpers = createTdfRuntimeLifecycleHelpers({
      Assignments: { find: () => ({ fetchAsync: async () => [] }), removeAsync: async () => 0 },
      archiveHistory: async tdfId => {
        await collection(rows).updateAsync({ TDFId: tdfId }, { $set: { tdfDeletedAt: new Date() } });
      },
      GlobalExperimentStates: collection(states),
      invalidateCourseSnapshotsForCourse: async () => {}, invalidateCourseSnapshotsForAssignment: async () => {},
    });
    await helpers.deleteTdfRuntimeData('deleted');
    const archived = JSON.stringify({ rows, states });
    await helpers.deleteTdfRuntimeData('deleted');
    expect(JSON.stringify({ rows, states })).to.equal(archived);
    expect(rows.length).to.equal(2);
    expect(rows[0]!.outcome).to.equal('correct');
    expect(rows[0]!.tdfDeletedAt).to.be.instanceOf(Date);
    expect(rows[1]).not.to.have.property('tdfDeletedAt');
    expect(states[0]!.experimentState).to.deep.equal({ progress: 7 });
  });

  it('invalidates course snapshots when deleting assigned TDF runtime data', async function() {
    const removedSelectors: Array<{ collection: string; selector: Record<string, unknown> }> = [];
    const archived: Array<{ collection: string; selector: any; modifier: any; options: any }> = [];
    const archivedHistoryIds: string[] = [];
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
      archiveHistory: async tdfId => { archivedHistoryIds.push(tdfId); },
      GlobalExperimentStates: {
        updateAsync: async (selector, modifier, options) => {
          archived.push({ collection: 'GlobalExperimentStates', selector, modifier, options });
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
      {
        collection: 'Assignments',
        selector: { $or: [{ TDFId: 'tdf-1' }, { memberTdfIds: 'tdf-1' }] },
      },
    ]);
    expect(archivedHistoryIds).to.deep.equal(['tdf-1']);
    expect(archived.map(row => row.collection)).to.deep.equal(['GlobalExperimentStates']);
    for (const row of archived) {
      expect(row.selector).to.deep.equal({ TDFId: 'tdf-1', tdfDeletedAt: { $exists: false } });
      expect(row.modifier.$set.tdfDeletedAt).to.be.instanceOf(Date);
      expect(row.options).to.deep.equal({ multi: true });
    }
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

  it('propagates required history archival failure before resume-state archival or snapshot invalidation', async function() {
    let resumeStateWrites = 0;
    let invalidations = 0;
    const helpers = createTdfRuntimeLifecycleHelpers({
      Assignments: { find: () => ({ fetchAsync: async () => [{ _id: 'assignment', courseId: 'course' }] }), removeAsync: async () => 1 },
      archiveHistory: async () => { throw new Error('Injected archival failure'); },
      GlobalExperimentStates: { updateAsync: async () => { resumeStateWrites += 1; } },
      invalidateCourseSnapshotsForCourse: async () => { invalidations += 1; },
      invalidateCourseSnapshotsForAssignment: async () => { invalidations += 1; },
    });
    let failure: unknown;
    try { await helpers.deleteTdfRuntimeData('lesson'); } catch (error) { failure = error; }
    expect(failure).to.be.instanceOf(Error);
    expect(resumeStateWrites).to.equal(0);
    expect(invalidations).to.equal(0);
  });
});
