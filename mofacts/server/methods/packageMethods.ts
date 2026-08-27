import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { parsePackageZip, type UploadedPackageFile } from '../lib/packageParser';
import { processPackageUploadWorkflow } from '../lib/packageUpload';
import { uploadPackageMedia } from '../lib/mediaUploader';
import type { PackageUploadIntegrity, ProcessPackageUploadDeps } from '../lib/packageUploadShared';
import type { createStorageBoundary } from '../lib/storageBoundary';
import { validateAutoTutorContent } from '../../common/lib/autoTutorContract';
import { mergeEditorContentPreservingSourceShape } from '../../common/lib/editorSaveShape';
import { createPackageGeneratedContentMethods, prepareAiGeneratedPackage } from './packageGeneratedContentMethods';
import type { ApiKeyResolutionDeps } from '../lib/apiKeyResolution';
import { validateAndEncryptUploadedApiKey } from '../lib/uploadedApiKeyValidation';
import { assertNoH5PContent } from '../../common/lib/unsupportedContent';
import { requireContentCreatorDisplayName } from '../lib/contentCreatorIdentity';
import {
  reconcileConditionCountsByChildId,
  validateConditionFamilyTutor,
} from '../../common/lib/tdfIdentityContract';
import { assertValidTdfExpressions } from '../../../learning-components/content/tdfExpressionValidation';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};

type DynamicAssetLike = {
  _id: string;
  path: string;
  userId?: string;
  ext?: string;
  name?: string;
  fileName?: string;
  type?: string;
  size?: number;
};

type _SaveContentResult = {
  result: boolean | null;
  errmsg: string;
  action: string;
  data?: unknown;
  tdfFileName?: string;
};

type TdfSetspecLike = {
  lessonname: string;
  stimulusfile?: string;
  userselect?: string;
  tips?: string[];
  condition?: string[];
  conditionTdfIds?: Array<string | null>;
  shuffleclusters?: unknown;
  openRouterModel?: string;
  aiVisibilityLockReason?: string;
};

type TdfPayload = {
  fileName?: string;
  ownerId?: string;
  source?: string;
  createdAt?: Date;
  tdfs: {
    tutor: {
      setspec: TdfSetspecLike;
      unit?: unknown[];
    };
  };
  [key: string]: unknown;
};

type PackagePayload = {
  tdfId: string;
  fileName: string;
  packageFile?: string;
  packageAssetId?: string;
  stimFileName: string;
  stimuli: unknown;
  tdfs: TdfPayload['tdfs'];
  conditionTdfIds?: Array<string | null>;
  expectedRevision: number;
};

type PrivateRepoTdfRecord = {
  sourceKey: string;
  sourceFileName: string;
  fileName: string;
  tdfs: TdfPayload['tdfs'];
};

type UpsertResult = {
  res?: string;
  reason?: string[];
  stimuliSetId?: string | number | null;
  TDF?: UnknownRecord;
  result?: boolean;
  errmsg?: string;
  tdfId?: string;
};

type PackageMethodsDeps = {
  Tdfs: any;
  TdfMutationJobs: any;
  ManualContentDrafts: any;
  usersCollection: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  DynamicAssets: any;
  storageBoundary: ReturnType<typeof createStorageBoundary>;
  UserUploadQuota: any;
  AuditLog: any;
  ownerEmail: string;
  serverConsole: (...args: unknown[]) => void;
  sendEmail: (to: string, from: string, subject: string, text: string) => void;
  getCurrentUser: () => Promise<any>;
  userIsInRoleAsync: (userId: string, roles: string[]) => Promise<boolean>;
  normalizeCanonicalId: (value: unknown) => string | null;
  getResponseKCAnswerKey: (answer: unknown) => string;
  getStimuliSetIdByFilename: (stimFileName: string) => Promise<string | number | null | undefined>;
  userCanManageTdf: (userId: string, tdf: any) => Promise<boolean> | boolean;
  allocateNextStimuliSetId: () => number;
  getNewItemFormat: (oldStimFormat: any, fileName: string, stimuliSetId: any, responseKCMap: Record<string, unknown>) => any[];
  legacyTrim: (value: unknown) => string;
  encryptData: (value: string) => string;
  getApiKeyResolutionDeps: () => ApiKeyResolutionDeps;
  updateStimDisplayTypeMap: (stimuliSetIds: unknown[] | null) => Promise<unknown>;
  rebuildStimDisplayTypeMapSnapshot: (deps: any) => Promise<unknown>;
  getStimDisplayTypeMapDeps: () => any;
  getMimeTypeForAssetName: (fileName: string, fallback?: string) => string;
  parseLocalMediaReference: (src: string) => { assetId?: string; [key: string]: unknown };
  findDynamicAssetScoped: (params: {
    stimuliSetId?: string | number | null;
    assetId?: string;
    fileName?: string;
  }) => Promise<any>;
  toCanonicalDynamicAssetPath: (asset: { _id?: string; name?: string; link?: () => string } | null) => string;
  normalizeUploadedMediaLookupKey: (value: unknown) => string;
  processAudioFilesForTDF: (tdfDoc: any, stimuliSetId: any, options: any) => Promise<any>;
  canonicalizeStimDisplayMediaRefs: (stimuliDoc: any, stimuliSetId: any, options: any) => Promise<any>;
  canonicalizeFlatStimuliMediaRefs: (canonicalStimuli: any, stimuliSetId: any, options: any) => Promise<any>;
};

function isPlainRecord(value: unknown): value is UnknownRecord {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isSafeEditorRemovalPath(path: string) {
  if (!path || path.length > 500) {
    return false;
  }
  return path
    .split('.')
    .every((segment) => /^[A-Za-z0-9_$-]+$/.test(segment) && !['__proto__', 'constructor', 'prototype'].includes(segment));
}

function deleteEditorRelativePath(root: unknown, path: string) {
  if (!isSafeEditorRemovalPath(path)) {
    throw new Meteor.Error(400, `Invalid editor removal path: ${path}`);
  }
  const segments = path.split('.');
  let current: unknown = root;
  for (const segment of segments.slice(0, -1)) {
    if (!isPlainRecord(current)) {
      return;
    }
    const next = current[segment];
    if (!isPlainRecord(next)) {
      return;
    }
    current = next;
  }
  if (isPlainRecord(current)) {
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      delete current[lastSegment];
    }
  }
}

export function createPackageMethods(deps: PackageMethodsDeps) {
  async function _requireContentUploadActor(thisArg: MethodContext, requestedOwner: unknown) {
    const actingUserId = deps.normalizeCanonicalId(thisArg.userId);
    if (!actingUserId) {
      throw new Meteor.Error(401, 'Must be logged in');
    }
    const isAdmin = await deps.userIsInRoleAsync(actingUserId, ['admin']);
    const isTeacher = await deps.userIsInRoleAsync(actingUserId, ['teacher']);
    if (!isAdmin && !isTeacher) {
      throw new Meteor.Error(403, 'Teacher or admin access required');
    }
    const ownerId = deps.normalizeCanonicalId(requestedOwner) || actingUserId;
    if (!isAdmin && ownerId !== actingUserId) {
      throw new Meteor.Error(403, 'Can only upload content for yourself unless admin');
    }
    return { actingUserId, ownerId, isAdmin, isTeacher };
  }

  async function getResponseKCMapForTdf(tdfId: string) {
    deps.serverConsole('getResponseKCMapForTdf', tdfId);

    const tdf = await deps.Tdfs.findOneAsync({_id: tdfId});
    if (!tdf || !tdf.stimuli) {
      deps.serverConsole('getResponseKCMapForTdf: TDF not found or has no stimuli', tdfId);
      return {};
    }

    const responseKCMap: Record<string, unknown> = {};
    for (const stim of tdf.stimuli) {
      if (stim && stim.correctResponse !== undefined) {
        const answerText = deps.getResponseKCAnswerKey(stim.correctResponse);
        responseKCMap[answerText] = stim.responseKC;
      }
    }

    deps.serverConsole('getResponseKCMapForTdf: Built map with', Object.keys(responseKCMap).length, 'entries');
    return responseKCMap;
  }

  async function getMaxResponseKC(){
    const responseKC = await deps.Tdfs.rawCollection().aggregate([
      {
        $addFields: {
          "maxResponseKC": {
            $max: "$stimuli.responseKC"
          }
        }
      },
      {
        $sort: {
          "maxResponseKC": -1
        }
      },
      {
        $limit: 1
      }]).toArray()
    return responseKC[0].maxResponseKC;
  }

  function getPackageUploadDeps(): ProcessPackageUploadDeps {
    return {
      DynamicAssets: deps.DynamicAssets,
      storageBoundary: deps.storageBoundary,
      userIsInRoleAsync: deps.userIsInRoleAsync,
      userCanManageTdf: deps.userCanManageTdf,
      normalizeCanonicalId: deps.normalizeCanonicalId,
      serverConsole: deps.serverConsole,
      encryptData: deps.encryptData,
      getApiKeyResolutionDeps: deps.getApiKeyResolutionDeps,
      legacyTrim: deps.legacyTrim,
      upsertPackage,
      updateStimDisplayTypeMap: deps.updateStimDisplayTypeMap,
      getStimuliSetIdByFilename: async (stimFileName) =>
        (await deps.getStimuliSetIdByFilename(stimFileName)) ?? undefined,
      saveMediaFile,
      toCanonicalDynamicAssetPath: deps.toCanonicalDynamicAssetPath,
      normalizeUploadedMediaLookupKey: deps.normalizeUploadedMediaLookupKey,
      getCurrentUser: deps.getCurrentUser,
      sendEmail: deps.sendEmail,
      ownerEmail: deps.ownerEmail,
      UserUploadQuota: deps.UserUploadQuota,
      AuditLog: deps.AuditLog,
      Tdfs: deps.Tdfs,
      TdfMutationJobs: deps.TdfMutationJobs,
      getResponseKCMapForTdf,
      processAudioFilesForTDF: deps.processAudioFilesForTDF,
      canonicalizeStimDisplayMediaRefs: deps.canonicalizeStimDisplayMediaRefs,
      getNewItemFormat: deps.getNewItemFormat,
      canonicalizeFlatStimuliMediaRefs: deps.canonicalizeFlatStimuliMediaRefs,
    };
  }

  async function processPackageUpload(
    this: MethodContext,
    fileObjOrId: string | DynamicAssetLike,
    _owner: string,
    _zipLink: string,
    emailToggle: boolean,
    integrity?: PackageUploadIntegrity,
    identityMode: 'preserve' | 'copy' = 'preserve'
  ){
    const actingUserId = deps.normalizeCanonicalId(this.userId);
    if (!actingUserId) {
      throw new Meteor.Error(401, 'Must be logged in');
    }
    await requireContentCreatorDisplayName(deps.usersCollection, actingUserId);
    if (identityMode !== 'preserve' && identityMode !== 'copy') {
      throw new Meteor.Error('invalid-package-identity-mode', 'Package identity mode must be preserve or copy.');
    }
    return processPackageUploadWorkflow(
      this,
      fileObjOrId,
      actingUserId,
      emailToggle,
      getPackageUploadDeps(),
      integrity,
      { identityMode }
    );
  }

  async function confirmPackageUpload(
    this: MethodContext,
    uploadPlanId: string,
    emailToggle: boolean = false,
    integrity?: PackageUploadIntegrity
  ) {
    const actingUserId = deps.normalizeCanonicalId(this.userId);
    if (!actingUserId) throw new Meteor.Error(401, 'Must be logged in');
    check(uploadPlanId, String);
    const job = await deps.TdfMutationJobs.findOneAsync({ _id: uploadPlanId, kind: 'package-upload' });
    if (!job || job.actorUserId !== actingUserId) {
      throw new Meteor.Error(404, 'Upload plan unavailable');
    }
    if (job.status === 'complete') {
      return job.terminalResult;
    }
    if (job.status !== 'awaiting-confirmation') {
      throw new Meteor.Error('upload-plan-unavailable', 'This upload plan can no longer be confirmed.');
    }
    if (!(job.confirmationExpiresAt instanceof Date) || job.confirmationExpiresAt.getTime() <= Date.now()) {
      await deps.TdfMutationJobs.updateAsync(
        { _id: uploadPlanId, status: 'awaiting-confirmation' },
        { $set: { status: 'expired', updatedAt: new Date() } },
      );
      throw new Meteor.Error('upload-plan-expired', 'This upload confirmation expired. Upload the package again.');
    }
    await requireContentCreatorDisplayName(deps.usersCollection, actingUserId);
    const claimed = await deps.TdfMutationJobs.updateAsync(
      { _id: uploadPlanId, actorUserId: actingUserId, status: 'awaiting-confirmation' },
      { $set: { status: 'committing', updatedAt: new Date() }, $unset: { cleanupAt: '', confirmationExpiresAt: '' } },
    );
    if (claimed !== 1) {
      throw new Meteor.Error('upload-plan-conflict', 'This upload plan is already being processed.');
    }
    try {
      const result = await processPackageUploadWorkflow(
        this,
        job.packageAssetId,
        actingUserId,
        emailToggle,
        getPackageUploadDeps(),
        integrity,
        {
          confirmedIdentityFingerprint: job.identityFingerprint,
          expectedArchiveSha256: job.archiveSha256,
          mutationJobId: uploadPlanId,
          identityMode: job.identityMode === 'copy' ? 'copy' : 'preserve',
        }
      );
      await deps.TdfMutationJobs.updateAsync(
        { _id: uploadPlanId, actorUserId: actingUserId, status: 'committing' },
        { $set: { status: 'complete', terminalResult: result, updatedAt: new Date() } },
      );
      return result;
    } catch (error) {
      await deps.TdfMutationJobs.updateAsync(
        { _id: uploadPlanId, actorUserId: actingUserId, status: 'committing' },
        { $set: { status: 'failed', updatedAt: new Date() } },
      );
      throw error;
    }
  }

  async function cancelPackageUpload(this: MethodContext, uploadPlanId: string) {
    const actingUserId = deps.normalizeCanonicalId(this.userId);
    if (!actingUserId) throw new Meteor.Error(401, 'Must be logged in');
    check(uploadPlanId, String);
    const job = await deps.TdfMutationJobs.findOneAsync({
      _id: uploadPlanId,
      actorUserId: actingUserId,
      kind: 'package-upload',
      status: 'awaiting-confirmation',
    });
    if (!job) throw new Meteor.Error(404, 'Upload plan unavailable');
    const cancelled = await deps.TdfMutationJobs.updateAsync(
      { _id: uploadPlanId, actorUserId: actingUserId, kind: 'package-upload', status: 'awaiting-confirmation' },
      { $set: { status: 'cancelled', updatedAt: new Date() } },
    );
    if (cancelled !== 1) {
      throw new Meteor.Error(404, 'Upload plan unavailable');
    }
    if (job?.packageAssetId) {
      await deps.DynamicAssets.removeAsync({ _id: job.packageAssetId });
    }
    return { status: 'cancelled' };
  }

  async function saveMediaFile(
    media: UploadedPackageFile,
    owner: string,
    stimSetId: string | number | null | undefined,
    options: { mutationJobId?: string | null } = {},
  ){
    deps.serverConsole("Uploading:", media.name);
    const scopedQuery: Record<string, unknown> = { name: media.name };
    if (stimSetId !== undefined && stimSetId !== null) {
      scopedQuery['meta.stimuliSetId'] = stimSetId;
    } else {
      scopedQuery.userId = owner;
    }
    const existingFiles = await deps.DynamicAssets.find(scopedQuery).fetchAsync();
    const stagedPreviousAssets: Array<{
      _id: string;
      name?: string;
      fileName?: string;
      meta?: Record<string, unknown>;
    }> = [];
    if (existingFiles.length > 0 && options.mutationJobId) {
      if (typeof deps.DynamicAssets.collection?.updateAsync !== 'function') {
        throw new Error('Package media replacement requires DynamicAssets.collection.updateAsync');
      }
      for (const existing of existingFiles) {
        stagedPreviousAssets.push({
          _id: String(existing._id),
          name: existing.name,
          fileName: existing.fileName,
          meta: existing.meta,
        });
      }
      const plannedJournaled = await deps.TdfMutationJobs.updateAsync(
        { _id: options.mutationJobId, status: 'committing' },
        {
          $push: { mediaMutations: { newAssetId: '', previousAssets: stagedPreviousAssets } },
          $set: { updatedAt: new Date() },
        },
      );
      if (plannedJournaled !== 1) throw new Error('Package media replacement could not be planned');
      for (const existing of existingFiles) {
        const backupName = `${media.name}.mofacts-backup-${options.mutationJobId}-${existing._id}`;
        await deps.DynamicAssets.collection.updateAsync(
          { _id: existing._id },
          {
            $set: {
              name: backupName,
              fileName: backupName,
              'meta.mutationBackupFor': options.mutationJobId,
            },
          },
        );
      }
    } else if (existingFiles.length > 0) {
      for (const existing of existingFiles) {
        await deps.DynamicAssets.removeAsync({_id: existing._id});
      }
      deps.serverConsole(`File ${media.name} already exists in scope, overwritting ${existingFiles.length} record(s).`);
    } else {
      deps.serverConsole(`File ${media.name} doesn't exist, uploading`)
    }

    const mimeType = deps.getMimeTypeForAssetName(media.name);
    let writtenAssetId = '';

    try {
      const fileRef = await deps.DynamicAssets.writeAsync(media.contents, {
        fileName: media.name,
        userId: owner,
        type: mimeType,
        meta: {
          stimuliSetId: stimSetId,
          public: true,
          ...(options.mutationJobId ? { mutationJobId: options.mutationJobId } : {}),
        }
      });
      writtenAssetId = fileRef?._id ? String(fileRef._id) : '';
      if (deps.storageBoundary.backend === 's3') {
        if (!fileRef?._id) {
          throw new Error(`S3 storage requires DynamicAssets.writeAsync to return an asset id for ${media.name}`);
        }
        const storageKey = `dynamic-assets/${fileRef._id}/${media.name}`;
        await deps.storageBoundary.putObject(storageKey, media.contents as Buffer, mimeType);
        if (typeof deps.DynamicAssets.collection?.updateAsync !== 'function') {
          throw new Error('S3 storage requires DynamicAssets.collection.updateAsync');
        }
        await deps.DynamicAssets.collection.updateAsync(
          { _id: fileRef._id },
          {
            $set: {
              'meta.storageBackend': 's3',
              'meta.storageKey': storageKey,
            }
          }
        );
        fileRef.meta = {
          ...(fileRef.meta || {}),
          storageBackend: 's3',
          storageKey,
        };
      }

      deps.serverConsole(`File ${media.name} uploaded successfully`);
      if (options.mutationJobId && fileRef?._id) {
        fileRef.replacement = {
          newAssetId: String(fileRef._id),
          previousAssets: stagedPreviousAssets,
        };
        const journaled = await deps.TdfMutationJobs.updateAsync(
          { _id: options.mutationJobId, status: 'committing' },
          { $push: { mediaMutations: fileRef.replacement }, $set: { updatedAt: new Date() } },
        );
        if (journaled !== 1) throw new Error('Package media replacement could not be journaled');
      }
      return fileRef;
    } catch (error: unknown) {
      if (writtenAssetId) await deps.DynamicAssets.removeAsync({ _id: writtenAssetId });
      for (const previousAsset of stagedPreviousAssets) {
        await deps.DynamicAssets.collection?.updateAsync?.(
          { _id: previousAsset._id },
          { $set: { name: previousAsset.name, fileName: previousAsset.fileName, meta: previousAsset.meta || {} } },
        );
      }
      deps.serverConsole(`File ${media.name} could not be uploaded`, error);
      throw error;
    }
  }

  async function repairAiGeneratedPackageMedia(this: MethodContext, tdfIdValue: string) {
    check(tdfIdValue, String);
    const actingUserId = deps.normalizeCanonicalId(this.userId);
    const tdfId = deps.normalizeCanonicalId(tdfIdValue);
    if (!actingUserId || !tdfId) throw new Meteor.Error(401, 'Must be logged in to repair generated content');
    const tdf = await deps.Tdfs.findOneAsync({ _id: tdfId });
    if (!tdf) throw new Meteor.Error(404, 'Generated content system not found');
    if (!(await deps.userCanManageTdf(actingUserId, tdf))) {
      throw new Meteor.Error(403, 'Can only repair generated content you can manage');
    }
    const stimuliSetId = tdf.stimuliSetId;
    if (stimuliSetId === undefined || stimuliSetId === null) {
      throw new Meteor.Error('ai-content-repair-invalid', 'Generated content has no stimulus-set scope.');
    }
    const rawStimuli = JSON.parse(JSON.stringify(tdf.rawStimuliFile || {}));
    const unresolvedNames = new Set<string>();
    const clusters = Array.isArray(rawStimuli?.setspec?.clusters) ? rawStimuli.setspec.clusters : [];
    for (const cluster of clusters) {
      for (const stim of Array.isArray(cluster?.stims) ? cluster.stims : []) {
        for (const field of ['imgSrc', 'audioSrc', 'videoSrc']) {
          const reference = String(stim?.display?.[field] || '').trim();
          if (!reference || /^(https?:|data:|blob:|\/\/)/i.test(reference)) continue;
          if (!deps.parseLocalMediaReference(reference).assetId) unresolvedNames.add(reference.replace(/^.*[\\/]/, ''));
        }
      }
    }
    if (unresolvedNames.size === 0) return { repaired: false, mediaCount: 0 };

    const packageAssetId = deps.normalizeCanonicalId(tdf.packageAssetId);
    if (!packageAssetId) throw new Meteor.Error('ai-content-repair-invalid', 'Generated content has no retained package asset.');
    const packageAsset = await deps.DynamicAssets.findOneAsync({ _id: packageAssetId });
    if (!packageAsset?.path) throw new Meteor.Error('ai-content-repair-invalid', 'Retained generated package asset was not found.');
    const packageFile = `${packageAssetId}.${packageAsset.ext || 'zip'}`;
    const parsedFiles = await parsePackageZip(packageAsset.path, packageFile, deps.serverConsole);
    const tdfFileName = String(tdf.tdfFileName || tdf.content?.fileName || '').trim();
    if (!parsedFiles.some((file) => file.type === 'tdf' && file.name === tdfFileName)) {
      throw new Meteor.Error('ai-content-repair-mismatch', 'Retained package does not contain the selected content system.');
    }
    const mediaByName = new Map(parsedFiles.filter((file) => file.type === 'media').map((file) => [file.name, file]));
    const missingNames = Array.from(unresolvedNames).filter((name) => !mediaByName.has(name));
    if (missingNames.length > 0) {
      throw new Meteor.Error('ai-content-repair-mismatch', `Retained package is missing referenced media: ${missingNames.join(', ')}`);
    }
    const pathMaps = await uploadPackageMedia({
      mediaFiles: Array.from(unresolvedNames).map((name) => mediaByName.get(name)!),
      uploadStimSetIds: new Set([stimuliSetId]),
      fallbackStimSetId: stimuliSetId,
      owner: tdf.ownerId || actingUserId,
      saveMediaFile,
      toCanonicalDynamicAssetPath: deps.toCanonicalDynamicAssetPath,
      normalizeUploadedMediaLookupKey: deps.normalizeUploadedMediaLookupKey,
      serverConsole: deps.serverConsole,
    });
    const uploadedMediaPathMap = pathMaps.get(String(stimuliSetId).trim());
    await deps.canonicalizeStimDisplayMediaRefs(rawStimuli, stimuliSetId, {
      rejectUnresolved: true,
      allowFilenameLookup: false,
      uploadedMediaPathMap,
      requireUploadedMediaMatch: true,
    });
    const responseKCMap = await getResponseKCMapForTdf(tdfId);
    const stimulusFileName = String(tdf.stimulusFileName || tdf.content?.tdfs?.tutor?.setspec?.stimulusfile || 'unknown');
    const canonicalStimuli = deps.getNewItemFormat({
      fileName: stimulusFileName,
      stimuli: rawStimuli,
      owner: tdf.ownerId,
      source: 'upload',
    }, stimulusFileName, stimuliSetId, responseKCMap);
    await deps.canonicalizeFlatStimuliMediaRefs(canonicalStimuli, stimuliSetId, {
      rejectUnresolved: true,
      allowFilenameLookup: false,
      uploadedMediaPathMap,
      requireUploadedMediaMatch: true,
    });
    await deps.Tdfs.updateAsync(
      { _id: tdfId },
      { $set: { rawStimuliFile: rawStimuli, stimuli: canonicalStimuli }, $inc: { tdfRevision: 1 } },
    );
    await deps.updateStimDisplayTypeMap([stimuliSetId]);
    return { repaired: true, mediaCount: unresolvedNames.size };
  }

  async function _validateStimAndTdf(tdfJson: unknown, stimJson: unknown, tdfFileName: string, stimFileName: string) {
    const stimDoc = stimJson as { setspec?: { clusters?: Array<{ stims?: Array<{ response?: { correctResponse?: unknown }; display?: Record<string, unknown> }> }> } } | null;
    const tdfDoc = tdfJson as { tutor?: { setspec?: { lessonname?: string; stimulusfile?: string }; unit?: unknown[]; unitTemplate?: unknown[] } };
    const scopedStimuliSetId = await deps.getStimuliSetIdByFilename(stimFileName);
    if (!stimDoc || !stimDoc.setspec || !Array.isArray(stimDoc.setspec.clusters)) {
      return { result: false, errmsg: `Stimulus file "${stimFileName}" missing clusters array.` };
    }
    const autoTutorValidation = validateAutoTutorContent({
      tdf: tdfJson,
      stimuli: stimJson,
    });
    if (!autoTutorValidation.valid) {
      return {
        result: false,
        errmsg: `Invalid AutoTutor content in TDF "${tdfFileName}": ${autoTutorValidation.errors.join('; ')}`,
      };
    }
    const clusters = stimDoc.setspec.clusters;
    if (!clusters.length) {
      return { result: false, errmsg: `Stimulus file "${stimFileName}" has no clusters.` };
    }
    for (const [clusterIdx, cluster] of clusters.entries()) {
      if (!cluster || !Array.isArray(cluster.stims) || !cluster.stims.length) {
        return { result: false, errmsg: `Cluster ${clusterIdx} in "${stimFileName}" missing or empty stims array.` };
      }
      const corrects = cluster.stims.map((s) => s.response && s.response.correctResponse).filter(Boolean);
      if (new Set(corrects).size !== corrects.length) {
        return { result: false, errmsg: `Duplicate correctResponse values in cluster ${clusterIdx} of "${stimFileName}".` };
      }
      for (const [stimIdx, stim] of cluster.stims.entries()) {
        if (!stim || typeof stim !== 'object') {
          return { result: false, errmsg: `Stim ${stimIdx} in cluster ${clusterIdx} is not an object.` };
        }
        const autoTutorOwnsResponse = Object.prototype.hasOwnProperty.call(stim, 'autoTutor');
        if (!autoTutorOwnsResponse && (!stim.response || typeof stim.response !== 'object' || !Object.prototype.hasOwnProperty.call(stim.response, 'correctResponse'))) {
          return { result: false, errmsg: `Stim ${stimIdx} in cluster ${clusterIdx} missing correctResponse.` };
        }
        if (stim.display) {
          const display = stim.display as Record<string, unknown>;
          ['text', 'audioSrc', 'imgSrc', 'videoSrc'].forEach((field: string) => {
            if (display[field] && typeof display[field] !== 'string') {
              return { result: false, errmsg: `Stim ${stimIdx} in cluster ${clusterIdx} has non-string display.${field}.` };
            }
          });
          for (const field of ['audioSrc', 'imgSrc', 'videoSrc']) {
            if (display[field]) {
              const url = display[field];
              if (typeof url !== 'string') {
                return { result: false, errmsg: `Stim ${stimIdx} in cluster ${clusterIdx} has non-string display.${field}.` };
              }
              const trimmedUrl = url.trim();
              if (/^(https?:|data:|blob:|\/\/)/i.test(trimmedUrl)) {
                continue;
              }
              const parsedRef = deps.parseLocalMediaReference(trimmedUrl);
              if (!parsedRef.assetId) {
                return { result: false, errmsg: `Stim ${stimIdx} in cluster ${clusterIdx} has non-canonical display.${field}: ${url}. Use canonical asset path or external URL.` };
              }
              const asset = await deps.findDynamicAssetScoped({
                assetId: parsedRef.assetId,
                stimuliSetId: scopedStimuliSetId ?? null
              });
              if (!asset) {
                return { result: false, errmsg: `Stim ${stimIdx} in cluster ${clusterIdx} has unresolved display.${field}: ${url}.` };
              }
            }
          }
        }
      }
    }
    if (!tdfDoc.tutor || !tdfDoc.tutor.setspec) {
      return { result: false, errmsg: `TDF "${tdfFileName}" missing tutor.setspec.` };
    }
    if (!tdfDoc.tutor.setspec.lessonname || typeof tdfDoc.tutor.setspec.lessonname !== 'string') {
      return { result: false, errmsg: `TDF "${tdfFileName}" missing or invalid lessonname.` };
    }
    if (!tdfDoc.tutor.setspec.stimulusfile || typeof tdfDoc.tutor.setspec.stimulusfile !== 'string') {
      return { result: false, errmsg: `TDF "${tdfFileName}" missing or invalid stimulusfile.` };
    }

    function extractClusterIndicesFromTDF(tdf: { tutor?: { unit?: unknown[]; unitTemplate?: unknown[] } }): number[] {
      const indices = new Set<number>();
      const units = [
        ...((tdf.tutor?.unit || []) as Array<{ clusterIndex?: unknown; assessmentsession?: { clusterlist?: string }; autotutorsession?: { cluster?: unknown } }>),
        ...((tdf.tutor?.unitTemplate || []) as Array<{ clusterIndex?: unknown; assessmentsession?: { clusterlist?: string }; autotutorsession?: { cluster?: unknown } }>)
      ];
      for (const [_unitIdx, unit] of units.entries()) {
        if (Object.prototype.hasOwnProperty.call(unit, 'clusterIndex')) {
          indices.add(Number(unit.clusterIndex));
        }
        if (unit.autotutorsession && Object.prototype.hasOwnProperty.call(unit.autotutorsession, 'cluster')) {
          indices.add(Number(unit.autotutorsession.cluster));
        }
        if (unit.assessmentsession && unit.assessmentsession.clusterlist) {
          const cl = unit.assessmentsession.clusterlist;
          if (typeof cl === "string") {
            cl.split(',').forEach((part: string) => {
              if (part.includes('-')) {
                const rangeParts = part.split('-').map(Number);
                const start = rangeParts[0];
                const end = rangeParts[1];
                if (typeof start === 'number' && typeof end === 'number' && Number.isFinite(start) && Number.isFinite(end)) {
                  for (let i = start; i <= end; i++) {
                    indices.add(i);
                  }
                }
              } else {
                indices.add(Number(part));
              }
            });
          }
        }
      }
      return Array.from(indices);
    }
    const tdfClusterRefs = extractClusterIndicesFromTDF(tdfDoc);
    for (const idx of tdfClusterRefs) {
      if (isNaN(idx) || idx < 0 || idx >= clusters.length) {
        return { result: false, errmsg: `TDF "${tdfFileName}" references cluster index ${idx}, but stimulus file "${stimFileName}" only has ${clusters.length} clusters.` };
      }
    }
    return { result: true };
  }

  async function upsertStimFile(stimulusFileName: string, stimJSON: unknown, ownerId: string, packagePath: string | null = null) {
    const formattedStims: unknown[] = [];

    if(packagePath){
      packagePath = packagePath.split('/')[0] ?? null;
    }
    const existingTdf = await deps.Tdfs.findOneAsync({"content.tdfs.tutor.setspec.stimulusfile": stimulusFileName});
    const responseKCMap = existingTdf?._id ? await getResponseKCMapForTdf(existingTdf._id) : {};
    let stimuliSetId = existingTdf?.stimuliSetId
    if (!stimuliSetId) {
      stimuliSetId = deps.allocateNextStimuliSetId();
    }
    deps.serverConsole('getAssociatedStimSetIdForStimFile', stimulusFileName, stimuliSetId);

    const oldStimFormat = {
      'fileName': stimulusFileName,
      'stimuli': stimJSON,
      'owner': ownerId,
      'source': 'repo',
    };
    const newStims = deps.getNewItemFormat(oldStimFormat, stimulusFileName, stimuliSetId, responseKCMap);
    let maxStimulusKC = 0;
    deps.serverConsole('newStims count:', newStims.length);
    for (const stim of newStims) {
      if(stim.stimulusKC > maxStimulusKC){
        maxStimulusKC = stim.stimulusKC;
      }
      formattedStims.push(stim);
    }
    await deps.Tdfs.updateAsync(
      { "content.tdfs.tutor.setspec.stimulusfile": stimulusFileName },
      {
        $set: {
          stimulusFileName,
          stimuliSetId,
          rawStimuliFile: stimJSON,
          stimuli: formattedStims,
        },
        $inc: { tdfRevision: 1 },
      },
      { multi: true },
    );

    return stimuliSetId
  }

  async function enforceConditionChildUserSelect(conditionTdfIds: Array<string | null>) {
    const validIds = [...new Set(conditionTdfIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
    if (validIds.length > 0) {
      await deps.Tdfs.updateAsync(
        { _id: { $in: validIds } },
        {
          $set: { 'content.tdfs.tutor.setspec.userselect': 'false' },
          $inc: { tdfRevision: 1 },
        },
        { multi: true },
      );
    }
  }

  function normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  async function upsertPackage(packageJSON: PackagePayload, ownerId: string): Promise<UpsertResult> {
    deps.serverConsole('upsertPackage', packageJSON.packageFile || 'unknown');
    const tdfId = deps.normalizeCanonicalId(packageJSON.tdfId);
    if (!tdfId) {
      throw new Meteor.Error(500, 'TDF id missing after package identity preflight');
    }
    const stimulusFileName = packageJSON.stimFileName
    const stimJSON = packageJSON.stimuli
    const packageFile = packageJSON.packageFile
    const packageAssetId = deps.normalizeCanonicalId(packageJSON.packageAssetId);
    if (!packageAssetId) {
      throw new Meteor.Error(500, 'Package asset id missing during package upsert');
    }
    const Tdf = packageJSON.tdfs;
    assertValidTdfExpressions(Tdf, `${packageJSON.fileName}.tdfs.tutor`);
    const lessonName = deps.legacyTrim(Tdf.tutor.setspec.lessonname);
    const prev = await deps.Tdfs.findOneAsync({ _id: tdfId });
    if (prev?._id && !(await deps.userCanManageTdf(ownerId, prev))) {
      return {
        result: false,
        errmsg: `TDF id "${tdfId}" belongs to content this account cannot manage.`
      };
    }
    const responseKCMap = prev?._id ? await getResponseKCMapForTdf(prev._id) : {};
    let stimuliSetId = prev ? prev.stimuliSetId : null;
    if (!stimuliSetId) {
      stimuliSetId = deps.allocateNextStimuliSetId();
    }
    if (lessonName.length < 1) {
      return { result: false, errmsg: 'TDF has no lessonname - it cannot be valid' };
    }
    const tips = Tdf.tutor.setspec.tips;
    const newFormatttedTips: string[] = [];
    if(tips){
      for(const tip of tips){
        if(tip.split('<img').length > 1){
          const imgSection = tip.split('<img')[1];
          const srcSection = imgSection?.split('src="')[1];
          const imageName = srcSection?.split('"')[0];
          if (!imageName) {
            continue;
          }
          const image = await deps.DynamicAssets.findOneAsync({userId: ownerId, name: imageName});
          if(image){
            const imageLink = image.link();
            newFormatttedTips.push(tip.replace(imageName, imageLink));
            deps.serverConsole('imageLink', imageLink);
          }
        }
      }
    }
    if(newFormatttedTips.length > 0){
      Tdf.tutor.setspec.tips = newFormatttedTips;
    }
    Tdf.tutor.setspec.conditionTdfIds = Array.isArray(packageJSON.conditionTdfIds)
      ? packageJSON.conditionTdfIds
      : [];
    const persistedOwnerId = typeof prev?.ownerId === 'string' && prev.ownerId.trim()
      ? prev.ownerId
      : ownerId;
    const tdfJSON: TdfPayload = {
      fileName: packageJSON.fileName,
      tdfs: Tdf,
      ownerId: persistedOwnerId,
      source: 'upload',
      ...(prev?.content?.createdAt ? { createdAt: prev.content.createdAt } : {}),
    };
    const formattedStims: unknown[] = [];
    deps.serverConsole('getAssociatedStimSetIdForStimFile', stimulusFileName, stimuliSetId);
    const oldStimFormat = {
      'fileName': stimulusFileName,
      'stimuli': stimJSON,
      'owner': ownerId,
      'source': 'repo',
    };
    const newStims = deps.getNewItemFormat(oldStimFormat, stimulusFileName, stimuliSetId, responseKCMap);
    let maxStimulusKC = 0;

    for (const stim of newStims) {
      if(stim.stimulusKC > maxStimulusKC){
        maxStimulusKC = stim.stimulusKC;
      }
      formattedStims.push(stim);
    }

    const tdfJSONtoUpsert = tdfJSON;
    if (!prev) {
      tdfJSON.createdAt = new Date();
    }
    const nextConditionIds = Tdf.tutor.setspec.conditionTdfIds ?? [];
    const conditionCounts = reconcileConditionCountsByChildId(
      prev?.content?.tdfs?.tutor?.setspec?.conditionTdfIds,
      prev?.conditionCounts,
      nextConditionIds.filter((id): id is string => typeof id === 'string'),
    );

    const setFields: UnknownRecord = {
      tdfFileName: packageJSON.fileName,
      content: tdfJSONtoUpsert,
      ownerId: persistedOwnerId,
      packageFile: packageFile,
      packageAssetId: packageAssetId,
      rawStimuliFile: stimJSON,
      stimuli: formattedStims,
      stimuliSetId: stimuliSetId,
      tdfAvailability: 'available',
    };
    setFields.conditionCounts = conditionCounts;
    if (prev) {
      const revisionSelector = packageJSON.expectedRevision === 0
        ? { _id: tdfId, $or: [{ tdfRevision: 0 }, { tdfRevision: { $exists: false } }] }
        : { _id: tdfId, tdfRevision: packageJSON.expectedRevision };
      const updated = await deps.Tdfs.updateAsync(revisionSelector, {
        $set: setFields,
        $inc: { tdfRevision: 1 },
      });
      if (updated !== 1) {
        throw new Meteor.Error('tdf-revision-conflict', `TDF "${tdfId}" changed after package preflight.`);
      }
    } else {
      await deps.Tdfs.insertAsync({
        _id: tdfId,
        ...setFields,
        tdfRevision: 1,
      });
    }
    await enforceConditionChildUserSelect(Tdf.tutor.setspec.conditionTdfIds ?? []);

    return { res: 'upserted', stimuliSetId: stimuliSetId, tdfId }
  }

  async function importPrivateRepoTdfBatch(records: PrivateRepoTdfRecord[], ownerId: string) {
    if (!Array.isArray(records) || records.length === 0) return [];
    const sourceKeys = records.map((record) => record.sourceKey.trim());
    if (sourceKeys.some((key) => !key) || new Set(sourceKeys).size !== sourceKeys.length) {
      throw new Meteor.Error('invalid-private-repo-batch', 'Private repository source keys must be non-empty and unique.');
    }
    const existing = await deps.Tdfs.find({
      'sourceIdentity.kind': 'private-repo',
      'sourceIdentity.key': { $in: sourceKeys },
    }).fetchAsync();
    const existingByKey = new Map<string, any>(
      existing.map((tdf: any) => [String(tdf?.sourceIdentity?.key || ''), tdf] as const),
    );
    const crypto = Npm.require('crypto');
    const entries = records.map((record) => {
      assertValidTdfExpressions(record.tdfs, `${record.sourceFileName}.tdfs.tutor`);
      const previous = existingByKey.get(record.sourceKey);
      return {
        record,
        previous,
        tdfId: previous?._id || `tdf_${crypto.randomBytes(12).toString('hex')}`,
      };
    });
    const entryBySourceName = new Map(entries.map((entry) => [entry.record.sourceFileName, entry]));
    const entryByFinalName = new Map(entries.map((entry) => [entry.record.fileName, entry]));
    for (const entry of entries) {
      const setspec = entry.record.tdfs.tutor.setspec;
      const conditions = Array.isArray(setspec.condition) ? setspec.condition : [];
      if (conditions.length > 0) {
        const children = conditions.map((fileName) => entryBySourceName.get(fileName) || entryByFinalName.get(fileName));
        if (children.some((child) => !child)) {
          throw new Meteor.Error('invalid-private-repo-family', `Private repository root ${entry.record.sourceFileName} references a child outside its batch.`);
        }
        setspec.condition = children.map((child) => child!.record.fileName);
        setspec.conditionTdfIds = children.map((child) => child!.tdfId);
        const previousIds = entry.previous?.content?.tdfs?.tutor?.setspec?.conditionTdfIds;
        if (Array.isArray(previousIds) && previousIds.some((id: unknown) => typeof id === 'string' && !setspec.conditionTdfIds!.includes(id))) {
          throw new Meteor.Error('condition-removal-forbidden', `Private repository root ${entry.record.sourceFileName} cannot remove an established child.`);
        }
        delete entry.record.tdfs.tutor.unit;
      } else {
        delete setspec.conditionTdfIds;
      }
      const validation = validateConditionFamilyTutor(entry.record.tdfs.tutor, { requireCanonicalIds: true });
      if (validation.errors.length > 0) {
        throw new Meteor.Error('invalid-private-repo-tdf', `${entry.record.sourceFileName}: ${validation.errors.join('; ')}`);
      }
    }

    const results = [];
    for (const entry of entries) {
      const previousRevision = Number.isInteger(entry.previous?.tdfRevision) ? entry.previous.tdfRevision : 0;
      const stimuliSetId = entry.previous?.stimuliSetId
        ?? await deps.getStimuliSetIdByFilename(String(entry.record.tdfs.tutor.setspec.stimulusfile || ''))
        ?? deps.allocateNextStimuliSetId();
      const conditionIds = entry.record.tdfs.tutor.setspec.conditionTdfIds?.filter((id): id is string => typeof id === 'string') || [];
      const fields = {
        ownerId,
        sourceIdentity: { kind: 'private-repo', key: entry.record.sourceKey },
        stimuliSetId,
        content: {
          fileName: entry.record.fileName,
          ownerId,
          source: 'repo',
          tdfs: entry.record.tdfs,
          ...(entry.previous?.content?.createdAt ? { createdAt: entry.previous.content.createdAt } : { createdAt: new Date() }),
        },
        conditionCounts: reconcileConditionCountsByChildId(
          entry.previous?.content?.tdfs?.tutor?.setspec?.conditionTdfIds,
          entry.previous?.conditionCounts,
          conditionIds,
        ),
        tdfIdentityState: { status: 'valid', checkedAt: new Date() },
        tdfAvailability: 'available',
      };
      if (entry.previous) {
        const selector = previousRevision === 0
          ? { _id: entry.tdfId, $or: [{ tdfRevision: 0 }, { tdfRevision: { $exists: false } }] }
          : { _id: entry.tdfId, tdfRevision: previousRevision };
        const updated = await deps.Tdfs.updateAsync(selector, { $set: fields, $inc: { tdfRevision: 1 } });
        if (updated !== 1) throw new Meteor.Error('tdf-revision-conflict', `Private repository TDF ${entry.record.sourceFileName} changed during import.`);
      } else {
        await deps.Tdfs.insertAsync({ _id: entry.tdfId, ...fields, tdfRevision: 1 });
      }
      results.push({ tdfId: entry.tdfId, stimuliSetId });
    }
    return results;
  }

  async function saveTdfStimuli(this: MethodContext, tdfId: string, updatedRawStimuliFile: UnknownRecord, filteredStimuli: unknown[] | null | undefined) {
    check(tdfId, String);
    check(updatedRawStimuliFile, Object);
    check(filteredStimuli, Match.OneOf(Array, null, undefined));
    assertNoH5PContent(updatedRawStimuliFile);
    assertNoH5PContent(filteredStimuli);

    const tdf = await deps.Tdfs.findOneAsync({_id: tdfId});
    if (!tdf) {
      throw new Meteor.Error('not-found', 'TDF not found');
    }

    const canManage = await deps.userCanManageTdf(this.userId || '', tdf);
    if (!canManage) {
      throw new Meteor.Error('not-authorized', 'You do not have permission to edit this content');
    }
    const autoTutorValidation = validateAutoTutorContent({
      tdf: tdf.content?.tdfs,
      stimuli: updatedRawStimuliFile,
    });
    if (!autoTutorValidation.valid) {
      throw new Meteor.Error('invalid-autotutor-content', autoTutorValidation.errors.join('; '));
    }

    const stimuliSetId = tdf.stimuliSetId;
    await deps.canonicalizeStimDisplayMediaRefs(updatedRawStimuliFile, stimuliSetId, {
      rejectUnresolved: true,
      allowFilenameLookup: true
    });

    let stimuliToSave = filteredStimuli;
    if (!stimuliToSave) {
      const stimulusFileName = tdf.stimulusFileName || tdf.content?.tdfs?.tutor?.setspec?.stimulusfile || 'unknown';
      const responseKCMap = await getResponseKCMapForTdf(tdfId);

      const oldStimFormat = {
        fileName: stimulusFileName,
        stimuli: updatedRawStimuliFile,
        owner: this.userId,
        source: 'editor'
      };

      stimuliToSave = deps.getNewItemFormat(oldStimFormat, stimulusFileName, stimuliSetId, responseKCMap);
      deps.serverConsole('saveTdfStimuli: Regenerated', stimuliToSave.length, 'stimuli from raw file');
    } else {
      await deps.canonicalizeFlatStimuliMediaRefs(stimuliToSave, stimuliSetId, {
        rejectUnresolved: true,
        allowFilenameLookup: true
      });
    }

    await deps.Tdfs.updateAsync({_id: tdfId}, {
      $set: {
        rawStimuliFile: updatedRawStimuliFile,
        stimuli: stimuliToSave
      },
      $inc: { tdfRevision: 1 },
    });

    await deps.updateStimDisplayTypeMap([stimuliSetId]);
    deps.serverConsole('saveTdfStimuli: Updated TDF', tdfId, 'with', stimuliToSave.length, 'stimuli');

    return { success: true, stimuliCount: stimuliToSave.length };
  }

  async function saveTdfContent(
    this: MethodContext,
    tdfId: string,
    tdfContent: { tdfs?: { tutor?: { setspec?: { lessonname?: string; speechAPIKey?: string; textToSpeechAPIKey?: string; openRouterApiKey?: string; condition?: string[]; conditionTdfIds?: Array<string | null>; [key: string]: unknown } } } } & UnknownRecord,
    apiKeyUpdates: { speechAPIKey?: boolean; textToSpeechAPIKey?: boolean; openRouterApiKey?: boolean } = {},
    removedTutorPaths: string[] = []
  ) {
    assertNoH5PContent(tdfContent);
    check(tdfId, String);
    check(tdfContent, Object);
    check(apiKeyUpdates, Object);
    check(removedTutorPaths, [String]);

    const tdf = await deps.Tdfs.findOneAsync({_id: tdfId});
    if (!tdf) {
      throw new Meteor.Error('not-found', 'TDF not found');
    }

    const canManage = await deps.userCanManageTdf(this.userId || '', tdf);
    if (!canManage) {
      throw new Meteor.Error('not-authorized', 'You do not have permission to edit this TDF');
    }

    if (!tdfContent.tdfs?.tutor?.setspec?.lessonname) {
      throw new Meteor.Error('invalid-tdf', 'TDF must have a lesson name');
    }

    const tdfContentToSave = mergeEditorContentPreservingSourceShape(tdf.content, tdfContent);
    try {
      assertValidTdfExpressions(tdfContentToSave, 'tdfs.tutor');
    } catch (error: unknown) {
      throw new Meteor.Error('invalid-tdf-expression', error instanceof Error ? error.message : String(error));
    }
    const tutorToSave = tdfContentToSave.tdfs?.tutor;
    if (tutorToSave) {
      for (const path of removedTutorPaths) {
        if (/^setspec\.(condition|conditionTdfIds)(?:\.|$)/.test(path)) {
          continue;
        }
        deleteEditorRelativePath(tutorToSave, path);
      }
    }
    const setspec = tdfContentToSave.tdfs?.tutor?.setspec;
    if (setspec) {
      const persistedSetspec = tdf.content?.tdfs?.tutor?.setspec;
      if (Array.isArray(persistedSetspec?.condition)) {
        setspec.condition = [...persistedSetspec.condition];
      } else {
        delete setspec.condition;
      }
      if (Array.isArray(persistedSetspec?.conditionTdfIds)) {
        setspec.conditionTdfIds = [...persistedSetspec.conditionTdfIds];
      } else {
        delete setspec.conditionTdfIds;
      }
      if (apiKeyUpdates.speechAPIKey && setspec.speechAPIKey) {
        setspec.speechAPIKey = validateAndEncryptUploadedApiKey({
          encryptData: deps.encryptData,
          field: 'speechAPIKey',
          value: setspec.speechAPIKey,
        });
        deps.serverConsole('saveTdfContent: Encrypted new speechAPIKey');
      }
      if (apiKeyUpdates.textToSpeechAPIKey && setspec.textToSpeechAPIKey) {
        setspec.textToSpeechAPIKey = validateAndEncryptUploadedApiKey({
          encryptData: deps.encryptData,
          field: 'textToSpeechAPIKey',
          value: setspec.textToSpeechAPIKey,
        });
        deps.serverConsole('saveTdfContent: Encrypted new textToSpeechAPIKey');
      }
      if (apiKeyUpdates.openRouterApiKey && setspec.openRouterApiKey) {
        setspec.openRouterApiKey = validateAndEncryptUploadedApiKey({
          encryptData: deps.encryptData,
          field: 'openRouterApiKey',
          value: setspec.openRouterApiKey,
        });
        deps.serverConsole('saveTdfContent: Encrypted new openRouterApiKey');
      }
    }
    const familyValidation = validateConditionFamilyTutor(tdfContentToSave.tdfs?.tutor, {
      requireCanonicalIds: true,
    });
    if (familyValidation.errors.length > 0) {
      throw new Meteor.Error('invalid-tdf-identity', familyValidation.errors.join('; '));
    }
    const autoTutorValidation = validateAutoTutorContent({
      tdf: tdfContentToSave.tdfs,
      stimuli: tdf.rawStimuliFile,
    });
    if (!autoTutorValidation.valid) {
      throw new Meteor.Error('invalid-autotutor-content', autoTutorValidation.errors.join('; '));
    }
    const tutor = tdfContentToSave.tdfs?.tutor as { unit?: Array<{ unitinstructions?: string }> } | undefined;
    if (tutor?.unit && Array.isArray(tutor.unit)) {
      await deps.processAudioFilesForTDF({ tutor: { unit: tutor.unit } }, tdf.stimuliSetId, {
        rejectUnresolved: true,
        allowFilenameLookup: true
      });
    }

    await deps.Tdfs.updateAsync({_id: tdfId}, {
      $set: {
        content: tdfContentToSave
      },
      $inc: { tdfRevision: 1 },
    });

    deps.serverConsole('saveTdfContent: Updated TDF', tdfId, 'lesson:', tdfContentToSave.tdfs?.tutor?.setspec?.lessonname || '');

    return { success: true };
  }

  function escapeRegex(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async function copyTdf(this: MethodContext, sourceTdfId: string) {
    check(sourceTdfId, String);

    const userId = this.userId;
    if (!userId) throw new Meteor.Error('not-authorized', 'Must be logged in to copy TDF');
    await requireContentCreatorDisplayName(deps.usersCollection, userId);

    const sourceTdf = await deps.Tdfs.findOneAsync({_id: sourceTdfId});
    if (!sourceTdf) throw new Meteor.Error('not-found', 'TDF not found');

    const isOwner = sourceTdf.ownerId === userId;
    const isAdmin = await deps.userIsInRoleAsync(userId, ['admin']);
    const isAccessor = sourceTdf.accessors?.some((a: { userId?: string }) => a.userId === userId);
    if (!isOwner && !isAdmin && !isAccessor) {
      throw new Meteor.Error('not-authorized', 'You do not have access to this TDF');
    }

    const baseName = sourceTdf.content?.tdfs?.tutor?.setspec?.lessonname || 'Untitled';
    const copyPattern = new RegExp(`^${escapeRegex(baseName)} \\((\\d+)\\)$`);
    const existingTdfs = await deps.Tdfs.find(
      { 'content.tdfs.tutor.setspec.lessonname': copyPattern },
      { fields: { 'content.tdfs.tutor.setspec.lessonname': 1 } }
    ).fetchAsync();

    let nextNum = 1;
    existingTdfs.forEach((tdf: { content?: { tdfs?: { tutor?: { setspec?: { lessonname?: string } } } } }) => {
      const tdfName = tdf.content?.tdfs?.tutor?.setspec?.lessonname || '';
      const match = tdfName.match(copyPattern);
      if (match) {
        nextNum = Math.max(nextNum, parseInt(match[1] || '0') + 1);
      }
    });

    const newName = `${baseName} (${nextNum})`;

    const newTdf = JSON.parse(JSON.stringify(sourceTdf));
    delete newTdf._id;
    newTdf.ownerId = userId;
    newTdf.accessors = [];

    const originalFileName = newTdf.content?.fileName || 'unknown.xml';
    const fileExt = originalFileName.includes('.') ? originalFileName.slice(originalFileName.lastIndexOf('.')) : '.xml';
    const fileBase = originalFileName.includes('.') ? originalFileName.slice(0, originalFileName.lastIndexOf('.')) : originalFileName;
    const newFileName = `${fileBase}_copy_${nextNum}${fileExt}`;
    if (newTdf.content) {
      newTdf.content.fileName = newFileName;
    }

    if (newTdf.content?.tdfs?.tutor?.setspec) {
      newTdf.content.tdfs.tutor.setspec.lessonname = newName;
      newTdf.content.tdfs.tutor.setspec.userselect = 'false';
    }
    delete newTdf.sourceIdentity;
    newTdf.tdfRevision = 1;

    const newId = await deps.Tdfs.insertAsync(newTdf);
    deps.serverConsole('copyTdf: Created copy', newId, 'of TDF', sourceTdfId, 'with name', newName);

    return { newTdfId: newId, newName };
  }

  const generatedContentMethods = createPackageGeneratedContentMethods(deps, {
    requireCreatorDisplayName: (userId) => requireContentCreatorDisplayName(deps.usersCollection, userId),
    ingestGeneratedPackage: async ({
      actingUserId,
      packageAsset,
      packageAssetId,
      uploadIntegrity,
      contract,
      creationSummary,
    }) => {
      let prepared: ReturnType<typeof prepareAiGeneratedPackage> | null = null;
      let mayRollbackNewTdf = false;
      let savedTdfId = '';
      try {
        const ingestion = await processPackageUploadWorkflow(
          { userId: actingUserId },
          packageAsset,
          actingUserId,
          false,
          getPackageUploadDeps(),
          uploadIntegrity as PackageUploadIntegrity,
          {
            requireAllContentResults: true,
            prepareParsedPackage: async ({ unzippedFiles, isTeacherOrAdmin }) => {
              prepared = prepareAiGeneratedPackage(unzippedFiles, contract, isTeacherOrAdmin);
              mayRollbackNewTdf = true;
            },
          },
        );
        if (!ingestion) throw new Meteor.Error('generated-package-save-failed', 'Generated package ingestion did not complete.');
        if (!('results' in ingestion) || !Array.isArray(ingestion.results)) {
          throw new Meteor.Error('generated-package-save-failed', 'Generated package ingestion unexpectedly required confirmation.');
        }
        const failedResult = ingestion.results.find((result) => !result.result);
        if (failedResult) {
          throw new Meteor.Error('generated-package-save-failed', failedResult.errmsg || 'Generated package save failed');
        }
        if (!prepared) throw new Meteor.Error('generated-package-save-failed', 'Generated package was not validated.');
        const preparedPackage = prepared as ReturnType<typeof prepareAiGeneratedPackage>;
        savedTdfId = typeof ingestion.results[0]?.tdfId === 'string' ? ingestion.results[0].tdfId : '';
        if (!savedTdfId) {
          throw new Meteor.Error('generated-package-save-failed', 'Generated package did not return its assigned TDF id.');
        }
        return [{
          moduleId: preparedPackage.moduleId,
          title: preparedPackage.title,
          artifactKindLabel: preparedPackage.moduleId === 'assessmentSession' ? 'Assessment session' : 'Learning session',
          tdfId: savedTdfId,
          route: '/contentUpload',
          editRoute: `/contentEdit/${savedTdfId}`,
          tdfEditRoute: `/tdfEdit/${savedTdfId}`,
          packageAssetId,
          itemCount: contract.pairs.length,
          summary: creationSummary,
        }];
      } catch (error) {
        if (prepared && mayRollbackNewTdf && savedTdfId) {
          const preparedPackage = prepared as ReturnType<typeof prepareAiGeneratedPackage>;
          const partialTdf = await deps.Tdfs.findOneAsync({ _id: savedTdfId });
          if (partialTdf?._id && partialTdf.ownerId === actingUserId) {
            try {
              if (partialTdf.stimuliSetId !== undefined && partialTdf.stimuliSetId !== null) {
                await deps.DynamicAssets.removeAsync({ 'meta.stimuliSetId': partialTdf.stimuliSetId });
              }
              await deps.Tdfs.removeAsync({ _id: partialTdf._id });
            } catch (cleanupError) {
              deps.serverConsole('AI generated package rollback failed:', preparedPackage.tdfFileName, cleanupError);
            }
          }
        }
        throw error;
      }
    },
  });

  return {
    getResponseKCMapForTdf,
    getMaxResponseKC,
    processPackageUpload,
    confirmPackageUpload,
    cancelPackageUpload,
    ...generatedContentMethods,
    repairAiGeneratedPackageMedia,
    saveTdfStimuli,
    saveTdfContent,
    copyTdf,
    upsertStimFile,
    importPrivateRepoTdfBatch,
    normalizeOptionalString,
  };
}
