type JsonRecord = Record<string, unknown>;

type SparcAuthoredIdentityMigrationDeps = {
  Tdfs: {
    find: (
      selector: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => { fetchAsync: () => Promise<Array<{ _id: unknown; rawStimuliFile: unknown }>> };
    updateAsync: (
      selector: Record<string, unknown>,
      modifier: Record<string, unknown>,
    ) => Promise<number>;
  };
  DynamicSettings: {
    findOneAsync: (selector: Record<string, unknown>) => Promise<unknown>;
    upsertAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>) => Promise<unknown>;
  };
  serverConsole: (...args: unknown[]) => void;
};

const MIGRATION_KEY = 'migration.sparcAuthoredPageIdentity.v1';
const BATCH_SIZE = 50;
const WRITE_CONCURRENCY = 10;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function migrateDisplayValue(value: unknown, pageId: string, isDisplayRoot = false): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => migrateDisplayValue(entry, pageId));
  }
  if (!isRecord(value)) {
    return value === 'documentId' ? 'pageKey' : value;
  }
  const migrated: JsonRecord = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (isDisplayRoot && (key === 'documentId' || key === 'pageKey')) {
      continue;
    }
    const nextKey = key === 'documentId' ? 'pageKey' : key;
    if (nextKey === 'pageKey' && typeof nestedValue === 'string') {
      migrated.pageKey = pageId;
    } else {
      migrated[nextKey] = migrateDisplayValue(nestedValue, pageId);
    }
  }
  return migrated;
}

function migrateTree(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(migrateTree);
  }
  if (!isRecord(value)) {
    return value;
  }
  const migrated: JsonRecord = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key !== 'sparcPages') {
      migrated[key] = migrateTree(nestedValue);
      continue;
    }
    if (!Array.isArray(nestedValue) || nestedValue.length === 0) {
      throw new Error('[SPARC Migration] setspec.sparcPages must be a non-empty array');
    }
    const seenPageIds = new Set<string>();
    migrated.sparcPages = nestedValue.map((page, index) => {
      if (!isRecord(page)) {
        throw new Error(`[SPARC Migration] sparcPages[${index}] must be an object`);
      }
      const pageId = typeof page.pageId === 'string' ? page.pageId.trim() : '';
      if (!pageId) {
        throw new Error(`[SPARC Migration] sparcPages[${index}] requires pageId`);
      }
      if (seenPageIds.has(pageId)) {
        throw new Error(`[SPARC Migration] duplicate sparcPages pageId ${pageId}`);
      }
      seenPageIds.add(pageId);
      if (!isRecord(page.display)) {
        throw new Error(`[SPARC Migration] sparcPages[${index}] requires display`);
      }
      return {
        ...page,
        pageId,
        display: migrateDisplayValue(page.display, pageId, true),
      };
    });
  }
  return migrated;
}

export function migrateSparcAuthoredPageIdentityValue(rawStimuliFile: unknown): unknown {
  return migrateTree(rawStimuliFile);
}

async function runWithConcurrency<T>(
  values: readonly T[],
  worker: (value: T) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < values.length; index += WRITE_CONCURRENCY) {
    await Promise.all(values.slice(index, index + WRITE_CONCURRENCY).map(worker));
  }
}

export async function migrateSparcAuthoredPageIdentity(
  deps: SparcAuthoredIdentityMigrationDeps,
): Promise<void> {
  if (await deps.DynamicSettings.findOneAsync({ key: MIGRATION_KEY })) {
    return;
  }
  let migratedCount = 0;
  let lastId: unknown = null;
  while (true) {
    const selector: Record<string, unknown> = {
      'rawStimuliFile.setspec.sparcPages': { $exists: true },
      ...(lastId === null ? {} : { _id: { $gt: lastId } }),
    };
    const rows = await deps.Tdfs.find(selector, {
      fields: { _id: 1, rawStimuliFile: 1 },
      limit: BATCH_SIZE,
      sort: { _id: 1 },
    }).fetchAsync();
    if (rows.length === 0) {
      break;
    }
    await runWithConcurrency(rows, async (row) => {
      const migratedRawStimuliFile = migrateSparcAuthoredPageIdentityValue(row.rawStimuliFile);
      await deps.Tdfs.updateAsync(
        { _id: row._id },
        { $set: { rawStimuliFile: migratedRawStimuliFile } },
      );
    });
    migratedCount += rows.length;
    lastId = rows[rows.length - 1]?._id ?? null;
    deps.serverConsole(`[SPARC Migration] Migrated ${migratedCount} authored SPARC TDF documents`);
  }
  await deps.DynamicSettings.upsertAsync(
    { key: MIGRATION_KEY },
    { $set: { value: { completedAt: new Date().toISOString(), migratedCount } } },
  );
  deps.serverConsole(`[SPARC Migration] Completed authored page identity migration; documents=${migratedCount}`);
}
