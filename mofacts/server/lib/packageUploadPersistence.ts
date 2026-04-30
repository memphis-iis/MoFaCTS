import type { UploadedPackageFile } from './packageParser';
import {
  failPackageUpload,
  getStimuliSetIdFromPackageResult,
  type DynamicAssetLike,
  type PackageUploadRuntimeState,
  type ProcessPackageUploadDeps,
  type SaveContentResult,
} from './packageUploadShared';

export async function processParsedPackageTdfs(args: {
  unzippedFiles: UploadedPackageFile[];
  fileObj: DynamicAssetLike;
  packageFile: string;
  packageAssetId: string;
  zipPath: string;
  owner: string;
  isTeacherOrAdmin: boolean;
  emailToggle: boolean;
  deps: ProcessPackageUploadDeps;
  state: PackageUploadRuntimeState;
}) {
  const {
    unzippedFiles, fileObj, packageFile, packageAssetId, zipPath, owner,
    isTeacherOrAdmin, emailToggle, deps, state
  } = args;

  const firstTdf = unzippedFiles.find((file) => file.type === 'tdf');
  state.fileName = firstTdf?.name || fileObj.name || packageFile;
  state.filePath = zipPath || fileObj.path || packageFile;

  const firstStim = unzippedFiles.find((file) => file.type === 'stim');
  const stimFileName = firstStim?.name;
  const touchedStimuliSetIds = new Set<string | number>();
  const results: SaveContentResult[] = [];
  const childUserSelectByFileName = new Map<string, string>();

  for (const rootCandidate of unzippedFiles.filter((file) => file.type === 'tdf')) {
    const rootContents = rootCandidate.contents as {
      tutor?: {
        setspec?: {
          condition?: unknown;
          userselect?: unknown;
        };
      };
    };
    const rootSetspec = rootContents?.tutor?.setspec;
    const rootConditions = Array.isArray(rootSetspec?.condition) ? rootSetspec.condition : [];
    if (rootConditions.length === 0) {
      continue;
    }
    const rootUserSelect = String(rootSetspec?.userselect || 'false').trim().toLowerCase() === 'true'
      ? 'true'
      : 'false';
    for (const condition of rootConditions) {
      if (typeof condition !== 'string' || !condition.trim()) {
        throw new Error(`Root TDF "${rootCandidate.name}" has an invalid condition reference.`);
      }
      const conditionFileName = condition.trim();
      const previous = childUserSelectByFileName.get(conditionFileName);
      if (previous && previous !== rootUserSelect) {
        throw new Error(`Condition TDF "${conditionFileName}" is referenced by roots with conflicting public/private settings.`);
      }
      childUserSelectByFileName.set(conditionFileName, rootUserSelect);
    }
  }

  try {
    for (const tdf of unzippedFiles.filter((file) => file.type === 'tdf')) {
      state.fileName = tdf.name || fileObj.name || packageFile;
      state.filePath = tdf.name ? `${zipPath}!${tdf.name}` : zipPath || packageFile;

      const tdfContents = tdf.contents as {
        tutor: {
          setspec: {
            stimulusfile: string;
            textToSpeechAPIKey?: string;
            speechAPIKey?: string;
            userselect?: string;
            experimentTarget?: string;
            lessonname?: unknown;
          };
        };
      };
      const stim = unzippedFiles.find((file) => file.name === tdfContents.tutor.setspec.stimulusfile);
      deps.serverConsole(
        'Processing stimFileName:',
        stimFileName,
        'from setspec:',
        tdfContents.tutor.setspec.stimulusfile
      );
      tdf.packageFile = packageFile;

      if (tdfContents.tutor.setspec.textToSpeechAPIKey) {
        tdfContents.tutor.setspec.textToSpeechAPIKey = deps.encryptData(tdfContents.tutor.setspec.textToSpeechAPIKey);
      }
      if (tdfContents.tutor.setspec.speechAPIKey) {
        tdfContents.tutor.setspec.speechAPIKey = deps.encryptData(tdfContents.tutor.setspec.speechAPIKey);
      }
      if (!isTeacherOrAdmin) {
        tdfContents.tutor.setspec.userselect = 'false';
      }
      const inheritedUserSelect = childUserSelectByFileName.get(tdf.name);
      if (inheritedUserSelect) {
        tdfContents.tutor.setspec.userselect = inheritedUserSelect;
      }

      const packageResult: SaveContentResult = { result: null, errmsg: 'No action taken?', action: 'None' };
      try {
        const jsonContents = typeof tdf.contents === 'string' ? JSON.parse(tdf.contents) : tdf.contents;
        if (jsonContents.tutor.setspec.experimentTarget) {
          jsonContents.tutor.setspec.experimentTarget = jsonContents.tutor.setspec.experimentTarget.toLowerCase();
        }
        const json = { tutor: jsonContents.tutor };
        const lessonName = deps.legacyTrim(jsonContents.tutor.setspec.lessonname);
        if (lessonName.length < 1) {
          packageResult.result = false;
          packageResult.errmsg = 'TDF has no lessonname - it cannot be valid';
          results.push(packageResult);
          continue;
        }
        if (!stim) {
          throw new Error('No matching stimulus file found for TDF');
        }
        const stimContents = typeof stim.contents === 'string' ? JSON.parse(stim.contents) : stim.contents;
        const record = {
          fileName: tdf.name,
          tdfs: json,
          ownerId: owner,
          source: 'upload',
          stimuli: stimContents,
          stimFileName: stim.name,
          packageFile: tdf.packageFile,
          packageAssetId
        };
        const ret = await deps.upsertPackage(record, owner);
        if (ret && (ret as { res?: string }).res === 'awaitClientTDF') {
          deps.serverConsole('awaitClientTDF', ret);
          packageResult.result = false;
        } else {
          packageResult.result = true;
        }
        packageResult.data = ret;
        packageResult.tdfFileName = tdf.name;
      } catch (error: unknown) {
        packageResult.result = false;
        packageResult.errmsg = String(error);
        deps.serverConsole('Error processing TDF:', error);
      }

      results.push(packageResult);
      const resultStimuliSetId = getStimuliSetIdFromPackageResult(packageResult);
      if (resultStimuliSetId !== undefined && resultStimuliSetId !== null) {
        touchedStimuliSetIds.add(resultStimuliSetId);
      }
      deps.serverConsole('packageResult success:', packageResult?.tdfFileName || 'unknown');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await failPackageUpload(emailToggle, deps, {
      zipPath,
      filePath: state.filePath,
      message,
      emailTextPrefix: 'Package upload failed: ',
      errorTextPrefix: 'package upload failed: ',
      logPrefix: '1'
    });
  } finally {
    if (touchedStimuliSetIds.size > 0) {
      await deps.updateStimDisplayTypeMap(Array.from(touchedStimuliSetIds));
    }
  }

  const firstResult = results.length > 0 ? results[0] : undefined;
  const firstResultStimuliSetId = firstResult ? getStimuliSetIdFromPackageResult(firstResult) : undefined;
  if (firstResultStimuliSetId !== undefined && firstResultStimuliSetId !== null) {
    state.stimSetId = firstResultStimuliSetId;
  }
  if (!state.stimSetId && stimFileName) {
    state.stimSetId = await deps.getStimuliSetIdByFilename(stimFileName);
  }

  return { results, touchedStimuliSetIds };
}
