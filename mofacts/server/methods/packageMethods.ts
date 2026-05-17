import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import type { UploadedPackageFile } from '../lib/packageParser';
import { processPackageUploadWorkflow } from '../lib/packageUpload';
import type { PackageUploadIntegrity } from '../lib/packageUploadShared';

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

type SaveContentResult = {
  result: boolean | null;
  errmsg: string;
  action: string;
  data?: unknown;
  tdfFileName?: string;
};

type TdfSetspecLike = {
  lessonname: string;
  tips?: string[];
  condition?: string[];
  conditionTdfIds?: Array<string | null>;
  shuffleclusters?: unknown;
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
  fileName: string;
  packageFile?: string;
  packageAssetId?: string;
  stimFileName: string;
  stimuli: unknown;
  tdfs: TdfPayload['tdfs'];
};

type UpsertPendingResult = {
  res?: string;
  reason: string[];
  stimuliSetId?: string | number | null;
  TDF?: UnknownRecord;
};

type UpsertResult = {
  res?: string;
  reason?: string[];
  stimuliSetId?: string | number | null;
  TDF?: UnknownRecord;
  result?: boolean;
  errmsg?: string;
};

type PackageMethodsDeps = {
  Tdfs: any;
  DynamicAssets: any;
  H5PContents?: any;
  UserUploadQuota: any;
  AuditLog: any;
  ownerEmail: string;
  serverConsole: (...args: unknown[]) => void;
  sendEmail: (to: string, from: string, subject: string, text: string) => void;
  getCurrentUser: () => Promise<any>;
  userIsInRoleAsync: (userId: string, roles: string[]) => Promise<boolean>;
  normalizeCanonicalId: (value: unknown) => string | null;
  getResponseKCAnswerKey: (answer: unknown) => string;
  getTdfByFileName: (filename: string) => Promise<any>;
  getTdfsByFileNameOrId: (keys: unknown[]) => Promise<any[]>;
  getStimuliSetIdByFilename: (stimFileName: string) => Promise<string | number | null | undefined>;
  userCanManageTdf: (userId: string, tdf: any) => Promise<boolean> | boolean;
  allocateNextStimuliSetId: () => number;
  getNewItemFormat: (oldStimFormat: any, fileName: string, stimuliSetId: any, responseKCMap: Record<string, unknown>) => any[];
  legacyTrim: (value: unknown) => string;
  encryptData: (value: string) => string;
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

export function createPackageMethods(deps: PackageMethodsDeps) {
  async function requireContentUploadActor(thisArg: MethodContext, requestedOwner: unknown) {
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

  async function processPackageUpload(this: MethodContext, fileObjOrId: string | DynamicAssetLike, owner: string, _zipLink: string, emailToggle: boolean, integrity?: PackageUploadIntegrity){
    return processPackageUploadWorkflow(this, fileObjOrId, owner, emailToggle, {
      DynamicAssets: deps.DynamicAssets,
      userIsInRoleAsync: deps.userIsInRoleAsync,
      normalizeCanonicalId: deps.normalizeCanonicalId,
      serverConsole: deps.serverConsole,
      encryptData: deps.encryptData,
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
      H5PContents: deps.H5PContents,
      resolveConditionTdfIds,
      getResponseKCMapForTdf,
      processAudioFilesForTDF: deps.processAudioFilesForTDF,
      canonicalizeStimDisplayMediaRefs: deps.canonicalizeStimDisplayMediaRefs,
      getNewItemFormat: deps.getNewItemFormat,
      canonicalizeFlatStimuliMediaRefs: deps.canonicalizeFlatStimuliMediaRefs
    }, integrity);
  }

  async function saveMediaFile(media: UploadedPackageFile, owner: string, stimSetId: string | number | null | undefined){
    deps.serverConsole("Uploading:", media.name);
    const scopedQuery: Record<string, unknown> = { name: media.name };
    if (stimSetId !== undefined && stimSetId !== null) {
      scopedQuery['meta.stimuliSetId'] = stimSetId;
    } else {
      scopedQuery.userId = owner;
    }
    const existingFiles = await deps.DynamicAssets.find(scopedQuery).fetchAsync();
    if (existingFiles.length > 0) {
      for (const existing of existingFiles) {
        await deps.DynamicAssets.removeAsync({_id: existing._id});
      }
      deps.serverConsole(`File ${media.name} already exists in scope, overwritting ${existingFiles.length} record(s).`);
    } else {
      deps.serverConsole(`File ${media.name} doesn't exist, uploading`)
    }

    const mimeType = deps.getMimeTypeForAssetName(media.name);

    try {
      const fileRef = await deps.DynamicAssets.writeAsync(media.contents, {
        fileName: media.name,
        userId: owner,
        type: mimeType,
        meta: {
          stimuliSetId: stimSetId,
          public: true
        }
      });

      deps.serverConsole(`File ${media.name} uploaded successfully`);
      return fileRef;
    } catch (error: unknown) {
      deps.serverConsole(`File ${media.name} could not be uploaded`, error);
      throw error;
    }
  }

  async function validateStimAndTdf(tdfJson: unknown, stimJson: unknown, tdfFileName: string, stimFileName: string) {
    const stimDoc = stimJson as { setspec?: { clusters?: Array<{ stims?: Array<{ response?: { correctResponse?: unknown }; display?: Record<string, unknown> }> }> } } | null;
    const tdfDoc = tdfJson as { tutor?: { setspec?: { lessonname?: string; stimulusfile?: string }; unit?: unknown[]; unitTemplate?: unknown[] } };
    const scopedStimuliSetId = await deps.getStimuliSetIdByFilename(stimFileName);
    if (!stimDoc || !stimDoc.setspec || !Array.isArray(stimDoc.setspec.clusters)) {
      return { result: false, errmsg: `Stimulus file "${stimFileName}" missing clusters array.` };
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
        const h5pOwnsResponse = (stim.display as Record<string, unknown> | undefined)?.h5p
          && ((stim.display as Record<string, unknown>).h5p as Record<string, unknown>).sourceType === 'self-hosted';
        if (!h5pOwnsResponse && (!stim.response || typeof stim.response !== 'object' || !Object.prototype.hasOwnProperty.call(stim.response, 'correctResponse'))) {
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

  async function saveContentFile(this: MethodContext, type: string, filename: string, filecontents: unknown, owner: string, packagePath: string | null = null) {
    deps.serverConsole('saveContentFile', type, filename, owner);
    const results: SaveContentResult = {
      'result': null,
      'errmsg': 'No action taken?',
      'action': 'None',
    };
    const touchedStimuliSetIds = new Set();
    if (!type) throw new Error('Type required for File Save');
    if (!filename) throw new Error('Filename required for File Save');
    if (!filecontents) throw new Error('File Contents required for File Save');
    const { ownerId } = await requireContentUploadActor(this, owner);
    if (type != 'tdf' && type != 'stim') throw new Error('Unknown file type not allowed: ' + type);

    try {
      if (type == 'tdf') {
        let jsonContents;
        try {
          jsonContents = typeof filecontents == 'string' ? JSON.parse(filecontents) : filecontents;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          results.result = false;
          results.errmsg = `Error parsing JSON in file "${filename}": ${message}`;
          return results;
        }
        const stimFileName = jsonContents.tutor.setspec.stimulusfile;
        const stimTdf = await deps.Tdfs.findOneAsync({stimulusFileName: stimFileName});
        const stimJson = stimTdf ? stimTdf.rawStimuliFile : null;
        const validation = await validateStimAndTdf(jsonContents, stimJson, filename, stimFileName);
        if (!validation.result) {
          results.result = false;
          results.errmsg = validation.errmsg || 'Validation failed';
          return results;
        }
        const upsertResult = await upsertTDFFile(
          filename,
          {fileName: filename, tdfs: jsonContents, ownerId: ownerId, source: 'upload'},
          ownerId,
          packagePath
        );
        if (upsertResult?.stimuliSetId !== undefined && upsertResult?.stimuliSetId !== null) {
          touchedStimuliSetIds.add(upsertResult.stimuliSetId);
        }
      } else if (type === 'stim') {
        let jsonContents;
        try {
          jsonContents = typeof filecontents == 'string' ? JSON.parse(filecontents) : filecontents;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          results.result = false;
          results.errmsg = `Error parsing JSON in stimulus file "${filename}": ${message}`;
          return results;
        }
        const stimuliSetId = await upsertStimFile(filename, jsonContents, ownerId, packagePath);
        if (stimuliSetId !== undefined && stimuliSetId !== null) {
          touchedStimuliSetIds.add(stimuliSetId);
        }
        results.data = jsonContents;
      }
    } catch (e: unknown) {
      const stack = e instanceof Error ? e.stack : undefined;
      deps.serverConsole('ERROR saving content file:', e, stack);
      results.result = false;
      const message = e instanceof Error ? e.message : String(e);
      results.errmsg = `saveContentFile error in file "${filename}": ${message}`;
      return results;
    }

    if (touchedStimuliSetIds.size > 0) {
      await deps.updateStimDisplayTypeMap(Array.from(touchedStimuliSetIds));
    }

    results.result = true;
    results.errmsg = '';
    return results;
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
    await deps.Tdfs.upsertAsync({"content.tdfs.tutor.setspec.stimulusfile": stimulusFileName}, {$set: {
      stimulusFileName: stimulusFileName,
      stimuliSetId: stimuliSetId,
      rawStimuliFile: stimJSON,
      stimuli: formattedStims,
    }}, {multi: true});

    return stimuliSetId
  }

  async function resolveConditionTdfIds(setspec: { condition?: string[] } = {}) {
    const conditions = Array.isArray(setspec.condition) ? setspec.condition : [];
    if (!conditions.length) {
      return [];
    }

    const normalizedConditions = conditions.map((entry) => (typeof entry === 'string' ? entry.trim() : ''));
    const conditionDocs = await deps.getTdfsByFileNameOrId(normalizedConditions);
    const conditionIdByKey = new Map<string, string>();
    for (const conditionDoc of conditionDocs) {
      const resolvedId = typeof conditionDoc?._id === 'string' ? conditionDoc._id : '';
      if (!resolvedId) {
        continue;
      }
      conditionIdByKey.set(resolvedId, resolvedId);
      const fileName = typeof conditionDoc?.content?.fileName === 'string'
        ? conditionDoc.content.fileName.trim()
        : '';
      if (fileName && !conditionIdByKey.has(fileName)) {
        conditionIdByKey.set(fileName, resolvedId);
      }
    }

    return normalizedConditions.map((entry) => (entry ? (conditionIdByKey.get(entry) || null) : null));
  }

  async function enforceConditionChildUserSelect(conditionTdfIds: Array<string | null>) {
    const validIds = conditionTdfIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    for (const id of validIds) {
      await deps.Tdfs.updateAsync(
        { _id: id },
        { $set: { 'content.tdfs.tutor.setspec.userselect': 'false' } }
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

  async function upsertTDFFile(tdfFilename: string, tdfJSON: TdfPayload, ownerId: string, packagePath: string | null = null): Promise<UpsertResult> {
    deps.serverConsole('upsertTDFFile', tdfFilename);
    let ret: UpsertPendingResult = {reason: []};
    const Tdf = tdfJSON.tdfs;
    const lessonName = deps.legacyTrim(Tdf.tutor.setspec.lessonname);
    const prev = await deps.getTdfByFileName(tdfFilename);
    let stimuliSetId = prev?.stimuliSetId;
    if (!stimuliSetId) {
      stimuliSetId = deps.allocateNextStimuliSetId();
    } else {
      ret = {res: 'awaitClientTDF', reason: ['prevStimExists']}
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
    Tdf.tutor.setspec.conditionTdfIds = await resolveConditionTdfIds(Tdf.tutor.setspec);
    tdfJSON = {'fileName': tdfFilename, 'tdfs': Tdf, 'ownerId': ownerId, 'source': 'upload'};
    let tdfJSONtoUpsert: TdfPayload;
    let formattedStims: unknown[] = [];
    if (prev && prev._id) {
      formattedStims = prev.formattedStims;
      deps.serverConsole('updating tdf', tdfFilename, formattedStims);
      tdfJSONtoUpsert = tdfJSON;
      const updateObj = {
        _id: prev._id,
        ownerId: ownerId,
        stimuliSetId: stimuliSetId,
        content: tdfJSONtoUpsert
      };
      if(ret.res != 'awaitClientTDF'){
        ret.res = 'awaitClientTDF';
      }
      ret.stimuliSetId = stimuliSetId;
      ret.TDF = updateObj;
      ret.reason.push('prevTDFExists');
      return ret;
    } else {
      formattedStims = [];
      deps.serverConsole('inserting tdf', tdfFilename, formattedStims);
      tdfJSON.createdAt = new Date();
      tdfJSONtoUpsert = tdfJSON;
    }
    const conditionCounts = tdfJSONtoUpsert.tdfs.tutor.setspec.condition ? new Array(tdfJSONtoUpsert.tdfs.tutor.setspec.condition.length).fill(0) : [];

    await deps.Tdfs.upsertAsync({_id: prev._id}, {$set: {
      path: packagePath,
      content: tdfJSONtoUpsert,
      ownerId: ownerId,
      conditionCounts: conditionCounts
      }});
    await enforceConditionChildUserSelect(Tdf.tutor.setspec.conditionTdfIds ?? []);

    return {res: 'upserted', stimuliSetId};
  }

  async function upsertPackage(packageJSON: PackagePayload, ownerId: string): Promise<UpsertResult> {
    deps.serverConsole('upsertPackage', packageJSON.packageFile || 'unknown');
    const stimulusFileName = packageJSON.stimFileName
    const stimJSON = packageJSON.stimuli
    const packageFile = packageJSON.packageFile
    const packageAssetId = deps.normalizeCanonicalId(packageJSON.packageAssetId);
    if (!packageAssetId) {
      throw new Meteor.Error(500, 'Package asset id missing during package upsert');
    }
    let ret: UpsertPendingResult = {reason: []};
    const Tdf = packageJSON.tdfs;
    const lessonName = deps.legacyTrim(Tdf.tutor.setspec.lessonname);
    const prev = await deps.getTdfByFileName(packageJSON.fileName);
    const responseKCMap = prev?._id ? await getResponseKCMapForTdf(prev._id) : {};
    let stimuliSetId = prev ? prev.stimuliSetId : null;
    if (!stimuliSetId) {
      stimuliSetId = deps.allocateNextStimuliSetId();
    } else {
      ret = {res: 'awaitClientTDF', reason: ['prevStimExists']}
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
    Tdf.tutor.setspec.conditionTdfIds = await resolveConditionTdfIds(Tdf.tutor.setspec);
    const tdfJSON: TdfPayload = {'fileName': packageJSON.fileName, 'tdfs': Tdf, 'ownerId': ownerId, 'source': 'upload'};
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

    let tdfJSONtoUpsert: TdfPayload;
    if (prev && prev._id) {
      tdfJSONtoUpsert = tdfJSON;
      const updateObj = {
        _id: prev._id,
        tdfFileName: packageJSON.fileName,
        content: tdfJSONtoUpsert,
        ownerId: ownerId,
        packageFile: packageFile,
        packageAssetId: packageAssetId,
        rawStimuliFile: stimJSON,
        stimuli: formattedStims,
        stimuliSetId: stimuliSetId
      };
      if(ret.res != 'awaitClientTDF'){
        ret.res = 'awaitClientTDF';
      }
      ret.stimuliSetId = stimuliSetId;
      ret.TDF = updateObj;
      ret.reason.push('prevTDFExists');
      return ret;
    } else {
      tdfJSON.createdAt = new Date();
      tdfJSONtoUpsert = tdfJSON;
    }
    const conditionCounts = tdfJSONtoUpsert.tdfs.tutor.setspec.condition ? new Array(tdfJSONtoUpsert.tdfs.tutor.setspec.condition.length).fill(0) : [];

    await deps.Tdfs.upsertAsync({"content.fileName": packageJSON.fileName}, {$set: {
      tdfFileName: packageJSON.fileName,
      content: tdfJSONtoUpsert,
      ownerId: ownerId,
      packageFile: packageFile,
      packageAssetId: packageAssetId,
      rawStimuliFile: stimJSON,
      stimuli: formattedStims,
      stimuliSetId: stimuliSetId,
      conditionCounts: conditionCounts
    }});
    await enforceConditionChildUserSelect(Tdf.tutor.setspec.conditionTdfIds ?? []);

    return {stimuliSetId: stimuliSetId}
  }

  async function tdfUpdateConfirmed(
    this: MethodContext,
    updateObj: { _id: string; TDFId?: string; stimuliSetId?: string | number } & UnknownRecord,
    resetShuffleClusters: boolean = false,
    policyReasons: string[] = []
  ){
    deps.serverConsole('tdfUpdateConfirmed for TDF:', updateObj.TDFId || 'unknown');
    const actingUserId = deps.normalizeCanonicalId(this.userId);
    if (!actingUserId) {
      throw new Meteor.Error(401, 'Must be logged in');
    }
    if (!updateObj || typeof updateObj !== 'object' || Array.isArray(updateObj)) {
      throw new Meteor.Error(400, 'Invalid TDF update');
    }
    const targetTdfId = deps.normalizeCanonicalId(updateObj._id) || deps.normalizeCanonicalId(updateObj.TDFId);
    if (!targetTdfId) {
      throw new Meteor.Error(400, 'TDF id is required');
    }
    updateObj._id = targetTdfId;
    const existingTdf = await deps.Tdfs.findOneAsync({ _id: targetTdfId });
    if (existingTdf) {
      const canManage = await deps.userCanManageTdf(actingUserId, existingTdf);
      if (!canManage) {
        throw new Meteor.Error(403, 'You do not have permission to confirm this TDF update');
      }
    } else {
      const requestedOwnerId = deps.normalizeCanonicalId((updateObj as any).ownerId);
      const isAdmin = await deps.userIsInRoleAsync(actingUserId, ['admin']);
      if (requestedOwnerId && requestedOwnerId !== actingUserId && !isAdmin) {
        throw new Meteor.Error(403, 'Can only confirm your own TDF updates unless admin');
      }
      if (!requestedOwnerId) {
        updateObj.ownerId = actingUserId;
      }
    }
    void resetShuffleClusters;
    void policyReasons;
    await deps.Tdfs.upsertAsync({_id: updateObj._id},{$set:updateObj});
    const confirmedConditionTdfIds = (updateObj as any)?.content?.tdfs?.tutor?.setspec?.conditionTdfIds;
    if (Array.isArray(confirmedConditionTdfIds)) {
      await enforceConditionChildUserSelect(confirmedConditionTdfIds);
    }
    if (updateObj?.stimuliSetId !== undefined && updateObj?.stimuliSetId !== null) {
      await deps.updateStimDisplayTypeMap([updateObj.stimuliSetId]);
    } else {
      const currentTdf = await deps.Tdfs.findOneAsync(
        { _id: updateObj._id },
        { fields: { stimuliSetId: 1 } }
      );
      if (currentTdf?.stimuliSetId !== undefined && currentTdf?.stimuliSetId !== null) {
        await deps.updateStimDisplayTypeMap([currentTdf.stimuliSetId]);
      } else {
        await deps.rebuildStimDisplayTypeMapSnapshot(deps.getStimDisplayTypeMapDeps());
      }
    }
  }

  async function saveTdfStimuli(this: MethodContext, tdfId: string, updatedRawStimuliFile: UnknownRecord, filteredStimuli: unknown[] | null | undefined) {
    check(tdfId, String);
    check(updatedRawStimuliFile, Object);
    check(filteredStimuli, Match.OneOf(Array, null, undefined));

    const tdf = await deps.Tdfs.findOneAsync({_id: tdfId});
    if (!tdf) {
      throw new Meteor.Error('not-found', 'TDF not found');
    }

    const canManage = await deps.userCanManageTdf(this.userId || '', tdf);
    if (!canManage) {
      throw new Meteor.Error('not-authorized', 'You do not have permission to edit this content');
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
      }
    });

    await deps.updateStimDisplayTypeMap([stimuliSetId]);
    deps.serverConsole('saveTdfStimuli: Updated TDF', tdfId, 'with', stimuliToSave.length, 'stimuli');

    return { success: true, stimuliCount: stimuliToSave.length };
  }

  async function saveTdfContent(
    this: MethodContext,
    tdfId: string,
    tdfContent: { tdfs?: { tutor?: { setspec?: { lessonname?: string; speechAPIKey?: string; textToSpeechAPIKey?: string; condition?: string[]; conditionTdfIds?: Array<string | null>; [key: string]: unknown } } } } & UnknownRecord,
    apiKeyUpdates: { speechAPIKey?: boolean; textToSpeechAPIKey?: boolean } = {}
  ) {
    check(tdfId, String);
    check(tdfContent, Object);
    check(apiKeyUpdates, Object);

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

    const setspec = tdfContent.tdfs?.tutor?.setspec;
    if (setspec) {
      if (apiKeyUpdates.speechAPIKey && setspec.speechAPIKey) {
        setspec.speechAPIKey = deps.encryptData(setspec.speechAPIKey);
        deps.serverConsole('saveTdfContent: Encrypted new speechAPIKey');
      }
      if (apiKeyUpdates.textToSpeechAPIKey && setspec.textToSpeechAPIKey) {
        setspec.textToSpeechAPIKey = deps.encryptData(setspec.textToSpeechAPIKey);
        deps.serverConsole('saveTdfContent: Encrypted new textToSpeechAPIKey');
      }
      setspec.conditionTdfIds = await resolveConditionTdfIds(setspec);
    }
    const tutor = tdfContent.tdfs?.tutor as { unit?: Array<{ unitinstructions?: string; unitinstructionsquestion?: string }> } | undefined;
    if (tutor?.unit && Array.isArray(tutor.unit)) {
      await deps.processAudioFilesForTDF({ tutor: { unit: tutor.unit } }, tdf.stimuliSetId, {
        rejectUnresolved: true,
        allowFilenameLookup: true
      });
    }

    await deps.Tdfs.updateAsync({_id: tdfId}, {
      $set: {
        content: tdfContent
      }
    });

    deps.serverConsole('saveTdfContent: Updated TDF', tdfId, 'lesson:', tdfContent.tdfs?.tutor?.setspec?.lessonname || '');

    return { success: true };
  }

  function escapeRegex(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async function copyTdf(this: MethodContext, sourceTdfId: string) {
    check(sourceTdfId, String);

    const userId = this.userId;
    if (!userId) throw new Meteor.Error('not-authorized', 'Must be logged in to copy TDF');

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

    const newId = await deps.Tdfs.insertAsync(newTdf);
    deps.serverConsole('copyTdf: Created copy', newId, 'of TDF', sourceTdfId, 'with name', newName);

    return { newTdfId: newId, newName };
  }

  return {
    getResponseKCMapForTdf,
    getMaxResponseKC,
    processPackageUpload,
    saveContentFile,
    tdfUpdateConfirmed,
    saveTdfStimuli,
    saveTdfContent,
    copyTdf,
    upsertStimFile,
    upsertTDFFile,
    resolveConditionTdfIds,
    normalizeOptionalString,
  };
}
