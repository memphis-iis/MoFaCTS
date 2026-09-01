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
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  GlobalExperimentStates: {
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
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
      { TDFId: normalizedTdfId },
      { fields: { _id: 1, courseId: 1 } },
    ).fetchAsync();
    const affectedAssignmentIds = [
      ...new Set(assignmentRows.map((row) => nonEmptyString(row?._id)).filter((id): id is string => !!id)),
    ];
    const affectedCourseIds = [
      ...new Set(assignmentRows.map((row) => nonEmptyString(row?.courseId)).filter((id): id is string => !!id)),
    ];

    await deps.Assignments.removeAsync({ TDFId: normalizedTdfId });
    await deps.Histories.removeAsync({ TDFId: normalizedTdfId });
    await deps.GlobalExperimentStates.removeAsync({ TDFId: normalizedTdfId });

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
