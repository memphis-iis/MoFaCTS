import { uploadPackageMedia } from './mediaUploader';
import { packagedSimulationMediaScopes } from './packageSimulations';
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
  stimulusScopesByName: Map<string, Set<string | number>>;
}) {
  const { unzippedFiles, owner, zipPath, emailToggle, deps, state, touchedStimuliSetIds, stimulusScopesByName } = args;
  const uploadStimSetIds = deriveUploadStimSetIds(touchedStimuliSetIds, state.stimSetId);

  try {
    const mediaScopesByName = packagedSimulationMediaScopes(unzippedFiles, stimulusScopesByName);
    state.uploadedMediaPathMapsByStimSetId = await uploadPackageMedia({
      mediaFiles: unzippedFiles.filter((file): file is UploadedPackageFile => file.type === 'media'),
      mediaScopesByName,
      uploadStimSetIds,
      fallbackStimSetId: state.stimSetId,
      owner,
      mutationJobId: state.mutationJobId,
      mediaMutations: state.mediaMutations,
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
