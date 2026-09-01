const MIGRATION_KEY = 'migration.purgeLearnerUnitAnalyticsCache.v1';
const COLLECTION_NAME = 'learner_unit_analytics_cache';

type PurgeLearnerUnitAnalyticsCacheDeps = {
  database: {
    dropCollection: (name: string) => Promise<boolean>;
  };
  DynamicSettings: {
    findOneAsync: (selector: Record<string, unknown>) => Promise<any>;
    upsertAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>) => Promise<unknown>;
  };
  serverConsole: (...args: unknown[]) => void;
};

function isMissingNamespace(error: unknown): boolean {
  const value = error as { code?: unknown; codeName?: unknown };
  return value?.code === 26 || value?.codeName === 'NamespaceNotFound';
}

export async function purgeLearnerUnitAnalyticsCache(
  deps: PurgeLearnerUnitAnalyticsCacheDeps,
): Promise<'already-complete' | 'dropped' | 'not-present'> {
  if (await deps.DynamicSettings.findOneAsync({ key: MIGRATION_KEY })) return 'already-complete';

  let status: 'dropped' | 'not-present' = 'dropped';
  try {
    await deps.database.dropCollection(COLLECTION_NAME);
  } catch (error) {
    if (!isMissingNamespace(error)) throw error;
    status = 'not-present';
  }

  await deps.DynamicSettings.upsertAsync(
    { key: MIGRATION_KEY },
    { $set: { value: { completedAt: new Date().toISOString(), status } } },
  );
  deps.serverConsole('[Learner analytics cache migration]', status);
  return status;
}
