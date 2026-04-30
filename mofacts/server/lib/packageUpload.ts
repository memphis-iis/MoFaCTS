import { Meteor } from 'meteor/meteor';

import { parsePackageZip, type UploadedPackageFile } from './packageParser';
import {
  failPackageUpload,
  type DynamicAssetLike,
  type MethodContext,
  type PackageUploadRuntimeState,
  type ProcessPackageUploadDeps,
} from './packageUploadShared';
import { uploadParsedPackageMedia } from './packageUploadMedia';
import { processParsedPackageTdfs } from './packageUploadPersistence';
import { postProcessUploadedTdfs } from './packageUploadPostProcess';
import { applyPackageUploadSideEffects } from './packageUploadSideEffects';

export async function processPackageUploadWorkflow(
  context: MethodContext,
  fileObjOrId: string | DynamicAssetLike,
  owner: string,
  emailToggle: boolean,
  deps: ProcessPackageUploadDeps
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
    const message = error instanceof Error ? error.message : String(error);
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
