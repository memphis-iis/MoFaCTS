type UnknownRecord = Record<string, unknown>;

type RootRow = {
  _id: unknown;
  ownerId?: unknown;
  packageAssetId?: unknown;
  content?: {
    tdfs?: {
      tutor?: {
        setspec?: {
          condition?: unknown;
          conditionTdfIds?: unknown;
        };
      };
    };
  };
};

type MigrationDeps = {
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<number>;
  };
  DynamicSettings: {
    findOneAsync: (selector: UnknownRecord) => Promise<any>;
    upsertAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
  };
  serverConsole: (...args: unknown[]) => void;
};

const MIGRATION_KEY = 'migration.conditionTdfIds.v1';
const BATCH_SIZE = 100;
const MAX_ROOTS_PER_STARTUP = 1000;

function normalize(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function candidateFileNames(candidate: any): string[] {
  return [normalize(candidate?.content?.fileName), normalize(candidate?.tdfFileName)]
    .filter((value): value is string => !!value);
}

function selectUniqueCandidate(root: RootRow, conditionFileName: string, candidates: any[]) {
  const matching = candidates.filter((candidate) => candidateFileNames(candidate).includes(conditionFileName));
  const packageAssetId = normalize(root.packageAssetId);
  if (packageAssetId) {
    const samePackage = matching.filter((candidate) => normalize(candidate?.packageAssetId) === packageAssetId);
    if (samePackage.length === 1) return samePackage[0];
    if (samePackage.length > 1) return null;
  }
  const ownerId = normalize(root.ownerId);
  const sameOwner = ownerId
    ? matching.filter((candidate) => normalize(candidate?.ownerId) === ownerId)
    : [];
  return sameOwner.length === 1 ? sameOwner[0] : null;
}

export async function backfillConditionTdfIds(deps: MigrationDeps) {
  const migrationState = await deps.DynamicSettings.findOneAsync({ key: MIGRATION_KEY });
  if (migrationState?.value?.completedAt) return migrationState.value;

  let lastId: unknown = migrationState?.value?.lastId ?? null;
  let updated = Number(migrationState?.value?.updated) || 0;
  let ambiguousOrMissing = Number(migrationState?.value?.ambiguousOrMissing) || 0;
  const affectedRootIds: string[] = Array.isArray(migrationState?.value?.affectedRootIds)
    ? migrationState.value.affectedRootIds.map(normalize).filter((value: string | null): value is string => !!value)
    : [];
  let processedThisRun = 0;

  while (processedThisRun < MAX_ROOTS_PER_STARTUP) {
    const roots = await deps.Tdfs.find({
      'content.tdfs.tutor.setspec.condition.0': { $exists: true },
      $or: [
        { 'content.tdfs.tutor.setspec.conditionTdfIds': { $exists: false } },
        { 'content.tdfs.tutor.setspec.conditionTdfIds': null },
        { 'content.tdfs.tutor.setspec.conditionTdfIds': { $size: 0 } },
      ],
      ...(lastId === null ? {} : { _id: { $gt: lastId } }),
    }, {
      fields: {
        _id: 1,
        ownerId: 1,
        packageAssetId: 1,
        'content.tdfs.tutor.setspec.condition': 1,
      },
      sort: { _id: 1 },
      limit: BATCH_SIZE,
    }).fetchAsync() as RootRow[];
    if (roots.length === 0) break;
    processedThisRun += roots.length;

    const conditionFileNames = Array.from(new Set(
      roots.flatMap((root) => {
        const conditions = root.content?.tdfs?.tutor?.setspec?.condition;
        return Array.isArray(conditions)
          ? conditions.map(normalize).filter((value): value is string => !!value)
          : [];
      })
    ));
    const candidates = conditionFileNames.length > 0
      ? await deps.Tdfs.find({
          $or: [
            { 'content.fileName': { $in: conditionFileNames } },
            { tdfFileName: { $in: conditionFileNames } },
          ],
        }, {
          fields: { _id: 1, ownerId: 1, packageAssetId: 1, tdfFileName: 1, 'content.fileName': 1 },
        }).fetchAsync()
      : [];

    for (const root of roots) {
      const conditions = root.content?.tdfs?.tutor?.setspec?.condition;
      const normalizedConditions = Array.isArray(conditions)
        ? conditions.map(normalize).filter((value): value is string => !!value)
        : [];
      const resolved = normalizedConditions.map((conditionFileName) =>
        selectUniqueCandidate(root, conditionFileName, candidates)
      );
      if (normalizedConditions.length === 0 || resolved.some((candidate) => !candidate?._id)) {
        ambiguousOrMissing += 1;
        continue;
      }
      const rootId = normalize(root._id);
      if (!rootId) {
        ambiguousOrMissing += 1;
        continue;
      }
      const conditionTdfIds = resolved.map((candidate) => String(candidate._id));
      const changed = await deps.Tdfs.updateAsync({
        _id: root._id,
        $or: [
          { 'content.tdfs.tutor.setspec.conditionTdfIds': { $exists: false } },
          { 'content.tdfs.tutor.setspec.conditionTdfIds': null },
          { 'content.tdfs.tutor.setspec.conditionTdfIds': { $size: 0 } },
        ],
      }, {
        $set: { 'content.tdfs.tutor.setspec.conditionTdfIds': conditionTdfIds },
      });
      if (changed > 0) {
        updated += 1;
        affectedRootIds.push(rootId);
      }
    }

    lastId = roots[roots.length - 1]?._id ?? null;
    await deps.DynamicSettings.upsertAsync(
      { key: MIGRATION_KEY },
      { $set: { value: { updated, ambiguousOrMissing, affectedRootIds, lastId } } }
    );
    deps.serverConsole('[TDF identity migration] progress', { updated, ambiguousOrMissing });
  }

  if (processedThisRun >= MAX_ROOTS_PER_STARTUP) {
    const paused = { updated, ambiguousOrMissing, affectedRootIds, lastId };
    deps.serverConsole('[TDF identity migration] paused at startup bound', {
      processedThisRun,
      updated,
      ambiguousOrMissing,
    });
    return paused;
  }

  const completed = {
    completedAt: new Date().toISOString(),
    updated,
    ambiguousOrMissing,
    affectedRootIds,
  };
  await deps.DynamicSettings.upsertAsync({ key: MIGRATION_KEY }, { $set: { value: completed } });
  deps.serverConsole('[TDF identity migration] complete', { updated, ambiguousOrMissing });
  return completed;
}

export const CONDITION_TDF_ID_MIGRATION_KEY = MIGRATION_KEY;
