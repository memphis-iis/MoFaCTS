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
}
