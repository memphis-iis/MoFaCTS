import { uploadPackageMedia } from './mediaUploader';
import type { UploadedPackageFile } from './packageParser';
import {
  deriveUploadStimSetIds,
  failPackageUpload,
  type PackageUploadRuntimeState,
  type ProcessPackageUploadDeps,
} from './packageUploadShared';

export async function uploadParsedPackageMedia(args: {
  unzippedFiles: UploadedPackageFile[];
  owner: string;
  zipPath: string;
  emailToggle: boolean;
  deps: ProcessPackageUploadDeps;
  state: PackageUploadRuntimeState;
  touchedStimuliSetIds: Set<string | number>;
}) {
  const { unzippedFiles, owner, zipPath, emailToggle, deps, state, touchedStimuliSetIds } = args;
  const uploadStimSetIds = deriveUploadStimSetIds(touchedStimuliSetIds, state.stimSetId);

  try {
    state.uploadedMediaPathMapsByStimSetId = await uploadPackageMedia({
      mediaFiles: unzippedFiles.filter((file): file is UploadedPackageFile => file.type === 'media'),
      uploadStimSetIds,
      fallbackStimSetId: state.stimSetId,
      owner,
      saveMediaFile: deps.saveMediaFile,
      toCanonicalDynamicAssetPath: deps.toCanonicalDynamicAssetPath,
      normalizeUploadedMediaLookupKey: deps.normalizeUploadedMediaLookupKey,
      serverConsole: deps.serverConsole,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await failPackageUpload(emailToggle, deps, {
      zipPath,
      filePath: state.filePath,
      message,
      emailTextPrefix: 'Package upload failed at media upload: ',
      errorTextPrefix: 'package upload failed at media upload: ',
      logPrefix: '2'
    });
  }
}
