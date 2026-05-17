import type { UploadedPackageFile } from './packageParser';
import type { PackageUploadRuntimeState, ProcessPackageUploadDeps } from './packageUploadShared';
import {
  extractH5PContentReferences,
  getMissingH5PLibraryFolders,
  storeH5PLibrariesFromPackage,
  storeH5PPackageFile,
} from './h5pPackage';

async function upsertReferencedH5PContent(args: {
  tdf: any;
  h5pFilesByName: Map<string, UploadedPackageFile>;
  deps: ProcessPackageUploadDeps;
  scopedStimuliSetId: string | number | null | undefined;
}) {
  const { tdf, h5pFilesByName, deps, scopedStimuliSetId } = args;
  const h5pStore = deps.H5PContents;
  if (!h5pStore || !tdf?.rawStimuliFile) {
    return;
  }

  const references = extractH5PContentReferences(tdf.rawStimuliFile);
  for (const reference of references) {
    const file = h5pFilesByName.get(reference.packageAssetId.toLowerCase());
    if (!file) {
      throw new Error(`H5P package "${reference.packageAssetId}" referenced by "${reference.contentId}" was not found in the uploaded package.`);
    }
    const parsed = await storeH5PPackageFile(file, reference.contentId);
    if (parsed.library !== reference.library) {
      throw new Error(`H5P package "${reference.packageAssetId}" declares "${parsed.library}", but stimulus "${reference.contentId}" expects "${reference.library}".`);
    }
    const missingLibraryFolders = await getMissingH5PLibraryFolders(parsed.requiredLibraryFolders);
    if (missingLibraryFolders.length > 0) {
      throw new Error(
        `H5P package "${reference.packageAssetId}" requires H5P libraries that are not installed: ${missingLibraryFolders.join(', ')}. ` +
        'Upload a package that contains those library folders once, then upload this content package again.'
      );
    }

    const asset = typeof deps.DynamicAssets.findOneAsync === 'function'
      ? await deps.DynamicAssets.findOneAsync({
          name: reference.packageAssetId,
          'meta.stimuliSetId': scopedStimuliSetId
        }, { fields: { _id: 1, name: 1, fileName: 1, path: 1, meta: 1 } })
      : await deps.DynamicAssets.collection.findOneAsync({
          name: reference.packageAssetId,
          'meta.stimuliSetId': scopedStimuliSetId
        });
    if (!asset?._id) {
      throw new Error(`Uploaded H5P asset "${reference.packageAssetId}" was not saved for stimuli set ${scopedStimuliSetId}.`);
    }

    await h5pStore.upsertAsync(
      { contentId: reference.contentId },
      {
        $set: {
          contentId: reference.contentId,
          packageAssetId: reference.packageAssetId,
          assetId: asset._id,
          stimuliSetId: scopedStimuliSetId,
          tdfId: tdf._id,
          library: parsed.library,
          mainLibrary: parsed.mainLibrary,
          title: parsed.title,
          packageHash: parsed.hash,
          contentParams: parsed.contentParams,
          storagePath: parsed.storagePath,
          requiredLibraryFolders: parsed.requiredLibraryFolders,
          bundledLibraryFolders: parsed.bundledLibraryFolders,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      }
    );
  }
}

export async function postProcessUploadedTdfs(args: {
  unzippedFiles: UploadedPackageFile[];
  deps: ProcessPackageUploadDeps;
  state: PackageUploadRuntimeState;
}) {
  const { unzippedFiles, deps, state } = args;
  const h5pFilesByName = new Map(
    unzippedFiles
      .filter((file) => file.extension.toLowerCase() === 'h5p')
      .map((file) => [file.name.toLowerCase(), file])
  );
  for (const h5pFile of h5pFilesByName.values()) {
    await storeH5PLibrariesFromPackage(h5pFile);
  }

  for (const tdfFile of unzippedFiles.filter((file) => file.type === 'tdf')) {
    const tdf = await deps.Tdfs.findOneAsync({ tdfFileName: tdfFile.name });
    const setspec = tdf?.content?.tdfs?.tutor?.setspec;
    if (setspec && Array.isArray(setspec.condition) && setspec.condition.length > 0) {
      const conditionTdfIds = await deps.resolveConditionTdfIds(setspec);
      if (conditionTdfIds.some((id) => !id)) {
        throw new Error(`TDF "${tdfFile.name}" references condition TDFs that were not found after package upload.`);
      }
      setspec.conditionTdfIds = conditionTdfIds;
    }
    if (tdf && tdf.content && tdf.content.tdfs && tdf.content.tdfs.tutor && tdf.content.tdfs.tutor.unit) {
      const responseKCMap = tdf._id ? await deps.getResponseKCMapForTdf(tdf._id) : {};
      const scopedStimuliSetId = tdf.stimuliSetId ?? state.stimSetId;
      const uploadedMediaPathMap = state.uploadedMediaPathMapsByStimSetId.get(String(scopedStimuliSetId ?? '').trim());
      await upsertReferencedH5PContent({ tdf, h5pFilesByName, deps, scopedStimuliSetId });
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
    }
    if (tdf) {
      await deps.Tdfs.upsertAsync({ _id: tdf._id }, tdf);
    }
  }
}
