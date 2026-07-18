import type { AiItem } from './aiContentTypes';
import type { validateAiOutput } from './aiContentValidation';

type ValidatedAiLessonOutput = ReturnType<typeof validateAiOutput>['output'];

export type AiMediaEnrichmentResult = {
  output: ValidatedAiLessonOutput;
  warnings: string[];
};

type WikimediaImageAttribution = {
  imgSrc: string;
  attribution: {
    creatorName: string;
    sourceName: string;
    sourceUrl: string;
    licenseName: string;
    licenseUrl: string;
  };
};

const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';
const MAX_CANDIDATES = 12;
const RESOLUTION_CONCURRENCY = 4;

function stripHtml(value: unknown): string {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
}

function normalizeTerms(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !['image', 'picture', 'photo', 'show', 'with', 'from', 'that', 'this'].includes(term));
}

function licenseUrlFor(name: string, explicitUrl: string): string {
  if (explicitUrl) return explicitUrl;
  const normalized = name.toLocaleLowerCase();
  if (normalized.includes('public domain')) return 'https://creativecommons.org/publicdomain/mark/1.0/';
  if (normalized.includes('cc0')) return 'https://creativecommons.org/publicdomain/zero/1.0/';
  return '';
}

function violatesConstraint(title: string, constraints: string[]): boolean {
  const normalizedTitle = title.toLocaleLowerCase();
  const requiresNoLabels = constraints.some((constraint) => /(?:nothing|no|without|un)\s*(?:is\s+)?label/i.test(constraint));
  return requiresNoLabels && /\b(?:labeled|labelled|names|text|caption)\b/.test(normalizedTitle);
}

function scoreCandidate(title: string, query: string, constraints: string[]): number {
  if (violatesConstraint(title, constraints)) return -1;
  const titleTerms = new Set(normalizeTerms(title));
  const queryTerms = normalizeTerms(query);
  if (queryTerms.length === 0) return -1;
  const matched = queryTerms.filter((term) => titleTerms.has(term)).length;
  const mapBonus = /\bmap\b/i.test(query) && /\bmap\b/i.test(title) ? 0.25 : 0;
  return matched / queryTerms.length + mapBonus;
}

export async function resolveWikimediaImage(
  query: string,
  constraints: string[],
  fetcher: typeof fetch = fetch,
): Promise<WikimediaImageAttribution | null> {
  const url = new URL(COMMONS_API_URL);
  Object.entries({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: String(MAX_CANDIDATES),
    gsrsearch: query,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetcher(url.toString());
  if (!response.ok) {
    throw new Error(`Wikimedia request failed with HTTP ${response.status}`);
  }
  const data = await response.json();
  const pages = data?.query?.pages ? Object.values(data.query.pages) as any[] : [];
  const candidates = pages.map((page) => {
    const info = page?.imageinfo?.[0];
    const metadata = info?.extmetadata || {};
    const title = String(page?.title || metadata.ObjectName?.value || '').replace(/^File:/i, '').trim();
    const licenseName = stripHtml(metadata.LicenseShortName?.value || metadata.License?.value);
    const licenseUrl = licenseUrlFor(licenseName, stripHtml(metadata.LicenseUrl?.value));
    return {
      score: scoreCandidate(title, query, constraints),
      title,
      info,
      licenseName,
      licenseUrl,
      creatorName: stripHtml(metadata.Artist?.value || metadata.Credit?.value || 'Wikimedia Commons contributor'),
    };
  }).filter((candidate) => candidate.info?.url && candidate.licenseName && candidate.licenseUrl && candidate.score >= 0.5)
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best) return null;
  return {
    imgSrc: String(best.info.url),
    attribution: {
      creatorName: best.creatorName,
      sourceName: best.title,
      sourceUrl: String(best.info.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(best.title).replace(/%20/g, '_')}`),
      licenseName: best.licenseName,
      licenseUrl: best.licenseUrl,
    },
  };
}

async function enrichItem(item: AiItem): Promise<AiItem> {
  const slot = item.prompt?.mediaSlot;
  if (!slot || slot.kind !== 'image' || slot.status === 'resolved') return item;
  try {
    const image = await resolveWikimediaImage(slot.query, slot.constraints);
    if (!image) {
      return {
        ...item,
        prompt: {
          ...(item.prompt || {}),
          mediaSlot: { ...slot, status: 'unresolved', failureReason: 'No sufficiently confident attributed Wikimedia image matched this prompt.' },
        },
      };
    }
    const { failureReason: _failureReason, ...resolvedSlot } = slot;
    return {
      ...item,
      prompt: {
        ...(item.prompt || {}),
        imgSrc: image.imgSrc,
        attribution: image.attribution,
        mediaSlot: { ...resolvedSlot, status: 'resolved', source: 'wikimedia', previewUrl: image.imgSrc },
      },
    };
  } catch (error) {
    return {
      ...item,
      prompt: {
        ...(item.prompt || {}),
        mediaSlot: {
          ...slot,
          status: 'unresolved',
          failureReason: error instanceof Error ? error.message : 'Wikimedia image resolution failed.',
        },
      },
    };
  }
}

export async function enrichAiContentMedia(output: ValidatedAiLessonOutput, _sourceText: string): Promise<AiMediaEnrichmentResult> {
  const items = Array.isArray(output.items) ? output.items : [];
  const enrichedItems = new Array<AiItem>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(RESOLUTION_CONCURRENCY, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      enrichedItems[index] = await enrichItem(items[index]!);
    }
  });
  await Promise.all(workers);
  const resolvedCount = enrichedItems.filter((item) => item.prompt?.mediaSlot?.status === 'resolved').length;
  const unresolvedCount = enrichedItems.filter((item) => item.prompt?.mediaSlot?.status === 'unresolved').length;
  const warnings: string[] = [];
  if (resolvedCount > 0) warnings.push(`Resolved ${resolvedCount} attributed Wikimedia image prompt${resolvedCount === 1 ? '' : 's'}.`);
  if (unresolvedCount > 0) warnings.push(`${unresolvedCount} image prompt${unresolvedCount === 1 ? '' : 's'} could not be resolved and must be reviewed.`);
  return {
    output: { ...output, items: enrichedItems },
    warnings,
  };
}
