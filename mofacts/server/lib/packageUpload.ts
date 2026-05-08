import { Meteor } from 'meteor/meteor';

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

const INCOMPLETE_UPLOAD_MESSAGE = 'The uploaded ZIP appears incomplete or truncated. Please upload the file again.';

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

  if (expectedSha256) {
    const actualSha256 = computeFileSha256(zipPath);
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
  integrity?: PackageUploadIntegrity
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
  const state: PackageUploadRuntimeState = {
    fileName: '',
    filePath: '',
    stimSetId: undefined,
    uploadedMediaPathMapsByStimSetId: new Map<string, Map<string, string>>()
  };

  try {
    await validateUploadedPackageFile(zipPath, fileObj, deps, integrity);
    unzippedFiles = await parsePackageZip(zipPath, packageFile, deps.serverConsole);

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
    await uploadParsedPackageMedia({
      unzippedFiles,
      owner,
      zipPath,
      emailToggle,
      deps,
      state,
      touchedStimuliSetIds
    });
    await applyPackageUploadSideEffects({
      context,
      fileObj,
      emailToggle,
      deps,
      state,
      isTeacherOrAdmin,
      results
    });

    return { results, stimSetId: state.stimSetId };
  } catch (error: unknown) {
    const message = normalizePackageInitializationError(error);
    deps.serverConsole(
      'Package upload initialization failure details:',
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
    await failPackageUpload(emailToggle, deps, {
      zipPath,
      filePath: state.filePath,
      message,
      emailTextPrefix: 'Package upload failed at initialization: ',
      errorTextPrefix: 'package upload failed at initialization: ',
      logPrefix: '3'
    });
  } finally {
    await postProcessUploadedTdfs({ unzippedFiles, deps, state });
  }
}
