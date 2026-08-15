import type {
  WikipediaDetailLinkCandidate,
  WikipediaListFieldCandidate,
  WikipediaListCandidate,
  WikipediaListEntry,
  WikipediaListRegionCandidate,
  WikipediaListSourceField,
} from '../../common/aiContentContract';

const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
const MAX_LIST_RESULTS = 3;
const MAX_REGIONS = 40;
const MAX_ENTRIES_PER_REGION = 500;
const MAX_FILE_REFERENCES_PER_ENTRY = 40;
const MAX_DETAIL_LINKS_PER_ENTRY = 20;
const MAX_SOURCE_FIELDS_PER_TABLE = 30;

type WikipediaApiPage = {
  pageid?: number;
  title?: string;
  fullurl?: string;
  extract?: string;
  index?: number;
};

export type WikipediaFileReference = {
  candidateId: string;
  itemId: string;
  fileTitle: string;
  caption: string;
  altText: string;
  surroundingText: string;
  structuralRole: string;
};

type RawDetailLink = {
  candidateId: string;
  itemId: string;
  anchorText: string;
  title: string;
  structuralRole: string;
};

export type ExtractedWikipediaListEntry = {
  item: WikipediaListEntry;
  directImages: WikipediaFileReference[];
  detailLinks: RawDetailLink[];
};

export type ExtractedWikipediaListRegion = {
  candidate: WikipediaListRegionCandidate;
  entries: ExtractedWikipediaListEntry[];
};

export type RetrievedWikipediaPage = {
  pageId: number;
  title: string;
  canonicalUrl: string;
  html: string;
};

type WikipediaListExtraction = {
  page: RetrievedWikipediaPage;
  regions: ExtractedWikipediaListRegion[];
};

function normalizedSpace(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizedKey(value: string): string {
  return normalizedSpace(value).replace(/\[[^\]]*\]/g, ' ').normalize('NFKC').toLocaleLowerCase().trim();
}

function textWithoutReferences(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('sup.reference, .reference').forEach((reference) => reference.remove());
  return normalizedSpace(clone.textContent);
}

function canonicalTitle(value: string): string {
  return normalizedSpace(value).replaceAll('_', ' ');
}

function buildUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  Object.entries({ action: 'query', format: 'json', formatversion: '2', origin: '*', ...params })
    .forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

export function wikipediaListSearchRequestUrl(query: string): string {
  return buildUrl(WIKIPEDIA_API_URL, {
    generator: 'search',
    gsrsearch: query.trim(),
    gsrnamespace: '0',
    gsrlimit: String(MAX_LIST_RESULTS),
    prop: 'extracts|info',
    exintro: '1',
    explaintext: '1',
    exsentences: '3',
    inprop: 'url',
  });
}

export function wikipediaPageRequestUrl(pageId: number): string {
  return buildUrl(WIKIPEDIA_API_URL, {
    action: 'parse',
    pageid: String(pageId),
    prop: 'text|displaytitle',
    redirects: '1',
    disableeditsection: '1',
    disabletoc: '1',
  });
}

export function wikipediaDetailLinkRequestUrls(links: ReadonlyArray<{ title: string }>): string[] {
  const uniqueTitles = Array.from(new Set(links.map(({ title }) => title)));
  const urls: string[] = [];
  for (let index = 0; index < uniqueTitles.length; index += 50) {
    urls.push(buildUrl(WIKIPEDIA_API_URL, {
      titles: uniqueTitles.slice(index, index + 50).join('|'),
      redirects: '1',
      prop: 'info',
      inprop: 'url',
    }));
  }
  return urls;
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<any> {
  const response = await fetcher(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Wikipedia request failed with HTTP ${response.status}.`);
  const data = await response.json();
  if (data?.error) throw new Error(`Wikipedia API error: ${String(data.error.info || data.error.code || 'unknown error')}`);
  return data;
}

function stripHtml(value: unknown): string {
  const source = String(value || '');
  if (typeof DOMParser !== 'undefined') {
    return normalizedSpace(new DOMParser().parseFromString(source, 'text/html').body.textContent || '');
  }
  return normalizedSpace(source.replace(/<[^>]+>/g, ' '));
}

export async function searchWikipediaListCandidates(
  query: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<WikipediaListCandidate[]> {
  const requestUrl = wikipediaListSearchRequestUrl(query);
  const data = await fetchJson(requestUrl, fetcher);
  const pages: WikipediaApiPage[] = Array.isArray(data?.query?.pages) ? data.query.pages : [];
  return pages
    .filter((page) => Number(page.pageid) > 0 && canonicalTitle(String(page.title || '')))
    .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
    .slice(0, MAX_LIST_RESULTS)
    .map((page, index) => ({
      candidateId: `list-page-${Number(page.pageid)}`,
      rank: index + 1,
      pageId: Number(page.pageid),
      title: canonicalTitle(String(page.title)),
      canonicalUrl: String(page.fullurl || `https://en.wikipedia.org/?curid=${Number(page.pageid)}`),
      snippet: stripHtml(page.extract),
      leadExcerpt: stripHtml(page.extract),
    }));
}

export async function fetchWikipediaPage(
  pageId: number,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<RetrievedWikipediaPage> {
  if (!Number.isInteger(pageId) || pageId <= 0) throw new Error('Wikipedia page ID must be a positive integer.');
  const requestUrl = wikipediaPageRequestUrl(pageId);
  const data = await fetchJson(requestUrl, fetcher);
  const parsed = data?.parse;
  const resolvedPageId = Number(parsed?.pageid || pageId);
  const title = canonicalTitle(String(parsed?.title || ''));
  const html = String(parsed?.text || '');
  if (!title || !html) throw new Error('Wikipedia did not return a readable page.');
  return {
    pageId: resolvedPageId,
    title,
    canonicalUrl: `https://en.wikipedia.org/?curid=${resolvedPageId}`,
    html,
  };
}

function wikiTitleFromAnchor(anchor: HTMLAnchorElement): string {
  const href = String(anchor.getAttribute('href') || '');
  const titleAttribute = String(anchor.getAttribute('title') || '');
  const match = href.match(/\/wiki\/([^#?]+)/i);
  if (match) {
    try {
      return canonicalTitle(decodeURIComponent(match[1] || ''));
    } catch {
      return canonicalTitle(match[1] || '');
    }
  }
  return canonicalTitle(titleAttribute);
}

function isFileTitle(title: string): boolean {
  return /^File:/i.test(title);
}

function isMainArticleTitle(title: string): boolean {
  return Boolean(title) && !/^(?:File|Category|Help|Special|Template|Portal|Wikipedia|Talk|User|Draft|Module|Media):/i.test(title);
}

function excludedRegion(element: Element): boolean {
  return Boolean(element.closest('.navbox, .vertical-navbox, .metadata, .ambox, .toc, .reflist, .references, .sidebar, .infobox'));
}

function headingBefore(element: Element): string {
  const headings = Array.from(element.ownerDocument.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  let selected = '';
  for (const heading of headings) {
    const relationship = heading.compareDocumentPosition(element);
    if ((relationship & 4) === 0) continue;
    selected = normalizedSpace(heading.textContent);
  }
  return selected;
}

function entryLabel(element: Element): { response: string; responseAnchor?: HTMLAnchorElement } | null {
  const anchors = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map((anchor) => ({ anchor, title: wikiTitleFromAnchor(anchor), text: textWithoutReferences(anchor) }))
    .filter(({ title, text }) => isMainArticleTitle(title) && Boolean(text));
  const preferred = anchors.find(({ text }) => !/^[A-Z]{1,3}$/.test(text)) || anchors[0];
  if (preferred) return { response: preferred.text, responseAnchor: preferred.anchor };

  const cells = Array.from(element.querySelectorAll(':scope > th, :scope > td'));
  const text = textWithoutReferences(cells.find((cell) => textWithoutReferences(cell)) || element);
  if (!text || text.length > 180) return null;
  return { response: text };
}

function fileReferences(element: Element, itemId: string, role: string, prefix: 'direct-image' | 'detail-image'): WikipediaFileReference[] {
  const references = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href], a[title]'))
    .map((anchor) => ({ anchor, title: wikiTitleFromAnchor(anchor) }))
    .filter(({ title }) => isFileTitle(title));
  return Array.from(new Map(references.map(({ anchor, title }, index) => {
    const image = anchor.querySelector('img');
    const figure = anchor.closest('figure, .thumb, .gallerybox, td, li');
    const fileTitle = canonicalTitle(title);
    const candidateId = `${prefix}-${itemId}-${index + 1}`;
    const reference: WikipediaFileReference = {
      candidateId,
      itemId,
      fileTitle,
      caption: normalizedSpace(figure?.querySelector('figcaption, .thumbcaption, .gallerytext')?.textContent),
      altText: normalizedSpace(image?.getAttribute('alt')),
      surroundingText: normalizedSpace(element.textContent).slice(0, 1000),
      structuralRole: role,
    };
    return [fileTitle.toLocaleLowerCase(), reference] as const;
  })).values()).slice(0, MAX_FILE_REFERENCES_PER_ENTRY);
}

function detailReferences(
  element: Element,
  itemId: string,
  role: string,
  responseAnchor?: HTMLAnchorElement,
): RawDetailLink[] {
  const anchors = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map((anchor) => ({ anchor, title: wikiTitleFromAnchor(anchor), text: textWithoutReferences(anchor) }))
    .filter(({ title, text }) => isMainArticleTitle(title) && Boolean(text));
  if (responseAnchor && !anchors.some(({ anchor }) => anchor === responseAnchor)) {
    const title = wikiTitleFromAnchor(responseAnchor);
    if (isMainArticleTitle(title)) anchors.unshift({ anchor: responseAnchor, title, text: textWithoutReferences(responseAnchor) });
  }
  return Array.from(new Map(anchors.map(({ title, text }, index) => {
    const reference: RawDetailLink = {
      candidateId: `detail-${itemId}-${index + 1}`,
      itemId,
      anchorText: text,
      title,
      structuralRole: role,
    };
    return [title.toLocaleLowerCase(), reference] as const;
  })).values()).slice(0, MAX_DETAIL_LINKS_PER_ENTRY);
}

function sourceElements(region: Element, kind: WikipediaListRegionCandidate['kind']): Element[] {
  if (kind === 'table') {
    return Array.from(region.querySelectorAll('tr')).filter((row) => row.querySelector('td'));
  }
  if (kind === 'gallery') {
    return Array.from(region.querySelectorAll(':scope > li, :scope > .gallerybox, figure'));
  }
  return Array.from(region.querySelectorAll(':scope > li'));
}

function tableFields(table: Element, regionId: string): WikipediaListFieldCandidate[] {
  const rows = Array.from(table.querySelectorAll('tr'));
  const headerRow = rows.find((row) => row.querySelectorAll(':scope > th').length > 0
    && row.querySelectorAll(':scope > td').length === 0)
    || rows.find((row) => row.querySelectorAll(':scope > th').length > 0);
  const headers = headerRow ? Array.from(headerRow.querySelectorAll(':scope > th')) : [];
  const columnCount = Math.max(
    headers.length,
    ...rows.map((row) => row.querySelectorAll(':scope > th, :scope > td').length),
  );
  return Array.from({ length: Math.min(columnCount, MAX_SOURCE_FIELDS_PER_TABLE) }, (_, index) => ({
    fieldId: `${regionId}-field-${index + 1}`,
    label: headers[index] ? textWithoutReferences(headers[index]!) : `Column ${index + 1}`,
    sampleValues: [],
  }));
}

function sourceFields(
  entry: Element,
  fields: WikipediaListFieldCandidate[],
): WikipediaListSourceField[] {
  const cells = Array.from(entry.querySelectorAll(':scope > th, :scope > td'));
  return fields.map((field, index) => ({
    fieldId: field.fieldId,
    label: field.label,
    value: cells[index] ? textWithoutReferences(cells[index]!) : '',
  }));
}

function regionElements(document: Document): Array<{ element: Element; kind: WikipediaListRegionCandidate['kind'] }> {
  const tables = Array.from(document.querySelectorAll('table'))
    .filter((element) => !excludedRegion(element) && element.querySelectorAll('tr td').length > 0)
    .map((element) => ({ element, kind: 'table' as const }));
  const galleries = Array.from(document.querySelectorAll('.gallery, [typeof~="mw:Image/Thumb"]'))
    .filter((element) => !excludedRegion(element))
    .map((element) => ({ element, kind: 'gallery' as const }));
  const lists = Array.from(document.querySelectorAll('ol, ul'))
    .filter((element) => !excludedRegion(element) && !element.closest('table, .gallery') && element.querySelectorAll(':scope > li').length >= 2)
    .filter((element) => !element.parentElement?.closest('ol, ul'))
    .map((element) => ({ element, kind: 'list' as const }));
  return [...tables, ...galleries, ...lists].slice(0, MAX_REGIONS);
}

export function extractWikipediaListRegions(page: RetrievedWikipediaPage): WikipediaListExtraction {
  if (typeof DOMParser === 'undefined') throw new Error('Wikipedia list extraction requires DOMParser.');
  const document = new DOMParser().parseFromString(page.html, 'text/html');
  const regions: ExtractedWikipediaListRegion[] = [];
  regionElements(document).forEach(({ element, kind }, regionIndex) => {
    const regionId = `region-${page.pageId}-${regionIndex + 1}`;
    const fields = kind === 'table' ? tableFields(element, regionId) : [];
    const entries: ExtractedWikipediaListEntry[] = [];
    const seen = new Set<string>();
    sourceElements(element, kind).slice(0, MAX_ENTRIES_PER_REGION).forEach((entryElement, entryIndex) => {
      const label = entryLabel(entryElement);
      if (!label) return;
      const responseKey = normalizedKey(label.response);
      if (!responseKey || seen.has(responseKey)) return;
      seen.add(responseKey);
      const itemId = `item-${page.pageId}-${regionIndex + 1}-${entryIndex + 1}`;
      const role = `${kind} entry ${entryIndex + 1}`;
      const directImages = fileReferences(entryElement, itemId, role, 'direct-image');
      const detailLinks = detailReferences(entryElement, itemId, role, label.responseAnchor);
      entries.push({
        item: {
          itemId,
          sourcePageId: page.pageId,
          sourcePageTitle: page.title,
          sourcePageUrl: page.canonicalUrl,
          regionId,
          sourceLocator: `${headingBefore(element) || page.title} / ${role}`,
          displayedResponse: label.response,
          normalizedResponseKey: responseKey,
          directImageCandidateIds: directImages.map(({ candidateId }) => candidateId),
          detailLinkCandidateIds: detailLinks.map(({ candidateId }) => candidateId),
          ...(fields.length > 0 ? { sourceFields: sourceFields(entryElement, fields) } : {}),
        },
        directImages,
        detailLinks,
      });
    });
    if (entries.length < 1) return;
    const fieldsWithSamples = fields.map((field) => ({
      ...field,
      sampleValues: entries
        .map(({ item }) => item.sourceFields?.find(({ fieldId }) => fieldId === field.fieldId)?.value || '')
        .filter(Boolean)
        .slice(0, 8),
    }));
    regions.push({
      candidate: {
        regionId,
        kind,
        heading: headingBefore(element) || page.title,
        entryCount: entries.length,
        sampleEntries: entries.slice(0, 8).map(({ item }) => item.displayedResponse),
        ...(fieldsWithSamples.length > 0 ? { fields: fieldsWithSamples } : {}),
      },
      entries,
    });
  });
  return { page, regions };
}

export async function hydrateWikipediaDetailLinks(
  links: RawDetailLink[],
  fetcher: typeof fetch = globalThis.fetch,
): Promise<WikipediaDetailLinkCandidate[]> {
  if (links.length === 0) return [];
  const uniqueTitles = Array.from(new Set(links.map(({ title }) => title)));
  const pagesByRequestedTitle = new Map<string, WikipediaApiPage>();
  const requestUrls = wikipediaDetailLinkRequestUrls(links);
  for (let index = 0; index < uniqueTitles.length; index += 50) {
    const batch = uniqueTitles.slice(index, index + 50);
    const requestUrl = requestUrls[index / 50]!;
    const data = await fetchJson(requestUrl, fetcher);
    const pages: WikipediaApiPage[] = Array.isArray(data?.query?.pages) ? data.query.pages : [];
    const normalized = new Map<string, string>((Array.isArray(data?.query?.normalized) ? data.query.normalized : [])
      .map((entry: { from?: string; to?: string }) => [canonicalTitle(String(entry.from || '')).toLocaleLowerCase(), canonicalTitle(String(entry.to || ''))]));
    const redirects = new Map<string, string>((Array.isArray(data?.query?.redirects) ? data.query.redirects : [])
      .map((entry: { from?: string; to?: string }) => [canonicalTitle(String(entry.from || '')).toLocaleLowerCase(), canonicalTitle(String(entry.to || ''))]));
    const pagesByTitle = new Map(pages.map((page) => [canonicalTitle(String(page.title || '')).toLocaleLowerCase(), page]));
    batch.forEach((requested) => {
      const requestedKey = canonicalTitle(requested).toLocaleLowerCase();
      const normalizedTitle = normalized.get(requestedKey) || canonicalTitle(requested);
      const redirectedTitle = redirects.get(normalizedTitle.toLocaleLowerCase()) || normalizedTitle;
      const page = pagesByTitle.get(redirectedTitle.toLocaleLowerCase());
      if (page) pagesByRequestedTitle.set(requestedKey, page);
    });
  }
  return links.flatMap((link) => {
    const page = pagesByRequestedTitle.get(link.title.toLocaleLowerCase());
    if (!page || Number(page.pageid) <= 0) return [];
    return [{
      candidateId: link.candidateId,
      itemId: link.itemId,
      anchorText: link.anchorText,
      pageId: Number(page.pageid),
      title: canonicalTitle(String(page.title || link.title)),
      canonicalUrl: String(page.fullurl || `https://en.wikipedia.org/?curid=${Number(page.pageid)}`),
      structuralRole: link.structuralRole,
    }];
  });
}

export function extractWikipediaPageFileReferences(
  page: RetrievedWikipediaPage,
  itemId: string,
): WikipediaFileReference[] {
  if (typeof DOMParser === 'undefined') throw new Error('Wikipedia image extraction requires DOMParser.');
  const document = new DOMParser().parseFromString(page.html, 'text/html');
  const content = document.querySelector('.mw-parser-output') || document.body;
  return fileReferences(content, itemId, 'detail-page content', 'detail-image');
}
