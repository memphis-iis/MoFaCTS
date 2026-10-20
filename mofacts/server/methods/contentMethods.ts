import { Meteor } from 'meteor/meteor';
import { validateConditionFamilyTutor } from '../../common/lib/tdfIdentityContract';
import {
  hasUserRole,
  requireAuthenticatedUser,
  requireUserMatchesOrHasRole,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';
import type { createStorageBoundary } from '../lib/storageBoundary';
import { requireContentCreatorDisplayName } from '../lib/contentCreatorIdentity';
import { createContentAssetMaintenanceMethods } from './contentAssetMaintenanceMethods';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
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
  path?: unknown;
  meta?: {
    public?: boolean;
    stimuliSetId?: unknown;
    storageBackend?: unknown;
    storageKey?: unknown;
    uploadPurpose?: unknown;
    draftId?: unknown;
    itemId?: unknown;
    mediaSlotId?: unknown;
    setId?: unknown;
    setAssetId?: unknown;
    targetId?: unknown;
  };
};

type ContentMethodsDeps = {
  ManualContentDrafts: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
    insertAsync: (document: UnknownRecord) => Promise<unknown>;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]>; countAsync?: () => Promise<number> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  Stims: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
  };
  DynamicAssets: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]>; countAsync: () => Promise<number> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
    collection: {
      rawCollection: () => {
        aggregate: (pipeline: UnknownRecord[]) => { toArray: () => Promise<Array<{ _id: unknown; count: number }>> };
        updateAsync?: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
      };
      updateAsync?: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
    };
    writeAsync?: (data: Buffer, options: UnknownRecord) => Promise<DynamicAssetDoc>;
    link?: (fileRef: UnknownRecord) => string | null;
  };
  storageBoundary: ReturnType<typeof createStorageBoundary>;
  usersCollection: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  UserUploadQuota: {
    findOneAsync: (selector: UnknownRecord) => Promise<any>;
  };
  AuditLog: {
    insertAsync: (document: UnknownRecord) => Promise<unknown>;
  };
  serverConsole: (...args: unknown[]) => void;
  isPlainRecord: (value: unknown) => value is UnknownRecord;
  cloneJsonLike: <T>(value: T) => T;
  normalizeCanonicalId: (value: unknown) => string | null;
  canAccessContentUploadTdf: (userId: string, tdf: any) => boolean | Promise<boolean>;
  getOrBuildCurrentPackageAsset: (
    tdfId: string,
    deps: any
  ) => Promise<{ link: string }>;
  parseLocalMediaReference: (src: string) => unknown;
  extractSrcFromHtml: (htmlString: string) => string[];
  getStimuliSetIdCandidates: (stimuliSetId: string | number | null | undefined) => Array<string | number>;
  findDynamicAssetsScopedBatch: (params: any) => Promise<unknown>;
  decryptData: (value: string) => string;
  deleteTdfRuntimeData: (tdfId: string) => Promise<void>;
  updateStimDisplayTypeMap: (stimuliSetIds: unknown[] | null) => Promise<unknown>;
  rebuildStimDisplayTypeMapSnapshot: (deps: any) => Promise<unknown>;
  getStimDisplayTypeMapDeps: () => any;
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
};

const MANUAL_CREATOR_STEP_LABELS = [
  'Lesson Basics',
  'Card Format',
  'Audio And Display',
  'Starter Content',
  'Edit Draft',
];

function normalizeManualDraftStep(value: unknown, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= MANUAL_CREATOR_STEP_LABELS.length) {
    return parsed;
  }
  return fallback;
}

function getManualDraftStepLabel(step: number) {
  return MANUAL_CREATOR_STEP_LABELS[step - 1] || MANUAL_CREATOR_STEP_LABELS[0];
}

function summarizeManualDraftState(state: UnknownRecord, currentStep: number, draftLessons: unknown[]) {
  const lessonName = typeof state.lessonName === 'string' && state.lessonName.trim()
    ? state.lessonName.trim()
    : 'Untitled draft';
  const promptType = typeof state.promptType === 'string' ? state.promptType : 'text';
  const responseType = typeof state.responseType === 'string' ? state.responseType : 'typed';
  const structure = typeof state.structure === 'string' ? state.structure : 'instructions-learning';
  const hasDraftLesson = Array.isArray(draftLessons) && draftLessons.length > 0;

  return {
    lessonName,
    promptType,
    responseType,
    structure,
    currentStep,
    stepLabel: getManualDraftStepLabel(currentStep),
    status: hasDraftLesson ? 'Draft ready' : getManualDraftStepLabel(currentStep),
  };
}

async function getOwnedManualContentDraft(
  deps: ContentMethodsDeps,
  userId: string,
  draftId: string,
  fields: UnknownRecord = {}
) {
  return await deps.ManualContentDrafts.findOneAsync(
    {
      _id: draftId,
      ownerId: userId,
      draftType: 'manual-content-creator',
    },
    Object.keys(fields).length > 0 ? { fields } : undefined
  );
}

export function createContentMethods(deps: ContentMethodsDeps) {
  const assetMaintenanceMethods = createContentAssetMaintenanceMethods(deps);
  return {
    ...assetMaintenanceMethods,

    listManualContentDrafts: async function(this: MethodContext) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }

      const drafts = await deps.ManualContentDrafts.find(
        {
          ownerId: this.userId,
          draftType: 'manual-content-creator',
        },
        {
          fields: {
            lessonName: 1,
            currentStep: 1,
            summary: 1,
            updatedAt: 1,
            createdAt: 1,
          },
          sort: { updatedAt: -1 },
          limit: 25,
        }
      ).fetchAsync();

      return drafts.map((draft: any) => {
        const currentStep = normalizeManualDraftStep(draft?.currentStep, 1);
        const summary = deps.isPlainRecord(draft?.summary) ? draft.summary : {};
        return {
          _id: String(draft?._id || ''),
          lessonName: typeof draft?.lessonName === 'string' && draft.lessonName.trim()
            ? draft.lessonName.trim()
            : (typeof summary.lessonName === 'string' && summary.lessonName.trim() ? summary.lessonName.trim() : 'Untitled draft'),
          currentStep,
          stepLabel: typeof summary.stepLabel === 'string' ? summary.stepLabel : getManualDraftStepLabel(currentStep),
          status: typeof summary.status === 'string' ? summary.status : getManualDraftStepLabel(currentStep),
          promptType: typeof summary.promptType === 'string' ? summary.promptType : null,
          responseType: typeof summary.responseType === 'string' ? summary.responseType : null,
          updatedAt: draft?.updatedAt || null,
          createdAt: draft?.createdAt || null,
        };
      });
    },

    getManualContentDraft: async function(this: MethodContext, draftId: string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!draftId || typeof draftId !== 'string') {
        throw new Meteor.Error(400, 'Draft id required');
      }

      const draft = await getOwnedManualContentDraft(deps, this.userId, draftId, {
        lessonName: 1,
        currentStep: 1,
        state: 1,
        draftLessons: 1,
        updatedAt: 1,
        createdAt: 1,
      });
      if (!draft) {
        throw new Meteor.Error(404, 'Draft not found');
      }

      return {
        _id: String(draft._id || ''),
        lessonName: typeof draft.lessonName === 'string' ? draft.lessonName : '',
        currentStep: normalizeManualDraftStep(draft.currentStep, 1),
        state: deps.isPlainRecord(draft.state) ? deps.cloneJsonLike(draft.state) : {},
        draftLessons: Array.isArray(draft.draftLessons) ? deps.cloneJsonLike(draft.draftLessons) : [],
        updatedAt: draft.updatedAt || null,
        createdAt: draft.createdAt || null,
      };
    },

    saveManualContentDraft: async function(this: MethodContext, payload: UnknownRecord = {}) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!deps.isPlainRecord(payload)) {
        throw new Meteor.Error(400, 'Invalid draft payload');
      }

      const draftId = typeof payload.draftId === 'string' ? payload.draftId.trim() : '';
      const currentStep = normalizeManualDraftStep(payload.currentStep, 1);
      const state = deps.isPlainRecord(payload.state) ? deps.cloneJsonLike(payload.state) : {};
      const draftLessons = Array.isArray(payload.draftLessons) ? deps.cloneJsonLike(payload.draftLessons) : [];
      const summary = summarizeManualDraftState(state, currentStep, draftLessons);
      const lessonName = summary.lessonName;
      const now = new Date();

      if (draftId) {
        const existingDraft = await getOwnedManualContentDraft(deps, this.userId, draftId, {
          _id: 1,
          createdAt: 1,
        });
        if (!existingDraft) {
          throw new Meteor.Error(404, 'Draft not found');
        }

        await deps.ManualContentDrafts.updateAsync(
          { _id: draftId },
          {
            $set: {
              lessonName,
              currentStep,
              state,
              draftLessons,
              summary,
              updatedAt: now,
            },
          }
        );

        return {
          draftId,
          lessonName,
          updatedAt: now,
        };
      }

      await requireContentCreatorDisplayName(deps.usersCollection, this.userId);
      const insertedId = await deps.ManualContentDrafts.insertAsync({
        ownerId: this.userId,
        draftType: 'manual-content-creator',
        lessonName,
        currentStep,
        state,
        draftLessons,
        summary,
        createdAt: now,
        updatedAt: now,
      });

      return {
        draftId: String(insertedId),
        lessonName,
        updatedAt: now,
      };
    },

    deleteManualContentDraft: async function(this: MethodContext, draftId: string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!draftId || typeof draftId !== 'string') {
        throw new Meteor.Error(400, 'Draft id required');
      }

      const draft = await getOwnedManualContentDraft(deps, this.userId, draftId, { _id: 1 });
      if (!draft) {
        throw new Meteor.Error(404, 'Draft not found');
      }

      await deps.ManualContentDrafts.removeAsync({ _id: draftId });
      return { deleted: true };
    },

    getPackageDownloadLink: async function(this: MethodContext, tdfId: string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!tdfId || typeof tdfId !== 'string') {
        throw new Meteor.Error(400, 'Invalid TDF');
      }

      const tdf = await deps.Tdfs.findOneAsync(
        { _id: tdfId },
        {
          fields: {
            ownerId: 1,
            accessors: 1,
            'content.fileName': 1,
            'content.tdfs.tutor.setspec.lessonname': 1,
            'content.tdfs.tutor.setspec.userselect': 1,
            'content.tdfs.tutor.setspec.experimentTarget': 1,
          },
        }
      );

      const isAdmin = await deps.getMethodAuthorizationDeps().userIsInRoleAsync(this.userId, ['admin']);
      if (!tdf || (tdf.ownerId !== this.userId && !isAdmin)) {
        throw new Meteor.Error(404, 'Package unavailable');
      }

      try {
        const result = await deps.getOrBuildCurrentPackageAsset(tdfId, {
          parseLocalMediaReference: deps.parseLocalMediaReference,
          extractSrcFromHtml: deps.extractSrcFromHtml,
          getStimuliSetIdCandidates: deps.getStimuliSetIdCandidates,
          findDynamicAssetsScopedBatch: deps.findDynamicAssetsScopedBatch,
          normalizeCanonicalId: deps.normalizeCanonicalId,
          decryptData: deps.decryptData,
          DynamicAssets: deps.DynamicAssets,
          storageBoundary: deps.storageBoundary,
          Tdfs: deps.Tdfs,
        });
        return { link: result.link };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        deps.serverConsole('[Package Download] Failed to build current package export', {
          tdfId,
          userId: this.userId,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        });
        if (error instanceof Meteor.Error) {
          throw error;
        }
        throw new Meteor.Error(500, `Package export failed: ${errorMessage}`);
      }
    },

    getStimuliFileForTdf: async function(this: MethodContext, tdfId: string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!tdfId || typeof tdfId !== 'string') {
        throw new Meteor.Error(400, 'Invalid TDF');
      }

      const tdf = await deps.Tdfs.findOneAsync(
        { _id: tdfId },
        {
          fields: {
            rawStimuliFile: 1,
            ownerId: 1,
            accessors: 1,
            'content.tdfs.tutor.setspec.stimulusfile': 1,
            'content.tdfs.tutor.setspec.userselect': 1,
            'content.tdfs.tutor.setspec.experimentTarget': 1,
          },
        }
      );

      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }
      if (!deps.canAccessContentUploadTdf(this.userId, tdf)) {
        throw new Meteor.Error(403, 'Not authorized to download this stimulus file');
      }
      if (!tdf.rawStimuliFile) {
        throw new Meteor.Error(404, 'Stimulus file not found');
      }

      const fileName = tdf.content?.tdfs?.tutor?.setspec?.stimulusfile;
      if (!fileName) {
        throw new Meteor.Error(404, 'Stimulus filename not found');
      }

      return {
        fileName,
        stimFile: tdf.rawStimuliFile,
      };
    },

    getUserAssetByName: async function(this: MethodContext, fileName: string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!fileName || typeof fileName !== 'string') {
        throw new Meteor.Error(400, 'Invalid filename');
      }

      const asset = await deps.DynamicAssets.findOneAsync(
        {
          userId: this.userId,
          $or: [
            { name: fileName },
            { fileName },
          ],
        },
        { fields: { _id: 1, name: 1, fileName: 1 } }
      );

      if (!asset) {
        return null;
      }

      return {
        _id: asset._id,
        name: asset.name,
        fileName: asset.fileName,
      };
    },

    getTdfOwnersMap: async function(this: MethodContext, ownerIds: string[]) {
      const actingUserId = requireAuthenticatedUser(this.userId, 'Must be logged in', 401);
      if (!Array.isArray(ownerIds)) {
        throw new Meteor.Error(400, 'Invalid owner id list');
      }
      const uniqueOwnerIds = [...new Set(
        ownerIds
          .filter((id) => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
      )];
      if (uniqueOwnerIds.length > 100) {
        throw new Meteor.Error(400, 'Too many owner ids requested');
      }
      const canReadAnyOwner = await hasUserRole(deps.getMethodAuthorizationDeps(), actingUserId, ['admin']);
      const allowedOwnerIds = new Set<string>();
      if (canReadAnyOwner) {
        for (const ownerId of uniqueOwnerIds) {
          allowedOwnerIds.add(ownerId);
        }
      } else {
        const tdfs = await deps.Tdfs.find(
          { ownerId: { $in: uniqueOwnerIds } },
          { fields: { _id: 1, ownerId: 1, accessors: 1, 'content.tdfs.tutor.setspec.userselect': 1 } }
        ).fetchAsync();
        for (const tdf of tdfs) {
          if (tdf?.ownerId && await deps.canAccessContentUploadTdf(actingUserId, tdf)) {
            allowedOwnerIds.add(tdf.ownerId);
          }
        }
      }
      const ownerMap: Record<string, string> = {};
      for (const id of allowedOwnerIds) {
        const foundUser = await deps.usersCollection.findOneAsync({ _id: id });
        if (typeof foundUser !== 'undefined') {
          ownerMap[id] = foundUser.username;
        }
      }
      return ownerMap;
    },

    getTdfsByOwnerId: async function(this: MethodContext, ownerId: string) {
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: this.userId,
        subjectUserId: ownerId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Can only read your own TDF list',
        forbiddenCode: 403,
      });
      const tdfs = await deps.Tdfs.find(
        { ownerId },
        {
          fields: {
            _id: 1,
            ownerId: 1,
            accessors: 1,
            stimuliSetId: 1,
            conditionCounts: 1,
            'content.fileName': 1,
            'content.tdfs.tutor.setspec.lessonname': 1,
            'content.tdfs.tutor.setspec.userselect': 1,
            'content.tdfs.tutor.setspec.condition': 1,
          },
        }
      ).fetchAsync();
      return tdfs || [];
    },

    getUploadQuotaStatus: async function(this: MethodContext) {
      const actingUserId = requireAuthenticatedUser(this.userId, 'Must be logged in', 'not-authorized');
      const isTeacherOrAdmin = await hasUserRole(deps.getMethodAuthorizationDeps(), actingUserId, ['admin', 'teacher']);

      if (isTeacherOrAdmin) {
        return { unlimited: true, role: 'teacher' };
      }

      const today = new Date().toISOString().split('T')[0];
      const quota = await deps.UserUploadQuota.findOneAsync({
        userId: actingUserId,
        date: today,
      });

      const DAILY_LIMIT = 3;
      const used = quota?.uploadCount || 0;

      return {
        unlimited: false,
        dailyLimit: DAILY_LIMIT,
        used,
        remaining: DAILY_LIMIT - used,
        maxFileSize: '10MB',
        resetsAt: new Date(today + 'T00:00:00Z').getTime() + 86400000,
      };
    },

    setTdfUserSelect: async function(this: MethodContext, tdfId: string, isPublic: boolean) {
      requireAuthenticatedUser(this.userId, 'Must be logged in', 'not-authorized');

      const tdf = await deps.Tdfs.findOneAsync({ _id: tdfId });
      if (!tdf) {
        throw new Meteor.Error('not-found', 'TDF not found');
      }

      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: this.userId,
        subjectUserId: tdf.ownerId,
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 'not-authorized',
        forbiddenMessage: 'Only owner can change public/private setting',
        forbiddenCode: 'not-authorized',
      });

      const newUserSelect = isPublic ? 'true' : 'false';
      const visibilityLockReason = String(tdf.content?.tdfs?.tutor?.setspec?.aiVisibilityLockReason || '').trim();
      if (isPublic && visibilityLockReason) {
        throw new Meteor.Error('tdf-public-locked', visibilityLockReason);
      }

      const familyValidation = validateConditionFamilyTutor(tdf.content?.tdfs?.tutor, { requireCanonicalIds: true });
      if (familyValidation.errors.length > 0) {
        throw new Meteor.Error('tdf-identity-repair-required', 'This lesson family requires an identity repair.');
      }

      await deps.Tdfs.updateAsync(
        { _id: tdfId },
        { $set: { 'content.tdfs.tutor.setspec.userselect': newUserSelect }, $inc: { tdfRevision: 1 } }
      );

      const conditionIds = familyValidation.conditionTdfIds;
      if (conditionIds.length > 0) {
        await deps.Tdfs.updateAsync(
          { _id: { $in: conditionIds }, ownerId: tdf.ownerId },
          { $set: { 'content.tdfs.tutor.setspec.userselect': newUserSelect }, $inc: { tdfRevision: 1 } },
          { multi: true }
        );
      }

      await deps.AuditLog.insertAsync({
        action: 'tdf_userselect_change',
        userId: this.userId,
        tdfId,
        newValue: newUserSelect,
        timestamp: new Date(),
      });

      return { success: true, userselect: newUserSelect };
    },
  };
}
