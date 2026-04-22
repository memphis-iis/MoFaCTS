import { Meteor } from 'meteor/meteor';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
};
type TdfAccessDoc = { ownerId?: string; accessors?: Array<{ userId?: string }>; content?: { fileName?: string } };

type TdfLookupDeps = {
  serverConsole: (...args: unknown[]) => void;
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  GlobalExperimentStates: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
  };
  normalizeCanonicalId: (value: unknown) => string | null;
  resolveAssignedRootTdfIdsForUser: (userId: string) => Promise<string[]>;
  canViewDashboardTdf: (userId: string, tdf: TdfAccessDoc | null | undefined) => boolean | Promise<boolean>;
  canAccessContentUploadTdf: (userId: string, tdf: TdfAccessDoc | null | undefined) => boolean | Promise<boolean>;
  isTdfOwner: (userId: string, tdf: TdfAccessDoc | null | undefined) => boolean;
  hasSharedTdfAccess: (userId: string, tdf: TdfAccessDoc | null | undefined) => boolean;
};

function normalizeTdfKeys(keys: unknown[]) {
  if (!Array.isArray(keys)) {
    return [];
  }
  return [...new Set(keys.map((key) => (typeof key === 'string' ? key.trim() : '')).filter(Boolean))];
}

export function createTdfLookupHelpers(deps: TdfLookupDeps) {
  async function getTdfsByFileNameOrId(keys: unknown[]) {
    const normalizedKeys = normalizeTdfKeys(keys);
    if (normalizedKeys.length === 0) {
      return [];
    }

    return await deps.Tdfs.find(
      {
        $or: [
          { _id: { $in: normalizedKeys } },
          { 'content.fileName': { $in: normalizedKeys } }
        ]
      },
      {
        fields: {
          _id: 1,
          ownerId: 1,
          accessors: 1,
          'content.fileName': 1
        }
      }
    ).fetchAsync();
  }

  async function getTdfById(this: MethodContext | void, TDFId: string) {
    const tdf = await deps.Tdfs.findOneAsync({ _id: TDFId });
    if (!this?.userId || !tdf) {
      return tdf;
    }

    const assignedRootIds = new Set(await deps.resolveAssignedRootTdfIdsForUser(this.userId));
    if (
      await deps.canViewDashboardTdf(this.userId, tdf) ||
      assignedRootIds.has(String(tdf._id || ''))
    ) {
      return tdf;
    }

    const experimentStates = await deps.GlobalExperimentStates.find(
      { userId: this.userId },
      { fields: { TDFId: 1 } }
    ).fetchAsync();
    const rootTdfIds = [...new Set(
      experimentStates
        .map((stateDoc: { TDFId?: string }) => deps.normalizeCanonicalId(stateDoc?.TDFId))
        .filter((id: string | null): id is string => typeof id === 'string')
    )];

    if (rootTdfIds.length === 0) {
      throw new Meteor.Error(403, 'Not authorized to access this TDF');
    }

    const rootTdfDocs = await deps.Tdfs.find(
      { _id: { $in: rootTdfIds } },
      { fields: { _id: 1, ownerId: 1, accessors: 1, 'content.tdfs.tutor.setspec': 1 } }
    ).fetchAsync();

    const conditionFileNames: string[] = [];
    for (const rootTdf of rootTdfDocs) {
      const rootId = String(rootTdf?._id || '');
      const canViewRoot = await deps.canViewDashboardTdf(this.userId, rootTdf);
      if (!canViewRoot && !assignedRootIds.has(rootId)) {
        continue;
      }
      if (rootId === TDFId) {
        return tdf;
      }
      const rootSetspec = rootTdf?.content?.tdfs?.tutor?.setspec;
      if (Array.isArray(rootSetspec?.conditionTdfIds)) {
        const resolvedIds = rootSetspec.conditionTdfIds
          .map((id: unknown) => deps.normalizeCanonicalId(id))
          .filter((id: string | null): id is string => typeof id === 'string');
        if (resolvedIds.includes(TDFId)) {
          return tdf;
        }
      } else {
        const conditions = Array.isArray(rootSetspec?.condition) ? rootSetspec.condition : [];
        for (const c of conditions) {
          if (typeof c === 'string' && c.trim()) {
            conditionFileNames.push(c.trim());
          }
        }
      }
    }

    if (conditionFileNames.length > 0) {
      const conditionDocs = await getTdfsByFileNameOrId(conditionFileNames);
      const resolvedConditionIds = new Set<string>();
      for (const doc of conditionDocs) {
        const id = deps.normalizeCanonicalId(doc?._id);
        if (id) resolvedConditionIds.add(id);
      }
      if (resolvedConditionIds.has(TDFId)) {
        return tdf;
      }
    }

    throw new Meteor.Error(403, 'Not authorized to access this TDF');
  }

  async function getTdfByFileName(filename: string) {
    try {
      const tdf = await deps.Tdfs.findOneAsync({ 'content.fileName': filename });
      if (!tdf) {
        return null;
      }
      return tdf;
    } catch (e: unknown) {
      deps.serverConsole('getTdfByFileName ERROR,', filename, ',', e);
      return null;
    }
  }

  async function userCanAccessContentUploadTdf(userId: string, tdf: TdfAccessDoc | null | undefined) {
    return deps.canAccessContentUploadTdf(userId, tdf);
  }

  async function userCanManageTdf(userId: string, tdf: TdfAccessDoc | null | undefined) {
    return deps.isTdfOwner(userId, tdf) || deps.hasSharedTdfAccess(userId, tdf);
  }

  async function assertUserOwnsTdfs(userId: string, keys: unknown[]) {
    if (!Array.isArray(keys)) {
      throw new Meteor.Error(400, 'Invalid TDF list');
    }
    const invalidKeys = keys.filter((key) => typeof key !== 'string' || key.trim().length === 0);
    if (invalidKeys.length > 0) {
      throw new Meteor.Error(400, 'Invalid TDF identifier');
    }
    const normalizedKeys = normalizeTdfKeys(keys);
    if (normalizedKeys.length === 0) {
      throw new Meteor.Error(400, 'No TDFs specified');
    }

    const tdfs = await getTdfsByFileNameOrId(normalizedKeys);
    const tdfByKey = new Map();
    for (const tdf of tdfs) {
      if (tdf?._id) {
        tdfByKey.set(tdf._id, tdf);
      }
      const fileName = tdf?.content?.fileName;
      if (fileName) {
        tdfByKey.set(fileName, tdf);
      }
    }

    for (const key of normalizedKeys) {
      const tdf = tdfByKey.get(key);
      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }
      if (!deps.isTdfOwner(userId, tdf)) {
        throw new Meteor.Error(403, 'Not authorized to access one or more owned TDFs');
      }
    }
  }

  return {
    getTdfById,
    getTdfByFileName,
    getTdfsByFileNameOrId,
    userCanAccessContentUploadTdf,
    userCanManageTdf,
    assertUserOwnsTdfs,
  };
}
