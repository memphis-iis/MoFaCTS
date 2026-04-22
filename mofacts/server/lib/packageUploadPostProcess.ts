import type { UploadedPackageFile } from './packageParser';
import type { PackageUploadRuntimeState, ProcessPackageUploadDeps } from './packageUploadShared';

export async function postProcessUploadedTdfs(args: {
  unzippedFiles: UploadedPackageFile[];
  deps: ProcessPackageUploadDeps;
  state: PackageUploadRuntimeState;
}) {
  const { unzippedFiles, deps, state } = args;

  for (const tdfFile of unzippedFiles.filter((file) => file.type === 'tdf')) {
    const tdf = await deps.Tdfs.findOneAsync({ tdfFileName: tdfFile.name });
    if (tdf && tdf.content && tdf.content.tdfs && tdf.content.tdfs.tutor && tdf.content.tdfs.tutor.unit) {
      const responseKCMap = tdf._id ? await deps.getResponseKCMapForTdf(tdf._id) : {};
      const scopedStimuliSetId = tdf.stimuliSetId ?? state.stimSetId;
      const uploadedMediaPathMap = state.uploadedMediaPathMapsByStimSetId.get(String(scopedStimuliSetId ?? '').trim());
      const processedTdf = await deps.processAudioFilesForTDF(tdf.content.tdfs, scopedStimuliSetId, {
        rejectUnresolved: true,
        allowFilenameLookup: false,
        uploadedMediaPathMap,
        requireUploadedMediaMatch: true
      });
      tdf.content.tdfs.tutor.unit = processedTdf.tutor.unit;

      if (tdf.rawStimuliFile && scopedStimuliSetId !== undefined && scopedStimuliSetId !== null) {
        await deps.canonicalizeStimDisplayMediaRefs(tdf.rawStimuliFile, scopedStimuliSetId, {
          rejectUnresolved: true,
          allowFilenameLookup: false,
          uploadedMediaPathMap,
          requireUploadedMediaMatch: true
        });
        const oldStimFormat = {
          fileName: tdf.stimulusFileName || tdf.content?.tdfs?.tutor?.setspec?.stimulusfile || 'unknown',
          stimuli: tdf.rawStimuliFile,
          owner: tdf.ownerId,
          source: 'upload'
        };
        const canonicalStimuli = deps.getNewItemFormat(
          oldStimFormat,
          String(oldStimFormat.fileName),
          scopedStimuliSetId,
          responseKCMap
        );
        await deps.canonicalizeFlatStimuliMediaRefs(canonicalStimuli, scopedStimuliSetId, {
          rejectUnresolved: true,
          allowFilenameLookup: false,
          uploadedMediaPathMap,
          requireUploadedMediaMatch: true
        });
        tdf.stimuli = canonicalStimuli;
      }
      await deps.Tdfs.upsertAsync({ _id: tdf._id }, tdf);
    }
  }
}
