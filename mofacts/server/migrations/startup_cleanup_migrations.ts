type ThemeMutationShape = {
  help?: {
    enabled?: boolean;
    format?: string;
    markdown?: string;
    url?: string;
    uploadedAt?: string;
    uploadedBy?: string | null;
    fileName?: string | null;
    source?: string;
  } | null;
  [key: string]: unknown;
};

type StartupCleanupMigrationDeps = {
  DynamicSettings: {
    findOneAsync: (selector: Record<string, unknown>) => Promise<any>;
    removeAsync: (selector: Record<string, unknown>) => Promise<number>;
    upsertAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>) => Promise<unknown>;
  };
  Courses: {
    find: (selector: Record<string, unknown>, options?: Record<string, unknown>) => { fetchAsync: () => Promise<any[]> };
    updateAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>, options?: Record<string, unknown>) => Promise<number>;
  };
  Assignments: {
    find: (selector?: Record<string, unknown>, options?: Record<string, unknown>) => { fetchAsync: () => Promise<any[]> };
    updateAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>, options?: Record<string, unknown>) => Promise<number>;
  };
  CourseLearnerSnapshotCache: {
    updateAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>, options?: Record<string, unknown>) => Promise<number>;
  };
  usersCollection: {
    findOneAsync: (selector: Record<string, unknown>, options?: Record<string, unknown>) => Promise<any>;
    updateAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>, options?: Record<string, unknown>) => Promise<number>;
  };
  serverConsole: (...args: any[]) => void;
  updateActiveThemeDocument: (
    userId: string | null | undefined,
    mutator: (theme: ThemeMutationShape) => ThemeMutationShape | void
  ) => Promise<unknown>;
};

const LEGACY_HELP_MIGRATION_KEY = 'migration.legacyHelpPageToTheme.v1';
const IMPERSONATION_FIELD_CLEANUP_KEY = 'migration.removeImpersonationFields.v1';
const SECRET_KEY_FIELD_CLEANUP_KEY = 'migration.removeSecretKeyFields.v1';
const COURSE_ASSIGNMENT_METADATA_MIGRATION_KEY = 'migration.courseAssignmentMetadata.v1';
const LEGACY_COURSE_TIMEZONE = 'America/Chicago';

async function runLegacyHelpPageMigration(deps: StartupCleanupMigrationDeps) {
  const completed = await deps.DynamicSettings.findOneAsync({ key: LEGACY_HELP_MIGRATION_KEY });
  if (completed) {
    return;
  }

  const legacyHelp = await deps.DynamicSettings.findOneAsync({ key: 'customHelpPage' });
  const legacyValue = legacyHelp?.value;
  if (!legacyValue || !legacyValue.markdownContent) {
    if (legacyHelp) {
      await deps.DynamicSettings.removeAsync({ key: 'customHelpPage' });
    }
    await deps.DynamicSettings.upsertAsync(
      { key: LEGACY_HELP_MIGRATION_KEY },
      { $set: { value: { completedAt: new Date().toISOString(), status: 'no-legacy-doc' } } }
    );
    return;
  }

  await deps.updateActiveThemeDocument(legacyValue.uploadedBy || null, (theme: ThemeMutationShape) => {
    theme.help = {
      enabled: legacyValue.enabled !== false,
      format: 'markdown',
      markdown: legacyValue.markdownContent,
      url: '',
      uploadedAt: legacyValue.uploadedAt || new Date().toISOString(),
      uploadedBy: legacyValue.uploadedBy || null,
      fileName: legacyValue.fileName || null,
      source: 'legacy'
    };
    return theme;
  });
  await deps.DynamicSettings.removeAsync({ key: 'customHelpPage' });
  await deps.DynamicSettings.upsertAsync(
    { key: LEGACY_HELP_MIGRATION_KEY },
    { $set: { value: { completedAt: new Date().toISOString(), status: 'migrated' } } }
  );
  deps.serverConsole('Migrated legacy custom help page into active theme');
}

async function runImpersonationFieldCleanup(deps: StartupCleanupMigrationDeps) {
  const completed = await deps.DynamicSettings.findOneAsync({ key: IMPERSONATION_FIELD_CLEANUP_KEY });
  if (completed) {
    return;
  }

  const hasLegacyFields = await deps.usersCollection.findOneAsync(
    {
      $or: [
        { impersonating: { $exists: true } },
        { impersonatedUserId: { $exists: true } },
        { impersonationStartTime: { $exists: true } },
        { impersonationExpires: { $exists: true } }
      ]
    },
    { fields: { _id: 1 } }
  );

  let removed = 0;
  if (hasLegacyFields) {
    removed = await deps.usersCollection.updateAsync(
      {
        $or: [
          { impersonating: { $exists: true } },
          { impersonatedUserId: { $exists: true } },
          { impersonationStartTime: { $exists: true } },
          { impersonationExpires: { $exists: true } }
        ]
      },
      {
        $unset: {
          impersonating: '',
          impersonatedUserId: '',
          impersonationStartTime: '',
          impersonationExpires: ''
        }
      },
      { multi: true }
    );
  }

  await deps.DynamicSettings.upsertAsync(
    { key: IMPERSONATION_FIELD_CLEANUP_KEY },
    { $set: { value: { completedAt: new Date().toISOString(), removed } } }
  );
  deps.serverConsole('Removed impersonation fields from', removed, 'users');
}

async function runSecretKeyFieldCleanup(deps: StartupCleanupMigrationDeps) {
  const completed = await deps.DynamicSettings.findOneAsync({ key: SECRET_KEY_FIELD_CLEANUP_KEY });
  if (completed) {
    return;
  }

  const hasSecretKeys = await deps.usersCollection.findOneAsync(
    { secretKey: { $exists: true } },
    { fields: { _id: 1 } }
  );

  let removed = 0;
  if (hasSecretKeys) {
    removed = await deps.usersCollection.updateAsync(
      { secretKey: { $exists: true } },
      { $unset: { secretKey: '' } },
      { multi: true }
    );
  }

  await deps.DynamicSettings.upsertAsync(
    { key: SECRET_KEY_FIELD_CLEANUP_KEY },
    { $set: { value: { completedAt: new Date().toISOString(), removed } } }
  );
  deps.serverConsole('Removed secret keys from', removed, 'users');
}

async function runCourseAssignmentMetadataMigration(deps: StartupCleanupMigrationDeps) {
  const completed = await deps.DynamicSettings.findOneAsync({ key: COURSE_ASSIGNMENT_METADATA_MIGRATION_KEY });
  if (completed) {
    return;
  }

  const legacyCourses = await deps.Courses.find(
    {
      $or: [
        { visibility: { $exists: false } },
        { visibility: null },
        { timezone: { $exists: false } },
        { timezone: null },
        { timezone: '' },
      ],
    },
    { fields: { _id: 1, visibility: 1, timezone: 1 } }
  ).fetchAsync();
  const courseIdsUpdated: string[] = [];
  for (const course of legacyCourses) {
    if (course.visibility !== undefined && course.visibility !== null && course.visibility !== 'private' && course.visibility !== 'public') {
      throw new Error(`Course ${course._id} has invalid visibility ${String(course.visibility)}`);
    }
    const $set: Record<string, unknown> = {};
    if (course.visibility === undefined || course.visibility === null) {
      $set.visibility = 'private';
    }
    if (typeof course.timezone !== 'string' || course.timezone.trim() === '') {
      $set.timezone = LEGACY_COURSE_TIMEZONE;
    }
    if (Object.keys($set).length > 0) {
      await deps.Courses.updateAsync({ _id: course._id }, { $set });
      courseIdsUpdated.push(String(course._id));
    }
  }

  const assignmentRows = await deps.Assignments.find(
    {},
    { fields: { _id: 1, courseId: 1, order: 1, required: 1, releaseAt: 1, dueAt: 1, createdAt: 1, updatedAt: 1 } }
  ).fetchAsync();
  const byCourse = new Map<string, any[]>();
  for (const row of assignmentRows) {
    const courseId = String(row.courseId || '');
    if (!courseId) continue;
    const rows = byCourse.get(courseId) || [];
    rows.push(row);
    byCourse.set(courseId, rows);
  }

  const assignmentIdsUpdated: string[] = [];
  const now = new Date();
  for (const rows of byCourse.values()) {
    rows.sort((a, b) => {
      const orderA = Number.isInteger(Number(a.order)) && Number(a.order) >= 0 ? Number(a.order) : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isInteger(Number(b.order)) && Number(b.order) >= 0 ? Number(b.order) : Number.MAX_SAFE_INTEGER;
      return orderA - orderB || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a._id).localeCompare(String(b._id));
    });
    for (const [index, row] of rows.entries()) {
      const $set: Record<string, unknown> = {};
      if (!Number.isInteger(Number(row.order)) || Number(row.order) !== index) $set.order = index;
      if (row.required === undefined || row.required === null) $set.required = true;
      if (row.releaseAt === undefined) $set.releaseAt = null;
      if (row.dueAt === undefined) $set.dueAt = null;
      if (!row.createdAt) $set.createdAt = now;
      if (!row.updatedAt) $set.updatedAt = now;
      if (Object.keys($set).length > 0) {
        await deps.Assignments.updateAsync({ _id: row._id }, { $set });
        assignmentIdsUpdated.push(String(row._id));
      }
    }
  }

  let invalidatedSnapshots = 0;
  if (courseIdsUpdated.length > 0 || assignmentIdsUpdated.length > 0) {
    invalidatedSnapshots = await deps.CourseLearnerSnapshotCache.updateAsync(
      {},
      { $set: { invalidatedAt: new Date(), rebuildReason: 'manual' } },
      { multi: true }
    );
  }

  await deps.DynamicSettings.upsertAsync(
    { key: COURSE_ASSIGNMENT_METADATA_MIGRATION_KEY },
    {
      $set: {
        value: {
          completedAt: new Date().toISOString(),
          courseIdsUpdated,
          assignmentIdsUpdated,
          timezoneAppliedToLegacyCourses: LEGACY_COURSE_TIMEZONE,
          invalidatedSnapshots,
        },
      },
    }
  );
  deps.serverConsole('Normalized course assignment metadata', {
    courses: courseIdsUpdated.length,
    assignments: assignmentIdsUpdated.length,
    timezoneAppliedToLegacyCourses: LEGACY_COURSE_TIMEZONE,
    invalidatedSnapshots,
  });
}

export async function runStartupCleanupMigrations(deps: StartupCleanupMigrationDeps) {
  try {
    await runLegacyHelpPageMigration(deps);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    deps.serverConsole('Warning: Failed legacy help page migration:', message);
  }

  try {
    await runImpersonationFieldCleanup(deps);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    deps.serverConsole('Warning: Failed impersonation-field cleanup migration:', message);
  }

  try {
    await runSecretKeyFieldCleanup(deps);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    deps.serverConsole('Warning: Failed secret-key cleanup migration:', message);
  }

  try {
    await runCourseAssignmentMetadataMigration(deps);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    deps.serverConsole('Warning: Failed course-assignment metadata migration:', message);
  }
}
