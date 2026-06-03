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

const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

function stripHtml(value: unknown): string {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeLicenseUrl(licenseName: string, licenseUrl: string): string {
  if (licenseUrl) {
    return licenseUrl;
  }
  if (/public\s*domain/i.test(licenseName)) {
    return 'https://creativecommons.org/publicdomain/mark/1.0/';
  }
  return '';
}

function hasImageIntent(sourceText: string, output: ValidatedAiLessonOutput): boolean {
  const promptType = String(output.promptType || '').trim();
  if (promptType === 'image' || promptType === 'text-image') {
    return true;
  }
  const source = sourceText.toLowerCase();
  if (/\b(image|images|picture|pictures|photo|photos|identify|visual|what .*this)\b/.test(source)) {
    return true;
  }
  if (/\b(bird|birds|animal|animals|plant|plants|tree|trees|flower|flowers|insect|insects|fish|mushroom|mushrooms|species|landmark|landmarks|artwork|tools?)\b/.test(source)) {
    return true;
  }
  const prompts = (output.items || [])
    .map((item) => String(item?.prompt?.text || '').toLowerCase())
    .join(' ');
  return /\bwhat (?:bird|animal|plant|tree|flower|species|organism) is this\b/.test(prompts);
}

function hasAttribution(item: AiItem): boolean {
  const attribution = item.prompt?.attribution;
  return Boolean(attribution?.sourceUrl && attribution?.licenseName && attribution?.licenseUrl);
}

function needsImage(item: AiItem): boolean {
  return !String(item.prompt?.imgSrc || '').trim();
}

function buildApiUrl(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Wikimedia request failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchLeadImageFileName(title: string): Promise<{ fileName: string; imageUrl: string } | null> {
  const data = await fetchJson(buildApiUrl(WIKIPEDIA_API_URL, {
    action: 'query',
    format: 'json',
    origin: '*',
    redirects: '1',
    prop: 'pageimages',
    piprop: 'name|original',
    titles: title,
  }));
  const pages = data?.query?.pages && Object.values(data.query.pages);
  const page = Array.isArray(pages) ? pages.find((entry: any) => entry?.pageimage && entry?.original?.source) as any : null;
  if (!page?.pageimage || !page?.original?.source) {
    return null;
  }
  return {
    fileName: String(page.pageimage),
    imageUrl: String(page.original.source),
  };
}

async function fetchCommonsAttribution(fileName: string, imageUrl: string): Promise<WikimediaImageAttribution | null> {
  const data = await fetchJson(buildApiUrl(COMMONS_API_URL, {
    action: 'query',
    format: 'json',
    origin: '*',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    titles: `File:${fileName}`,
  }));
  const pages = data?.query?.pages && Object.values(data.query.pages);
  const imageInfo = Array.isArray(pages) ? (pages[0] as any)?.imageinfo?.[0] : null;
  const metadata = imageInfo?.extmetadata || {};
  const licenseName = stripHtml(metadata.LicenseShortName?.value || metadata.License?.value);
  const licenseUrl = normalizeLicenseUrl(licenseName, stripHtml(metadata.LicenseUrl?.value));
  if (!licenseName || !licenseUrl) {
    return null;
  }
  const sourceUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName).replace(/%20/g, '_')}`;
  return {
    imgSrc: String(imageInfo?.url || imageUrl),
    attribution: {
      creatorName: stripHtml(metadata.Artist?.value || metadata.Credit?.value || 'Wikimedia Commons contributor'),
      sourceName: stripHtml(metadata.ObjectName?.value || fileName),
      sourceUrl,
      licenseName,
      licenseUrl,
    },
  };
}

async function fetchWikimediaImageAttribution(title: string): Promise<WikimediaImageAttribution | null> {
  const leadImage = await fetchLeadImageFileName(title);
  if (!leadImage) {
    return null;
  }
  return fetchCommonsAttribution(leadImage.fileName, leadImage.imageUrl);
}

export async function enrichAiContentMedia(output: ValidatedAiLessonOutput, sourceText: string): Promise<AiMediaEnrichmentResult> {
  const warnings: string[] = [];
  const items = Array.isArray(output.items) ? output.items : [];
  if (!hasImageIntent(sourceText, output) || items.length === 0) {
    return { output, warnings };
  }

  const enrichedItems = await Promise.all(items.map(async (item) => {
    const title = String(item?.response?.correctResponse || item?.prompt?.text || '').trim();
    if (!title || !needsImage(item)) {
      return item;
    }
    try {
      const image = await fetchWikimediaImageAttribution(title);
      if (!image) {
        return item;
      }
      return {
        ...item,
        prompt: {
          ...(item.prompt || {}),
          imgSrc: image.imgSrc,
          attribution: image.attribution,
        },
      };
    } catch {
      return item;
    }
  }));

  const missingImageCount = enrichedItems.filter((item) => needsImage(item)).length;
  const missingAttributionCount = enrichedItems.filter((item) => String(item.prompt?.imgSrc || '').trim() && !hasAttribution(item)).length;
  const enrichedCount = enrichedItems.length - missingImageCount;
  if (enrichedCount > 0) {
    warnings.push(`Added Wikimedia image attribution for ${enrichedCount} generated item${enrichedCount === 1 ? '' : 's'}.`);
  }
  if (missingImageCount > 0) {
    warnings.push(`${missingImageCount} visual identification item${missingImageCount === 1 ? '' : 's'} could not be matched to an attributed Wikimedia image.`);
  }
  if (missingAttributionCount > 0) {
    warnings.push('Generated media content is locked private because one or more media prompts lack attribution evidence.');
  }

  return {
    output: {
      ...output,
      promptType: enrichedCount > 0 ? 'text-image' : output.promptType,
      visibility: missingAttributionCount > 0 ? 'private' : output.visibility,
      visibilityLockReason: missingAttributionCount > 0
        ? 'Generated visual content requires image attribution evidence before public sharing.'
        : output.visibilityLockReason,
      items: enrichedItems,
    },
    warnings,
  };
}
