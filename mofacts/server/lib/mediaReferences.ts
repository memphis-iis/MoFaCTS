import { Meteor } from 'meteor/meteor';
import * as path from 'path';

type UnknownRecord = Record<string, unknown>;

type MediaReferenceDeps = {
  DynamicAssets: any;
  serverConsole: (...args: unknown[]) => void;
};

const LOCAL_MEDIA_EXTENSIONS_REGEX = /\.(mp3|wav|ogg|m4a|aac|flac|webm|mp4|mov|m4v|jpg|jpeg|png|gif|svg|webp|bmp|ico)$/i;
const CDN_ASSET_PATH_REGEX = /^\/cdn\/storage\/Assets\/([^/]+)\/original\/([^/?#]+)$/i;
const DYNAMIC_ASSET_ID_PATH_REGEX = /^\/dynamic-assets\/([A-Za-z0-9_-]+)(?:\/|$)/i;
const MEDIA_MIME_TYPES = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v'
} as const;

function normalizeUploadedMediaLookupKey(value: unknown) {
  return decodeURIComponent(String(value ?? '').trim()).toLowerCase();
}

function extractSrcFromHtml(htmlString: string) {
  if (!htmlString || typeof htmlString !== 'string') {
    return [];
  }

  const srcValues: string[] = [];
  const patterns = [
    /src\s*=\s*"([^"]+)"/gi,
    /src\s*=\s*'([^']+)'/gi,
    /src\s*=\s*([^\s>]+)/gi
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(htmlString)) !== null) {
      let srcValue = String(match[1] ?? '').trim();
      srcValue = srcValue.replace(/[\\"]/g, '');
      if (srcValue && !srcValues.includes(srcValue)) {
        srcValues.push(srcValue);
      }
    }
  });

  return srcValues;
}

export function getMimeTypeForAssetName(fileName: string, fallback = 'application/octet-stream') {
  const extension = path.extname(String(fileName || '')).slice(1).toLowerCase();
  if (!extension) {
    return fallback;
  }
  return MEDIA_MIME_TYPES[extension as keyof typeof MEDIA_MIME_TYPES] || fallback;
}

function toAppRelativePath(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^(?:data:|blob:|#|\/\/)/i.test(trimmed)) return trimmed;
  const absolutePathMatch = trimmed.match(/^https?:\/\/[^/]+(\/.+)$/i);
  let next = absolutePathMatch?.[1] ?? trimmed;
  if (/^(?:cdn|dynamic-assets)\//i.test(next)) {
    next = `/${next}`;
  }
  if (!next.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(next)) {
    next = `/${next}`;
  }
  return next;
}

function getStimuliSetIdCandidates(stimuliSetId: string | number | null | undefined) {
  const candidates: Array<string | number> = [];
  if (stimuliSetId === undefined || stimuliSetId === null || String(stimuliSetId).trim() === '') {
    return candidates;
  }
  candidates.push(stimuliSetId);
  const asString = String(stimuliSetId).trim();
  if (asString.length > 0 && !candidates.includes(asString)) {
    candidates.push(asString);
  }
  const asNumber = Number(asString);
  if (Number.isFinite(asNumber) && !candidates.includes(asNumber)) {
    candidates.push(asNumber);
  }
  return candidates;
}

function safeDecodeURIComponent(value: unknown) {
  const stringValue = String(value ?? '');
  try {
    return decodeURIComponent(stringValue);
  } catch (_error) {
    return stringValue;
  }
}

function parseLocalMediaReference(src: string) {
  const raw = String(src ?? '').trim();
  if (!raw) {
    return { raw: '', normalized: '', fileName: '', assetId: '', isExternal: false, isLocalMediaLike: false };
  }

  const normalized = toAppRelativePath(raw.split('?')[0]?.split('#')[0] || raw);
  const isExternal = /^(?:https?:|data:|blob:|\/\/|#)/i.test(raw);
  const decoded = safeDecodeURIComponent(normalized);
  const cdnMatch = decoded.match(CDN_ASSET_PATH_REGEX);
  const dynamicIdMatch = decoded.match(DYNAMIC_ASSET_ID_PATH_REGEX);
  const fileName = safeDecodeURIComponent(cdnMatch?.[2] || decoded.split('/').pop() || decoded);
  const isLocalMediaLike = LOCAL_MEDIA_EXTENSIONS_REGEX.test(fileName);
  return {
    raw,
    normalized: decoded,
    fileName,
    assetId: cdnMatch?.[1] || dynamicIdMatch?.[1] || '',
    isExternal,
    isLocalMediaLike
  };
}

function toCanonicalDynamicAssetPath(asset: { _id?: string; name?: string; link?: () => string } | null) {
  if (!asset) return '';
  const linked = typeof asset.link === 'function' ? asset.link() : '';
  const linkPath = toAppRelativePath(String(linked || '').trim());
  if (linkPath && CDN_ASSET_PATH_REGEX.test(linkPath)) {
    return linkPath;
  }
  if (asset._id) {
    const encodedName = encodeURIComponent(String(asset.name || 'asset'));
    return `/cdn/storage/Assets/${asset._id}/original/${encodedName}`;
  }
  return '';
}

function getUploadedMediaCanonicalPath(
  src: string,
  uploadedMediaPathMap?: Map<string, string>
) {
  if (!uploadedMediaPathMap || uploadedMediaPathMap.size === 0) {
    return '';
  }

  const parsed = parseLocalMediaReference(src);
  const candidates = [parsed.fileName, parsed.normalized, parsed.raw]
    .map((candidate) => normalizeUploadedMediaLookupKey(candidate))
    .filter(Boolean);

  for (const candidate of candidates) {
    const match = uploadedMediaPathMap.get(candidate);
    if (match) {
      return match;
    }
  }

  return '';
}

export function createMediaReferenceHelpers(deps: MediaReferenceDeps) {
  async function findDynamicAssetScoped(params: {
    stimuliSetId?: string | number | null;
    assetId?: string;
    fileName?: string;
  }) {
    const assetId = String(params.assetId || '').trim();
    const fileName = String(params.fileName || '').trim();
    if (!assetId && !fileName) return null;

    const candidates = getStimuliSetIdCandidates(params.stimuliSetId ?? null);
    for (const candidate of candidates) {
      if (assetId) {
        const foundById = await deps.DynamicAssets.findOneAsync({ _id: assetId, 'meta.stimuliSetId': candidate });
        if (foundById) return foundById;
      }
      if (fileName) {
        const foundByName = await deps.DynamicAssets.findOneAsync({
          $or: [{ name: fileName }, { fileName: fileName }],
          'meta.stimuliSetId': candidate
        });
        if (foundByName) return foundByName;
      }
    }
    return null;
  }

  async function findDynamicAssetsScopedBatch(params: {
    stimuliSetIds: Array<string | number | null | undefined>;
    assetIds: string[];
    fileNames: string[];
  }) {
    const scopedStimuliSetIds = [...new Set(
      params.stimuliSetIds
        .flatMap((stimuliSetId) => getStimuliSetIdCandidates(stimuliSetId))
        .filter((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== '')
    )];
    const assetIds = [...new Set(
      params.assetIds
        .map((assetId) => String(assetId || '').trim())
        .filter((assetId) => assetId.length > 0)
    )];
    const fileNames = [...new Set(
      params.fileNames
        .map((fileName) => String(fileName || '').trim())
        .filter((fileName) => fileName.length > 0)
    )];

    if (scopedStimuliSetIds.length === 0 || (assetIds.length === 0 && fileNames.length === 0)) {
      return [];
    }

    const orClauses: Record<string, unknown>[] = [];
    if (assetIds.length > 0) {
      orClauses.push({ _id: { $in: assetIds } });
    }
    if (fileNames.length > 0) {
      orClauses.push({ name: { $in: fileNames } });
      orClauses.push({ fileName: { $in: fileNames } });
    }

    return deps.DynamicAssets.find(
      {
        'meta.stimuliSetId': { $in: scopedStimuliSetIds },
        $or: orClauses
      },
      {
        fields: {
          _id: 1,
          name: 1,
          fileName: 1,
          path: 1,
          meta: 1
        }
      }
    ).fetchAsync();
  }

  async function canonicalizeLocalMediaReference(
    src: string,
    stimuliSetId?: string | number | null,
    options: {
      allowFilenameLookup?: boolean;
      uploadedMediaPathMap?: Map<string, string> | undefined;
      requireUploadedMediaMatch?: boolean | undefined;
    } = {}
  ) {
    const parsed = parseLocalMediaReference(src);
    if (!parsed.normalized) return { resolved: '', found: true, external: false, parsed };
    if (parsed.isExternal) return { resolved: parsed.raw, found: true, external: true, parsed };
    if (!parsed.assetId && !parsed.isLocalMediaLike) {
      return { resolved: parsed.normalized, found: true, external: false, parsed };
    }

    const uploadedMediaCanonicalPath = getUploadedMediaCanonicalPath(src, options.uploadedMediaPathMap);
    if (uploadedMediaCanonicalPath) {
      return { resolved: uploadedMediaCanonicalPath, found: true, external: false, parsed };
    }
    if (options.requireUploadedMediaMatch) {
      return { resolved: '', found: false, external: false, parsed };
    }

    const found = await findDynamicAssetScoped({
      assetId: parsed.assetId || '',
      fileName: options.allowFilenameLookup ? parsed.fileName : '',
      stimuliSetId: stimuliSetId ?? null
    });
    if (!found) {
      return { resolved: '', found: false, external: false, parsed };
    }
    const canonical = toCanonicalDynamicAssetPath(found as { _id?: string; name?: string; link?: () => string });
    return { resolved: canonical || parsed.normalized, found: true, external: false, parsed };
  }

  async function resolveInstructionMediaReference(
    src: string,
    stimuliSetId?: string | number | null,
    options: {
      allowFilenameLookup?: boolean;
      uploadedMediaPathMap?: Map<string, string> | undefined;
      requireUploadedMediaMatch?: boolean | undefined;
    } = {}
  ): Promise<string | null> {
    const result = await canonicalizeLocalMediaReference(src, stimuliSetId, {
      allowFilenameLookup: options.allowFilenameLookup !== false,
      uploadedMediaPathMap: options.uploadedMediaPathMap,
      requireUploadedMediaMatch: options.requireUploadedMediaMatch
    });
    if (!result.found) {
      deps.serverConsole('[Instruction Media Resolve] Scoped asset not found', {
        src,
        normalized: result.parsed.normalized,
        filename: result.parsed.fileName,
        assetId: result.parsed.assetId,
        stimuliSetId: stimuliSetId ?? null
      });
      return null;
    }
    return result.resolved;
  }

  async function processAudioFilesForTDF(
    TDF: { tutor: { unit: Array<{ unitinstructions?: string; unitinstructionsquestion?: string }> } },
    stimuliSetId?: string | number | null,
    options: {
      rejectUnresolved?: boolean;
      allowFilenameLookup?: boolean;
      uploadedMediaPathMap?: Map<string, string> | undefined;
      requireUploadedMediaMatch?: boolean | undefined;
    } = {}
  ){
    for (const unitIdx in TDF.tutor.unit){
      const unit = TDF.tutor.unit[Number(unitIdx)];
      if (!unit) continue;

      const fields: Array<'unitinstructions' | 'unitinstructionsquestion'> = ['unitinstructions', 'unitinstructionsquestion'];
      for (const fieldName of fields) {
        const fieldValue = unit[fieldName];
        if (!fieldValue) continue;

        const srcValues = extractSrcFromHtml(fieldValue);
        let updatedFieldValue = fieldValue;

        for(const src of srcValues) {
          const resolvedReference = await resolveInstructionMediaReference(src, stimuliSetId, {
            allowFilenameLookup: options.allowFilenameLookup !== false,
            uploadedMediaPathMap: options.uploadedMediaPathMap,
            requireUploadedMediaMatch: options.requireUploadedMediaMatch
          });
          if (resolvedReference && resolvedReference !== src) {
            updatedFieldValue = updatedFieldValue.split(src).join(resolvedReference);
          } else if (!resolvedReference) {
            if (options.rejectUnresolved) {
              throw new Meteor.Error('invalid-media-reference', `Unresolved instruction media reference: ${src}`);
            }
            deps.serverConsole('[Instruction Media Rewrite] No scoped replacement found', {
              fieldName,
              src,
              stimuliSetId: stimuliSetId ?? null
            });
          }
        }
        unit[fieldName] = updatedFieldValue;
      }
    }
    return TDF
  }

  async function canonicalizeStimDisplayMediaRefs(
    stimPayload: UnknownRecord,
    stimuliSetId?: string | number | null,
    options: {
      rejectUnresolved?: boolean;
      allowFilenameLookup?: boolean;
      uploadedMediaPathMap?: Map<string, string> | undefined;
      requireUploadedMediaMatch?: boolean | undefined;
    } = {}
  ) {
    const root = stimPayload as { setspec?: { clusters?: Array<{ stims?: Array<{ display?: Record<string, unknown> }> }> } };
    const clusters = root?.setspec?.clusters;
    if (!Array.isArray(clusters)) {
      return stimPayload;
    }

    const canonicalFields: Array<'audioSrc' | 'imgSrc' | 'videoSrc'> = ['audioSrc', 'imgSrc', 'videoSrc'];
    const legacyAliasFields = ['audioStimulus', 'imageSrc', 'imageStimulus', 'videoStimulus'];
    for (const cluster of clusters) {
      if (!cluster?.stims || !Array.isArray(cluster.stims)) continue;
      for (const stim of cluster.stims) {
        if (!stim?.display || typeof stim.display !== 'object') continue;
        for (const legacyField of legacyAliasFields) {
          const legacyValue = stim.display?.[legacyField];
          if (typeof legacyValue === 'string' && legacyValue.trim().length > 0) {
            throw new Meteor.Error('invalid-media-schema', `Legacy display media key is not allowed: ${legacyField}`);
          }
        }

        for (const field of canonicalFields) {
          const raw = stim.display?.[field];
          if (typeof raw !== 'string' || !raw.trim()) continue;

          const resolved = await canonicalizeLocalMediaReference(raw, stimuliSetId, {
            allowFilenameLookup: options.allowFilenameLookup !== false,
            uploadedMediaPathMap: options.uploadedMediaPathMap,
            requireUploadedMediaMatch: options.requireUploadedMediaMatch
          });
          if (!resolved.found) {
            if (options.rejectUnresolved) {
              throw new Meteor.Error('invalid-media-reference', `Unresolved stimulus media reference (${field}): ${raw}`);
            }
            continue;
          }

          if (resolved.resolved && resolved.resolved !== raw) {
            stim.display[field] = resolved.resolved;
          } else if (typeof stim.display[field] !== 'string' || !String(stim.display[field]).trim()) {
            stim.display[field] = raw;
          }
        }
      }
    }

    return stimPayload;
  }

  async function canonicalizeFlatStimuliMediaRefs(
    stimuli: unknown[],
    stimuliSetId?: string | number | null,
    options: {
      rejectUnresolved?: boolean;
      allowFilenameLookup?: boolean;
      uploadedMediaPathMap?: Map<string, string> | undefined;
      requireUploadedMediaMatch?: boolean | undefined;
    } = {}
  ) {
    const canonicalFields: Array<'audioStimulus' | 'imageStimulus' | 'videoStimulus'> = ['audioStimulus', 'imageStimulus', 'videoStimulus'];
    const disallowedAliasFields = ['audioSrc', 'imgSrc', 'videoSrc'];
    for (const rawStim of stimuli) {
      const stim = rawStim as Record<string, unknown>;
      for (const disallowedField of disallowedAliasFields) {
        const disallowedValue = stim[disallowedField];
        if (typeof disallowedValue === 'string' && disallowedValue.trim().length > 0) {
          throw new Meteor.Error('invalid-media-schema', `Non-canonical flat stimulus media key is not allowed: ${disallowedField}`);
        }
      }
      for (const field of canonicalFields) {
        const value = stim[field];
        if (typeof value !== 'string' || !value.trim()) continue;
        const resolved = await canonicalizeLocalMediaReference(value, stimuliSetId, {
          allowFilenameLookup: options.allowFilenameLookup !== false,
          uploadedMediaPathMap: options.uploadedMediaPathMap,
          requireUploadedMediaMatch: options.requireUploadedMediaMatch
        });
        if (!resolved.found) {
          if (options.rejectUnresolved) {
            throw new Meteor.Error('invalid-media-reference', `Unresolved stimulus media reference (${field}): ${value}`);
          }
          continue;
        }
        if (resolved.resolved && resolved.resolved !== value) {
          stim[field] = resolved.resolved;
        }
      }
    }
    return stimuli;
  }

  return {
    normalizeUploadedMediaLookupKey,
    extractSrcFromHtml,
    getMimeTypeForAssetName,
    toAppRelativePath,
    getStimuliSetIdCandidates,
    safeDecodeURIComponent,
    parseLocalMediaReference,
    toCanonicalDynamicAssetPath,
    findDynamicAssetScoped,
    findDynamicAssetsScopedBatch,
    canonicalizeLocalMediaReference,
    resolveInstructionMediaReference,
    processAudioFilesForTDF,
    canonicalizeStimDisplayMediaRefs,
    canonicalizeFlatStimuliMediaRefs,
  };
}
