import { Meteor } from 'meteor/meteor';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const crypto = require('crypto');

type DynamicAssetRef = {
  _id?: unknown;
  path?: unknown;
  fileName?: unknown;
  name?: unknown;
  meta?: Record<string, unknown>;
  link?: () => string;
};

type BuildAndStoreCurrentPackageAssetDeps = {
  parseLocalMediaReference: (src: string) => {
    raw?: string;
    isExternal?: boolean;
    assetId?: string;
    fileName?: string;
    isLocalMediaLike?: boolean;
  };
  extractSrcFromHtml: (htmlString: string) => string[];
  getStimuliSetIdCandidates: (stimuliSetId: string | number | null | undefined) => Array<string | number>;
  findDynamicAssetsScopedBatch: (params: {
    stimuliSetIds: Array<string | number | null | undefined>;
    assetIds: string[];
    fileNames: string[];
  }) => Promise<any[]>;
  normalizeCanonicalId: (value: unknown) => string | null;
  decryptData: (value: string) => string;
  resolveConditionTdfIds: (setspec?: { condition?: string[] }) => Promise<Array<string | null>>;
  DynamicAssets: {
    findOneAsync: (selector: Record<string, unknown>, options?: Record<string, unknown>) => Promise<DynamicAssetRef | null>;
    writeAsync: (data: Buffer, options: Record<string, unknown>) => Promise<DynamicAssetRef>;
    removeAsync: (selector: Record<string, unknown>) => Promise<unknown>;
    link: (fileRef: Record<string, unknown>) => string | null;
  };
  Tdfs: {
    find: (selector: Record<string, unknown>, options?: Record<string, unknown>) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: Record<string, unknown>, options?: Record<string, unknown>) => Promise<any>;
    updateAsync: (selector: Record<string, unknown>, modifier: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
  };
};

type PreparedPackageExportEntry = {
  tdfId: string;
  exportTdfDoc: Record<string, unknown>;
  rawStimuliFile: unknown;
  tdfFileName: string;
  stimFileName: string;
  stimuliSetId: string | number | null | undefined;
};

type PreparedPackageExportState = {
  memberTdfs: any[];
  rootTdf: any;
  rootOwnerId: string;
  zipFileName: string;
  packageSignature: string;
  memberIds: string[];
  oldPackageAssetIds: string[];
  preparedEntries: PreparedPackageExportEntry[];
  assetsByZipName: Map<string, any>;
  reusablePackageAssetId: string | null;
};

function hashPackageExportPayload(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cloneJsonValue<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function maybeDecryptPackageExportSecret(value: unknown, deps: BuildAndStoreCurrentPackageAssetDeps): unknown {
  if (typeof value !== 'string' || !value.trim()) {
    return value;
  }
  try {
    const decrypted = deps.decryptData(value);
    return decrypted || value;
  } catch (_error) {
    return value;
  }
}

function isInvalidZipFilename(fileName: string) {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    return true;
  }
  if (fileName === '.' || fileName === '..') {
    return true;
  }
  return fileName.includes('/') || fileName.includes('\\');
}

function sanitizeZipBaseName(fileName: string) {
  const invalidCharacters = '<>:"/\\|?*';
  return Array.from(fileName)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || invalidCharacters.includes(char) ? '_' : char;
    })
    .join('');
}

function normalizePackageExportMediaReference(src: string, deps: BuildAndStoreCurrentPackageAssetDeps) {
  const parsed = deps.parseLocalMediaReference(src);
  if (!parsed.raw || parsed.isExternal) {
    return src;
  }
  if (parsed.fileName && (parsed.assetId || parsed.isLocalMediaLike)) {
    return parsed.fileName;
  }
  return src;
}

function rewriteInstructionHtmlForPackageExport(htmlString: string, deps: BuildAndStoreCurrentPackageAssetDeps) {
  if (!htmlString || typeof htmlString !== 'string') {
    return htmlString;
  }

  let updated = htmlString;
  const srcValues = deps.extractSrcFromHtml(htmlString);
  for (const src of srcValues) {
    const rewritten = normalizePackageExportMediaReference(src, deps);
    if (rewritten && rewritten !== src) {
      updated = updated.split(src).join(rewritten);
    }
  }
  return updated;
}

const PACKAGE_EXPORT_HTML_FIELDS = new Set(['unitinstructions', 'unitinstructionsquestion']);
const PACKAGE_EXPORT_MEDIA_FIELDS = new Set([
  'audioSrc',
  'imgSrc',
  'videoSrc',
  'audioStimulus',
  'imageStimulus',
  'videoStimulus'
]);

function rewriteKnownMediaReferencesForPackageExport(node: unknown, deps: BuildAndStoreCurrentPackageAssetDeps): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      rewriteKnownMediaReferencesForPackageExport(item, deps);
    }
    return;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === 'string') {
      if (PACKAGE_EXPORT_HTML_FIELDS.has(key)) {
        (node as Record<string, unknown>)[key] = rewriteInstructionHtmlForPackageExport(value, deps);
        continue;
      }
      if (PACKAGE_EXPORT_MEDIA_FIELDS.has(key)) {
        (node as Record<string, unknown>)[key] = normalizePackageExportMediaReference(value, deps);
        continue;
      }
    }

    rewriteKnownMediaReferencesForPackageExport(value, deps);
  }
}

function collectPackageMediaReferenceString(
  rawValue: string,
  refs: Set<string>,
  deps: BuildAndStoreCurrentPackageAssetDeps
) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return refs;
  }

  const parsed = deps.parseLocalMediaReference(trimmed);
  if (!parsed.isExternal && (parsed.assetId || parsed.isLocalMediaLike) && parsed.fileName) {
    refs.add(trimmed);
  }
  return refs;
}

function collectKnownPackageMediaReferences(
  node: unknown,
  deps: BuildAndStoreCurrentPackageAssetDeps,
  refs: Set<string> = new Set<string>()
) {
  if (!node || typeof node !== 'object') {
    return refs;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectKnownPackageMediaReferences(item, deps, refs);
    }
    return refs;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === 'string') {
      if (PACKAGE_EXPORT_HTML_FIELDS.has(key)) {
        const srcValues = deps.extractSrcFromHtml(value);
        for (const src of srcValues) {
          collectPackageMediaReferenceString(src, refs, deps);
        }
        continue;
      }

      if (PACKAGE_EXPORT_MEDIA_FIELDS.has(key)) {
        collectPackageMediaReferenceString(value, refs, deps);
        continue;
      }
    }

    collectKnownPackageMediaReferences(value, deps, refs);
  }
  return refs;
}

function getSafePackageExportFileName(rawFileName: unknown, fallbackBaseName = 'lesson.json') {
  const candidate = path.basename(String(rawFileName || '').trim() || fallbackBaseName);
  if (isInvalidZipFilename(candidate)) {
    throw new Meteor.Error(400, `Invalid package export filename: ${String(rawFileName || '')}`);
  }
  return candidate;
}

function getSafePackageExportZipName(rawFileName: unknown, lessonName: unknown) {
  const rawStr = String(rawFileName || '').trim();
  const fromFile = rawStr ? path.basename(rawStr).replace(/\.[^.]+$/, '').trim() : '';
  const fromLesson = String(lessonName || '').trim();
  const baseName = fromFile || fromLesson || 'lesson';
  const safeBaseName = sanitizeZipBaseName(path.basename(baseName)).trim() || 'lesson';
  const zipName = `${safeBaseName}.zip`;
  if (isInvalidZipFilename(zipName)) {
    throw new Meteor.Error(400, `Invalid package export zip filename: ${zipName}`);
  }
  return zipName;
}

async function resolvePackageExportMemberTdfs(rootTdfId: string, deps: BuildAndStoreCurrentPackageAssetDeps) {
  const fields = {
    _id: 1,
    ownerId: 1,
    packageFile: 1,
    packageAssetId: 1,
    stimuliSetId: 1,
    rawStimuliFile: 1,
    'content.fileName': 1,
    'content.tdfs.tutor': 1
  };

  const rootTdf = await deps.Tdfs.findOneAsync({ _id: rootTdfId }, { fields });
  if (!rootTdf) {
    throw new Meteor.Error(404, 'TDF not found');
  }

  const rootSetspec = rootTdf.content?.tdfs?.tutor?.setspec || {};
  const rawConditions = Array.isArray(rootSetspec.condition) ? rootSetspec.condition : [];
  let conditionIds = Array.isArray(rootSetspec.conditionTdfIds)
    ? rootSetspec.conditionTdfIds.map((id: unknown) => deps.normalizeCanonicalId(id))
    : [];

  if (!conditionIds.some(Boolean) && rawConditions.length > 0) {
    conditionIds = await deps.resolveConditionTdfIds(rootSetspec);
  }

  const missingConditions = rawConditions
    .map((condition: unknown, index: number) => ({
      condition: typeof condition === 'string' ? condition.trim() : '',
      resolvedId: conditionIds[index]
    }))
    .filter((entry: { condition: string; resolvedId: string | null | undefined }) => entry.condition && !entry.resolvedId)
    .map((entry: { condition: string }) => entry.condition);

  if (missingConditions.length > 0) {
    throw new Meteor.Error(
      409,
      `Current package is missing one or more condition TDFs: ${missingConditions.join(', ')}`
    );
  }

  const memberIds = [
    rootTdfId,
    ...conditionIds.filter((id: string | null): id is string => typeof id === 'string' && id.length > 0)
  ];

  if (memberIds.length === 1) {
    return [rootTdf];
  }

  const memberDocs = await deps.Tdfs.find({ _id: { $in: memberIds } }, { fields }).fetchAsync();
  const docsById = new Map<string, any>();
  for (const memberDoc of memberDocs) {
    const memberId = deps.normalizeCanonicalId(memberDoc?._id);
    if (memberId) {
      docsById.set(memberId, memberDoc);
    }
  }

  const missingMemberIds = memberIds.filter((memberId) => !docsById.has(memberId));
  if (missingMemberIds.length > 0) {
    throw new Meteor.Error(
      404,
      `Current package is missing one or more TDF records: ${missingMemberIds.join(', ')}`
    );
  }

  return memberIds.map((memberId) => docsById.get(memberId));
}

async function resolvePackageExportAssets(memberTdfs: any[], deps: BuildAndStoreCurrentPackageAssetDeps) {
  const assetsByZipName = new Map<string, any>();
  const pendingLookups: Array<{
    ref: string;
    parsed: ReturnType<BuildAndStoreCurrentPackageAssetDeps['parseLocalMediaReference']>;
    stimuliSetCandidates: Array<string | number>;
  }> = [];

  for (const memberTdf of memberTdfs) {
    const refs = new Set<string>();
    collectKnownPackageMediaReferences(memberTdf?.content?.tdfs?.tutor || {}, deps, refs);
    collectKnownPackageMediaReferences(memberTdf?.rawStimuliFile || {}, deps, refs);

    for (const ref of refs) {
      const parsed = deps.parseLocalMediaReference(ref);
      if (parsed.isExternal || (!parsed.assetId && !parsed.fileName)) {
        continue;
      }
      pendingLookups.push({
        ref,
        parsed,
        stimuliSetCandidates: deps.getStimuliSetIdCandidates(memberTdf?.stimuliSetId ?? null)
      });
    }
  }

  const scopedAssets = await deps.findDynamicAssetsScopedBatch({
    stimuliSetIds: pendingLookups.flatMap((lookup) => lookup.stimuliSetCandidates),
    assetIds: pendingLookups
      .map((lookup) => String(lookup.parsed.assetId || '').trim())
      .filter((assetId) => assetId.length > 0),
    fileNames: pendingLookups
      .map((lookup) => String(lookup.parsed.fileName || '').trim())
      .filter((fileName) => fileName.length > 0)
  });

  const assetsByScopedId = new Map<string, any>();
  const assetsByScopedName = new Map<string, any>();
  for (const asset of scopedAssets) {
    const scopedStimuliSetId = String(asset?.meta?.stimuliSetId ?? '').trim();
    if (!scopedStimuliSetId) {
      continue;
    }
    const assetId = String(asset?._id || '').trim();
    const assetName = String(asset?.name || asset?.fileName || '').trim();
    if (assetId && !assetsByScopedId.has(`${scopedStimuliSetId}::${assetId}`)) {
      assetsByScopedId.set(`${scopedStimuliSetId}::${assetId}`, asset);
    }
    if (assetName && !assetsByScopedName.has(`${scopedStimuliSetId}::${assetName}`)) {
      assetsByScopedName.set(`${scopedStimuliSetId}::${assetName}`, asset);
    }
  }

  for (const lookup of pendingLookups) {
    let asset = null;
    for (const candidate of lookup.stimuliSetCandidates) {
      const scopedStimuliSetId = String(candidate ?? '').trim();
      if (!scopedStimuliSetId) {
        continue;
      }
      if (lookup.parsed.assetId) {
        asset = assetsByScopedId.get(`${scopedStimuliSetId}::${lookup.parsed.assetId}`);
      }
      if (!asset && lookup.parsed.fileName) {
        asset = assetsByScopedName.get(`${scopedStimuliSetId}::${lookup.parsed.fileName}`);
      }
      if (asset) {
        break;
      }
    }

    if (!asset) {
      throw new Meteor.Error(404, `Referenced media asset not found for export: ${lookup.parsed.fileName || lookup.ref}`);
    }

    const zipName = getSafePackageExportFileName(
      (asset as any)?.name || (asset as any)?.fileName || lookup.parsed.fileName,
      lookup.parsed.fileName || 'asset.bin'
    );

    const existingAsset = assetsByZipName.get(zipName);
    if (existingAsset && String(existingAsset._id) !== String((asset as any)?._id || '')) {
      throw new Meteor.Error(
        409,
        `Package export found multiple media assets named "${zipName}". Rename duplicates before downloading.`
      );
    }

    assetsByZipName.set(zipName, asset);
  }

  return assetsByZipName;
}

async function preparePackageExportState(
  rootTdfId: string,
  deps: BuildAndStoreCurrentPackageAssetDeps
): Promise<PreparedPackageExportState> {
  const memberTdfs = await resolvePackageExportMemberTdfs(rootTdfId, deps);
  if (!Array.isArray(memberTdfs) || memberTdfs.length === 0) {
    throw new Meteor.Error(404, 'No TDFs found for package export');
  }

  const rootTdf = memberTdfs[0];
  const rootOwnerId = deps.normalizeCanonicalId(rootTdf?.ownerId);
  if (!rootOwnerId) {
    throw new Meteor.Error(404, 'Package export owner not found');
  }

  const reservedZipNames = new Set<string>();
  const reserveZipEntry = (rawFileName: unknown, fallbackName: string, label: string) => {
    const safeName = getSafePackageExportFileName(rawFileName, fallbackName);
    if (reservedZipNames.has(safeName)) {
      throw new Meteor.Error(409, `Package export cannot include duplicate filename "${safeName}" (${label}).`);
    }
    reservedZipNames.add(safeName);
    return safeName;
  };

  const preparedEntries: PreparedPackageExportEntry[] = [];
  for (const memberTdf of memberTdfs) {
    const memberTdfId = deps.normalizeCanonicalId(memberTdf?._id);
    if (!memberTdfId) {
      throw new Meteor.Error(404, 'Package export found a member TDF with no canonical id');
    }

    const tutorDoc = cloneJsonValue(memberTdf?.content?.tdfs?.tutor || null);
    if (!tutorDoc) {
      throw new Meteor.Error(404, `TDF ${String(memberTdf?._id || '')} is missing tutor content`);
    }

    const rawStimuliFile = cloneJsonValue(memberTdf?.rawStimuliFile || null);
    if (!rawStimuliFile) {
      throw new Meteor.Error(404, `TDF ${String(memberTdf?._id || '')} is missing its stimulus file`);
    }

    const setspec = (tutorDoc as { setspec?: Record<string, unknown> | null })?.setspec;
    if (setspec && typeof setspec === 'object') {
      if (Object.prototype.hasOwnProperty.call(setspec, 'speechAPIKey')) {
        setspec.speechAPIKey = maybeDecryptPackageExportSecret(setspec.speechAPIKey, deps);
      }
      if (Object.prototype.hasOwnProperty.call(setspec, 'textToSpeechAPIKey')) {
        setspec.textToSpeechAPIKey = maybeDecryptPackageExportSecret(setspec.textToSpeechAPIKey, deps);
      }
      delete setspec.conditionTdfIds;
    }

    const exportTdfDoc = { tutor: tutorDoc };
    rewriteKnownMediaReferencesForPackageExport(exportTdfDoc, deps);
    rewriteKnownMediaReferencesForPackageExport(rawStimuliFile, deps);

    const lessonName = typeof setspec?.lessonname === 'string' && setspec.lessonname.trim()
      ? sanitizeZipBaseName(setspec.lessonname.trim()) + '.json'
      : null;
    const tdfFileName = reserveZipEntry(
      lessonName || memberTdf?.content?.fileName,
      `lesson-${String(memberTdf?._id || 'unknown')}.json`,
      'TDF'
    );
    const stimFileName = reserveZipEntry(
      (tutorDoc as { setspec?: { stimulusfile?: unknown } })?.setspec?.stimulusfile,
      `stim-${String(memberTdf?._id || 'unknown')}.json`,
      'stimulus file'
    );

    preparedEntries.push({
      tdfId: memberTdfId,
      exportTdfDoc,
      rawStimuliFile,
      tdfFileName,
      stimFileName,
      stimuliSetId: memberTdf?.stimuliSetId ?? null
    });
  }

  const assetsByZipName = await resolvePackageExportAssets(memberTdfs, deps);
  for (const zipName of assetsByZipName.keys()) {
    reserveZipEntry(zipName, zipName, 'media');
  }

  const zipFileName = getSafePackageExportZipName(
    rootTdf?.content?.fileName,
    rootTdf?.content?.tdfs?.tutor?.setspec?.lessonname
  );
  const memberIds = preparedEntries.map((entry) => entry.tdfId);
  const oldPackageAssetIds = [...new Set(
    memberTdfs
      .map((memberTdf: { packageAssetId?: unknown }) => deps.normalizeCanonicalId(memberTdf?.packageAssetId))
      .filter((value: string | null): value is string => !!value)
  )];
  const reusablePackageAssetId = oldPackageAssetIds.length === 1 ? (oldPackageAssetIds[0] || null) : null;
  const packageSignature = hashPackageExportPayload({
    rootTdfId,
    zipFileName,
    members: preparedEntries.map((entry) => ({
      tdfId: entry.tdfId,
      stimuliSetId: entry.stimuliSetId ?? null,
      tdfFileName: entry.tdfFileName,
      stimFileName: entry.stimFileName,
      exportTdfDoc: entry.exportTdfDoc,
      rawStimuliFile: entry.rawStimuliFile
    })),
    assets: [...assetsByZipName.entries()]
      .map(([zipName, asset]) => ({
        zipName,
        assetId: deps.normalizeCanonicalId(asset?._id),
        assetName: String(asset?.name || asset?.fileName || ''),
        stimuliSetId: asset?.meta?.stimuliSetId ?? null
      }))
      .sort((a, b) => String(a.zipName).localeCompare(String(b.zipName)))
  });

  return {
    memberTdfs,
    rootTdf,
    rootOwnerId,
    zipFileName,
    packageSignature,
    memberIds,
    oldPackageAssetIds,
    preparedEntries,
    assetsByZipName,
    reusablePackageAssetId
  };
}

async function cleanupPackageAssetIfUnreferenced(
  packageAssetId: unknown,
  excludeTdfIds: string[],
  deps: BuildAndStoreCurrentPackageAssetDeps
) {
  const normalizedPackageAssetId = deps.normalizeCanonicalId(packageAssetId);
  if (!normalizedPackageAssetId) {
    return;
  }

  const selector: Record<string, unknown> = { packageAssetId: normalizedPackageAssetId };
  if (excludeTdfIds.length > 0) {
    selector._id = { $nin: excludeTdfIds };
  }

  const stillReferenced = await deps.Tdfs.findOneAsync(selector, { fields: { _id: 1 } });
  if (stillReferenced) {
    return;
  }

  await deps.DynamicAssets.removeAsync({ _id: normalizedPackageAssetId });
}

async function maybeReuseCurrentPackageAsset(
  rootTdfId: string,
  preparedState: PreparedPackageExportState,
  deps: BuildAndStoreCurrentPackageAssetDeps
) {
  const reusablePackageAssetId = preparedState.reusablePackageAssetId;
  if (!reusablePackageAssetId) {
    return null;
  }

  const packageAsset = await deps.DynamicAssets.findOneAsync(
    { _id: reusablePackageAssetId },
    { fields: { _id: 1, name: 1, fileName: 1, meta: 1 } }
  );
  if (!packageAsset) {
    return null;
  }

  const meta = packageAsset.meta || {};
  if (!meta.contentUploadCurrentExport) {
    return null;
  }
  if (String(meta.rootTdfId || '').trim() !== rootTdfId) {
    return null;
  }
  if (String(meta.packageExportSignature || '').trim() !== preparedState.packageSignature) {
    return null;
  }

  const link = typeof packageAsset.link === 'function'
    ? packageAsset.link()
    : deps.DynamicAssets.link({ ...packageAsset });
  if (!link) {
    return null;
  }

  const packageExt = path.extname(preparedState.zipFileName).replace(/^\./, '') || 'zip';
  return {
    link,
    packageFile: `${reusablePackageAssetId}.${packageExt}`,
    packageAssetId: reusablePackageAssetId,
    reusedExisting: true
  };
}

async function buildAndStorePreparedPackageAsset(
  rootTdfId: string,
  preparedState: PreparedPackageExportState,
  deps: BuildAndStoreCurrentPackageAssetDeps
) {
  const zip = new JSZip();

  for (const entry of preparedState.preparedEntries) {
    zip.file(entry.tdfFileName, JSON.stringify(entry.exportTdfDoc, null, 2));
    zip.file(entry.stimFileName, JSON.stringify(entry.rawStimuliFile, null, 2));
  }

  for (const [zipName, asset] of preparedState.assetsByZipName.entries()) {
    const assetPath = typeof asset?.path === 'string' ? asset.path : '';
    if (!assetPath) {
      throw new Meteor.Error(404, `Media asset is missing a readable path: ${zipName}`);
    }
    const buffer = await fs.promises.readFile(assetPath);
    zip.file(zipName, buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const fileRef = await deps.DynamicAssets.writeAsync(zipBuffer, {
    fileName: preparedState.zipFileName,
    userId: preparedState.rootOwnerId,
    type: 'application/zip',
    meta: {
      public: true,
      contentUploadCurrentExport: true,
      rootTdfId,
      packageExportSignature: preparedState.packageSignature
    }
  });

  const packageExt = path.extname(preparedState.zipFileName).replace(/^\./, '') || 'zip';
  const packageAssetId = deps.normalizeCanonicalId(fileRef?._id);
  if (!packageAssetId) {
    throw new Meteor.Error(500, 'Package asset id missing after export');
  }
  const packageFile = `${packageAssetId}.${packageExt}`;

  if (preparedState.memberIds.length > 0) {
    await deps.Tdfs.updateAsync(
      { _id: { $in: preparedState.memberIds } },
      { $set: { packageFile, packageAssetId } },
      { multi: true }
    );
  }

  const stalePackageAssetIds = preparedState.oldPackageAssetIds.filter((oldAssetId) => oldAssetId !== packageAssetId);
  if (stalePackageAssetIds.length > 0) {
    await Promise.all(
      stalePackageAssetIds.map((oldAssetId) => cleanupPackageAssetIfUnreferenced(oldAssetId, preparedState.memberIds, deps))
    );
  }

  const link = typeof fileRef?.link === 'function'
    ? fileRef.link()
    : deps.DynamicAssets.link({ ...fileRef });
  if (!link) {
    throw new Meteor.Error(500, 'Package link unavailable');
  }

  return { link, packageFile, packageAssetId, reusedExisting: false };
}

export async function getOrBuildCurrentPackageAsset(
  rootTdfId: string,
  deps: BuildAndStoreCurrentPackageAssetDeps
) {
  const preparedState = await preparePackageExportState(rootTdfId, deps);
  const reusedAsset = await maybeReuseCurrentPackageAsset(rootTdfId, preparedState, deps);
  if (reusedAsset) {
    return reusedAsset;
  }
  return buildAndStorePreparedPackageAsset(rootTdfId, preparedState, deps);
}
