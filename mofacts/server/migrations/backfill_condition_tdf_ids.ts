import { normalizeTdfIdentity } from '../../common/lib/tdfIdentityContract';

type UnknownRecord = Record<string, unknown>;
type RootRow = {
  _id: unknown;
  ownerId?: unknown;
  packageAssetId?: unknown;
  tdfRevision?: unknown;
  tdfIdentityState?: unknown;
  content?: { tdfs?: { tutor?: { unit?: unknown; setspec?: { condition?: unknown; conditionTdfIds?: unknown } } } };
};

type MigrationDeps = {
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<number>;
  };
  TdfMutationJobs: {
    insertAsync: (document: UnknownRecord) => Promise<unknown>;
  };
  DynamicSettings: {
    findOneAsync: (selector: UnknownRecord) => Promise<any>;
    upsertAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
  };
  serverConsole: (...args: unknown[]) => void;
};

const MIGRATION_KEY = 'migration.conditionTdfIds.v2';
const MIGRATION_VERSION = 2;
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
    return samePackage.length === 1 ? samePackage[0] : null;
  }
  const ownerId = normalize(root.ownerId);
  const sameOwner = ownerId ? matching.filter((candidate) => normalize(candidate?.ownerId) === ownerId) : [];
  return sameOwner.length === 1 ? sameOwner[0] : null;
}

function revisionSelector(root: RootRow): UnknownRecord {
  const revision = Number.isInteger(root.tdfRevision) ? Number(root.tdfRevision) : 0;
  return revision === 0
    ? { _id: root._id, $or: [{ tdfRevision: 0 }, { tdfRevision: { $exists: false } }] }
    : { _id: root._id, tdfRevision: revision };
}

function readConditionsExactly(root: RootRow): string[] | null {
  const raw = root.content?.tdfs?.tutor?.setspec?.condition;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const normalized = raw.map((value) => typeof value === 'string' && value === value.trim() && value.length > 0 ? value : null);
  if (normalized.some((value) => value === null)) return null;
  const conditions = normalized as string[];
  return new Set(conditions).size === conditions.length ? conditions : null;
}

async function recordMigrationJob(
  deps: MigrationDeps,
  root: RootRow,
  before: UnknownRecord,
  after: UnknownRecord,
) {
  await deps.TdfMutationJobs.insertAsync({
    kind: 'condition-identity-migration',
    status: 'complete',
    actorUserId: 'server-startup',
    targetId: root._id,
    targetRevision: Number.isInteger(root.tdfRevision) ? root.tdfRevision : 0,
    beforeImage: before,
    afterImage: after,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function backfillConditionTdfIds(deps: MigrationDeps) {
  const migrationState = await deps.DynamicSettings.findOneAsync({ key: MIGRATION_KEY });
  if (migrationState?.value?.completedAt) return migrationState.value;

  let lastId: unknown = migrationState?.value?.lastId ?? null;
  let scanned = Number(migrationState?.value?.scanned) || 0;
  let updated = Number(migrationState?.value?.updated) || 0;
  let unresolved = Number(migrationState?.value?.unresolved) || 0;
  let processedThisRun = 0;
  let reachedEnd = false;

  while (processedThisRun < MAX_ROOTS_PER_STARTUP) {
    const roots = await deps.Tdfs.find({
      'content.tdfs.tutor.setspec.condition.0': { $exists: true },
      'tdfIdentityState.migrationVersion': { $ne: MIGRATION_VERSION },
      ...(lastId === null ? {} : { _id: { $gt: lastId } }),
    }, {
      fields: {
        _id: 1,
        ownerId: 1,
        packageAssetId: 1,
        tdfRevision: 1,
        tdfIdentityState: 1,
        'content.fileName': 1,
        'content.tdfs.tutor.unit': 1,
        'content.tdfs.tutor.setspec.condition': 1,
        'content.tdfs.tutor.setspec.conditionTdfIds': 1,
      },
      sort: { _id: 1 },
      limit: BATCH_SIZE,
    }).fetchAsync() as RootRow[];
    if (roots.length === 0) {
      reachedEnd = true;
      break;
    }
    processedThisRun += roots.length;
    scanned += roots.length;

    const conditionFileNames = Array.from(new Set(roots.flatMap((root) => readConditionsExactly(root) || [])));
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
      const conditions = readConditionsExactly(root);
      const existingIds = root.content?.tdfs?.tutor?.setspec?.conditionTdfIds;
      let conditionTdfIds: string[] | null = null;
      if (conditions && Array.isArray(existingIds) && existingIds.length === conditions.length) {
        const normalizedExisting = existingIds.map(normalizeTdfIdentity);
        if (normalizedExisting.every((id): id is string => !!id) && new Set(normalizedExisting).size === normalizedExisting.length) {
          const childById = new Map(candidates.map((candidate) => [String(candidate._id), candidate]));
          const aligned = normalizedExisting.every((id, index) => {
            const candidate = childById.get(id);
            return candidate
              && normalize(candidate.ownerId) === normalize(root.ownerId)
              && candidateFileNames(candidate).includes(conditions[index]!);
          });
          if (aligned) conditionTdfIds = normalizedExisting;
        }
      }
      if (!conditionTdfIds && conditions) {
        const resolved = conditions.map((fileName) => selectUniqueCandidate(root, fileName, candidates));
        const resolvedIds = resolved.map((candidate) => normalizeTdfIdentity(candidate?._id));
        if (resolvedIds.every((id): id is string => !!id) && new Set(resolvedIds).size === resolvedIds.length) {
          conditionTdfIds = resolvedIds;
        }
      }

      const unit = root.content?.tdfs?.tutor?.unit;
      const canNormalizeEmptyUnit = Array.isArray(unit) && unit.length === 0;
      if (!conditions || !conditionTdfIds || (unit !== undefined && !canNormalizeEmptyUnit)) {
        unresolved += 1;
        const reason = !conditions
          ? 'Condition filenames are missing, invalid, or duplicated.'
          : !conditionTdfIds
            ? 'Condition filenames could not be resolved to unique canonical TDF ids.'
            : 'A condition root contains tutor.unit entries and cannot be normalized automatically.';
        const beforeState = root.tdfIdentityState;
        const changed = await deps.Tdfs.updateAsync(revisionSelector(root), {
          $set: {
            tdfIdentityState: {
              status: 'repair-required',
              reason,
              migrationVersion: MIGRATION_VERSION,
              checkedAt: new Date(),
            },
            tdfAvailability: 'repair-required',
          },
          $inc: { tdfRevision: 1 },
        });
        if (changed === 1) {
          await recordMigrationJob(deps, root, { tdfIdentityState: beforeState }, {
            tdfIdentityState: { status: 'repair-required', reason, migrationVersion: MIGRATION_VERSION },
          });
        }
        continue;
      }

      const before = {
        conditionTdfIds: existingIds,
        unit,
        tdfIdentityState: root.tdfIdentityState,
      };
      const modifier: UnknownRecord = {
        $set: {
          'content.tdfs.tutor.setspec.conditionTdfIds': conditionTdfIds,
          tdfIdentityState: { status: 'valid', migrationVersion: MIGRATION_VERSION, checkedAt: new Date() },
          tdfAvailability: 'available',
        },
        $inc: { tdfRevision: 1 },
      };
      if (canNormalizeEmptyUnit) {
        modifier.$unset = { 'content.tdfs.tutor.unit': '' };
      }
      const changed = await deps.Tdfs.updateAsync(revisionSelector(root), modifier);
      if (changed === 1) {
        updated += 1;
        await recordMigrationJob(deps, root, before, {
          conditionTdfIds,
          unit: undefined,
          tdfIdentityState: { status: 'valid', migrationVersion: MIGRATION_VERSION },
        });
      } else {
        unresolved += 1;
      }
    }

    lastId = roots[roots.length - 1]?._id ?? null;
    await deps.DynamicSettings.upsertAsync(
      { key: MIGRATION_KEY },
      { $set: { value: { scanned, updated, unresolved, lastId } } },
    );
    deps.serverConsole('[TDF identity migration v2] progress', { scanned, updated, unresolved });
  }

  if (!reachedEnd) {
    const paused = { scanned, updated, unresolved, lastId };
    await deps.DynamicSettings.upsertAsync({ key: MIGRATION_KEY }, { $set: { value: paused } });
    deps.serverConsole('[TDF identity migration v2] incomplete', paused);
    return paused;
  }

  const completed = { completedAt: new Date().toISOString(), scanned, updated, unresolved, lastId: null };
  await deps.DynamicSettings.upsertAsync({ key: MIGRATION_KEY }, { $set: { value: completed } });
  deps.serverConsole('[TDF identity migration v2] complete', completed);
  return completed;
}

export const CONDITION_TDF_ID_MIGRATION_KEY = MIGRATION_KEY;
