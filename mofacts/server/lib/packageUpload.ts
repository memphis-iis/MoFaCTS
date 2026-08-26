import { Meteor } from 'meteor/meteor';
import fs from 'fs/promises';

import { parsePackageZip, type UploadedPackageFile } from './packageParser';
import {
  failPackageUpload,
  type DynamicAssetLike,
  type MethodContext,
  type PackageUploadIntegrity,
  type PackageUploadRuntimeState,
  type ProcessPackageUploadDeps,
} from './packageUploadShared';
import { uploadParsedPackageMedia } from './packageUploadMedia';
import { processParsedPackageTdfs } from './packageUploadPersistence';
import { postProcessUploadedTdfs } from './packageUploadPostProcess';
import { applyPackageUploadSideEffects } from './packageUploadSideEffects';
import { preflightPackageTdfIdentities } from './packageTdfIdentity';
import { assertValidTdfExpressions } from '../../../learning-components/content/tdfExpressionValidation';

const INCOMPLETE_UPLOAD_MESSAGE = 'The uploaded ZIP appears incomplete or truncated. Please upload the file again.';

export type PackageUploadPolicy = {
  requireAllContentResults?: boolean;
  prepareParsedPackage?: (args: {
    unzippedFiles: UploadedPackageFile[];
    owner: string;
    isTeacherOrAdmin: boolean;
  }) => Promise<void> | void;
  confirmedIdentityFingerprint?: string | null;
  expectedArchiveSha256?: string | null;
  mutationJobId?: string | null;
};

const UPLOAD_PLAN_TTL_MS = 30 * 60 * 1000;
const TERMINAL_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPositiveNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function normalizeSha256(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-f0-9]{64}$/.test(text) ? text : undefined;
}

function getExpectedPackageSize(fileObj: DynamicAssetLike, integrity?: PackageUploadIntegrity) {
  return toPositiveNumber(integrity?.expectedSize)
    ?? toPositiveNumber(fileObj.size)
    ?? toPositiveNumber(fileObj.meta?.expectedSize)
    ?? toPositiveNumber(fileObj.meta?.size);
}

function getExpectedPackageSha256(fileObj: DynamicAssetLike, integrity?: PackageUploadIntegrity) {
  return normalizeSha256(integrity?.sha256)
    ?? normalizeSha256(fileObj.meta?.sha256)
    ?? normalizeSha256(fileObj.meta?.uploadSha256);
}

async function getStableFileStats(zipPath: string, expectedSize?: number) {
  const fs = Npm.require('fs');
  let previousSize: number | undefined;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    let stat;
    try {
      stat = fs.statSync(zipPath);
    } catch (_error) {
      if (attempt === 5) {
        throw new Error('Uploaded package file is missing on the server. Please upload the file again.');
      }
      await sleep(250);
      continue;
    }

    const currentSize = Number(stat.size || 0);
    if (currentSize <= 0) {
      if (attempt === 5) {
        throw new Error('Uploaded package file is empty. Please upload the file again.');
      }
      await sleep(250);
      previousSize = currentSize;
      continue;
    }

    if (expectedSize && currentSize < expectedSize) {
      if (attempt === 5) {
        throw new Error(`${INCOMPLETE_UPLOAD_MESSAGE} Stored ${currentSize} of ${expectedSize} bytes.`);
      }
      await sleep(250);
      previousSize = currentSize;
      continue;
    }

    if (!expectedSize) {
      if (previousSize === undefined || (previousSize !== currentSize && attempt < 5)) {
        await sleep(250);
        previousSize = currentSize;
        continue;
      }
    }

    return stat;
  }

  throw new Error(INCOMPLETE_UPLOAD_MESSAGE);
}

function computeFileSha256(zipPath: string) {
  const fs = Npm.require('fs');
  const crypto = Npm.require('crypto');
  return crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
}

async function mirrorPackageAssetToS3(fileObj: DynamicAssetLike, deps: ProcessPackageUploadDeps) {
  if (deps.storageBoundary.backend !== 's3') {
    return;
  }
  if (!fileObj._id || !fileObj.path) {
    throw new Error('S3 storage requires package asset id and local upload path');
  }
  if (typeof deps.DynamicAssets.collection.updateAsync !== 'function') {
    throw new Error('S3 storage requires DynamicAssets.collection.updateAsync');
  }
  const name = String(fileObj.name || fileObj.fileName || `${fileObj._id}.${fileObj.ext || 'zip'}`).trim();
  const key = `dynamic-assets/${fileObj._id}/${name}`;
  await deps.storageBoundary.putObject(key, await fs.readFile(fileObj.path), fileObj.type || 'application/zip');
  await deps.DynamicAssets.collection.updateAsync(
    { _id: fileObj._id },
    {
      $set: {
        'meta.storageBackend': 's3',
        'meta.storageKey': key,
      },
    }
  );
}

async function validateUploadedPackageFile(
  zipPath: string,
  fileObj: DynamicAssetLike,
  deps: ProcessPackageUploadDeps,
  integrity?: PackageUploadIntegrity
) {
  const expectedSize = getExpectedPackageSize(fileObj, integrity);
  const expectedSha256 = getExpectedPackageSha256(fileObj, integrity);
  const stat = await getStableFileStats(zipPath, expectedSize);
  const storedSize = Number(stat.size || 0);

  if (expectedSize && storedSize !== expectedSize) {
    throw new Error(`${INCOMPLETE_UPLOAD_MESSAGE} Stored ${storedSize} of ${expectedSize} bytes.`);
  }

  const actualSha256 = computeFileSha256(zipPath);
  if (expectedSha256) {
    if (actualSha256 !== expectedSha256) {
      throw new Error(`Uploaded package checksum mismatch. Expected ${expectedSha256}, got ${actualSha256}. Please upload the file again.`);
    }
  }

  deps.serverConsole(
    'Package upload integrity check:',
    fileObj._id,
    fileObj.name || fileObj.fileName || '',
    'storedBytes=',
    storedSize,
    'expectedBytes=',
    expectedSize || '',
    'sha256Checked=',
    Boolean(expectedSha256)
  );
  return actualSha256;
}

function normalizePackageInitializationError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  if (/FILE_ENDED|unexpected end|end of central directory|invalid zip/i.test(rawMessage)) {
    return `${INCOMPLETE_UPLOAD_MESSAGE} (${rawMessage})`;
  }
  return rawMessage;
}

export async function processPackageUploadWorkflow(
  context: MethodContext,
  fileObjOrId: string | DynamicAssetLike,
  owner: string,
  emailToggle: boolean,
  deps: ProcessPackageUploadDeps,
  integrity?: PackageUploadIntegrity,
  policy: PackageUploadPolicy = {}
) {
  if (!context.userId) {
    throw new Meteor.Error(401, 'Must be logged in to upload packages');
  }

  let fileObj: DynamicAssetLike | null = typeof fileObjOrId === 'string' ? null : fileObjOrId;
  if (typeof fileObjOrId === 'string') {
    fileObj = await deps.DynamicAssets.collection.findOneAsync({ _id: fileObjOrId });
  }
  if (!fileObj || !fileObj._id) {
    throw new Meteor.Error(404, 'Package asset not found');
  }

  const actingUserIsAdmin = await deps.userIsInRoleAsync(context.userId, ['admin']);
  const assetOwnerId = typeof fileObj.userId === 'string' ? fileObj.userId.trim() : '';
  if (assetOwnerId && assetOwnerId !== context.userId && !actingUserIsAdmin) {
    throw new Meteor.Error(403, 'Can only process package assets you uploaded');
  }
  const uploadPurpose = typeof fileObj.meta?.uploadPurpose === 'string' ? fileObj.meta.uploadPurpose : '';
  if (uploadPurpose && uploadPurpose !== 'package') {
    throw new Meteor.Error(400, 'Only package-purpose assets can enter package processing');
  }

  if (owner !== context.userId && !actingUserIsAdmin) {
    throw new Meteor.Error(403, 'Can only upload packages for yourself unless admin');
  }

  const isTeacherOrAdmin = await deps.userIsInRoleAsync(context.userId, ['admin', 'teacher']);
  const zipPath = fileObj.path;
  let unzippedFiles: UploadedPackageFile[] = [];
  const packageExt = fileObj.ext || (fileObj.name ? fileObj.name.split('.').pop() : 'zip');
  const packageAssetId = deps.normalizeCanonicalId(fileObj?._id);
  if (!packageAssetId) {
    throw new Meteor.Error(500, 'Uploaded package asset id missing');
  }
  const packageFile = `${fileObj._id}.${packageExt}`;
  let failureStage = 'initialization';
  const state: PackageUploadRuntimeState = {
    fileName: '',
    filePath: '',
    uploadActorUserId: context.userId,
    stimSetId: undefined,
    uploadedMediaPathMapsByStimSetId: new Map<string, Map<string, string>>(),
    mediaMutations: [],
    identityPlan: null,
    mutationJobId: policy.mutationJobId || null,
  };
  let uploadPlanExpiresAt: Date | null = null;

  try {
    const archiveSha256 = await validateUploadedPackageFile(zipPath, fileObj, deps, integrity);
    if (policy.expectedArchiveSha256 && policy.expectedArchiveSha256 !== archiveSha256) {
      throw new Meteor.Error('changed-package-asset', 'The uploaded package changed after preflight. Upload it again.');
    }
    await mirrorPackageAssetToS3(fileObj, deps);
    unzippedFiles = await parsePackageZip(zipPath, packageFile, deps.serverConsole);
    await policy.prepareParsedPackage?.({ unzippedFiles, owner, isTeacherOrAdmin });
    for (const tdfFile of unzippedFiles.filter((file) => file.type === 'tdf')) {
      const contents = typeof tdfFile.contents === 'string' ? JSON.parse(tdfFile.contents) : tdfFile.contents;
      assertValidTdfExpressions({ tutor: (contents as { tutor?: unknown })?.tutor }, `${tdfFile.name}.tutor`);
    }

    failureStage = 'identity preflight';
    const identityPlan = await preflightPackageTdfIdentities({
      unzippedFiles,
      packageAssetId,
      ownerId: owner,
      deps,
    });
    state.identityPlan = identityPlan;
    if (!state.mutationJobId) {
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + UPLOAD_PLAN_TTL_MS);
      uploadPlanExpiresAt = expiresAt;
      state.mutationJobId = await deps.TdfMutationJobs.insertAsync({
        kind: 'package-upload',
        status: identityPlan.updates.length > 0 ? 'awaiting-confirmation' : 'committing',
        actorUserId: context.userId,
        ownerId: owner,
        packageAssetId,
        archiveSha256,
        identityFingerprint: identityPlan.fingerprint,
        operations: identityPlan.entries,
        creates: identityPlan.creates,
        updates: identityPlan.updates,
        createdAt,
        updatedAt: createdAt,
        confirmationExpiresAt: identityPlan.updates.length > 0 ? expiresAt : undefined,
        cleanupAt: identityPlan.updates.length > 0 ? expiresAt : undefined,
      });
    }
    if (identityPlan.updates.length > 0 && policy.confirmedIdentityFingerprint !== identityPlan.fingerprint) {
      return {
        status: 'confirmation-required',
        uploadPlanId: state.mutationJobId,
        expiresAt: uploadPlanExpiresAt,
        updates: identityPlan.updates,
        creates: identityPlan.creates,
      };
    }

    failureStage = 'content processing';
    const { results, touchedStimuliSetIds } = await processParsedPackageTdfs({
      unzippedFiles,
      fileObj,
      packageFile,
      packageAssetId,
      zipPath,
      owner,
      isTeacherOrAdmin,
      emailToggle,
      deps,
      state
    });
    const failedResult = results.find((result) => !result.result);
    if (failedResult) throw new Error(failedResult.errmsg || 'Package content persistence failed.');
    failureStage = 'media upload';
    await uploadParsedPackageMedia({
      unzippedFiles,
      owner,
      zipPath,
      emailToggle,
      deps,
      state,
      touchedStimuliSetIds
    });
    failureStage = 'content post-processing';
    await postProcessUploadedTdfs({ unzippedFiles, deps, state });
    failureStage = 'side effects';
    await applyPackageUploadSideEffects({
      context,
      fileObj,
      emailToggle,
      deps,
      state,
      isTeacherOrAdmin,
      results
    });

    const tdfIds = results
      .map((result) => result.tdfId)
      .filter((tdfId): tdfId is string => typeof tdfId === 'string' && tdfId.length > 0);
    const terminalResult = {
      status: 'complete',
      tdfIds,
      routes: tdfIds.map((tdfId) => `/content/${encodeURIComponent(tdfId)}`),
      results,
      stimSetId: state.stimSetId,
    };
    for (const mediaMutation of state.mediaMutations) {
      await deps.DynamicAssets.collection.updateAsync?.(
        { _id: mediaMutation.newAssetId },
        { $unset: { 'meta.mutationJobId': '' } },
      );
      for (const previousAsset of mediaMutation.previousAssets) {
        try {
          await deps.DynamicAssets.removeAsync?.({ _id: previousAsset._id });
        } catch (cleanupError) {
          deps.serverConsole('Committed package media backup cleanup failed:', previousAsset._id, cleanupError);
        }
      }
    }
    if (state.mutationJobId) {
      await deps.TdfMutationJobs.updateAsync(
        { _id: state.mutationJobId, status: 'committing' },
        {
          $set: {
            status: 'complete',
            terminalResult,
            updatedAt: new Date(),
            cleanupAt: new Date(Date.now() + TERMINAL_JOB_RETENTION_MS),
          },
          $unset: { confirmationExpiresAt: '' },
        },
      );
    }
    return terminalResult;
  } catch (error: unknown) {
    const domainErrorCode = error && typeof error === 'object' ? String((error as { error?: unknown }).error || '') : '';
    const message = normalizePackageInitializationError(error);
    if (state.identityPlan && state.mutationJobId) {
      let rollbackFailed = false;
      for (const mediaMutation of [...state.mediaMutations].reverse()) {
        try {
          await deps.DynamicAssets.removeAsync?.({ _id: mediaMutation.newAssetId });
          for (const previousAsset of mediaMutation.previousAssets) {
            const restored = await deps.DynamicAssets.collection.updateAsync?.(
              { _id: previousAsset._id },
              { $set: { name: previousAsset.name, fileName: previousAsset.fileName, meta: previousAsset.meta || {} } },
            );
            if (restored === undefined) throw new Error('DynamicAssets.collection.updateAsync is unavailable');
          }
        } catch (rollbackError) {
          rollbackFailed = true;
          deps.serverConsole('Package media rollback failed:', mediaMutation.newAssetId, rollbackError);
        }
      }
      for (const entry of [...state.identityPlan.entries].reverse()) {
        try {
          if (entry.action === 'create') {
            await deps.Tdfs.removeAsync({ _id: entry.tdfId, packageAssetId });
            continue;
          }
          const before = entry.beforeImage || {};
          const current = await deps.Tdfs.findOneAsync(
            { _id: entry.tdfId },
            { fields: { _id: 1, tdfRevision: 1 } },
          );
          const currentRevision = Number.isInteger(current?.tdfRevision) ? current.tdfRevision : 0;
          if (currentRevision === entry.targetRevision) continue;
          if (currentRevision !== entry.targetRevision + 1) {
            throw new Error(`TDF "${entry.tdfId}" changed again before rollback.`);
          }
          const setFields: Record<string, unknown> = { tdfRevision: entry.targetRevision };
          const unsetFields: Record<string, string> = {};
          for (const field of ['tdfFileName', 'content', 'ownerId', 'stimuliSetId', 'rawStimuliFile', 'stimuli', 'packageFile', 'packageAssetId', 'conditionCounts', 'tdfAvailability', 'tdfIdentityState']) {
            if (Object.prototype.hasOwnProperty.call(before, field) && before[field] !== undefined) setFields[field] = before[field];
            else unsetFields[field] = '';
          }
          const restored = await deps.Tdfs.updateAsync(
            { _id: entry.tdfId, tdfRevision: entry.targetRevision + 1 },
            { $set: setFields, ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}) },
          );
          if (restored !== 1) throw new Error(`TDF "${entry.tdfId}" could not be restored.`);
        } catch (rollbackError) {
          rollbackFailed = true;
          deps.serverConsole('Package rollback failed for TDF:', entry.tdfId, rollbackError);
        }
      }
      await deps.TdfMutationJobs.updateAsync(
        { _id: state.mutationJobId, status: 'committing' },
        {
          $set: {
            status: rollbackFailed ? 'recovery-required' : 'rolled-back',
            updatedAt: new Date(),
            ...(rollbackFailed ? {} : { cleanupAt: new Date(Date.now() + TERMINAL_JOB_RETENTION_MS) }),
          },
          $unset: { confirmationExpiresAt: '' },
        },
      );
      if (!rollbackFailed) {
        const remainingReferences = await deps.Tdfs.find(
          { packageAssetId },
          { fields: { _id: 1 } },
        ).fetchAsync();
        if (remainingReferences.length === 0 && typeof deps.DynamicAssets.removeAsync === 'function') {
          await deps.DynamicAssets.removeAsync({ _id: packageAssetId });
        }
      }
    }
    deps.serverConsole(
      `Package upload ${failureStage} failure details:`,
      fileObj._id,
      fileObj.name || fileObj.fileName || '',
      'path=',
      zipPath,
      'declaredSize=',
      fileObj.size || '',
      'expectedSize=',
      getExpectedPackageSize(fileObj, integrity) || '',
      'expectedSha256=',
      getExpectedPackageSha256(fileObj, integrity) || '',
      'message=',
      message
    );
    if (!state.stimSetId && fileObj?._id && typeof deps.DynamicAssets.removeAsync === 'function') {
      try {
        await deps.DynamicAssets.removeAsync({ _id: fileObj._id });
        deps.serverConsole('Removed package asset after failed initialization:', fileObj._id);
      } catch (cleanupError: unknown) {
        deps.serverConsole('Could not remove package asset after failed initialization:', fileObj._id, cleanupError);
      }
    }
    if (
      domainErrorCode === 'package-upload-failed'
      || domainErrorCode === 'generated-package-name-conflict'
      || domainErrorCode.startsWith('ai-content-')
    ) {
      throw error;
    }
    await failPackageUpload(emailToggle, deps, {
      zipPath,
      filePath: state.filePath,
      message,
      emailTextPrefix: `Package upload failed at ${failureStage}: `,
      errorTextPrefix: `package upload failed at ${failureStage}: `,
      logPrefix: '3'
    });
  }
}
