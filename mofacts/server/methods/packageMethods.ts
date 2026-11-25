import { versionedAssetFileName } from '../../common/lib/versionedAssetFileName';
import { LESSON_PROVIDER_KEY_FIELDS } from '../../common/lessonProviderKeys';
import { isTdfOwner } from '../lib/contentAccessPolicy';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { storePackageFile } from '../lib/packageFileStorage';
import { getContentUpdateWarnings, type ContentUpdateWarning, type ContentUpdateConfirmation, type ContentUpdateReview } from '../../common/lib/contentUpdateWarnings';
import { Meteor } from 'meteor/meteor';
import { MongoInternals } from 'meteor/mongo';
import { isPublicDemoTutor } from '../../common/publicDemoContract';
import { check, Match } from 'meteor/check';
import type { UploadedPackageFile } from '../lib/packageParser';
import { processPackageUploadWorkflow } from '../lib/packageUpload';
import { assertPackageConditionOwnership } from '../lib/packageTdfIdentity';
import { PACKAGE_WRITE_OWNERSHIP } from '../lib/tdfMutationRecovery';
import type { PackageUploadIntegrity, ProcessPackageUploadDeps } from '../lib/packageUploadShared';
import type { createStorageBoundary } from '../lib/storageBoundary';
import { validateAutoTutorContent } from '../../common/lib/autoTutorContract';
import { mergeEditorContentPreservingSourceShape } from '../../common/lib/editorSaveShape';
import { TDF_CONTENT_SCHEMA } from '../../common/lib/tdfContentSchema';
import { createPackageGeneratedContentMethods, prepareAiGeneratedPackage } from './packageGeneratedContentMethods';
import type { ApiKeyResolutionDeps } from '../lib/apiKeyResolution';
import { validateAndEncryptUploadedApiKey } from '../lib/uploadedApiKeyValidation';
import { assertNoH5PContent } from '../../common/lib/unsupportedContent';
import { requireAuthenticatedUser } from '../lib/methodAuthorization';
import { requireContentCreatorDisplayName } from '../lib/contentCreatorIdentity';
import {
  assertConditionFilenameIdAlignment,
  reconcileConditionCountsByChildId,
  validateConditionFamilyTutor,
} from '../../common/lib/tdfIdentityContract';
import { assertValidTdfExpressions } from '../../common/lib/tdfExpressionValidation';

export const packageUploadPolicy = Object.freeze({
  kind: 'package-upload', operation: 'persisted-archive', authorize: requireAuthenticatedUser,
} as const);
export const lessonCopyPolicy = Object.freeze({
  kind: 'content-maintenance', operation: 'lesson-copy-access', authorize: canCopyLesson,
} as const);

function canCopyLesson(userId: string, lesson: { ownerId?: string; accessors?: unknown }, isAdmin: boolean): boolean {
  return lesson.ownerId === userId || isAdmin || (Array.isArray(lesson.accessors)
    && lesson.accessors.some(accessor => accessor?.userId === userId));
}

export const packageUploadPlanPolicy = Object.freeze({
  kind: 'package-upload', operation: 'owned-confirmation-plan', authorize: requireAuthenticatedUser,
} as const);

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
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
  action: 'create' | 'update';
  tdfId: string;
  fileName: string;
  packageFile?: string;
  packageAssetId?: string;
  stimFileName: string;
  stimuli: unknown;
  tdfs: TdfPayload['tdfs'];
  conditionTdfIds?: Array<string | null>;
  expectedRevision: number;
  mutationJobId: string;
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
  storageRoot: string;
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

export function createPackageService(deps: PackageMethodsDeps) {
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
    fileObjOrId: string | { _id: string },
    _owner: string,
    _zipLink: string,
    emailToggle: boolean,
    integrity?: PackageUploadIntegrity,
    identityMode: 'preserve' | 'copy' = 'preserve'
  ){
    const actingUserId = packageUploadPolicy.authorize(this.userId);
    await requireContentCreatorDisplayName(deps.usersCollection, actingUserId);
    if (identityMode !== 'preserve' && identityMode !== 'copy') {
      throw new Meteor.Error('invalid-package-identity-mode', 'Package identity mode must be preserve or copy.');
    }
    const assetId = deps.normalizeCanonicalId(typeof fileObjOrId === 'string' ? fileObjOrId : fileObjOrId?._id);
    if (!assetId) throw new Meteor.Error(404, 'Package asset not found');
    return processPackageUploadWorkflow(
      this,
      assetId,
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
    const actingUserId = packageUploadPlanPolicy.authorize(this.userId);
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
      { $set: { status: 'committing', contentWriteOwnership: PACKAGE_WRITE_OWNERSHIP, updatedAt: new Date() }, $unset: { cleanupAt: '', confirmationExpiresAt: '' } },
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
      if (result && 'status' in result && result.status === 'confirmation-required') {
        throw new Meteor.Error('tdf-revision-conflict', 'The content changed after upload review. Upload the package again to review the current content.');
      }
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
    const actingUserId = packageUploadPlanPolicy.authorize(this.userId);
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
    // A plan can reprocess a previously saved archive. Cancelling owns only the plan.
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
    const collision = await deps.DynamicAssets.findOneAsync(scopedQuery, { fields: { _id: 1 } });
    const storedName = collision ? versionedAssetFileName(media.name) : media.name;
    const mimeType = deps.getMimeTypeForAssetName(media.name);
    let writtenAssetId = '';

    try {
      if (!media.source) throw new Error(`Media has no staged source: ${media.name}`);
      const fileRef = await storePackageFile(deps.DynamicAssets, deps.storageRoot, media.source.path, {
        fileName: storedName,
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
        const storageKey = `dynamic-assets/${fileRef._id}/${storedName}`;
        await deps.storageBoundary.putObject(storageKey, createReadStream(media.source.path), mimeType, media.source.size);
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
          previousAssets: [],
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
      deps.serverConsole(`File ${media.name} could not be uploaded`, error);
      throw error;
    }
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
        if (!stim.response || typeof stim.response !== 'object' || !Object.prototype.hasOwnProperty.call(stim.response, 'correctResponse')) {
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
        ...((tdf.tutor?.unit || []) as Array<{ clusterIndex?: unknown; assessmentsession?: { clusterlist?: string } }>),
        ...((tdf.tutor?.unitTemplate || []) as Array<{ clusterIndex?: unknown; assessmentsession?: { clusterlist?: string } }>)
      ];
      for (const [_unitIdx, unit] of units.entries()) {
        if (Object.prototype.hasOwnProperty.call(unit, 'clusterIndex')) {
          indices.add(Number(unit.clusterIndex));
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
    if (!packageJSON.mutationJobId) throw new Error('Package content write requires a mutation job');
    const Tdf = packageJSON.tdfs;
    assertValidTdfExpressions(Tdf, `${packageJSON.fileName}.tdfs.tutor`);
    const lessonName = deps.legacyTrim(Tdf.tutor.setspec.lessonname);
    const prev = await deps.Tdfs.findOneAsync({ _id: tdfId });
    if ((packageJSON.action === 'update') !== Boolean(prev)) {
      throw new Meteor.Error('tdf-revision-conflict', 'The system was created or deleted after upload review. Upload the package again.');
    }
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
      packageWriteJobId: packageJSON.mutationJobId,
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

    await assertPackageConditionOwnership(deps.Tdfs, entries.map(({ tdfId, record }) => ({
      tdfId, conditionTdfIds: record.tdfs.tutor.setspec.conditionTdfIds ?? [],
    })));

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

  function reviewEditorUpdate(tdf: any, structuralWarnings: ContentUpdateWarning[], confirmation?: ContentUpdateConfirmation): ContentUpdateReview | null {
    check(confirmation, Match.Maybe({ expectedRevision: Match.Integer, confirmed: Match.Where((value: unknown) => value === true) }));
    const expectedRevision = Number.isInteger(tdf.tdfRevision) ? tdf.tdfRevision : 0;
    if (confirmation && confirmation.expectedRevision !== expectedRevision) {
      throw new Meteor.Error('tdf-revision-conflict', 'This lesson changed after review. Reload it and review your update again.');
    }
    return structuralWarnings.length && !confirmation ? {
      status: 'confirmation-required', tdfId: tdf._id,
      lessonName: tdf.content?.tdfs?.tutor?.setspec?.lessonname || '',
      expectedRevision, structuralWarnings,
    } : null;
  }

  function editorRevisionSelector(tdf: any): UnknownRecord {
    const revision = Number.isInteger(tdf.tdfRevision) ? tdf.tdfRevision : 0;
    return revision === 0
      ? { _id: tdf._id, $or: [{ tdfRevision: 0 }, { tdfRevision: { $exists: false } }] }
      : { _id: tdf._id, tdfRevision: revision };
  }

  async function saveTdfStimuli(this: MethodContext, tdfId: string, updatedRawStimuliFile: UnknownRecord, filteredStimuli: unknown[] | null | undefined, updateConfirmation?: ContentUpdateConfirmation) {
    check(tdfId, String);
    check(updatedRawStimuliFile, Object);
    check(updatedRawStimuliFile, Match.ObjectIncluding({ setspec: Match.ObjectIncluding({
      clusters: [Match.ObjectIncluding({ stims: [Object] })],
    }) }));
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
    if (isPublicDemoTutor(tdf.content?.tdfs?.tutor) &&
        !(this.userId && await deps.userIsInRoleAsync(this.userId, ['admin']))) {
      throw new Meteor.Error(403, 'Only administrators can edit public demo lessons');
    }
    const autoTutorValidation = validateAutoTutorContent({
      tdf: tdf.content?.tdfs,
      stimuli: updatedRawStimuliFile,
    });
    if (!autoTutorValidation.valid) {
      throw new Meteor.Error('invalid-autotutor-content', autoTutorValidation.errors.join('; '));
    }

    const review = reviewEditorUpdate(tdf, getContentUpdateWarnings(
      { stimuli: tdf.rawStimuliFile }, { stimuli: updatedRawStimuliFile as any }), updateConfirmation);
    if (review) return review;

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

    const updated = await deps.Tdfs.updateAsync(editorRevisionSelector(tdf), {
      $set: {
        rawStimuliFile: updatedRawStimuliFile,
        stimuli: stimuliToSave
      },
      $inc: { tdfRevision: 1 },
    });
    if (updated !== 1) throw new Meteor.Error('tdf-revision-conflict', 'This lesson changed during saving. Reload it and review your update again.');

    deps.serverConsole('saveTdfStimuli: Updated TDF', tdfId, 'with', stimuliToSave.length, 'stimuli');

    return { success: true, stimuliCount: stimuliToSave.length };
  }

  async function saveTdfContent(
    this: MethodContext,
    tdfId: string,
    tdfContent: { tdfs?: { tutor?: { setspec?: { lessonname?: string; speechAPIKey?: string; textToSpeechAPIKey?: string; openRouterApiKey?: string; condition?: string[]; conditionTdfIds?: Array<string | null>; [key: string]: unknown } } } } & UnknownRecord,
    apiKeyUpdates: { speechAPIKey?: boolean; textToSpeechAPIKey?: boolean; openRouterApiKey?: boolean } = {},
    removedTutorPaths: string[] = [],
    updateConfirmation?: ContentUpdateConfirmation
  ) {
    assertNoH5PContent(tdfContent, TDF_CONTENT_SCHEMA);
    check(tdfId, String);
    check(tdfContent, Object);
    check(apiKeyUpdates, Object);
    if (Object.entries(apiKeyUpdates).some(([key, value]) =>
      !LESSON_PROVIDER_KEY_FIELDS.some(field => field === key) || typeof value !== 'boolean')) {
      throw new Meteor.Error('invalid-provider-key-update', 'Unknown provider key or invalid update flag.');
    }
    check(removedTutorPaths, [String]);

    const tdf = await deps.Tdfs.findOneAsync({_id: tdfId});
    if (!tdf) {
      throw new Meteor.Error('not-found', 'TDF not found');
    }

    const canManage = await deps.userCanManageTdf(this.userId || '', tdf);
    if (!canManage) {
      throw new Meteor.Error('not-authorized', 'You do not have permission to edit this TDF');
    }

    const submittedSettings = tdfContent.tdfs?.tutor?.setspec;
    if (!submittedSettings?.lessonname) {
      throw new Meteor.Error('invalid-tdf', 'TDF must have a lesson name');
    }

    const tdfContentToSave = mergeEditorContentPreservingSourceShape(tdf.content, tdfContent, TDF_CONTENT_SCHEMA);
    if ((isPublicDemoTutor(tdf.content?.tdfs?.tutor) || isPublicDemoTutor(tdfContentToSave.tdfs?.tutor)) &&
        !(this.userId && await deps.userIsInRoleAsync(this.userId, ['admin']))) {
      throw new Meteor.Error(403, 'Only administrators can designate or edit public demo lessons');
    }
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
    if (!setspec?.lessonname) throw new Meteor.Error('invalid-tdf', 'A saved lesson must retain its settings and name.');
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
    for (const field of LESSON_PROVIDER_KEY_FIELDS) {
      const action = apiKeyUpdates[field];
      const supplied = Object.hasOwn(submittedSettings, field);
      const removed = removedTutorPaths.includes('setspec.' + field);
      if (action !== undefined || supplied || removed) {
        if (!isTdfOwner(this.userId, tdf)) {
          throw new Meteor.Error('not-authorized', 'Only the lesson owner may change provider keys.');
        }
        if (action === true && supplied && !removed) {
          setspec[field] = validateAndEncryptUploadedApiKey({
            encryptData: deps.encryptData, field, value: submittedSettings[field],
          });
        } else if (action === false && !supplied) {
          delete setspec[field];
        } else {
          throw new Meteor.Error('invalid-provider-key-update', 'Specify a replacement or an explicit removal for the provider key.');
        }
      } else if (persistedSetspec && Object.hasOwn(persistedSetspec, field)) {
        setspec[field] = persistedSetspec[field];
      } else {
        delete setspec[field];
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
    const review = reviewEditorUpdate(tdf, getContentUpdateWarnings(
      { tutor: tdf.content?.tdfs?.tutor }, { tutor: tdfContentToSave.tdfs?.tutor }), updateConfirmation);
    if (review) return review;

    const tutor = tdfContentToSave.tdfs?.tutor as { unit?: Array<{ unitinstructions?: string }> } | undefined;
    if (tutor?.unit && Array.isArray(tutor.unit)) {
      await deps.processAudioFilesForTDF({ tutor: { unit: tutor.unit } }, tdf.stimuliSetId, {
        rejectUnresolved: true,
        allowFilenameLookup: true
      });
    }

    const updated = await deps.Tdfs.updateAsync(editorRevisionSelector(tdf), {
      $set: {
        content: tdfContentToSave
      },
      $inc: { tdfRevision: 1 },
    });
    if (updated !== 1) throw new Meteor.Error('tdf-revision-conflict', 'This lesson changed during saving. Reload it and review your update again.');

    deps.serverConsole('saveTdfContent: Updated TDF', tdfId, 'lesson:', tdfContentToSave.tdfs?.tutor?.setspec?.lessonname || '');

    return { success: true };
  }

  function escapeRegex(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async function copyTdf(this: MethodContext, sourceTdfId: string) {
    check(sourceTdfId, String);
    const userId = requireAuthenticatedUser(this.userId, 'Must be logged in to copy TDF', 'not-authorized');
    await requireContentCreatorDisplayName(deps.usersCollection, userId);
    const isAdmin = await deps.userIsInRoleAsync(userId, ['admin']);
    const collection = deps.Tdfs.rawCollection();
    const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const source = await collection.findOne({ _id: sourceTdfId }, { session });
        if (!source) throw new Meteor.Error('not-found', 'TDF not found');
        if (!lessonCopyPolicy.authorize(userId, source, isAdmin)) {
          throw new Meteor.Error('not-authorized', 'You do not have access to this TDF');
        }

        const family = validateConditionFamilyTutor(source.content?.tdfs?.tutor, { requireCanonicalIds: true });
        const children = family.conditionTdfIds.length > 0
          ? await collection.find({ _id: { $in: family.conditionTdfIds } }, { session }).toArray()
          : [];
        const filesById = new Map<string, string>();
        for (const child of children) {
          const childValidation = validateConditionFamilyTutor(child.content?.tdfs?.tutor);
          if (child._id === sourceTdfId || child.ownerId !== source.ownerId || childValidation.isConditionRoot
            || childValidation.errors.length > 0 || child.tdfAvailability === 'repair-required') {
            throw new Meteor.Error('tdf-identity-repair-required', 'The lesson family requires an identity repair before copying.');
          }
          filesById.set(child._id, child.content?.fileName);
        }
        if (source.tdfAvailability === 'repair-required' || family.errors.length
          || assertConditionFilenameIdAlignment(family.conditionFileNames, family.conditionTdfIds, filesById).length) {
          throw new Meteor.Error('tdf-identity-repair-required', 'The lesson family requires an identity repair before copying.');
        }
        const baseName = source.content?.tdfs?.tutor?.setspec?.lessonname || 'Untitled';
        const copyPattern = new RegExp(`^${escapeRegex(baseName)} \\((\\d+)\\)$`);
        const existingCopies = await collection.find(
          { 'content.tdfs.tutor.setspec.lessonname': copyPattern },
          { projection: { 'content.tdfs.tutor.setspec.lessonname': 1 }, session },
        ).toArray();
        let nextNum = 1;
        for (const existing of existingCopies) {
          const match = copyPattern.exec(existing.content.tdfs.tutor.setspec.lessonname);
          if (match) nextNum = Math.max(nextNum, Number(match[1]) + 1);
        }

        const newName = `${baseName} (${nextNum})`;
        const members = [source, ...children];
        const newIds = new Map<string, string>(members.map(lesson => [lesson._id, `tdf_${randomBytes(12).toString('hex')}`]));
        const newTdfId = newIds.get(sourceTdfId)!;
        const ownerMayKeepKeys = source.ownerId === userId;
        for (const lesson of members) {
          lesson._id = newIds.get(lesson._id);
          lesson.ownerId = userId;
          lesson.accessors = [];
          lesson.tdfRevision = 1;
          delete lesson.packageFile;
          delete lesson.packageAssetId;
          delete lesson.sourceIdentity;
          delete lesson.packageWriteJobId;
          const settings = lesson.content.tdfs.tutor.setspec ??= {};
          settings.userselect = 'false';
          delete settings.experimentTarget;
          if (Array.isArray(settings.tags)) {
            settings.tags = settings.tags.filter((tag: unknown) => typeof tag !== 'string' || tag.trim().toLowerCase() !== 'public-demo');
          }
          if (!ownerMayKeepKeys) {
            for (const field of LESSON_PROVIDER_KEY_FIELDS) delete settings[field];
          }
        }

        const originalFileName = source.content.fileName || 'unknown.xml';
        const extensionOffset = originalFileName.lastIndexOf('.');
        const baseFile = extensionOffset >= 0 ? originalFileName.slice(0, extensionOffset) : originalFileName;
        const extension = extensionOffset >= 0 ? originalFileName.slice(extensionOffset) : '.xml';
        source.content.fileName = `${baseFile}_copy_${nextNum}${extension}`;
        source.tdfFileName = source.content.fileName;
        const rootSettings = source.content.tdfs.tutor.setspec;
        rootSettings.lessonname = newName;
        if (family.isConditionRoot) {
          rootSettings.conditionTdfIds = family.conditionTdfIds.map(id => newIds.get(id)!);
          source.conditionCounts = family.conditionTdfIds.map(() => 0);
        }
        await collection.insertMany(members, { session });
        return { newTdfId, newName };
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } finally {
      await session.endSession();
    }
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

  const methods = {
    processPackageUpload,
    confirmPackageUpload,
    cancelPackageUpload,
    ...generatedContentMethods,
    saveTdfStimuli,
    saveTdfContent,
    copyTdf,
  };
  return { methods, getResponseKCMapForTdf, upsertStimFile, importPrivateRepoTdfBatch, normalizeOptionalString };
}
