import { DAILY_LESSON_PACKAGE_LIMIT } from '../../common/fileUploadPolicy';
import { Meteor } from 'meteor/meteor';
import { normalizeTdfIdentity, validateConditionFamilyTutor } from '../../common/lib/tdfIdentityContract';
import {
  hasUserRole,
  requireAuthenticatedUser,
  requireUserMatchesOrHasRole,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';
import { buildParentRootSelector } from '../lib/tdfLessonFamilyResolver';
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
    find: (selector: UnknownRecord, options?: UnknownRecord) => {
      fetchAsync: () => Promise<any[]>;
      countAsync?: () => Promise<number>;
      forEachAsync: (visit: (lesson: UnknownRecord) => void) => Promise<void>;
    };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
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
  stimulusFilePolicy: { authorize: (userId: string, tdf: any) => boolean | Promise<boolean> };
  storageRoot: string;
  getOrBuildCurrentPackageAsset: (
    tdfId: string,
    deps: any
  ) => Promise<{ link: string }>;
  parseLocalMediaReference: (src: string) => unknown;
  extractSrcFromHtml: (htmlString: string) => string[];
  getStimuliSetIdCandidates: (stimuliSetId: string | number | null | undefined) => Array<string | number>;
  findDynamicAssetsScopedBatch: (params: any) => Promise<unknown>;
  deleteTdfRuntimeData: (tdfId: string) => Promise<void>;
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

export const uploadReadPolicy = Object.freeze({
  kind: 'upload-read', operation: 'self',
  authorize: (userId: string | null | undefined, code: 401 | 'not-authorized') =>
    requireAuthenticatedUser(userId, 'Must be logged in', code),
} as const);

export const manualDraftPolicy = Object.freeze({
  kind: 'manual-draft', operation: 'owner',
  authorize: (userId: string | null | undefined) => requireAuthenticatedUser(userId, 'Must be logged in', 401),
  selector: (ownerId: string, draftId: string) => ({ _id: draftId, ownerId, draftType: 'manual-content-creator' }),
} as const);

export const packageDownloadPolicy = Object.freeze({
  kind: 'content-maintenance', operation: 'lesson-package-owner-or-admin', authorize: hasUserRole,
} as const);

export const lessonVisibilityPolicy = Object.freeze({
  kind: 'content-maintenance', operation: 'lesson-owner',
  authorize: (deps: MethodAuthorizationDeps, actingUserId: string | null | undefined, ownerId: string | undefined) =>
    requireUserMatchesOrHasRole(deps, {
      actingUserId,
      subjectUserId: ownerId,
      notLoggedInMessage: 'Must be logged in',
      notLoggedInCode: 'not-authorized',
      forbiddenMessage: 'Only owner can change public/private setting',
      forbiddenCode: 'not-authorized',
    }),
} as const);

export function createContentMethods(deps: ContentMethodsDeps) {
  const assetMaintenanceMethods = createContentAssetMaintenanceMethods(deps);
  return {
    ...assetMaintenanceMethods,

    getManualContentDraft: async function(this: MethodContext, draftId: string) {
      const ownerId = manualDraftPolicy.authorize(this.userId);
      if (!draftId || typeof draftId !== 'string') {
        throw new Meteor.Error(400, 'Draft id required');
      }

      const draft = await deps.ManualContentDrafts.findOneAsync(manualDraftPolicy.selector(ownerId, draftId), { fields: {
        lessonName: 1,
        currentStep: 1,
        state: 1,
        draftLessons: 1,
        updatedAt: 1,
        createdAt: 1,
      } });
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
      const ownerId = manualDraftPolicy.authorize(this.userId);
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
        const updated = await deps.ManualContentDrafts.updateAsync(
          manualDraftPolicy.selector(ownerId, draftId),
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

        if (!updated) throw new Meteor.Error(404, 'Draft not found');

        return {
          draftId,
          lessonName,
          updatedAt: now,
        };
      }

      await requireContentCreatorDisplayName(deps.usersCollection, ownerId);
      const insertedId = await deps.ManualContentDrafts.insertAsync({
        ownerId,
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
      const ownerId = manualDraftPolicy.authorize(this.userId);
      if (!draftId || typeof draftId !== 'string') {
        throw new Meteor.Error(400, 'Draft id required');
      }

      const removed = await deps.ManualContentDrafts.removeAsync(manualDraftPolicy.selector(ownerId, draftId));
      if (!removed) throw new Meteor.Error(404, 'Draft not found');
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

      const isAdmin = await packageDownloadPolicy.authorize(deps.getMethodAuthorizationDeps(), this.userId, ['admin']);
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
          DynamicAssets: deps.DynamicAssets,
          storageBoundary: deps.storageBoundary,
          storageRoot: deps.storageRoot,
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
      if (!await deps.stimulusFilePolicy.authorize(this.userId, tdf)) {
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
      const ownerId = uploadReadPolicy.authorize(this.userId, 401);
      if (!fileName || typeof fileName !== 'string') {
        throw new Meteor.Error(400, 'Invalid filename');
      }

      const asset = await deps.DynamicAssets.findOneAsync(
        {
          userId: ownerId,
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

    getUploadQuotaStatus: async function(this: MethodContext) {
      const actingUserId = uploadReadPolicy.authorize(this.userId, 'not-authorized');
      const isTeacherOrAdmin = await hasUserRole(deps.getMethodAuthorizationDeps(), actingUserId, ['admin', 'teacher']);

      if (isTeacherOrAdmin) {
        return { unlimited: true, role: 'teacher' };
      }

      const today = new Date().toISOString().split('T')[0];
      const quota = await deps.UserUploadQuota.findOneAsync({
        userId: actingUserId,
        date: today,
      });

      const used = quota?.uploadCount || 0;

      return {
        unlimited: false,
        dailyLimit: DAILY_LESSON_PACKAGE_LIMIT,
        used,
        remaining: Math.max(0, DAILY_LESSON_PACKAGE_LIMIT - used),
        maxFileSize: '10MB',
        resetsAt: new Date(today + 'T00:00:00Z').getTime() + 86400000,
      };
    },

    setTdfUserSelect: async function(this: MethodContext, tdfId: string, isPublic: boolean) {
      requireAuthenticatedUser(this.userId, 'Must be logged in', 'not-authorized');

      if (!normalizeTdfIdentity(tdfId) || typeof isPublic !== 'boolean') {
        throw new Meteor.Error(400, 'Expected a lesson ID and a boolean visibility setting');
      }
      const tdf = await deps.Tdfs.findOneAsync({ _id: tdfId });
      if (!tdf) {
        throw new Meteor.Error('not-found', 'TDF not found');
      }

      await lessonVisibilityPolicy.authorize(deps.getMethodAuthorizationDeps(), this.userId, tdf.ownerId);

      const parent = buildParentRootSelector([tdfId]);
      if (parent && await deps.Tdfs.findOneAsync(parent, { fields: { _id: 1 } })) {
        throw new Meteor.Error('tdf-condition-visibility', 'Change study visibility on the root lesson.');
      }

      const newUserSelect = isPublic ? 'true' : 'false';
      const visibilityLockReason = String(tdf.content?.tdfs?.tutor?.setspec?.aiVisibilityLockReason || '').trim();
      if (isPublic && visibilityLockReason) {
        throw new Meteor.Error('tdf-public-locked', visibilityLockReason);
      }

      const familyValidation = validateConditionFamilyTutor(tdf.content?.tdfs?.tutor, { requireCanonicalIds: true });
      if (familyValidation.errors.length > 0) {
        throw new Meteor.Error('tdf-identity-repair-required', 'This lesson family requires an identity repair.');
      }

      const field = 'content.tdfs.tutor.setspec.userselect';
      if (familyValidation.conditionTdfIds.length > 0) {
        // Repair conditions made separately visible by the previous switch.
        await deps.Tdfs.updateAsync(
          { _id: { $in: familyValidation.conditionTdfIds }, ownerId: tdf.ownerId, [field]: { $ne: 'false' } },
          { $set: { [field]: 'false' }, $inc: { tdfRevision: 1 } },
          { multi: true }
        );
      }
      const changed = await deps.Tdfs.updateAsync(
        { _id: tdfId, ownerId: tdf.ownerId, tdfRevision: tdf.tdfRevision ?? { $exists: false } },
        { $set: { [field]: newUserSelect }, $inc: { tdfRevision: 1 } }
      );
      if (!changed) throw new Meteor.Error('tdf-changed', 'Lesson changed. Refresh and try again.');

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
