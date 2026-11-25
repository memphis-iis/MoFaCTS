import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { validateConditionFamilyTutor } from '../../common/lib/tdfIdentityContract';
import { contentMediaStimuliSetId } from '../../common/fileUploadPolicy';
import {
  hasUserRole,
  requireAuthenticatedUser,
  requireUserMatchesOrHasRole,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
};

export const packageDeletionPolicy = Object.freeze({
  kind: 'content-maintenance', operation: 'archive-and-family-owner-or-admin', authorize: hasUserRole,
} as const);

export const assetDeletionPolicy = Object.freeze({
  kind: 'content-maintenance', operation: 'asset-owner-or-admin',
  authorize: (deps: MethodAuthorizationDeps, actingUserId: string, ownerId: string | undefined) =>
    requireUserMatchesOrHasRole(deps, {
      actingUserId,
      subjectUserId: ownerId,
      roles: ['admin'],
      notLoggedInMessage: 'Must be logged in',
      notLoggedInCode: 401,
      forbiddenMessage: 'Can only delete your own assets',
      forbiddenCode: 403,
    }),
} as const);

type PackageMediaAsset = {
  _id: string;
  userId?: string;
  name?: string;
  fileName?: string;
  meta: { tdfId: string; stimuliSetId: string | number };
};

type PackageLesson = { _id: string; ownerId?: string; stimuliSetId?: unknown };

type ContentAssetMaintenanceDeps = {
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => {
      fetchAsync: () => Promise<any[]>;
      forEachAsync: (visit: (lesson: UnknownRecord) => void) => Promise<void>;
    };
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
  deleteTdfRuntimeData: (tdfId: string) => Promise<void>;
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
};

function retainReferencedMedia(value: unknown, candidates: Map<string, string[]>): void {
  if (typeof value === 'string') {
    const text = value.toLowerCase();
    for (const [id, tokens] of candidates) {
      if (tokens.some(token => text.includes(token))) candidates.delete(id);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const child of Object.values(value)) {
    if (candidates.size === 0) break;
    retainReferencedMedia(child, candidates);
  }
}

async function removeUnusedPackageMedia(deps: ContentAssetMaintenanceDeps, family: PackageLesson[]) {
  if (family.length === 0) return;
  const scopes = new Map(family.map(lesson => [lesson._id, contentMediaStimuliSetId(lesson)]));
  const stimulusSetIds = [...new Set(scopes.values())].filter(scope => scope !== null);
  if (stimulusSetIds.length === 0) return;
  const assets: PackageMediaAsset[] = await deps.DynamicAssets.find({
    'meta.stimuliSetId': { $in: stimulusSetIds },
    'meta.uploadPurpose': 'content-media',
    'meta.tdfId': { $in: [...scopes.keys()] },
  }, { fields: { _id: 1, userId: 1, name: 1, fileName: 1, meta: 1 } }).fetchAsync();
  const candidates = new Map<string, string[]>();
  const assetsByStimulusSet = new Map<string, string[]>();
  for (const asset of assets) {
    const scope = scopes.get(asset.meta.tdfId);
    if (scope == null || asset.meta.stimuliSetId !== scope) continue;
    const scopeKey = String(scope);
    const scopedAssets = assetsByStimulusSet.get(scopeKey) ?? [];
    scopedAssets.push(asset._id);
    assetsByStimulusSet.set(scopeKey, scopedAssets);
    const names = [asset.name, asset.fileName].filter((name): name is string => Boolean(name));
    candidates.set(asset._id, [asset._id, ...names, ...names.map(encodeURIComponent)].map(token => token.toLowerCase()));
  }
  if (candidates.size === 0) return;

  // Lesson media can appear in formatted stimuli, source stimuli, or nested tutor content.
  // A bare name is ambiguous, so a surviving match preserves the asset.
  await deps.Tdfs.find({}, {
    fields: { stimuliSetId: 1, stimuli: 1, rawStimuliFile: 1, content: 1 }, batchSize: 100,
  }).forEachAsync(lesson => {
    for (const id of assetsByStimulusSet.get(String(lesson.stimuliSetId)) ?? []) candidates.delete(id);
    if (candidates.size > 0) retainReferencedMedia(lesson, candidates);
  });
  for (const asset of assets) {
    if (!candidates.has(asset._id)) continue;
    await deps.DynamicAssets.removeAsync({
      _id: asset._id, userId: asset.userId ?? null, name: asset.name ?? null, fileName: asset.fileName ?? null,
      'meta.uploadPurpose': 'content-media', 'meta.tdfId': asset.meta.tdfId, 'meta.stimuliSetId': asset.meta.stimuliSetId,
    });
  }
}

export function createContentAssetMaintenanceMethods(deps: ContentAssetMaintenanceDeps) {
  return {
    deletePackageFile: async function(
      this: MethodContext,
      selectedIdInput: string,
      confirmation: { wholeFamily?: boolean; unpackagedLesson?: boolean } = {},
    ) {
      const userId = this.userId;
      if (!userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!selectedIdInput || typeof selectedIdInput !== 'string') {
        throw new Meteor.Error(400, 'Package id missing');
      }
      if (confirmation?.wholeFamily !== true) {
        throw new Meteor.Error('whole-family-confirmation-required', 'Confirm deletion of the complete lesson family.');
      }

      try {
        let deletedCount = 0;
        const selectedId = deps.normalizeCanonicalId(selectedIdInput);
        if (!selectedId) {
          throw new Meteor.Error(404, 'Package asset id missing');
        }

        const isAdmin = await packageDeletionPolicy.authorize(deps.getMethodAuthorizationDeps(), userId, ['admin']);
        const unpackaged = confirmation.unpackagedLesson === true;
        const packageAsset = unpackaged ? null : await deps.DynamicAssets.findOneAsync({ _id: selectedId });
        if (packageAsset && !isAdmin && packageAsset.userId !== userId) {
          throw new Meteor.Error(403, 'Can only delete your own packages');
        }
        if (packageAsset?.meta?.uploadPurpose === 'content-media') {
          throw new Meteor.Error(400, 'Select a package archive');
        }
        const fields = {
          _id: 1, ownerId: 1, stimuliSetId: 1,
          'content.tdfs.tutor.setspec.condition': 1,
          'content.tdfs.tutor.setspec.conditionTdfIds': 1,
        };
        let matchingTdfs;
        const noArchive = { packageAssetId: { $in: [null, ''] }, packageFile: { $in: [null, ''] } };
        if (unpackaged) {
          const lesson = await deps.Tdfs.findOneAsync({ _id: selectedId, ...noArchive });
          if (!lesson) throw new Meteor.Error(404, 'The selected lesson no longer has this package state');
          if (!isAdmin && lesson.ownerId !== userId) throw new Meteor.Error(403, 'Can only delete your own packages');
          const family = validateConditionFamilyTutor(lesson.content?.tdfs?.tutor, { requireCanonicalIds: true });
          if (family.errors.length > 0) {
            throw new Meteor.Error('partial-family-deletion-forbidden', 'The selected lesson family requires identity repair.');
          }
          matchingTdfs = await deps.Tdfs.find(
            { _id: { $in: [selectedId, ...family.conditionTdfIds] }, ...noArchive }, { fields },
          ).fetchAsync();
          if (!matchingTdfs.some((lesson: PackageLesson) => lesson._id === selectedId)) {
            throw new Meteor.Error(409, 'The selected lesson changed before deletion');
          }
        } else {
          const packageExt = typeof packageAsset?.ext === 'string' && packageAsset.ext.trim()
            ? packageAsset.ext.trim()
            : 'zip';
          const filenames = [...new Set([`${selectedId}.${packageExt}`, `${selectedId}.${packageExt.toLowerCase()}`])];
          matchingTdfs = await deps.Tdfs.find({
            $or: [{ packageAssetId: selectedId }, { packageFile: { $in: filenames } }],
          }, { fields }).fetchAsync();
        }

        if (!isAdmin && matchingTdfs.some((tdf: { ownerId?: string }) => tdf.ownerId !== userId)) {
          throw new Meteor.Error(403, 'Can only delete your own packages');
        }

        const familyIds = matchingTdfs.map((tdf: PackageLesson) => tdf._id);
        const externalParents = familyIds.length > 0
          ? await deps.Tdfs.find(
              {
                _id: { $nin: familyIds },
                'content.tdfs.tutor.setspec.conditionTdfIds': { $in: familyIds },
              },
              { fields: { _id: 1 } },
            ).fetchAsync()
          : [];
        const missingMembers = matchingTdfs.flatMap((tdf: any) => {
          const childIds = tdf?.content?.tdfs?.tutor?.setspec?.conditionTdfIds;
          return Array.isArray(childIds) ? childIds.filter((id: unknown) => !familyIds.includes(String(id))) : [];
        });
        if (externalParents.length > 0 || missingMembers.length > 0) {
          throw new Meteor.Error('partial-family-deletion-forbidden', 'The selected package is not a complete, isolated lesson family.');
        }

        for (const lesson of matchingTdfs as PackageLesson[]) {
          await deps.deleteTdfRuntimeData(lesson._id);
          const selector = { _id: lesson._id, ownerId: lesson.ownerId ?? null, ...(unpackaged ? noArchive : {}) };
          if (await deps.Tdfs.removeAsync(selector) !== 1) {
            throw new Meteor.Error(409, 'Lesson changed before deletion');
          }
          deletedCount++;
        }

        if (packageAsset) {
          await deps.DynamicAssets.removeAsync({ _id: packageAsset._id, userId: packageAsset.userId ?? null });
        }

        await removeUnusedPackageMedia(deps, matchingTdfs);

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
      const actingUserId = requireAuthenticatedUser(this.userId, 'Must be logged in', 401);
      check(assetId, String);
      const asset = await deps.DynamicAssets.findOneAsync({ _id: assetId });
      if (!asset) {
        throw new Meteor.Error(404, 'Asset not found');
      }
      await assetDeletionPolicy.authorize(deps.getMethodAuthorizationDeps(), actingUserId, asset.userId);

      const removed = await deps.DynamicAssets.removeAsync({ _id: assetId, userId: asset.userId ?? null });
      if (removed === 0) throw new Meteor.Error(409, 'Asset changed before deletion');
      if (removed !== 1) throw new Meteor.Error(500, 'Storage did not confirm asset deletion');
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

      const ids = [...new Set(assetIds)];
      const assets = await deps.DynamicAssets.find(
        { _id: { $in: ids } }, { fields: { _id: 1, userId: 1 } },
      ).fetchAsync();
      for (const asset of assets) {
        await assetDeletionPolicy.authorize(deps.getMethodAuthorizationDeps(), actingUserId, asset.userId);
      }

      if (assets.length !== ids.length) return { deleted: 0, selectionChanged: true };

      let deleted = 0;
      for (const asset of assets) {
        try {
          const removed = await deps.DynamicAssets.removeAsync({ _id: asset._id, userId: asset.userId ?? null });
          if (removed === 0) return { deleted, selectionChanged: true };
          if (removed !== 1) throw new Error('Unexpected asset removal count');
          deleted += removed;
        } catch {
          deps.serverConsole('[removeMultipleAssets] Storage did not confirm removal');
          return { deleted, storageFailed: true };
        }
      }
      return { deleted };
    },
  };
}
