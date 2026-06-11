import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import {
  hasUserRole,
  requireAuthenticatedUser,
  requireUserMatchesOrHasRole,
  requireUserWithRoles,
} from '../lib/methodAuthorization';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
};

type DynamicAssetDoc = {
  _id?: string;
  userId?: string;
  name?: string;
  fileName?: string;
  size?: unknown;
  type?: unknown;
  uploadedAt?: unknown;
  ext?: unknown;
  extension?: unknown;
  meta?: { public?: boolean; stimuliSetId?: unknown; storageBackend?: unknown; storageKey?: unknown };
};

type TdfLike = {
  _id?: string;
  ownerId?: string;
  accessors?: Array<{ userId?: string }>;
  packageFile?: string | null;
  packageAssetId?: unknown;
  stimuliSetId?: unknown;
  stimuli?: Array<Record<string, unknown>>;
  content?: {
    fileName?: string;
  };
};

type DynamicAssetCleanupResult = {
  scanned: number;
  orphanCount: number;
  removedCount: number;
  sizeBytes: number;
  dryRun: boolean;
  limit: number;
  hasMore: boolean;
  assets: Array<{
    assetId: string;
    name: string | null;
    size: unknown;
    reason: string;
    stimuliSetId: unknown;
  }>;
};

type ContentAssetMaintenanceDeps = {
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]>; countAsync?: () => Promise<number> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  DynamicAssets: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]>; countAsync: () => Promise<number> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  serverConsole: (...args: unknown[]) => void;
  normalizeCanonicalId: (value: unknown) => string | null;
  getStimuliSetIdCandidates: (stimuliSetId: string | number | null | undefined) => Array<string | number>;
  deleteTdfRuntimeData: (tdfId: string) => Promise<void>;
  updateStimDisplayTypeMap: (stimuliSetIds: unknown[] | null) => Promise<unknown>;
  rebuildStimDisplayTypeMapSnapshot: (deps: any) => Promise<unknown>;
  getStimDisplayTypeMapDeps: () => any;
  getMethodAuthorizationDeps: () => any;
};

function hasNonEmptyValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function assetExtension(asset: DynamicAssetDoc): string {
  const ext = String(asset.ext || asset.extension || '').trim().toLowerCase().replace(/^\./, '');
  if (ext) {
    return ext;
  }
  const name = String(asset.name || asset.fileName || '').trim().toLowerCase();
  return name.match(/\.([a-z0-9]+)$/)?.[1] || '';
}

function stimuliSetCandidates(deps: ContentAssetMaintenanceDeps, stimuliSetId: unknown): Array<string | number> {
  if (!hasNonEmptyValue(stimuliSetId)) {
    return [];
  }
  return deps.getStimuliSetIdCandidates(stimuliSetId as string | number);
}

function stimuliSetKey(value: unknown): string {
  return `${typeof value}:${String(value)}`;
}

function packageReferenceCandidates(asset: DynamicAssetDoc): string[] {
  const values = new Set<string>();
  for (const value of [asset._id, asset.name, asset.fileName]) {
    if (typeof value === 'string' && value.trim()) {
      values.add(value.trim());
    }
  }
  const ext = assetExtension(asset);
  if (asset._id && ext) {
    values.add(`${asset._id}.${ext}`);
  }
  return Array.from(values);
}

async function removeAssetsForInactiveStimuliSets(deps: ContentAssetMaintenanceDeps, stimuliSetIds: unknown[]): Promise<number> {
  let removedCount = 0;
  const seen = new Set<string>();
  for (const stimuliSetId of stimuliSetIds) {
    const candidates = stimuliSetCandidates(deps, stimuliSetId);
    const key = candidates.map(stimuliSetKey).sort().join('|');
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);

    const remainingTdfs = await deps.Tdfs.find(
      { stimuliSetId: { $in: candidates } },
      { fields: { _id: 1 } }
    ).fetchAsync();
    if (remainingTdfs.length > 0) {
      continue;
    }

    const assets = await deps.DynamicAssets.find(
      { 'meta.stimuliSetId': { $in: candidates } },
      { fields: { _id: 1, name: 1 } }
    ).fetchAsync();
    for (const asset of assets as DynamicAssetDoc[]) {
      if (!asset?._id) {
        continue;
      }
      await deps.DynamicAssets.removeAsync({ _id: asset._id });
      removedCount += 1;
      deps.serverConsole('Removed orphaned DynamicAsset for deleted stimuli set:', asset._id, asset.name || '', stimuliSetId);
    }
  }
  return removedCount;
}

async function cleanupOrphanDynamicAssets(
  deps: ContentAssetMaintenanceDeps,
  options: { dryRun?: boolean; limit?: number } = {}
): Promise<DynamicAssetCleanupResult> {
  const dryRun = options.dryRun !== false;
  const limit = Math.min(Math.max(Number(options.limit || 10000), 1), 50000);
  const assets = await deps.DynamicAssets.find(
    {},
    {
      fields: { _id: 1, name: 1, fileName: 1, size: 1, ext: 1, extension: 1, meta: 1 },
      limit,
    }
  ).fetchAsync() as DynamicAssetDoc[];
  const tdfs = await deps.Tdfs.find(
    {},
    { fields: { stimuliSetId: 1, packageAssetId: 1, packageFile: 1 } }
  ).fetchAsync() as TdfLike[];

  const activeStimuliSetKeys = new Set<string>();
  const activePackageReferences = new Set<string>();
  for (const tdf of tdfs) {
    for (const candidate of stimuliSetCandidates(deps, tdf.stimuliSetId)) {
      activeStimuliSetKeys.add(stimuliSetKey(candidate));
    }
    for (const value of [tdf.packageAssetId, tdf.packageFile]) {
      if (typeof value === 'string' && value.trim()) {
        activePackageReferences.add(value.trim());
      }
    }
  }

  const orphanAssets: DynamicAssetCleanupResult['assets'] = [];
  let sizeBytes = 0;
  for (const asset of assets) {
    const assetId = typeof asset._id === 'string' ? asset._id : '';
    if (!assetId) {
      continue;
    }
    const assetStimuliSetId = asset.meta?.stimuliSetId;
    let reason = '';
    if (hasNonEmptyValue(assetStimuliSetId)) {
      const hasActiveTdf = stimuliSetCandidates(deps, assetStimuliSetId)
        .some((candidate) => activeStimuliSetKeys.has(stimuliSetKey(candidate)));
      if (!hasActiveTdf) {
        reason = 'noActiveTdfForStimuliSetId';
      }
    } else if (['zip', 'apkg', 'h5p'].includes(assetExtension(asset))) {
      const hasActivePackageReference = packageReferenceCandidates(asset)
        .some((candidate) => activePackageReferences.has(candidate));
      if (!hasActivePackageReference) {
        reason = 'unreferencedPackageUpload';
      }
    }

    if (!reason) {
      continue;
    }
    const numericSize = Number(asset.size);
    if (Number.isFinite(numericSize) && numericSize > 0) {
      sizeBytes += numericSize;
    }
    orphanAssets.push({
      assetId,
      name: asset.name || asset.fileName || null,
      size: asset.size || null,
      reason,
      stimuliSetId: assetStimuliSetId ?? null,
    });
  }

  let removedCount = 0;
  if (!dryRun) {
    for (const asset of orphanAssets) {
      await deps.DynamicAssets.removeAsync({ _id: asset.assetId });
      removedCount += 1;
    }
  }

  return {
    scanned: assets.length,
    orphanCount: orphanAssets.length,
    removedCount,
    sizeBytes,
    dryRun,
    limit,
    hasMore: assets.length >= limit,
    assets: orphanAssets.slice(0, 500),
  };
}

export function createContentAssetMaintenanceMethods(deps: ContentAssetMaintenanceDeps) {
  return {
    cleanupOrphanDynamicAssets: async function(this: MethodContext, options: { dryRun?: boolean; limit?: number } = {}) {
      await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
        userId: this.userId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Admin access required',
        forbiddenCode: 403,
      });
      return await cleanupOrphanDynamicAssets(deps, options || {});
    },

    deletePackageFile: async function(this: MethodContext, packageAssetIdInput: string) {
      deps.serverConsole('Remove package asset:', packageAssetIdInput);
      const userId = this.userId;
      if (!userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!packageAssetIdInput || typeof packageAssetIdInput !== 'string') {
        throw new Meteor.Error(400, 'Package id missing');
      }

      try {
        let deletedCount = 0;
        const touchedStimuliSetIds = new Set();
        const packageAssetId = deps.normalizeCanonicalId(packageAssetIdInput);
        if (!packageAssetId) {
          throw new Meteor.Error(404, 'Package asset id missing');
        }

        const isAdmin = await hasUserRole(deps.getMethodAuthorizationDeps(), userId, ['admin']);
        const packageAsset = await deps.DynamicAssets.findOneAsync({ _id: packageAssetId });
        const packageFileCandidates = new Set<string>();
        const packageExt = typeof packageAsset?.ext === 'string' && packageAsset.ext.trim()
          ? packageAsset.ext.trim()
          : 'zip';
        packageFileCandidates.add(`${packageAssetId}.${packageExt}`);
        packageFileCandidates.add(`${packageAssetId}.${packageExt.toLowerCase()}`);

        const matchingTdfs = await deps.Tdfs.find(
          {
            $or: [
              { packageAssetId },
              { packageFile: { $in: Array.from(packageFileCandidates) } },
            ],
          },
          { fields: { _id: 1, ownerId: 1, stimuliSetId: 1, stimuli: 1 } }
        ).fetchAsync();

        deps.serverConsole('Found', matchingTdfs.length, 'TDFs for package asset:', packageAssetId);

        if (!isAdmin && matchingTdfs.some((tdf: { ownerId?: string }) => tdf.ownerId !== userId)) {
          throw new Meteor.Error(403, 'Can only delete your own packages');
        }

        const assetsToCheck = new Set();
        for (const TDF of matchingTdfs as Array<TdfLike>) {
          if (TDF && (isAdmin || TDF.ownerId === userId)) {
            const tdfId = TDF._id;
            if (TDF.stimuliSetId !== undefined && TDF.stimuliSetId !== null) {
              touchedStimuliSetIds.add(TDF.stimuliSetId);
            }
            if (Array.isArray(TDF.stimuli)) {
              for (const stim of TDF.stimuli) {
                if (stim?.stimuliSetId !== undefined && stim?.stimuliSetId !== null) {
                  touchedStimuliSetIds.add(stim.stimuliSetId);
                }
              }
            }
            if (tdfId) {
              await deps.deleteTdfRuntimeData(tdfId);
              await deps.Tdfs.removeAsync({ _id: tdfId });
              deletedCount++;
              deps.serverConsole('Deleted TDF:', tdfId);
            }

            if (TDF.stimuli) {
              for (const stim of TDF.stimuli) {
                const asset = stim.imageStimulus || stim.audioStimulus || stim.videoStimulus || false;
                if (asset) {
                  assetsToCheck.add(asset);
                }
              }
            }
          }
        }

        if (assetsToCheck.size > 0) {
          deps.serverConsole('Checking', assetsToCheck.size, 'assets for potential deletion');

          const assetNames = Array.from(assetsToCheck);
          const tdfsStillUsingAssets = await deps.Tdfs.find({
            $or: [
              { 'stimuli.imageStimulus': { $in: assetNames } },
              { 'stimuli.audioStimulus': { $in: assetNames } },
              { 'stimuli.videoStimulus': { $in: assetNames } },
            ],
          }, { fields: { stimuli: 1 } }).fetchAsync();

          const stillUsedAssets = new Set();
          for (const tdf of tdfsStillUsingAssets as Array<{ stimuli?: Array<{ imageStimulus?: string; audioStimulus?: string; videoStimulus?: string }> }>) {
            if (tdf.stimuli) {
              for (const stim of tdf.stimuli) {
                if (stim.imageStimulus) stillUsedAssets.add(stim.imageStimulus);
                if (stim.audioStimulus) stillUsedAssets.add(stim.audioStimulus);
                if (stim.videoStimulus) stillUsedAssets.add(stim.videoStimulus);
              }
            }
          }

          for (const assetName of assetsToCheck) {
            if (!stillUsedAssets.has(assetName)) {
              try {
                await deps.DynamicAssets.removeAsync({ name: assetName });
                deps.serverConsole('Asset removed (not used by other TDFs):', assetName);
              } catch (err: unknown) {
                deps.serverConsole('Error removing asset:', err);
              }
            } else {
              deps.serverConsole('Asset kept (still used by other TDFs):', assetName);
            }
          }
        }

        deps.serverConsole('Removing package asset with ID:', packageAssetId);
        if (packageAsset) {
          if (!isAdmin && packageAsset.userId !== userId) {
            throw new Meteor.Error(403, 'Can only delete your own packages');
          }
          await deps.DynamicAssets.removeAsync({ _id: packageAsset._id });
          deps.serverConsole('Package file removed from DynamicAssets');
        } else {
          deps.serverConsole('Package file not found in DynamicAssets (may have been deleted already)');
        }

        const orphanedAssetsRemoved = await removeAssetsForInactiveStimuliSets(deps, Array.from(touchedStimuliSetIds));
        if (orphanedAssetsRemoved > 0) {
          deps.serverConsole('Removed orphaned assets for deleted package:', orphanedAssetsRemoved);
        }

        if (deletedCount > 0) {
          if (touchedStimuliSetIds.size > 0) {
            await deps.updateStimDisplayTypeMap(Array.from(touchedStimuliSetIds));
          } else {
            await deps.rebuildStimDisplayTypeMapSnapshot(deps.getStimDisplayTypeMapDeps());
          }
        }

        return { deletedCount };
      } catch (e: unknown) {
        deps.serverConsole('deletePackageFile error:', e);
        if (e instanceof Meteor.Error) {
          throw e;
        }
        const message = e instanceof Error ? e.message : String(e);
        throw new Meteor.Error(500, 'There was an error deleting the package: ' + message);
      }
    },

    removeAssetById: async function(this: MethodContext, assetId: string) {
      const asset = await deps.DynamicAssets.findOneAsync({ _id: assetId });
      if (!asset) {
        throw new Meteor.Error(404, 'Asset not found');
      }
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: this.userId,
        subjectUserId: asset.userId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Can only delete your own assets',
        forbiddenCode: 403,
      });

      await deps.DynamicAssets.removeAsync({ _id: assetId });
    },

    removeMultipleAssets: async function(this: MethodContext, assetIds: string[]) {
      const actingUserId = requireAuthenticatedUser(this.userId, 'Must be logged in', 401);
      check(assetIds, [String]);

      if (assetIds.length === 0) {
        return { deleted: 0 };
      }

      if (assetIds.length > 50) {
        throw new Meteor.Error(400, 'Maximum 50 files per batch delete');
      }

      const assets = await deps.DynamicAssets.find({ _id: { $in: assetIds } }).fetchAsync();
      for (const asset of assets as Array<DynamicAssetDoc>) {
        await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
          actingUserId,
          subjectUserId: asset.userId,
          roles: ['admin'],
          forbiddenMessage: `Cannot delete asset "${asset.name}" - not owned by you`,
          forbiddenCode: 403,
        });
      }

      let deleted = 0;
      for (const assetId of assetIds) {
        try {
          await deps.DynamicAssets.removeAsync({ _id: assetId });
          deleted++;
        } catch (err: unknown) {
          console.error('[removeMultipleAssets] Error deleting asset:', assetId, err);
        }
      }

      return { deleted };
    },

    auditPublicAssetsWithoutSharedTdf: async function(this: MethodContext, options: { limit?: number | string } = {}) {
      await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
        userId: this.userId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Admin access required',
        forbiddenCode: 403,
      });
      if (options && typeof options !== 'object') {
        throw new Meteor.Error(400, 'Invalid options');
      }

      const rawLimit = options?.limit ?? 500;
      const limit = typeof rawLimit === 'number' ? rawLimit : Number(rawLimit);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Meteor.Error(400, 'Invalid limit');
      }
      if (limit > 2000) {
        throw new Meteor.Error(400, 'Limit too large (max 2000)');
      }

      const publicAssetQuery = { 'meta.public': true };
      const totalPublicAssets = await deps.DynamicAssets.find(publicAssetQuery).countAsync();

      const publicAssets = await deps.DynamicAssets.find(
        publicAssetQuery,
        {
          fields: {
            _id: 1,
            name: 1,
            userId: 1,
            size: 1,
            type: 1,
            uploadedAt: 1,
            meta: 1,
          },
          sort: { uploadedAt: -1 },
          limit,
        }
      ).fetchAsync();

      const stimSetIds = publicAssets
        .map((asset: DynamicAssetDoc) => asset?.meta?.stimuliSetId)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
      const uniqueStimSetIds = [...new Set(stimSetIds)];

      const tdfs = uniqueStimSetIds.length > 0
        ? await deps.Tdfs.find(
            { stimuliSetId: { $in: uniqueStimSetIds } },
            { fields: { _id: 1, stimuliSetId: 1, ownerId: 1, accessors: 1, 'content.fileName': 1 } }
          ).fetchAsync()
        : [];

      const tdfsByStimSetId = new Map();
      const sharedStimSetIds = new Set();
      for (const tdf of tdfs as Array<TdfLike>) {
        if (!tdf?.stimuliSetId) {
          continue;
        }
        if (!tdfsByStimSetId.has(tdf.stimuliSetId)) {
          tdfsByStimSetId.set(tdf.stimuliSetId, []);
        }
        tdfsByStimSetId.get(tdf.stimuliSetId).push(tdf);
        if (Array.isArray(tdf.accessors) && tdf.accessors.length > 0) {
          sharedStimSetIds.add(tdf.stimuliSetId);
        }
      }

      const flaggedAssets = [];
      for (const asset of publicAssets as Array<DynamicAssetDoc>) {
        const stimSetId = asset?.meta?.stimuliSetId || null;
        if (!stimSetId) {
          flaggedAssets.push({
            assetId: asset._id,
            name: asset.name,
            userId: asset.userId || null,
            stimSetId: null,
            uploadedAt: asset.uploadedAt || null,
            size: asset.size || null,
            type: asset.type || null,
            reason: 'missingStimuliSetId',
            tdfId: null,
            tdfFileName: null,
            tdfCountForStimSet: 0,
            sharedAccessorCount: 0,
          });
          continue;
        }

        const linkedTdfs = tdfsByStimSetId.get(stimSetId) || [];
        if (linkedTdfs.length === 0) {
          flaggedAssets.push({
            assetId: asset._id,
            name: asset.name,
            userId: asset.userId || null,
            stimSetId,
            uploadedAt: asset.uploadedAt || null,
            size: asset.size || null,
            type: asset.type || null,
            reason: 'noTdfForStimuliSetId',
            tdfId: null,
            tdfFileName: null,
            tdfCountForStimSet: 0,
            sharedAccessorCount: 0,
          });
          continue;
        }

        if (!sharedStimSetIds.has(stimSetId)) {
          const tdfSample = linkedTdfs[0];
          flaggedAssets.push({
            assetId: asset._id,
            name: asset.name,
            userId: asset.userId || null,
            stimSetId,
            uploadedAt: asset.uploadedAt || null,
            size: asset.size || null,
            type: asset.type || null,
            reason: 'tdfNotShared',
            tdfId: tdfSample?._id || null,
            tdfFileName: tdfSample?.content?.fileName || null,
            tdfCountForStimSet: linkedTdfs.length,
            sharedAccessorCount: Array.isArray(tdfSample?.accessors) ? tdfSample.accessors.length : 0,
          });
        }
      }

      return {
        totalPublicAssets,
        scannedPublicAssets: publicAssets.length,
        flaggedCount: flaggedAssets.length,
        limit,
        hasMore: totalPublicAssets > publicAssets.length,
        assets: flaggedAssets,
      };
    }
  };
}
