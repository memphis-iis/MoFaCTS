type JsonRecord = Record<string, unknown>;

type SparcHistoryIdentityMigrationDeps = {
  Histories: {
    find: (
      selector: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => { fetchAsync: () => Promise<Array<{ _id: unknown; sparc: unknown }>> };
    updateAsync: (
      selector: Record<string, unknown>,
      modifier: Record<string, unknown>,
    ) => Promise<number>;
  };
  Tdfs: {
    findOneAsync: (
      selector: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | null>;
  };
  DynamicSettings: {
    findOneAsync: (selector: Record<string, unknown>) => Promise<unknown>;
    upsertAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>) => Promise<unknown>;
  };
  serverConsole: (...args: unknown[]) => void;
};

const MIGRATION_KEY = 'migration.sparcHistoryPageIdentity.v2';
const BATCH_SIZE = 250;
const WRITE_CONCURRENCY = 20;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function migrateSparcHistoryIdentityValue(
  value: unknown,
  canonicalPageKey?: string,
  path = 'sparc',
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => migrateSparcHistoryIdentityValue(entry, canonicalPageKey, `${path}[${index}]`));
  }
  if (!isRecord(value)) {
    if (typeof value === 'string' && canonicalPageKey) {
      return value
        .replace(/"documentId":"[^"]+"/g, `"pageKey":"${canonicalPageKey}"`)
        .replace(/"pageKey":"[^"]+"/g, `"pageKey":"${canonicalPageKey}"`);
    }
    return value;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'documentId')
    && Object.prototype.hasOwnProperty.call(value, 'pageKey')) {
    throw new Error(`[SPARC Migration] ${path} contains both documentId and pageKey`);
  }
  const migrated: JsonRecord = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const nextKey = key === 'documentId' ? 'pageKey' : key;
    migrated[nextKey] = nextKey === 'pageKey' && typeof nestedValue === 'string' && canonicalPageKey
      ? canonicalPageKey
      : migrateSparcHistoryIdentityValue(nestedValue, canonicalPageKey, `${path}.${nextKey}`);
  }
  return migrated;
}

function resolveCanonicalPageKey(tdf: Record<string, unknown>, levelUnit: unknown): string {
  const content = isRecord(tdf.content) ? tdf.content : null;
  const tdfs = content && isRecord(content.tdfs) ? content.tdfs : null;
  const tutor = tdfs && isRecord(tdfs.tutor) ? tdfs.tutor : null;
  const units = tutor && Array.isArray(tutor.unit) ? tutor.unit : null;
  const unitIndex = Number(levelUnit);
  const unit = units && Number.isInteger(unitIndex) && unitIndex >= 0 && isRecord(units[unitIndex])
    ? units[unitIndex]
    : null;
  const sparcsession = unit && isRecord(unit.sparcsession) ? unit.sparcsession : null;
  const pageId = sparcsession && typeof sparcsession.pageId === 'string' ? sparcsession.pageId.trim() : '';
  if (!pageId) {
    throw new Error(`[SPARC Migration] TDF ${String(tdf._id)} unit ${String(levelUnit)} does not declare sparcsession.pageId`);
  }
  const rawStimuliFile = isRecord(tdf.rawStimuliFile) ? tdf.rawStimuliFile : null;
  const setspec = rawStimuliFile && isRecord(rawStimuliFile.setspec) ? rawStimuliFile.setspec : null;
  const pages = setspec && Array.isArray(setspec.sparcPages) ? setspec.sparcPages : [];
  if (!pages.some((page) => isRecord(page) && page.pageId === pageId)) {
    throw new Error(`[SPARC Migration] TDF ${String(tdf._id)} unit ${String(levelUnit)} selects missing pageId ${pageId}`);
  }
  return pageId;
}

async function runWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < values.length; index += concurrency) {
    await Promise.all(values.slice(index, index + concurrency).map(worker));
  }
}

export async function migrateSparcHistoryPageIdentity(
  deps: SparcHistoryIdentityMigrationDeps,
): Promise<void> {
  if (await deps.DynamicSettings.findOneAsync({ key: MIGRATION_KEY })) {
    return;
  }

  let migratedCount = 0;
  let lastId: unknown = null;
  const tdfById = new Map<string, Record<string, unknown>>();
  while (true) {
    const selector: Record<string, unknown> = {
      eventType: 'sparc',
      ...(lastId === null ? {} : { _id: { $gt: lastId } }),
    };
    const rows = await deps.Histories.find(
      selector,
      { fields: { _id: 1, sparc: 1, TDFId: 1, levelUnit: 1 }, limit: BATCH_SIZE, sort: { _id: 1 } },
    ).fetchAsync();
    if (rows.length === 0) {
      break;
    }
    await runWithConcurrency(rows, WRITE_CONCURRENCY, async (row) => {
      if (!isRecord(row.sparc)) {
        throw new Error(`[SPARC Migration] History ${String(row._id)} has invalid sparc extension`);
      }
      const TDFId = typeof (row as JsonRecord).TDFId === 'string' ? String((row as JsonRecord).TDFId) : '';
      if (!TDFId) {
        throw new Error(`[SPARC Migration] History ${String(row._id)} is missing TDFId`);
      }
      let tdf = tdfById.get(TDFId);
      if (!tdf) {
        tdf = await deps.Tdfs.findOneAsync(
          { _id: TDFId },
          { fields: { _id: 1, content: 1, rawStimuliFile: 1 } },
        ) ?? undefined;
        if (!tdf) {
          throw new Error(`[SPARC Migration] History ${String(row._id)} references missing TDF ${TDFId}`);
        }
        tdfById.set(TDFId, tdf);
      }
      const canonicalPageKey = resolveCanonicalPageKey(tdf, (row as JsonRecord).levelUnit);
      const migratedSparc = migrateSparcHistoryIdentityValue(row.sparc, canonicalPageKey);
      await deps.Histories.updateAsync(
        { _id: row._id },
        { $set: { sparc: migratedSparc } },
      );
    });
    migratedCount += rows.length;
    lastId = rows[rows.length - 1]?._id ?? null;
    deps.serverConsole(`[SPARC Migration] Migrated ${migratedCount} history rows to pageKey`);
  }

  await deps.DynamicSettings.upsertAsync(
    { key: MIGRATION_KEY },
    { $set: { value: { completedAt: new Date().toISOString(), migratedCount } } },
  );
  deps.serverConsole(`[SPARC Migration] Completed page identity migration; rows=${migratedCount}`);
}
