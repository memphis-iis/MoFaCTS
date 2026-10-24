type UnknownRecord = Record<string, unknown>;

type CollectionCursor<T> = {
  fetchAsync: () => Promise<T[]>;
};

type TdfRuntimeLifecycleDeps = {
  Assignments: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => CollectionCursor<UnknownRecord>;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  Histories: {
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options: UnknownRecord) => Promise<unknown>;
  };
  GlobalExperimentStates: {
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options: UnknownRecord) => Promise<unknown>;
  };
  invalidateCourseSnapshotsForCourse: (courseId: string, reason: string) => Promise<unknown>;
  invalidateCourseSnapshotsForAssignment: (assignmentId: string, reason: string) => Promise<unknown>;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createTdfRuntimeLifecycleHelpers(deps: TdfRuntimeLifecycleDeps) {
  async function deleteTdfRuntimeData(tdfId: string) {
    const normalizedTdfId = nonEmptyString(tdfId);
    if (!normalizedTdfId) {
      throw new Error('deleteTdfRuntimeData requires a TDF id');
    }

    const assignmentRows = await deps.Assignments.find(
      { $or: [{ TDFId: normalizedTdfId }, { memberTdfIds: normalizedTdfId }] },
      { fields: { _id: 1, courseId: 1 } },
    ).fetchAsync();
    const affectedAssignmentIds = [
      ...new Set(assignmentRows.map((row) => nonEmptyString(row?._id)).filter((id): id is string => !!id)),
    ];
    const affectedCourseIds = [
      ...new Set(assignmentRows.map((row) => nonEmptyString(row?.courseId)).filter((id): id is string => !!id)),
    ];

    await deps.Assignments.removeAsync({ $or: [{ TDFId: normalizedTdfId }, { memberTdfIds: normalizedTdfId }] });
    // Retain source records, but permanently exclude this installation's data.
    // The selector makes retrying deletion preserve its original archive time.
    const selector = { TDFId: normalizedTdfId, tdfDeletedAt: { $exists: false } };
    const modifier = { $set: { tdfDeletedAt: new Date() } };
    await deps.Histories.updateAsync(selector, modifier, { multi: true });
    await deps.GlobalExperimentStates.updateAsync(selector, modifier, { multi: true });

    for (const assignmentId of affectedAssignmentIds) {
      await deps.invalidateCourseSnapshotsForAssignment(assignmentId, 'tdf-deleted');
    }
    for (const courseId of affectedCourseIds) {
      await deps.invalidateCourseSnapshotsForCourse(courseId, 'tdf-deleted');
    }
  }

  return {
    deleteTdfRuntimeData,
  };
}
