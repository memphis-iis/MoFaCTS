import { Session } from 'meteor/session';
import { clientConsole } from '../../../../lib/userSessionHelpers';
import {
  logIdInvariantBreachOnce,
  setActiveTdfContext,
} from '../../../../lib/idContext';

type DynamicAssetRecord = Record<string, unknown>;
type DynamicAssetsLike = {
  findOne: (query: Record<string, unknown>) => DynamicAssetRecord | null | undefined;
  link: (asset: DynamicAssetRecord) => string;
};

type TdfDocumentLike = {
  stimuliSetId?: string | number | null;
};

const DynamicAssets = (globalThis as { DynamicAssets?: DynamicAssetsLike }).DynamicAssets;
const TdfsCollection = (globalThis as {
  Tdfs?: {
    findOne: (query: Record<string, unknown>) => TdfDocumentLike | null | undefined;
  };
}).Tdfs;
const loggedResolverIssues = new Set<string>();
const surfacedUiIssues = new Set<string>();
const LOCAL_MEDIA_EXT_REGEX = /\.(mp3|wav|ogg|m4a|aac|flac|webm|mp4|mov|m4v|jpg|jpeg|png|gif|svg|webp|bmp|ico)$/i;

function toAppRelativePath(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  if (/^(?:data:|blob:|#|\/\/)/i.test(trimmed)) {
    return trimmed;
  }

  let next = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const assetLikePath = /^(?:\/(?:cdn\/storage\/Assets|dynamic-assets)\/|\/?$)/i.test(parsed.pathname);
      if (assetLikePath) {
        next = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } else if (currentOrigin && parsed.origin === currentOrigin) {
        next = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } else {
        return trimmed;
      }
    } catch {
      return trimmed;
    }
  }

  if (/^(?:cdn|dynamic-assets)\//i.test(next)) {
    next = `/${next}`;
  }
  if (!next.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(next)) {
    next = `/${next}`;
  }
  return next;
}

function normalizeSource(input: unknown): string {
  return String(input ?? '').trim().replace(/\\\//g, '/');
}

function isLikelyLocalMediaPath(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const withoutQuery = raw.split('?')[0]?.split('#')[0] || raw;
  const filename = withoutQuery.split('/').pop() || withoutQuery;
  return LOCAL_MEDIA_EXT_REGEX.test(filename);
}

function parseAssetReference(normalized: string) {
  const withoutQuery = normalized.split('?')[0]?.split('#')[0] || normalized;
  const asPath = toAppRelativePath(withoutQuery);
  const cdnMatch = asPath.match(/^\/cdn\/storage\/Assets\/([^/]+)\/original\/([^/]+)$/i);
  const directIdMatch = asPath.match(/^\/dynamic-assets\/([A-Za-z0-9_-]+)(?:\/|$)/i);
  const fileName = decodeURIComponent(cdnMatch?.[2] || asPath.split('/').pop() || asPath);
  return {
    normalized: asPath,
    fileName,
    assetId: cdnMatch?.[1] || directIdMatch?.[1] || '',
  };
}

function getScopedStimuliSetId(): string | number | null {
  const stimSetId = Session.get('currentStimuliSetId');
  if (stimSetId === undefined || stimSetId === null || String(stimSetId).trim() === '') {
    return null;
  }
  return stimSetId;
}

function getScopedStimuliSetIdCandidates(stimuliSetId: string | number | null): Array<string | number> {
  if (stimuliSetId === null) return [];
  const candidates: Array<string | number> = [stimuliSetId];
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

function findAssetByLookup(params: { fileName?: string; assetId?: string; stimuliSetId?: string | number | null }) {
  if (!DynamicAssets?.findOne) return null;

  const fileName = String(params.fileName || '').trim();
  const assetId = String(params.assetId || '').trim();
  const stimuliSetId = params.stimuliSetId ?? null;

  if (!assetId && !fileName) return null;

  const queries: Array<Record<string, unknown>> = [];
  const scopedCandidates = getScopedStimuliSetIdCandidates(stimuliSetId);
  for (const scopedStimuliSetId of scopedCandidates) {
    if (fileName) {
      queries.push({ name: fileName, 'meta.stimuliSetId': scopedStimuliSetId });
      queries.push({ fileName: fileName, 'meta.stimuliSetId': scopedStimuliSetId });
    }
    if (assetId) queries.push({ _id: assetId, 'meta.stimuliSetId': scopedStimuliSetId });
  }

  for (const query of queries) {
    const found = DynamicAssets.findOne(query);
    if (found) return found;
  }
  return null;
}

function getCurrentTdfScopedStimuliSetId(): string | number | null {
  const currentTdfId = Session.get('currentTdfId') || Session.get('currentRootTdfId');
  if (!currentTdfId || !TdfsCollection?.findOne) return null;
  let tdfDoc = TdfsCollection.findOne({ _id: currentTdfId });
  if (!tdfDoc && Session.get('currentRootTdfId') && String(Session.get('currentRootTdfId')) !== String(currentTdfId)) {
    tdfDoc = TdfsCollection.findOne({ _id: Session.get('currentRootTdfId') });
  }
  const stimSetId = tdfDoc?.stimuliSetId;
  if (stimSetId === undefined || stimSetId === null || String(stimSetId).trim() === '') {
    return null;
  }
  return stimSetId;
}

export function ensureCurrentStimuliSetId(fallbackStimuliSetId: unknown = null): string | number | null {
  const existing = getScopedStimuliSetId();
  if (existing !== null) return existing;

  if (
    fallbackStimuliSetId !== null &&
    fallbackStimuliSetId !== undefined &&
    String(fallbackStimuliSetId).trim() !== ''
  ) {
    setActiveTdfContext({
      currentRootTdfId: Session.get('currentRootTdfId'),
      currentTdfId: Session.get('currentTdfId') || Session.get('currentRootTdfId'),
      currentStimuliSetId: fallbackStimuliSetId,
    }, 'mediaResolver.ensureCurrentStimuliSetId');
    return fallbackStimuliSetId as string | number;
  }

  logIdInvariantBreachOnce('mediaResolver:missing-stimuli-scope', {
    fallbackStimuliSetId: fallbackStimuliSetId ?? null,
  });
  return null;
}

export function resolveDynamicAssetPath(
  input: unknown,
  options: { fallbackStimuliSetId?: unknown; logPrefix?: string } = {}
): string {
  const src = normalizeSource(input);
  if (!src) return '';

  const maybeUrl = toAppRelativePath(src);
  if (/^(?:data:|blob:|\/\/|#)/i.test(maybeUrl)) return maybeUrl;
  const localMediaCandidate = isLikelyLocalMediaPath(maybeUrl);
  if (maybeUrl.startsWith('/') && !/^\/cdn\/storage\/Assets\//i.test(maybeUrl) && !/^\/dynamic-assets\//i.test(maybeUrl)) {
    if (localMediaCandidate) {
      // Continue to scoped lookup for bare local filenames/paths.
    } else {
      return maybeUrl;
    }
  }

  const { normalized, fileName, assetId } = parseAssetReference(src);
  if (!assetId && !localMediaCandidate) {
    return maybeUrl;
  }

  let scopedStimuliSetId = ensureCurrentStimuliSetId(options.fallbackStimuliSetId);
  if (scopedStimuliSetId === null) {
    const canonicalStimuliSetId = getCurrentTdfScopedStimuliSetId();
    if (canonicalStimuliSetId !== null) {
      setActiveTdfContext({
        currentRootTdfId: Session.get('currentRootTdfId'),
        currentTdfId: Session.get('currentTdfId') || Session.get('currentRootTdfId'),
        currentStimuliSetId: canonicalStimuliSetId,
      }, 'mediaResolver.resolveDynamicAssetPath.missingScopeRecovered');
      scopedStimuliSetId = canonicalStimuliSetId;
    }
  }
  if (scopedStimuliSetId === null) {
    if (options.logPrefix) {
      const issueKey = `scope-missing|${options.logPrefix}|${src}`;
      if (!loggedResolverIssues.has(issueKey)) {
        loggedResolverIssues.add(issueKey);
        clientConsole(1, `${options.logPrefix} media scope missing`, {
        source: src,
        normalized,
        assetId: assetId || null,
        currentTdfId: Session.get('currentTdfId') || null,
        currentRootTdfId: Session.get('currentRootTdfId') || null,
        currentStimuliSetId: Session.get('currentStimuliSetId') || null,
        });
      }
    }
    if (localMediaCandidate || isLikelyLocalMediaPath(normalized)) {
      return '';
    }
    return normalized;
  }

  const found = findAssetByLookup({ fileName, assetId, stimuliSetId: scopedStimuliSetId });
  if (!found) {
    const canonicalStimuliSetId = getCurrentTdfScopedStimuliSetId();
    if (
      canonicalStimuliSetId !== null &&
      String(canonicalStimuliSetId) !== String(scopedStimuliSetId)
    ) {
      const retryFound = findAssetByLookup({
        fileName,
        assetId,
        stimuliSetId: canonicalStimuliSetId
      });
      if (retryFound) {
        setActiveTdfContext({
          currentRootTdfId: Session.get('currentRootTdfId'),
          currentTdfId: Session.get('currentTdfId') || Session.get('currentRootTdfId'),
          currentStimuliSetId: canonicalStimuliSetId,
        }, 'mediaResolver.resolveDynamicAssetPath.retryCanonical');
        return toAppRelativePath(String(DynamicAssets?.link({ ...retryFound }) || normalized).trim());
      }
    }
  }
  if (!found) {
    if (options.logPrefix) {
      const issueKey = `not-found|${options.logPrefix}|${scopedStimuliSetId}|${fileName}|${assetId}`;
      if (!loggedResolverIssues.has(issueKey)) {
        loggedResolverIssues.add(issueKey);
        clientConsole(1, `${options.logPrefix} media asset not found in scoped set`, {
        source: src,
        normalized,
        assetId: assetId || null,
        currentTdfId: Session.get('currentTdfId') || null,
        currentRootTdfId: Session.get('currentRootTdfId') || null,
        currentStimuliSetId: Session.get('currentStimuliSetId') || null,
        });
      }
    }
    if (/\.(mp3|wav|ogg|m4a)$/i.test(fileName)) {
      const uiIssueKey = `audio-missing|${scopedStimuliSetId}|${fileName}`;
      if (!surfacedUiIssues.has(uiIssueKey)) {
        surfacedUiIssues.add(uiIssueKey);
        Session.set('uiMessage', {
          variant: 'warning',
          text: `Audio file could not be resolved: ${fileName}`,
        });
      }
    }
    if (isLikelyLocalMediaPath(normalized) || isLikelyLocalMediaPath(fileName)) {
      return '';
    }
    return toAppRelativePath(normalized);
  }

  if (!DynamicAssets?.link) {
    return normalized;
  }
  return toAppRelativePath(String(DynamicAssets.link({ ...found }) || normalized).trim());
}
