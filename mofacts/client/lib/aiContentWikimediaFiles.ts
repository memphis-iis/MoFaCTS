import type {
  AiPromptAttribution,
  WikimediaImageCandidate,
} from '../../common/aiContentContract';
import {
  AI_IMAGE_MAX_SOURCE_BYTES,
  AI_IMAGE_MAX_WIDTH,
  convertAiImageToWebp,
  isSupportedAiImageFile,
  type ConvertedImage,
} from './aiContentImageAssets';
import type { WikipediaFileReference } from './aiContentWikipediaSource';

const WIKIMEDIA_COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

type WikimediaMetadata = Record<string, { value?: unknown }>;

type WikimediaFilePage = {
  pageid?: number;
  title?: string;
  missing?: boolean;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    width?: number;
    height?: number;
    mime?: string;
    extmetadata?: WikimediaMetadata;
  }>;
};

type WikimediaCandidateRejection = {
  candidateId: string;
  fileTitle: string;
  reason: string;
};

type WikimediaCandidateHydration = {
  candidates: WikimediaImageCandidate[];
  rejections: WikimediaCandidateRejection[];
};

export type PredictedWikimediaFileTitle = Readonly<{
  itemId: string;
  response: string;
  predictedFileTitle: string;
  parentListPageId: number;
  filenamePatternId: string;
}>;

export type PredictedWikimediaFileRejection = Readonly<{
  itemId: string;
  predictedFileTitle: string;
  reason: string;
}>;

export type PredictedWikimediaFileResolution = Readonly<{
  candidates: WikimediaImageCandidate[];
  rejections: PredictedWikimediaFileRejection[];
}>;

export type AcquiredWikimediaAsset = {
  candidate: WikimediaImageCandidate;
  sourceMediaType: string;
  sourceByteLength: number;
  sourceBytes: Uint8Array;
  webpBytes: Uint8Array;
  webpWidth: number;
  webpHeight: number;
};

function buildUrl(params: Record<string, string>): string {
  const url = new URL(WIKIMEDIA_COMMONS_API_URL);
  Object.entries({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })
    .forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

export function wikimediaCandidateHydrationRequestUrls(
  references: ReadonlyArray<{ fileTitle: string }>,
): string[] {
  const uniqueTitles = Array.from(new Set(references.map(({ fileTitle }) => fileTitle)));
  const urls: string[] = [];
  for (let index = 0; index < uniqueTitles.length; index += 50) {
    urls.push(buildUrl({
      titles: uniqueTitles.slice(index, index + 50).join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: String(AI_IMAGE_MAX_WIDTH),
    }));
  }
  return urls;
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<any> {
  const response = await fetcher(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Wikimedia request failed with HTTP ${response.status}.`);
  const data = await response.json();
  if (data?.error) throw new Error(`Wikimedia API error: ${String(data.error.info || data.error.code || 'unknown error')}`);
  return data;
}

function stripHtml(value: unknown): string {
  const source = String(value || '');
  if (typeof DOMParser !== 'undefined') {
    return String(new DOMParser().parseFromString(source, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  return source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function allowedLicense(metadata: WikimediaMetadata): { name: string; url: string } | null {
  const name = stripHtml(metadata.LicenseShortName?.value || metadata.License?.value);
  const url = stripHtml(metadata.LicenseUrl?.value);
  const key = name.toLocaleLowerCase();
  if (/non[- ]?free|fair use|copyrighted/.test(key)) return null;
  if (key.includes('public domain') || key === 'pd') {
    return { name: name || 'Public domain', url: url || 'https://creativecommons.org/publicdomain/mark/1.0/' };
  }
  if (key.includes('cc0')) {
    return { name: name || 'CC0', url: url || 'https://creativecommons.org/publicdomain/zero/1.0/' };
  }
  if (/cc\s*[- ]?by(?:[- ]?sa)?\b|creative commons attribution/.test(key) && url) return { name, url };
  return null;
}

function attribution(metadata: WikimediaMetadata, sourceUrl: string, license: { name: string; url: string }): AiPromptAttribution | null {
  const creatorName = stripHtml(metadata.Artist?.value || metadata.Credit?.value);
  if (!creatorName) return null;
  return {
    creatorName,
    sourceName: 'Wikimedia Commons',
    sourceUrl,
    licenseName: license.name,
    licenseUrl: license.url,
  };
}

function candidateFromPage(
  reference: WikipediaFileReference,
  page: WikimediaFilePage,
  sourcePath: WikimediaImageCandidate['sourcePath'],
  parentListPageId: number,
  detailPageId?: number,
): WikimediaImageCandidate | WikimediaCandidateRejection {
  const info = page.imageinfo?.[0];
  const fileTitle = String(page.title || reference.fileTitle).trim();
  if (Number(page.pageid) <= 0) return { candidateId: reference.candidateId, fileTitle, reason: 'Wikimedia returned no canonical file-page ID.' };
  if (!info) return { candidateId: reference.candidateId, fileTitle, reason: 'Wikimedia returned no image metadata.' };
  const mimeType = String(info.mime || '').trim().toLocaleLowerCase();
  if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif'].includes(mimeType)) {
    return { candidateId: reference.candidateId, fileTitle, reason: `Unsupported source MIME type ${mimeType || 'unknown'}.` };
  }
  const width = Number(info.width || 0);
  const height = Number(info.height || 0);
  if (width < 1 || height < 1) return { candidateId: reference.candidateId, fileTitle, reason: 'Wikimedia returned invalid image dimensions.' };
  const metadata = info.extmetadata || {};
  const license = allowedLicense(metadata);
  if (!license) return { candidateId: reference.candidateId, fileTitle, reason: 'No allowed machine-readable license was found.' };
  const renditionUrl = String(info.thumburl || info.url || '').trim();
  const sourceTitle = fileTitle.replace(/^File:/i, '').trim();
  const commonsUrl = String(info.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(sourceTitle).replace(/%20/g, '_')}`);
  if (!renditionUrl || !commonsUrl || !sourceTitle) {
    return { candidateId: reference.candidateId, fileTitle, reason: 'Wikimedia returned incomplete canonical file URLs.' };
  }
  const completeAttribution = attribution(metadata, commonsUrl, license);
  if (!completeAttribution) {
    return { candidateId: reference.candidateId, fileTitle, reason: 'Wikimedia returned incomplete creator attribution.' };
  }
  return {
    candidateId: reference.candidateId,
    itemId: reference.itemId,
    sourcePath,
    parentListPageId,
    ...(detailPageId ? { detailPageId } : {}),
    filePageId: Number(page.pageid || 0),
    fileTitle,
    commonsUrl,
    renditionUrl,
    caption: reference.caption || stripHtml(metadata.ImageDescription?.value),
    altText: reference.altText,
    surroundingText: reference.surroundingText,
    structuralRole: reference.structuralRole,
    mimeType,
    width,
    height,
    attribution: completeAttribution,
  };
}

function canonicalFileTitleKey(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function titleAliases(data: any): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const entry of [...(Array.isArray(data?.query?.normalized) ? data.query.normalized : []),
    ...(Array.isArray(data?.query?.redirects) ? data.query.redirects : [])]) {
    const from = canonicalFileTitleKey(String(entry?.from || ''));
    const to = String(entry?.to || '').trim();
    if (from && to) aliases.set(from, to);
  }
  return aliases;
}

function resolvedTitle(title: string, aliases: Map<string, string>): string {
  let current = title;
  const visited = new Set<string>();
  for (let count = 0; count < 10; count += 1) {
    const key = canonicalFileTitleKey(current);
    if (visited.has(key)) break;
    visited.add(key);
    const next = aliases.get(key);
    if (!next) break;
    current = next;
  }
  return current;
}

export function predictedWikimediaFileRequestUrls(
  predictions: ReadonlyArray<Pick<PredictedWikimediaFileTitle, 'predictedFileTitle'>>,
): string[] {
  const titles = Array.from(new Set(predictions.map(({ predictedFileTitle }) => predictedFileTitle)));
  const urls: string[] = [];
  for (let index = 0; index < titles.length; index += 50) {
    urls.push(buildUrl({
      titles: titles.slice(index, index + 50).join('|'),
      prop: 'imageinfo',
      redirects: '1',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: String(AI_IMAGE_MAX_WIDTH),
    }));
  }
  return urls;
}

export async function resolvePredictedWikimediaFiles(
  predictions: PredictedWikimediaFileTitle[],
  fetcher: typeof fetch = globalThis.fetch,
): Promise<PredictedWikimediaFileResolution> {
  if (predictions.length === 0) return { candidates: [], rejections: [] };
  const uniqueTitles = Array.from(new Set(predictions.map(({ predictedFileTitle }) => predictedFileTitle)));
  const requestUrls = predictedWikimediaFileRequestUrls(predictions);
  const pageByRequestedTitle = new Map<string, WikimediaFilePage>();
  for (let index = 0; index < uniqueTitles.length; index += 50) {
    const batch = uniqueTitles.slice(index, index + 50);
    const data = await fetchJson(requestUrls[index / 50]!, fetcher);
    const aliases = titleAliases(data);
    const pages: WikimediaFilePage[] = Array.isArray(data?.query?.pages) ? data.query.pages : [];
    const pagesByTitle = new Map(pages.map((page) => [canonicalFileTitleKey(String(page.title || '')), page]));
    batch.forEach((predictedFileTitle) => {
      const canonical = resolvedTitle(predictedFileTitle, aliases);
      const page = pagesByTitle.get(canonicalFileTitleKey(canonical));
      if (page) pageByRequestedTitle.set(canonicalFileTitleKey(predictedFileTitle), page);
    });
  }
  const candidates: WikimediaImageCandidate[] = [];
  const rejections: PredictedWikimediaFileRejection[] = [];
  predictions.forEach((prediction) => {
    const page = pageByRequestedTitle.get(canonicalFileTitleKey(prediction.predictedFileTitle));
    if (!page || page.missing || Number(page.pageid) <= 0 || !page.imageinfo?.[0]) {
      rejections.push({
        itemId: prediction.itemId,
        predictedFileTitle: prediction.predictedFileTitle,
        reason: 'Wikimedia did not resolve the predicted title to a canonical file-page ID with image metadata.',
      });
      return;
    }
    const result = candidateFromPage({
      candidateId: `pattern-image-${prediction.itemId}`,
      itemId: prediction.itemId,
      fileTitle: String(page.title || prediction.predictedFileTitle),
      caption: '',
      altText: '',
      surroundingText: `Resolved from filename pattern ${prediction.filenamePatternId}.`,
      structuralRole: 'filename-pattern',
    }, page, 'filename-pattern', prediction.parentListPageId);
    if ('reason' in result) {
      rejections.push({
        itemId: prediction.itemId,
        predictedFileTitle: prediction.predictedFileTitle,
        reason: result.reason,
      });
    } else {
      candidates.push(result);
    }
  });
  return { candidates, rejections };
}

export async function hydrateWikimediaImageCandidates(
  references: WikipediaFileReference[],
  context: {
    sourcePath: 'list-page' | 'detail-page';
    parentListPageId: number;
    detailPageId?: number;
  },
  fetcher: typeof fetch = globalThis.fetch,
): Promise<WikimediaCandidateHydration> {
  if (references.length === 0) return { candidates: [], rejections: [] };
  const uniqueTitles = Array.from(new Set(references.map(({ fileTitle }) => fileTitle)));
  const requestUrls = wikimediaCandidateHydrationRequestUrls(references);
  const pagesByTitle = new Map<string, WikimediaFilePage>();
  for (let index = 0; index < uniqueTitles.length; index += 50) {
    const requestUrl = requestUrls[index / 50]!;
    const data = await fetchJson(requestUrl, fetcher);
    const pages: WikimediaFilePage[] = Array.isArray(data?.query?.pages) ? data.query.pages : [];
    pages.forEach((page) => pagesByTitle.set(String(page.title || '').toLocaleLowerCase(), page));
  }
  const candidates: WikimediaImageCandidate[] = [];
  const rejections: WikimediaCandidateRejection[] = [];
  references.forEach((reference) => {
    const page = pagesByTitle.get(reference.fileTitle.toLocaleLowerCase());
    if (!page) {
      rejections.push({ candidateId: reference.candidateId, fileTitle: reference.fileTitle, reason: 'Wikimedia did not resolve the supplied file title.' });
      return;
    }
    const result = candidateFromPage(reference, page, context.sourcePath, context.parentListPageId, context.detailPageId);
    if ('reason' in result) rejections.push(result);
    else candidates.push(result);
  });
  return { candidates, rejections };
}

export async function acquireWikimediaImageCandidate(
  candidate: WikimediaImageCandidate,
  fetcher: typeof fetch = globalThis.fetch,
  converter: (file: File) => Promise<ConvertedImage> = convertAiImageToWebp,
): Promise<AcquiredWikimediaAsset> {
  const response = await fetcher(candidate.renditionUrl, { method: 'GET', headers: { Accept: 'image/*' } });
  if (!response.ok) throw new Error(`Wikimedia image download failed with HTTP ${response.status}.`);
  const blob = await response.blob();
  const sourceMediaType = String(blob.type || response.headers.get('content-type') || candidate.mimeType)
    .split(';')[0]!.trim().toLocaleLowerCase();
  if (!sourceMediaType.startsWith('image/')) throw new Error(`Selected rendition returned ${sourceMediaType || 'an unknown media type'}.`);
  if (blob.size === 0) throw new Error('Selected rendition returned an empty image body.');
  if (blob.size > AI_IMAGE_MAX_SOURCE_BYTES) throw new Error('Selected rendition is larger than 50 MB.');
  const sourceName = candidate.fileTitle.replace(/^File:/i, '').trim();
  const file = new File([blob], sourceName, { type: sourceMediaType });
  if (!isSupportedAiImageFile(file)) throw new Error(`Selected rendition uses unsupported image type ${sourceMediaType || 'unknown'}.`);
  const converted = await converter(file);
  if (converted.bytes.byteLength === 0 || !converted.width || !converted.height || converted.width > AI_IMAGE_MAX_WIDTH) {
    throw new Error('WebP conversion returned an empty image, invalid dimensions, or an image wider than 1280 pixels.');
  }
  return {
    candidate,
    sourceMediaType,
    sourceByteLength: blob.size,
    sourceBytes: new Uint8Array(await blob.arrayBuffer()),
    webpBytes: converted.bytes,
    webpWidth: converted.width,
    webpHeight: converted.height,
  };
}
