import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import {
  hasUserRole,
  requireAuthenticatedUser,
  requireUserMatchesOrHasRole,
  requireUserWithRoles,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';

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
  meta?: { public?: boolean; stimuliSetId?: unknown };
};

type TdfLike = {
  _id?: string;
  ownerId?: string;
  accessors?: Array<{ userId?: string }>;
  packageFile?: string | null;
  packageAssetId?: unknown;
  stimuliSetId?: unknown;
  visibility?: unknown;
  conditionCounts?: unknown[];
  rawStimuliFile?: unknown;
  stimuli?: Array<Record<string, unknown>>;
  content?: {
    fileName?: string;
    tdfs?: {
      tutor?: {
        setspec?: {
          lessonname?: string;
          userselect?: string;
          textToSpeechAPIKey?: unknown;
          speechAPIKey?: unknown;
          condition?: string[];
          conditionTdfIds?: Array<string | null>;
          stimulusfile?: string;
          experimentTarget?: string;
        };
        unit?: Array<{ learningsession?: { stimulusfile?: string } }>;
      };
    };
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
  };
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
  getTdfsByFileNameOrId: (keys: unknown[]) => Promise<any[]>;
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
  resolveConditionTdfIds: (setspec?: { condition?: string[] }) => Promise<Array<string | null>>;
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

async function getContentUploadSummariesForIds(
  deps: ContentMethodsDeps,
  thisArg: MethodContext,
  tdfIds: unknown[]
) {
  const userId = thisArg.userId;
  if (!userId) {
    throw new Meteor.Error(401, 'Must be logged in');
  }
  if (!Array.isArray(tdfIds)) {
    throw new Meteor.Error(400, 'Invalid TDF id list');
  }

  const uniqueIds = [...new Set(tdfIds.filter((id) => typeof id === 'string' && id.trim().length > 0))] as string[];
  if (uniqueIds.length === 0) {
    return [];
  }
  if (uniqueIds.length > 200) {
    throw new Meteor.Error(400, 'Too many TDF ids requested');
  }

  const tdfs = await deps.Tdfs.find(
    { _id: { $in: uniqueIds } },
    {
      fields: {
        _id: 1,
        ownerId: 1,
        packageFile: 1,
        packageAssetId: 1,
        stimuliSetId: 1,
        visibility: 1,
        conditionCounts: 1,
        'content.fileName': 1,
        'content.tdfs.tutor.setspec.lessonname': 1,
        'content.tdfs.tutor.setspec.userselect': 1,
        'content.tdfs.tutor.setspec.textToSpeechAPIKey': 1,
        'content.tdfs.tutor.setspec.speechAPIKey': 1,
        'content.tdfs.tutor.setspec.condition': 1,
        'content.tdfs.tutor.setspec.conditionTdfIds': 1,
        'content.tdfs.tutor.setspec.stimulusfile': 1,
        'content.tdfs.tutor.unit.learningsession.stimulusfile': 1,
      },
    }
  ).fetchAsync();

  const conditionLookupKeys = new Set<string>();
  const stimLookupKeys = new Set<string>();
  for (const tdf of tdfs as TdfLike[]) {
    const setspec = tdf.content?.tdfs?.tutor?.setspec;
    const conditions = Array.isArray(setspec?.condition) ? setspec.condition : [];
    for (const condition of conditions) {
      if (typeof condition === 'string' && condition.trim().length > 0) {
        conditionLookupKeys.add(condition.trim());
      }
    }

    if (typeof setspec?.stimulusfile === 'string' && setspec.stimulusfile.trim().length > 0) {
      stimLookupKeys.add(setspec.stimulusfile.trim());
    }

    const units = Array.isArray(tdf.content?.tdfs?.tutor?.unit) ? tdf.content.tdfs.tutor.unit : [];
    for (const unit of units) {
      const stimulusfile = unit?.learningsession?.stimulusfile;
      if (typeof stimulusfile === 'string' && stimulusfile.trim().length > 0) {
        stimLookupKeys.add(stimulusfile.trim());
      }
    }
  }

  const [resolvedConditionDocs, stimDocs] = await Promise.all([
    conditionLookupKeys.size > 0
      ? deps.getTdfsByFileNameOrId(Array.from(conditionLookupKeys))
      : Promise.resolve([]),
    stimLookupKeys.size > 0
      ? deps.Stims.find(
          { 'meta.fileName': { $in: Array.from(stimLookupKeys) } },
          { fields: { _id: 1, 'meta.fileName': 1 } }
        ).fetchAsync()
      : Promise.resolve([]),
  ]);

  const resolvedConditionIdByKey = new Map<string, string>();
  for (const conditionDoc of resolvedConditionDocs) {
    const resolvedId = typeof conditionDoc?._id === 'string' ? conditionDoc._id : '';
    if (!resolvedId) {
      continue;
    }
    resolvedConditionIdByKey.set(resolvedId, resolvedId);
    const fileName = typeof conditionDoc?.content?.fileName === 'string'
      ? conditionDoc.content.fileName.trim()
      : '';
    if (fileName && !resolvedConditionIdByKey.has(fileName)) {
      resolvedConditionIdByKey.set(fileName, resolvedId);
    }
  }

  const stimDocsByFileName = new Map<string, { _id: string }>();
  for (const stimDoc of stimDocs as Array<{ _id: string; meta?: { fileName?: string } }>) {
    const fileName = typeof stimDoc?.meta?.fileName === 'string' ? stimDoc.meta.fileName.trim() : '';
    if (fileName) {
      stimDocsByFileName.set(fileName, { _id: stimDoc._id });
    }
  }

  const summaries = [];
  for (const tdf of tdfs as TdfLike[]) {
    if (!await deps.canAccessContentUploadTdf(userId, tdf)) {
      throw new Meteor.Error(403, 'Not authorized to access one or more TDFs');
    }

    const setspec = tdf.content?.tdfs?.tutor?.setspec;
    const summary = {
      _id: tdf._id,
      ownerId: tdf.ownerId,
      packageFile: tdf.packageFile || null,
      packageAssetId: deps.normalizeCanonicalId(tdf.packageAssetId),
      stimuliSetId: tdf.stimuliSetId || null,
      lessonName: setspec?.lessonname || 'Unknown Lesson',
      fileName: tdf.content?.fileName || 'unknown.xml',
      isPublic: setspec?.userselect === 'true',
      hasAPIKeys: !!(setspec?.textToSpeechAPIKey || setspec?.speechAPIKey),
      conditions: [] as Array<{ condition: string; tdfId: string | null; count: number | null }>,
      errors: [] as string[],
      stimFiles: [] as Array<{ filename: string; stimId: string | null; exists: boolean }>,
    };

    if (!setspec) {
      summary.errors.push('TDF missing required structure.');
    }

    const conditions = Array.isArray(setspec?.condition) ? setspec.condition : [];
    if (conditions.length > 0) {
      const persistedConditionIds = Array.isArray(setspec?.conditionTdfIds)
        ? setspec.conditionTdfIds.map((id: unknown) => deps.normalizeCanonicalId(id))
        : [];
      const resolvedConditionIds = conditions.map((conditionFilename: string, index: number) => {
        const persistedId = persistedConditionIds[index];
        if (typeof persistedId === 'string') {
          return persistedId;
        }
        const normalizedCondition = typeof conditionFilename === 'string' ? conditionFilename.trim() : '';
        return normalizedCondition ? (resolvedConditionIdByKey.get(normalizedCondition) || null) : null;
      });

      if (Array.isArray(tdf.conditionCounts)) {
        if (tdf.conditionCounts.length < conditions.length) {
          summary.errors.push('Condition counts length mismatch. Please click the refresh icon for this lesson.');
        }
        summary.conditions = conditions.map((conditionFilename: string, index: number) => ({
          condition: conditionFilename,
          tdfId: resolvedConditionIds[index] ?? null,
          count: typeof tdf.conditionCounts?.[index] === 'number' ? tdf.conditionCounts[index] : null,
        }));
      } else {
        summary.errors.push('Condition counts not found. Condition count reset needed. Please click the refresh icon for this lesson.');
        summary.conditions = conditions.map((conditionFilename: string, index: number) => ({
          condition: conditionFilename,
          tdfId: resolvedConditionIds[index] ?? null,
          count: null,
        }));
      }
    }

    const stimFileSet = new Set<string>();
    if (setspec?.stimulusfile) {
      stimFileSet.add(setspec.stimulusfile);
    }
    if (tdf.content?.tdfs?.tutor?.unit) {
      for (const unit of tdf.content.tdfs.tutor.unit) {
        if (unit.learningsession?.stimulusfile) {
          stimFileSet.add(unit.learningsession.stimulusfile);
        }
      }
    }

    if (stimFileSet.size > 0) {
      summary.stimFiles = Array.from(stimFileSet).map((filename: string) => {
        const normalizedFilename = filename.trim();
        const stimDoc = stimDocsByFileName.get(normalizedFilename);
        return {
          filename,
          stimId: stimDoc?._id || null,
          exists: !!stimDoc,
        };
      });
    }

    summaries.push(summary);
  }

  return summaries;
}

async function getContentUploadListIds(deps: ContentMethodsDeps, thisArg: MethodContext, options: UnknownRecord = {}) {
  const userId = thisArg.userId;
  if (!userId) {
    throw new Meteor.Error(401, 'Must be logged in');
  }

  const safeOptions: UnknownRecord = (options && typeof options === 'object') ? options : {};
  const rawLimit = typeof safeOptions.limit === 'number' ? safeOptions.limit : Number(safeOptions.limit);
  const limit = Number.isFinite(rawLimit) ? Math.max(rawLimit, 1) : 50;
  const sort = { 'content.tdfs.tutor.setspec.lessonname': 1, _id: 1 };
  const query = {
    $or: [
      { ownerId: userId },
      { 'accessors.userId': userId },
    ],
  };

  const idDocs = await deps.Tdfs.find(query, { fields: { _id: 1 }, sort, limit: limit + 1 }).fetchAsync();
  const hasMore = idDocs.length > limit;
  const ids = (hasMore ? idDocs.slice(0, limit) : idDocs).map((doc: { _id: string }) => doc._id);
  const totalCount = hasMore ? (ids.length + 1) : ids.length;

  return { ids, totalCount, hasMore };
}

export function createContentMethods(deps: ContentMethodsDeps) {
  return {
    getContentUploadSummariesForIds: async function(this: MethodContext, tdfIds: unknown[]) {
      return await getContentUploadSummariesForIds(deps, this, tdfIds);
    },

    getContentUploadListIds: async function(this: MethodContext, options: UnknownRecord = {}) {
      return await getContentUploadListIds(deps, this, options);
    },

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
            visibility: 1,
            'content.fileName': 1,
            'content.tdfs.tutor.setspec.lessonname': 1,
            'content.tdfs.tutor.setspec.userselect': 1,
            'content.tdfs.tutor.setspec.experimentTarget': 1,
          },
        }
      );

      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }
      if (!deps.canAccessContentUploadTdf(this.userId, tdf)) {
        throw new Meteor.Error(403, 'Not authorized to download this package');
      }

      try {
        const result = await deps.getOrBuildCurrentPackageAsset(tdfId, {
          parseLocalMediaReference: deps.parseLocalMediaReference,
          extractSrcFromHtml: deps.extractSrcFromHtml,
          getStimuliSetIdCandidates: deps.getStimuliSetIdCandidates,
          findDynamicAssetsScopedBatch: deps.findDynamicAssetsScopedBatch,
          normalizeCanonicalId: deps.normalizeCanonicalId,
          decryptData: deps.decryptData,
          resolveConditionTdfIds: deps.resolveConditionTdfIds,
          DynamicAssets: deps.DynamicAssets,
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
            visibility: 1,
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
        const matchingTdfs = await deps.Tdfs.find(
          { packageAssetId },
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
        const packageAsset = await deps.DynamicAssets.findOneAsync({ _id: packageAssetId });
        if (packageAsset) {
          if (!isAdmin && packageAsset.userId !== userId) {
            throw new Meteor.Error(403, 'Can only delete your own packages');
          }
          await deps.DynamicAssets.removeAsync({ _id: packageAsset._id });
          deps.serverConsole('Package file removed from DynamicAssets');
        } else {
          deps.serverConsole('Package file not found in DynamicAssets (may have been deleted already)');
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
    },

    toggleTdfPresence: async function(this: MethodContext, tdfIds: string[], mode: boolean | string) {
      await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
        userId: this.userId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Admin access required to toggle TDF visibility',
        forbiddenCode: 403,
      });

      for (const tdfid of tdfIds) {
        await deps.Tdfs.updateAsync({ _id: tdfid }, { $set: { visibility: mode } });
      }
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
          { fields: { _id: 1, ownerId: 1, accessors: 1, visibility: 1, 'content.tdfs.tutor.setspec.userselect': 1 } }
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
            visibility: 1,
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
        forbiddenMessage: 'Only owner can change visibility',
        forbiddenCode: 'not-authorized',
      });

      const newUserSelect = isPublic ? 'true' : 'false';

      await deps.Tdfs.updateAsync(
        { _id: tdfId },
        { $set: { 'content.tdfs.tutor.setspec.userselect': newUserSelect } }
      );

      const setspec = tdf.content?.tdfs?.tutor?.setspec;
      const conditionIds = Array.isArray(setspec?.condition)
        ? (await deps.resolveConditionTdfIds(setspec)).filter(Boolean)
        : [];
      if (conditionIds.length > 0) {
        await deps.Tdfs.updateAsync(
          { _id: { $in: conditionIds }, ownerId: tdf.ownerId },
          { $set: { 'content.tdfs.tutor.setspec.userselect': newUserSelect } },
          { multi: true }
        );
      }

      await deps.AuditLog.insertAsync({
        action: 'tdf_visibility_change',
        userId: this.userId,
        tdfId,
        newValue: newUserSelect,
        timestamp: new Date(),
      });

      return { success: true, userselect: newUserSelect };
    },
  };
}
