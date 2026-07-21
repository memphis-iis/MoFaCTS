import type { AiContentPair, AiPromptAttribution } from '../../common/aiContentContract';
import { convertAiImageToWebp, type ConvertedImage } from './aiContentImageAssets';
import {
  planWikimediaTopics,
  type WikimediaTopicPlan,
} from './aiContentWikimediaTopics';

const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';
const API_USER_AGENT = 'MoFaCTS-AI-Content-Creator/4.0';
const MAX_TOPICS = 5;
const MAX_SEARCH_RESULTS_PER_TOPIC = 6;
const MAX_TRAVERSAL_ROUNDS = 5;
const MAX_PAGES_PER_ROUND = 12;
const MAX_PAGES_TOTAL = 60;
const MAX_LINKS_PER_PAGE = 500;
const MAX_IMAGES_PER_PAGE = 80;
const MAX_REQUESTS = 120;
const MAX_REQUEST_ATTEMPTS = 3;
const MAX_SERIES_COLLECTIONS = 8;

type WikimediaMetadata = Record<string, { value?: unknown }>;

type WikimediaImagePage = {
  title?: string;
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

type PageNode = {
  title: string;
  depth: number;
  score: number;
  role?: 'collection' | 'member';
  parentTitle?: string;
  path: string[];
};

type InspectedPage = {
  title: string;
  articleLinks: string[];
  fileTitles: string[];
  commonsCollections: CommonsCollectionReference[];
  images: WikimediaImagePage[];
  extract: string;
};

type GroundingSectionEvidence = {
  sectionIndex: string;
  sectionTitle: string;
  articleLinks: string[];
  extract: string;
};

type WikimediaStructuralGrounding = {
  collections: string[];
  members: string[];
};

type CommonsCollectionReference = {
  kind: 'file' | 'category' | 'gallery';
  title: string;
  sourceUrl: string;
};

type CandidateAsset = {
  pairId: string;
  pairIndex: number;
  response: string;
  articleTitle: string;
  path: string[];
  page: WikimediaImagePage;
  familyKeys: string[];
  matchScore: number;
  contextScore: number;
  staticSource: boolean;
};

type DiscoveryContext = {
  fetcher: typeof fetch;
  diagnostics: WikimediaDiscoveryDiagnostic[];
  requestCount: number;
  acquisitionRequestCount: number;
  pagesVisited: number;
};

class DiscoveryLimitError extends Error {
  constructor(readonly stopReason: WikimediaDiscoveryStopReason, message: string) {
    super(message);
  }
}

export type WikimediaDiscoveryStopReason =
  | 'complete'
  | 'no-image-pairs'
  | 'frontier-empty'
  | 'depth-limit'
  | 'page-limit'
  | 'request-limit'
  | 'acquisition-failed';

export type WikimediaDiscoveryDiagnostic = {
  stage: 'topic-planning' | 'grounding' | 'search' | 'traversal' | 'candidate' | 'family' | 'selection' | 'license' | 'acquisition' | 'conversion';
  message: string;
  requestUrl?: string;
  round?: number;
  depth?: number;
  articleTitle?: string;
  parentArticleTitle?: string;
  linkedArticleTitle?: string;
  traversalPath?: string[];
  pairId?: string;
  pairIndex?: number;
  response?: string;
  familyKey?: string;
  candidateFile?: string;
  selected1280Url?: string;
  sourceMediaType?: string;
  licenseName?: string;
  decision?: 'accepted' | 'rejected' | 'selected' | 'unresolved';
};

export type WikimediaDiscoveredAsset = {
  pairId: string;
  pairIndex: number;
  sourceTitle: string;
  sourceUrl: string;
  renditionUrl: string;
  sourceMediaType: string;
  sourceByteLength: number;
  sourceBytes: Uint8Array;
  familyKey: string;
  sourceWidth?: number;
  sourceHeight?: number;
  webpBytes: Uint8Array;
  webpWidth: number;
  webpHeight: number;
  attribution: AiPromptAttribution;
};

export type WikimediaDiscoveryLimits = {
  maxTopics: number;
  maxSearchResultsPerTopic: number;
  maxTraversalRounds: number;
  maxPagesPerRound: number;
  maxPagesTotal: number;
  maxLinksPerPage: number;
  maxImagesPerPage: number;
  maxSeriesCollections: number;
  maxRequests: number;
  maxRequestAttempts: number;
};

export type WikimediaDiscoveryResult = {
  input: {
    notes: string;
    imageResponses: Array<{ pairId: string; pairIndex: number; response: string }>;
  };
  topicPlan: WikimediaTopicPlan;
  topics: string[];
  assets: WikimediaDiscoveredAsset[];
  unresolvedPairIds: string[];
  diagnostics: WikimediaDiscoveryDiagnostic[];
  stopReason: WikimediaDiscoveryStopReason;
  limits: WikimediaDiscoveryLimits;
  requestsUsed: number;
  acquisitionRequestsUsed: number;
  pagesVisited: number;
  roundsCompleted: number;
};

export type WikimediaDiscoveryOptions = {
  notes: string;
  pairs: AiContentPair[];
  model: string;
  fetcher?: typeof fetch;
  topicPlanner?: (notes: string, responses: string[], model: string) => Promise<WikimediaTopicPlan>;
  converter?: (file: File) => Promise<ConvertedImage>;
};

export type WikimediaAuthoritativeDiscoveryResult = WikimediaDiscoveryResult & {
  pairs: AiContentPair[];
  groundings: Array<{ articleTitle: string; result: WikimediaStructuralGrounding }>;
};

export type WikimediaAuthoritativeDiscoveryOptions = {
  notes: string;
  model: string;
  fetcher?: typeof fetch;
  topicPlanner?: (notes: string, responses: string[], model: string) => Promise<WikimediaTopicPlan>;
  converter?: (file: File) => Promise<ConvertedImage>;
};

const DISCOVERY_LIMITS: WikimediaDiscoveryLimits = {
  maxTopics: MAX_TOPICS,
  maxSearchResultsPerTopic: MAX_SEARCH_RESULTS_PER_TOPIC,
  maxTraversalRounds: MAX_TRAVERSAL_ROUNDS,
  maxPagesPerRound: MAX_PAGES_PER_ROUND,
  maxPagesTotal: MAX_PAGES_TOTAL,
  maxLinksPerPage: MAX_LINKS_PER_PAGE,
  maxImagesPerPage: MAX_IMAGES_PER_PAGE,
  maxSeriesCollections: MAX_SERIES_COLLECTIONS,
  maxRequests: MAX_REQUESTS,
  maxRequestAttempts: MAX_REQUEST_ATTEMPTS,
};

function stripHtml(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function singular(term: string): string {
  const known: Record<string, string> = {
    bones: 'bone', phalanges: 'phalanx', carpals: 'carpal', metacarpals: 'metacarpal',
    images: 'image', diagrams: 'diagram', pictures: 'picture', photos: 'photo',
    first: '1', second: '2', third: '3', fourth: '4', fifth: '5',
    triangular: 'triquetrum', triquetral: 'triquetrum', triqueterum: 'triquetrum',
    metacarpus: 'metacarpal',
  };
  if (known[term]) return known[term];
  if (term.length > 4 && term.endsWith('s')) return term.slice(0, -1);
  return term;
}

function normalizeTerms(value: string): string[] {
  const stop = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'human', 'right', 'left']);
  return value.replace(/([\p{Ll}\d])([\p{Lu}])/gu, '$1 $2').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/)
    .map(singular)
    .filter((term) => term && !stop.has(term));
}

function normalizedKey(value: string): string {
  return normalizeTerms(value).join('-').slice(0, 160);
}

function canonicalTitle(value: string): string {
  return String(value || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildUrl(apiUrl: string, params: Record<string, string>): string {
  const url = new URL(apiUrl);
  Object.entries({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    'Api-User-Agent': API_USER_AGENT,
    ...params,
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

async function request(
  url: string,
  context: DiscoveryContext,
  stage: WikimediaDiscoveryDiagnostic['stage'],
  countsAgainstTraversalLimit = true,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    if (countsAgainstTraversalLimit && context.requestCount >= MAX_REQUESTS) {
      throw new DiscoveryLimitError('request-limit', `Wikimedia discovery reached its ${MAX_REQUESTS}-request limit.`);
    }
    if (countsAgainstTraversalLimit) context.requestCount += 1;
    else context.acquisitionRequestCount += 1;
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const timeout = controller ? globalThis.setTimeout(() => controller.abort(), 15_000) : null;
    try {
      const response = await context.fetcher(url, controller ? { signal: controller.signal } : undefined);
      if (!response.ok) throw new Error(`Wikimedia request failed with HTTP ${response.status}.`);
      if (attempt > 1) {
        context.diagnostics.push({ stage, requestUrl: url, decision: 'accepted', message: `Request succeeded on attempt ${attempt}.` });
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      context.diagnostics.push({
        stage,
        requestUrl: url,
        decision: 'rejected',
        message: `Request attempt ${attempt} failed: ${lastError.message}`,
      });
      if (attempt < MAX_REQUEST_ATTEMPTS) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 250 * (2 ** (attempt - 1))));
      }
    } finally {
      if (timeout !== null) globalThis.clearTimeout(timeout);
    }
  }
  throw lastError || new Error('Wikimedia request failed.');
}

async function fetchJson(
  url: string,
  context: DiscoveryContext,
  stage: WikimediaDiscoveryDiagnostic['stage'],
): Promise<any> {
  return (await request(url, context, stage)).json();
}

export function buildWikimediaCollectionQuery(notes: string): string {
  return String(notes || '')
    .replace(/\b(?:create|make|generate)\s+(?:a\s+)?(?:lesson|learning session|test|quiz)\s+(?:on|about)\b/gi, ' ')
    .replace(/\b(with|using|use|include|including)\s+(image|images|image prompts|pictures|photos|diagrams|visuals)\b/gi, ' ')
    .replace(/\b(create|make|generate|lesson|learning|test|quiz|prompts?)\b/gi, ' ')
    .replace(/^\s*(?:on|about)\s+/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

async function searchTopic(topic: string, context: DiscoveryContext): Promise<string[]> {
  const requestUrl = buildUrl(WIKIPEDIA_API_URL, {
    list: 'search',
    srnamespace: '0',
    srlimit: String(MAX_SEARCH_RESULTS_PER_TOPIC),
    srsearch: topic,
  });
  try {
    const data = await fetchJson(requestUrl, context, 'search');
    const titles: string[] = (Array.isArray(data?.query?.search) ? data.query.search : [])
      .map((entry: { title?: unknown }) => canonicalTitle(String(entry.title || '')))
      .filter(Boolean)
      .slice(0, MAX_SEARCH_RESULTS_PER_TOPIC);
    context.diagnostics.push({
      stage: 'search',
      requestUrl,
      decision: titles.length > 0 ? 'accepted' : 'rejected',
      message: `Wikipedia topic ${JSON.stringify(topic)} returned ${titles.length} article candidates: ${titles.join(', ') || 'none'}.`,
    });
    return titles;
  } catch (error) {
    if (error instanceof DiscoveryLimitError) throw error;
    context.diagnostics.push({ stage: 'search', requestUrl, decision: 'rejected', message: `Wikipedia topic ${JSON.stringify(topic)} failed: ${error instanceof Error ? error.message : String(error)}` });
    return [];
  }
}

function parseCommonsUrl(value: string): CommonsCollectionReference | null {
  try {
    const url = new URL(value);
    if (url.hostname !== 'commons.wikimedia.org') return null;
    const match = url.pathname.match(/^\/wiki\/(.+)$/);
    if (!match) return null;
    const title = canonicalTitle(decodeURIComponent(match[1] || ''));
    if (!title || title.startsWith('Special:')) return null;
    if (/^File:/i.test(title)) return { kind: 'file', title, sourceUrl: url.toString() };
    if (/^Category:/i.test(title)) return { kind: 'category', title, sourceUrl: url.toString() };
    return { kind: 'gallery', title, sourceUrl: url.toString() };
  } catch {
    return null;
  }
}

async function inspectArticleLinks(node: PageNode, round: number, context: DiscoveryContext): Promise<Pick<InspectedPage, 'articleLinks' | 'fileTitles' | 'commonsCollections' | 'extract'>> {
  const articleLinks: string[] = [];
  const fileTitles: string[] = [];
  const commonsCollections: CommonsCollectionReference[] = [];
  let extract = '';
  let continuation: Record<string, string> = {};
  do {
    const requestUrl = buildUrl(WIKIPEDIA_API_URL, {
      prop: 'links|extlinks|extracts',
      titles: node.title,
      plnamespace: '0|14',
      pllimit: 'max',
      ellimit: 'max',
      explaintext: '1',
      exsectionformat: 'plain',
      redirects: '1',
      ...continuation,
    });
    const data = await fetchJson(requestUrl, context, 'traversal');
    const page = Array.isArray(data?.query?.pages) ? data.query.pages[0] : null;
    if (!extract) extract = String(page?.extract || '').trim();
    (Array.isArray(page?.links) ? page.links : []).forEach((entry: { title?: unknown; ns?: unknown }) => {
      const title = canonicalTitle(String(entry.title || ''));
      if (!title) return;
      if (Number(entry.ns) === 0) articleLinks.push(title);
      else if (/^File:/i.test(title)) fileTitles.push(title);
    });
    (Array.isArray(page?.extlinks) ? page.extlinks : []).forEach((entry: { url?: unknown }) => {
      const reference = parseCommonsUrl(String(entry.url || ''));
      if (reference) commonsCollections.push(reference);
    });
    continuation = data?.continue && typeof data.continue === 'object'
      ? Object.fromEntries(Object.entries(data.continue).map(([key, value]) => [key, String(value)]))
      : {};
  } while (Object.keys(continuation).length > 0 && articleLinks.length < MAX_LINKS_PER_PAGE);

  const uniqueArticles = Array.from(new Set(articleLinks)).slice(0, MAX_LINKS_PER_PAGE);
  const uniqueFiles = Array.from(new Set(fileTitles));
  const uniqueCommons = Array.from(new Map(commonsCollections.map((entry) => [`${entry.kind}:${entry.title}`, entry])).values());
  context.diagnostics.push({
    stage: 'traversal',
    round,
    depth: node.depth,
    articleTitle: node.title,
    ...(node.parentTitle ? { parentArticleTitle: node.parentTitle } : {}),
    traversalPath: node.path,
    decision: 'accepted',
    message: `Inspected ${node.title}: ${uniqueArticles.length} article links, ${uniqueFiles.length} file links, and ${uniqueCommons.length} Commons links.`,
  });
  return { articleLinks: uniqueArticles, fileTitles: uniqueFiles, commonsCollections: uniqueCommons, extract };
}

const NONCONTENT_SECTION_TITLES = /^(?:see also|references|notes|external links|further reading|bibliography|history|etymology|other animals|clinical significance|additional images)$/i;

function pluralNormalizedTerms(value: string): Set<string> {
  const tokens = value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return new Set(tokens.filter((token) => singular(token) !== token).map(singular));
}

function withoutNonArticleWikiLinks(wikitext: string): string {
  let remaining = String(wikitext || '').replace(/<gallery\b[^>]*>[\s\S]*?<\/gallery>/gi, ' ');
  const namespaceStart = /\[\[(?:File|Image|Category|Help|Template|Wikipedia):/gi;
  let match = namespaceStart.exec(remaining);
  while (match) {
    let depth = 1;
    let cursor = match.index + 2;
    while (cursor < remaining.length && depth > 0) {
      if (remaining.startsWith('[[', cursor)) {
        depth += 1;
        cursor += 2;
      } else if (remaining.startsWith(']]', cursor)) {
        depth -= 1;
        cursor += 2;
      } else {
        cursor += 1;
      }
    }
    remaining = `${remaining.slice(0, match.index)} ${remaining.slice(cursor)}`;
    namespaceStart.lastIndex = match.index + 1;
    match = namespaceStart.exec(remaining);
  }
  return remaining;
}

function wikipediaLinksInText(wikitext: string): Array<{ title: string; display: string }> {
  const links: Array<{ title: string; display: string }> = [];
  for (const match of withoutNonArticleWikiLinks(wikitext).matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g)) {
    const title = canonicalTitle(String(match[1] || ''));
    const display = stripHtml(String(match[2] || match[1] || '').replace(/\{\{[^}]+\}\}/g, ' '));
    if (title && !/^(?:File|Image|Category|Help|Template|Wikipedia):/i.test(title)) links.push({ title, display });
  }
  return links;
}

function isCollectionIdentityTitle(candidateTitle: string, collectionTitle: string): boolean {
  const genericTerms = new Set(['bone', 'hand', 'human', 'anatomy']);
  const collectionTerms = new Set(normalizeTerms(collectionTitle).filter((term) => !genericTerms.has(term)));
  const candidateTerms = new Set(normalizeTerms(candidateTitle).filter((term) => !genericTerms.has(term)));
  return collectionTerms.size > 0
    && collectionTerms.size === candidateTerms.size
    && Array.from(collectionTerms).every((term) => candidateTerms.has(term));
}

function enumerationPassage(wikitext: string, notes: string): string {
  const noteTerms = new Set(normalizeTerms(notes));
  const paragraphs = String(wikitext || '').split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const numberPattern = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|\d+)\b/i;
  const scored = paragraphs.map((paragraph) => {
    const terms = new Set(normalizeTerms(paragraph));
    const overlap = Array.from(terms).filter((term) => noteTerms.has(term)).length;
    const linkCount = wikipediaLinksInText(paragraph).length;
    const enumeration = numberPattern.test(paragraph) || /\b(?:consists? of|comprises?|include[sd]?|organized into|make up)\b/i.test(paragraph);
    return { paragraph, score: (overlap * 3) + Math.min(linkCount, 12) + (enumeration ? 20 : 0) };
  });
  return scored.sort((left, right) => right.score - left.score)[0]?.paragraph || '';
}

function collectionBranchesFromPassage(wikitext: string, notes: string): { passage: string; titles: string[] } {
  const passage = enumerationPassage(wikitext, notes);
  const entityTerms = new Set(normalizeTerms(notes));
  const pluralTerms = pluralNormalizedTerms(passage);
  const titles = wikipediaLinksInText(passage).filter(({ title, display }) => {
    const titleTerms = normalizeTerms(title);
    const displayTerms = normalizeTerms(display);
    const displayHasPlural = pluralNormalizedTerms(display).size > 0;
    const entityOverlap = displayTerms.some((term) => entityTerms.has(term));
    const distinctivePlural = titleTerms.some((term) => term !== 'bone' && pluralTerms.has(term));
    const titleKeepsEntityType = titleTerms.some((term) => entityTerms.has(term));
    return (displayHasPlural && entityOverlap) || (distinctivePlural && titleKeepsEntityType);
  }).map(({ title }) => title);
  return { passage, titles: Array.from(new Set(titles)) };
}

async function wikipediaArticleCategories(articleTitle: string, context: DiscoveryContext): Promise<string[]> {
  const requestUrl = buildUrl(WIKIPEDIA_API_URL, {
    prop: 'categories',
    titles: articleTitle,
    cllimit: 'max',
    redirects: '1',
  });
  const data = await fetchJson(requestUrl, context, 'traversal');
  const page = Array.isArray(data?.query?.pages) ? data.query.pages[0] : null;
  return Array.from(new Set<string>((Array.isArray(page?.categories) ? page.categories : [])
    .map((entry: { title?: unknown }) => canonicalTitle(String(entry.title || '')).replace(/^Category:/i, ''))
    .filter((title: string) => title && !/articles|description|wikipedia|webarchive|commons|errors|statements|language text/i.test(title))));
}

async function wikipediaCategoryArticleMembers(categoryTitle: string, context: DiscoveryContext): Promise<string[]> {
  const requestUrl = buildUrl(WIKIPEDIA_API_URL, {
    list: 'categorymembers',
    cmtitle: `Category:${categoryTitle}`,
    cmnamespace: '0',
    cmlimit: 'max',
  });
  const data = await fetchJson(requestUrl, context, 'traversal');
  return Array.from(new Set<string>((Array.isArray(data?.query?.categorymembers) ? data.query.categorymembers : [])
    .map((entry: { title?: unknown }) => canonicalTitle(String(entry.title || '')))
    .filter(Boolean)));
}

async function distinctRedirectMembers(collectionTitle: string, titles: string[], context: DiscoveryContext): Promise<string[]> {
  if (titles.length === 0) return [];
  const requestUrl = buildUrl(WIKIPEDIA_API_URL, {
    titles: titles.join('|'),
    redirects: '1',
  });
  const data = await fetchJson(requestUrl, context, 'traversal');
  const normalized = new Map<string, string>((Array.isArray(data?.query?.normalized) ? data.query.normalized : [])
    .map((entry: { from?: unknown; to?: unknown }) => [canonicalTitle(String(entry.from || '')).toLocaleLowerCase(), canonicalTitle(String(entry.to || ''))]));
  const redirects = new Map<string, { to: string; fragment: string }>((Array.isArray(data?.query?.redirects) ? data.query.redirects : [])
    .map((entry: { from?: unknown; to?: unknown; tofragment?: unknown }) => [
      canonicalTitle(String(entry.from || '')).toLocaleLowerCase(),
      { to: canonicalTitle(String(entry.to || '')), fragment: canonicalTitle(String(entry.tofragment || '')) },
    ]));
  const identities = new Set<string>();
  return titles.filter((title) => {
    const normalizedTitle = normalized.get(title.toLocaleLowerCase()) || title;
    const redirect = redirects.get(normalizedTitle.toLocaleLowerCase()) || redirects.get(title.toLocaleLowerCase());
    if (!redirect) {
      const identity = normalizedTitle.toLocaleLowerCase();
      if (identities.has(identity)) return false;
      identities.add(identity);
      return true;
    }
    if (normalizedKey(redirect.to) !== normalizedKey(collectionTitle) || !redirect.fragment) return false;
    const identity = `${redirect.to}#${redirect.fragment}`.toLocaleLowerCase();
    if (identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
}

async function canonicalMemberLinks(
  node: PageNode,
  inspected: InspectedPage,
  round: number,
  context: DiscoveryContext,
): Promise<string[]> {
  const articleTerms = normalizeTerms(node.title);
  const distinctiveTerms = articleTerms.filter((term) => !['bone', 'hand', 'human', 'anatomy'].includes(term));
  const categories = await wikipediaArticleCategories(node.title, context);
  const rankedCategories = categories.map((title) => {
    const terms = normalizeTerms(title);
    const distinctiveOverlap = terms.filter((term) => distinctiveTerms.includes(term)).length;
    const allOverlap = terms.filter((term) => articleTerms.includes(term)).length;
    return { title, distinctiveOverlap, score: (distinctiveOverlap * 4) + allOverlap };
  }).filter((entry) => entry.distinctiveOverlap > 0).sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
  for (const category of rankedCategories.slice(0, 2)) {
    const members = (await wikipediaCategoryArticleMembers(category.title, context))
      .filter((title) => normalizedKey(title) !== normalizedKey(node.title) && !isCollectionIdentityTitle(title, node.title));
    if (members.length >= 2) {
      context.diagnostics.push({ stage: 'grounding', round, articleTitle: node.title, linkedArticleTitle: `Category:${category.title}`, decision: 'accepted', message: `Wikipedia category ${JSON.stringify(category.title)} supplied ${members.length} canonical member articles for ${node.title}.` });
      return members;
    }
  }
  const linkedMembers = inspected.articleLinks.filter((title) => {
    if (/\((?:disambiguation|identifier)\)$/i.test(title)) return false;
    if (isCollectionIdentityTitle(title, node.title)) return false;
    const terms = normalizeTerms(title);
    return distinctiveTerms.length > 0 && terms.some((term) => distinctiveTerms.includes(term));
  });
  const members = await distinctRedirectMembers(node.title, Array.from(new Set(linkedMembers)), context);
  context.diagnostics.push({ stage: 'grounding', round, articleTitle: node.title, decision: members.length >= 2 ? 'accepted' : 'rejected', message: `${node.title} supplied ${members.length} canonical member links through exact collection-name overlap.` });
  return members.length >= 2 ? Array.from(new Set(members)) : [];
}

async function inspectRelevantGroundingSection(
  node: PageNode,
  notes: string,
  round: number,
  context: DiscoveryContext,
): Promise<GroundingSectionEvidence> {
  const sectionsUrl = buildUrl(WIKIPEDIA_API_URL, {
    action: 'parse',
    page: node.title,
    prop: 'sections',
    redirects: '1',
  });
  const sectionsData = await fetchJson(sectionsUrl, context, 'traversal');
  const sections: Array<{ index: string; title: string; level: number }> = (Array.isArray(sectionsData?.parse?.sections) ? sectionsData.parse.sections : [])
    .map((section: { index?: unknown; line?: unknown; level?: unknown }) => ({
      index: String(section.index || '').trim(),
      title: stripHtml(section.line),
      level: Number(section.level || 0),
    }))
    .filter((section: { index: string; title: string }) => section.index && section.title && !NONCONTENT_SECTION_TITLES.test(section.title));
  const noteTerms = new Set(normalizeTerms(notes).filter((term) => !['image', 'prompt', 'create', 'lesson', 'test', 'learn'].includes(term)));
  const scored: Array<{ index: string; title: string; level: number; score: number }> = sections.map((section) => ({
    ...section,
    score: normalizeTerms(section.title).filter((term) => noteTerms.has(term)).length,
  }));
  const bestScore = Math.max(0, ...scored.map((section) => section.score));
  const selected = bestScore > 0
    ? scored.filter((section) => section.score === bestScore).sort((left, right) => left.level - right.level || Number(left.index) - Number(right.index))[0]
    : scored.find((section) => /^structure$/i.test(section.title));
  if (!selected) {
    throw new Error(`Wikipedia article ${node.title} has no relevant named section for ${JSON.stringify(buildWikimediaCollectionQuery(notes))}.`);
  }
  const sectionUrl = buildUrl(WIKIPEDIA_API_URL, {
    action: 'parse',
    page: node.title,
    section: selected.index,
    prop: 'links|wikitext',
    redirects: '1',
  });
  const sectionData = await fetchJson(sectionUrl, context, 'traversal');
  const sectionArticleLinks = Array.from(new Set<string>((Array.isArray(sectionData?.parse?.links) ? sectionData.parse.links : [])
    .filter((entry: { ns?: unknown }) => Number(entry.ns) === 0)
    .map((entry: { title?: unknown }) => canonicalTitle(String(entry.title || '')))
    .filter(Boolean)))
    .slice(0, MAX_LINKS_PER_PAGE);
  const wikitext = String(sectionData?.parse?.wikitext || '').trim();
  const grounded = collectionBranchesFromPassage(wikitext, notes);
  const canonicalSectionTitles = new Map(sectionArticleLinks.map((title) => [title.toLocaleLowerCase(), title]));
  const articleLinks = grounded.titles
    .map((title) => canonicalSectionTitles.get(title.toLocaleLowerCase()))
    .filter((title): title is string => Boolean(title));
  const extract = grounded.passage;
  context.diagnostics.push({
    stage: 'traversal',
    round,
    articleTitle: node.title,
    traversalPath: node.path,
    decision: articleLinks.length > 0 ? 'selected' : 'rejected',
    message: `Selected Wikipedia section ${JSON.stringify(selected.title)} on ${node.title} for grounded collection links: ${articleLinks.length > 0 ? articleLinks.join(', ') : 'none'}.`,
  });
  return { sectionIndex: selected.index, sectionTitle: selected.title, articleLinks, extract };
}

async function articleImages(title: string, context: DiscoveryContext): Promise<WikimediaImagePage[]> {
  const requestUrl = buildUrl(WIKIPEDIA_API_URL, {
    generator: 'images',
    titles: title,
    redirects: '1',
    gimlimit: 'max',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1280',
  });
  const data = await fetchJson(requestUrl, context, 'candidate');
  return (Array.isArray(data?.query?.pages) ? data.query.pages : []).slice(0, MAX_IMAGES_PER_PAGE);
}

async function commonsFiles(titles: string[], context: DiscoveryContext): Promise<WikimediaImagePage[]> {
  if (titles.length === 0) return [];
  const requestUrl = buildUrl(COMMONS_API_URL, {
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1280',
  });
  const data = await fetchJson(requestUrl, context, 'candidate');
  return Array.isArray(data?.query?.pages) ? data.query.pages : [];
}

async function commonsFile(title: string, context: DiscoveryContext): Promise<WikimediaImagePage[]> {
  return (await commonsFiles([title], context)).slice(0, 1);
}

async function commonsCollectionImages(
  reference: CommonsCollectionReference,
  context: DiscoveryContext,
  responses: string[] = [],
): Promise<WikimediaImagePage[]> {
  const params = reference.kind === 'category'
    ? {
      generator: 'categorymembers',
      gcmtitle: reference.title,
      gcmtype: 'file',
      gcmlimit: 'max',
    }
    : {
      generator: 'images',
      titles: reference.title,
      gimlimit: 'max',
    };
  const requestUrl = buildUrl(COMMONS_API_URL, {
    ...params,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1280',
  });
  const data = await fetchJson(requestUrl, context, 'candidate');
  const pages: WikimediaImagePage[] = Array.isArray(data?.query?.pages) ? data.query.pages : [];
  if (responses.length === 0) return pages.slice(0, MAX_IMAGES_PER_PAGE);
  const selected = pages.map((page) => ({
    page,
    score: Math.max(0, ...responses.map((response) => titleMatchScore(String(page.title || ''), response))),
  })).filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || String(left.page.title || '').localeCompare(String(right.page.title || '')))
    .slice(0, MAX_IMAGES_PER_PAGE)
    .map(({ page }) => page);
  const missingMetadata = selected.filter((page) => !page.imageinfo?.[0]).map((page) => String(page.title || '')).filter(Boolean);
  const hydrated: WikimediaImagePage[] = [];
  for (let index = 0; index < missingMetadata.length; index += 50) {
    hydrated.push(...await commonsFiles(missingMetadata.slice(index, index + 50), context));
  }
  const hydratedByTitle = new Map(hydrated.map((page) => [String(page.title || ''), page]));
  return selected.map((page) => hydratedByTitle.get(String(page.title || '')) || page);
}

async function inspectPage(node: PageNode, round: number, context: DiscoveryContext): Promise<InspectedPage> {
  const pages: WikimediaImagePage[] = [];
  try {
    pages.push(...await articleImages(node.title, context));
  } catch (error) {
    if (error instanceof DiscoveryLimitError) throw error;
    context.diagnostics.push({ stage: 'candidate', round, articleTitle: node.title, traversalPath: node.path, decision: 'rejected', message: `Could not enumerate images on ${node.title}: ${error instanceof Error ? error.message : String(error)}` });
  }
  const links = await inspectArticleLinks(node, round, context);
  for (const fileTitle of links.fileTitles) {
    try {
      pages.push(...await commonsFile(fileTitle, context));
    } catch (error) {
      if (error instanceof DiscoveryLimitError) throw error;
      context.diagnostics.push({ stage: 'candidate', round, articleTitle: node.title, candidateFile: fileTitle, decision: 'rejected', message: `Could not inspect linked file ${fileTitle}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  for (const reference of links.commonsCollections) {
    try {
      pages.push(...(reference.kind === 'file'
        ? await commonsFile(reference.title, context)
        : await commonsCollectionImages(reference, context)));
    } catch (error) {
      if (error instanceof DiscoveryLimitError) throw error;
      context.diagnostics.push({ stage: 'candidate', round, articleTitle: node.title, linkedArticleTitle: reference.title, decision: 'rejected', message: `Could not inspect Commons ${reference.kind} ${reference.title}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  const uniqueImages = Array.from(new Map(pages.map((page) => [String(page.title || ''), page])).values()).slice(0, MAX_IMAGES_PER_PAGE);
  context.diagnostics.push({ stage: 'candidate', round, articleTitle: node.title, traversalPath: node.path, decision: uniqueImages.length > 0 ? 'accepted' : 'rejected', message: `${node.title} exposed ${uniqueImages.length} distinct image candidates.` });
  return { title: node.title, ...links, images: uniqueImages };
}

function titleMatchScore(title: string, response: string): number {
  const titleTerms = new Set(normalizeTerms(title));
  const responseTerms = normalizeTerms(response).filter((term) => term !== 'bone');
  if (responseTerms.length === 0) return 0;
  const matched = responseTerms.filter((term) => titleTerms.has(term)).length;
  const ratio = matched / responseTerms.length;
  const phrase = normalizedKey(title).includes(normalizedKey(response).replace(/-bone$/i, ''));
  return ratio + (phrase ? 1 : 0);
}

function linkScore(title: string, topics: string[], notes: string, unresolved: AiContentPair[]): number {
  const responseScore = Math.max(0, ...unresolved.map((pair) => titleMatchScore(title, pair.response)));
  const topicScore = Math.max(0, ...topics.map((topic) => titleMatchScore(title, topic)));
  const subjectScore = titleMatchScore(title, buildWikimediaCollectionQuery(notes));
  const collectionBonus = /\b(?:anatomy|bone|bones|carpal|metacarpal|phalan|skeleton|radius|ulna|wrist|thumb|finger)\b/i.test(title) ? 0.25 : 0;
  const directResponseMatch = responseScore >= 0.75;
  const relevantCollection = collectionBonus > 0 && (topicScore >= 0.35 || subjectScore >= 0.3);
  if (!directResponseMatch && !relevantCollection) return 0;
  return (responseScore * 4) + (topicScore * 3) + subjectScore + collectionBonus;
}

function allowedLicense(metadata: WikimediaMetadata): { name: string; url: string } | null {
  const name = stripHtml(metadata.LicenseShortName?.value || metadata.License?.value);
  const url = stripHtml(metadata.LicenseUrl?.value);
  const key = name.toLocaleLowerCase();
  if (/non[- ]?free|fair use|copyrighted/.test(key)) return null;
  if (key.includes('public domain') || key === 'pd') return { name: name || 'Public domain', url: url || 'https://creativecommons.org/publicdomain/mark/1.0/' };
  if (key.includes('cc0')) return { name, url: url || 'https://creativecommons.org/publicdomain/zero/1.0/' };
  if (/cc\s*[- ]?by(?:[- ]?sa)?\b|creative commons attribution/.test(key) && url) return { name, url };
  return null;
}

function isContentImage(page: WikimediaImagePage): boolean {
  const title = String(page.title || '').toLocaleLowerCase();
  if (!/\.(?:avif|bmp|gif|jpe?g|png|webp)$/i.test(title)) return false;
  if (['logo', 'icon', 'edit-', 'commons-logo', 'wiki letter', 'speaker', 'symbol'].some((term) => title.includes(term))) return false;
  const info = page.imageinfo?.[0];
  return Boolean(info?.width && info.height && info.width >= 240 && info.height >= 180);
}

function originatingSourceFiles(metadata: WikimediaMetadata): string[] {
  const provenance = `${String(metadata.Credit?.value || '')} ${String(metadata.Source?.value || '')}`;
  return Array.from(provenance.matchAll(/File:([^"'<>|]+?\.(?:png|jpe?g|gif|svg|webp))/gi))
    .map((match) => normalizedKey(match[1] || ''))
    .filter(Boolean);
}

function seriesGalleries(metadata: WikimediaMetadata, response: string): string[] {
  const provenance = `${String(metadata.Credit?.value || '')} ${String(metadata.Source?.value || '')}`;
  const responseKey = normalizedKey(response);
  return Array.from(provenance.matchAll(/commons\.wikimedia\.org\/wiki\/(?!File:|Category:)([^"'<>?#\s]+)/gi))
    .map((match) => {
      try {
        return normalizedKey(decodeURIComponent(String(match[1] || '')).replace(/_/g, ' '));
      } catch {
        return normalizedKey(String(match[1] || '').replace(/_/g, ' '));
      }
    })
    .filter((key) => Boolean(key && key !== responseKey));
}

function filenameSeries(title: string, response: string): string {
  const responseTerms = new Set([...normalizeTerms(response), 'bone', 'file', 'image']);
  const remaining = normalizeTerms(title.replace(/^File:/i, '').replace(/\.[^.]+$/, ''))
    .filter((term) => !responseTerms.has(term) && !/^\d+$/.test(term));
  return remaining.length > 0 ? remaining.join('-') : '';
}

function seriesCategories(metadata: WikimediaMetadata, response: string): string[] {
  const responseKey = normalizedKey(response);
  return String(metadata.Categories?.value || '').split('|').map((value) => stripHtml(value)).filter((value) => {
    const key = normalizedKey(value);
    return Boolean(key && !key.includes(responseKey) && /(animation|anatomograph|gray|plate|series|pictures-by|atlas|illustration)/i.test(key));
  });
}

function familyKeys(page: WikimediaImagePage, response: string): string[] {
  const metadata = page.imageinfo?.[0]?.extmetadata || {};
  const filename = filenameSeries(String(page.title || ''), response);
  return Array.from(new Set([
    ...originatingSourceFiles(metadata).map((source) => `source-file:${source}`),
    ...(filename ? [`filename:${filename}`] : []),
    ...seriesCategories(metadata, response).map((category) => `category:${normalizedKey(category)}`),
    ...seriesGalleries(metadata, response).map((gallery) => `gallery:${gallery}`),
  ]));
}

function candidateMatchScore(page: WikimediaImagePage, response: string): number {
  const metadata = page.imageinfo?.[0]?.extmetadata || {};
  const identityText = [page.title, metadata.ObjectName?.value].map(stripHtml).join(' ');
  const responseTerms = normalizeTerms(response).filter((term) => term !== 'bone');
  const identityTerms = new Set(normalizeTerms(identityText));
  if (responseTerms.length === 0 || !responseTerms.every((term) => identityTerms.has(term))) return 0;
  const descriptionScore = titleMatchScore(stripHtml(metadata.ImageDescription?.value), response);
  return titleMatchScore(identityText, response) + (descriptionScore * 0.1);
}

function candidateContextScore(page: WikimediaImagePage, articleTitle: string): number {
  const metadata = page.imageinfo?.[0]?.extmetadata || {};
  const imageText = [page.title, metadata.ObjectName?.value, metadata.ImageDescription?.value, metadata.Categories?.value]
    .map(stripHtml)
    .join(' ');
  const subjectText = `${articleTitle} ${imageText}`;
  let score = 0;
  const subjectRelevant = /\b(?:anatom|bone|hand|wrist|carpus|carpal|skeleton|upper limb)\b/i.test(subjectText);
  const hasLargerSystemCue = /\b(?:hand|wrist|carpus|carpal|skeleton|upper limb)\b/i.test(imageText);
  const isArticulated = /\barticulat(?:ed|ion)\b/i.test(imageText);
  const targetIsMarked = /\b(?:highlight|highlighted|colou?r(?:ed)?|shown in red)\b/i.test(imageText);
  const explicitlyShowsContext = isArticulated
    || /\b(?:surrounding bones|skeleton|upper limb|dissection of (?:the )?human hand)\b/i.test(imageText)
    || (hasLargerSystemCue && targetIsMarked);
  if (!subjectRelevant || !explicitlyShowsContext) return 0;
  score += 3;
  if (isArticulated) score += 2;
  if (targetIsMarked) score += 2;
  if (/\b(?:anterior|posterior|palmar|dorsal|left|right)\b/i.test(imageText)) score += 1;
  return score;
}

function isStaticSource(page: WikimediaImagePage): boolean {
  const info = page.imageinfo?.[0];
  const mime = String(info?.mime || '').toLocaleLowerCase();
  return mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp'
    || /\.(?:png|jpe?g|webp)$/i.test(String(page.title || ''));
}

function hasLearnerVisibleLabelRisk(page: WikimediaImagePage): boolean {
  const metadata = page.imageinfo?.[0]?.extmetadata || {};
  const text = [page.title, metadata.ObjectName?.value, metadata.ImageDescription?.value, metadata.Categories?.value]
    .map(stripHtml)
    .join(' ');
  return /\b(?:labelled|labeled|annotated)\b/i.test(text)
    || /gray'?s anatomy plate|\bFile:Gray\d+|\bOspoignet\b|\bSlide\d+|RightHuman(?:Anterior|Posterior)DistalRadiusUlnaCarpals\s*-/i.test(text);
}

function collectCandidates(
  page: InspectedPage,
  node: PageNode,
  round: number,
  pairs: Array<{ pair: AiContentPair; pairIndex: number }>,
  diagnostics: WikimediaDiscoveryDiagnostic[],
): CandidateAsset[] {
  const candidates: CandidateAsset[] = [];
  page.images.forEach((image) => {
    const fileTitle = String(image.title || 'Unnamed file');
    if (!isContentImage(image)) {
      diagnostics.push({ stage: 'candidate', round, articleTitle: page.title, candidateFile: fileTitle, traversalPath: node.path, decision: 'rejected', message: `${fileTitle} is not a supported content-sized bitmap.` });
      return;
    }
    if (hasLearnerVisibleLabelRisk(image)) {
      diagnostics.push({ stage: 'candidate', round, articleTitle: page.title, candidateFile: fileTitle, traversalPath: node.path, decision: 'rejected', message: `${fileTitle} is likely to contain learner-visible anatomical labels or annotations that could reveal the response.` });
      return;
    }
    const metadata = image.imageinfo?.[0]?.extmetadata || {};
    const license = allowedLicense(metadata);
    if (!license) {
      diagnostics.push({ stage: 'license', round, articleTitle: page.title, candidateFile: fileTitle, licenseName: stripHtml(metadata.LicenseShortName?.value || metadata.License?.value) || 'unknown', decision: 'rejected', message: `${fileTitle} has no allowed machine-readable license.` });
      return;
    }
    diagnostics.push({ stage: 'license', round, articleTitle: page.title, candidateFile: fileTitle, licenseName: license.name, decision: 'accepted', message: `${fileTitle} is allowed under ${license.name}.` });
    pairs.forEach(({ pair, pairIndex }) => {
      const matchScore = candidateMatchScore(image, pair.response);
      if (matchScore < 0.5) {
        diagnostics.push({ stage: 'candidate', round, articleTitle: page.title, pairId: pair.id, pairIndex, response: pair.response, candidateFile: fileTitle, decision: 'rejected', message: `${fileTitle} does not identify ${pair.response}.` });
        return;
      }
      const keys = familyKeys(image, pair.response);
      if (keys.length === 0) {
        diagnostics.push({ stage: 'family', round, articleTitle: page.title, pairId: pair.id, pairIndex, candidateFile: fileTitle, decision: 'rejected', message: `${fileTitle} has no explicit source-file, filename-series, category, or gallery relationship.` });
        return;
      }
      candidates.push({
        pairId: pair.id,
        pairIndex,
        response: pair.response,
        articleTitle: page.title,
        path: node.path,
        page: image,
        familyKeys: keys,
        matchScore,
        contextScore: candidateContextScore(image, page.title),
        staticSource: isStaticSource(image),
      });
      const contextScore = candidateContextScore(image, page.title);
      diagnostics.push({ stage: 'candidate', round, articleTitle: page.title, pairId: pair.id, pairIndex, response: pair.response, candidateFile: fileTitle, selected1280Url: String(image.imageinfo?.[0]?.thumburl || image.imageinfo?.[0]?.url || ''), traversalPath: node.path, decision: 'accepted', message: `${fileTitle} is a matching candidate for ${pair.response}; anatomical/system context score ${contextScore}; ${isStaticSource(image) ? 'static source' : 'animated source whose converted frame must retain context'}.` });
      keys.forEach((familyKey) => diagnostics.push({ stage: 'family', round, articleTitle: page.title, pairId: pair.id, pairIndex, familyKey, candidateFile: fileTitle, decision: 'accepted', message: `${fileTitle} belongs to ${familyKey}.` }));
    });
  });
  return candidates;
}

function candidateIdentity(candidate: CandidateAsset): string {
  return `${candidate.pairId}\u0000${String(candidate.page.title || '')}`;
}

function selectFamilies(
  candidates: CandidateAsset[],
  pairCount: number,
  contextRequired: boolean,
): Array<{ candidate: CandidateAsset; familyKey: string }> {
  const byFamily = new Map<string, CandidateAsset[]>();
  const eligibleCandidates = contextRequired
    ? candidates.filter((candidate) => candidate.contextScore >= 3)
    : candidates;
  eligibleCandidates.forEach((candidate) => candidate.familyKeys.forEach((key) => {
    byFamily.set(key, [...(byFamily.get(key) || []), candidate]);
  }));
  const selected: Array<{ candidate: CandidateAsset; familyKey: string }> = [];
  const assignedPairs = new Set<string>();
  const usedFiles = new Set<string>();
  while (true) {
    const ranked = Array.from(byFamily.entries()).map(([familyKey, familyCandidates]) => {
      const available = familyCandidates
        .filter((candidate) => !assignedPairs.has(candidate.pairId) && !usedFiles.has(String(candidate.page.title || '')));
      const coverage = new Set(available.map((candidate) => candidate.pairId)).size;
      const quality = Array.from(new Set(available.map((candidate) => candidate.pairId))).reduce((total, pairId) => {
        const best = available.filter((candidate) => candidate.pairId === pairId)
          .reduce((score, candidate) => Math.max(score, (candidate.contextScore * 10) + Number(candidate.staticSource)), 0);
        return total + best;
      }, 0);
      return { familyKey, familyCandidates, coverage, quality };
    }).filter((entry) => entry.coverage > 0)
      .sort((left, right) => right.coverage - left.coverage || right.quality - left.quality || left.familyKey.localeCompare(right.familyKey));
    const best = ranked[0];
    if (!best || (pairCount > 1 && best.coverage < 2)) break;
    const pairIds = Array.from(new Set(best.familyCandidates.map((candidate) => candidate.pairId)))
      .filter((pairId) => !assignedPairs.has(pairId));
    let added = 0;
    pairIds.forEach((pairId) => {
      const candidate = best.familyCandidates
        .filter((entry) => entry.pairId === pairId && !usedFiles.has(String(entry.page.title || '')))
        .sort((left, right) => right.contextScore - left.contextScore
          || Number(right.staticSource) - Number(left.staticSource)
          || right.matchScore - left.matchScore
          || String(left.page.title || '').localeCompare(String(right.page.title || '')))[0];
      if (!candidate) return;
      selected.push({ candidate, familyKey: best.familyKey });
      assignedPairs.add(pairId);
      usedFiles.add(String(candidate.page.title || ''));
      added += 1;
    });
    byFamily.delete(best.familyKey);
    if (added === 0) break;
  }
  const remainingPairIds = Array.from(new Set(eligibleCandidates.map((candidate) => candidate.pairId)))
    .filter((pairId) => !assignedPairs.has(pairId));
  remainingPairIds.forEach((pairId) => {
    const candidate = eligibleCandidates
      .filter((entry) => entry.pairId === pairId && !usedFiles.has(String(entry.page.title || '')))
      .filter((entry) => !contextRequired || entry.contextScore >= 3)
      .sort((left, right) => right.contextScore - left.contextScore
        || Number(right.staticSource) - Number(left.staticSource)
        || right.matchScore - left.matchScore
        || String(left.page.title || '').localeCompare(String(right.page.title || '')))[0];
    if (!candidate) return;
    selected.push({ candidate, familyKey: candidate.familyKeys[0]! });
    assignedPairs.add(pairId);
    usedFiles.add(String(candidate.page.title || ''));
  });
  return selected;
}

function selectedMetadata(selection: { candidate: CandidateAsset; familyKey: string }): Omit<WikimediaDiscoveredAsset, 'sourceMediaType' | 'sourceByteLength' | 'sourceBytes' | 'webpBytes' | 'webpWidth' | 'webpHeight'> | null {
  const info = selection.candidate.page.imageinfo?.[0];
  const metadata = info?.extmetadata || {};
  const license = allowedLicense(metadata);
  const sourceTitle = String(selection.candidate.page.title || metadata.ObjectName?.value || '').replace(/^File:/i, '').trim();
  const renditionUrl = String(info?.thumburl || info?.url || '').trim();
  if (!info || !license || !sourceTitle || !renditionUrl) return null;
  const sourceUrl = String(info.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(sourceTitle).replace(/%20/g, '_')}`);
  return {
    pairId: selection.candidate.pairId,
    pairIndex: selection.candidate.pairIndex,
    sourceTitle,
    sourceUrl,
    renditionUrl,
    familyKey: selection.familyKey,
    ...(Number(info.width) ? { sourceWidth: Number(info.width) } : {}),
    ...(Number(info.height) ? { sourceHeight: Number(info.height) } : {}),
    attribution: {
      creatorName: stripHtml(metadata.Artist?.value || metadata.Credit?.value) || 'Unknown creator',
      sourceName: 'Wikimedia Commons',
      sourceUrl,
      licenseName: license.name,
      licenseUrl: license.url,
    },
  };
}

async function acquireSelection(
  selection: { candidate: CandidateAsset; familyKey: string },
  context: DiscoveryContext,
  converter: (file: File) => Promise<ConvertedImage>,
): Promise<WikimediaDiscoveredAsset | null> {
  const selected = selectedMetadata(selection);
  if (!selected) return null;
  try {
    const response = await request(selected.renditionUrl, context, 'acquisition', false);
    const blob = await response.blob();
    const sourceMediaType = String(blob.type || response.headers.get('content-type') || '').split(';')[0]!.trim().toLocaleLowerCase();
    if (!sourceMediaType.startsWith('image/')) throw new Error(`Selected rendition returned ${sourceMediaType || 'an unknown media type'}.`);
    context.diagnostics.push({ stage: 'acquisition', pairId: selected.pairId, pairIndex: selected.pairIndex, familyKey: selected.familyKey, candidateFile: selected.sourceTitle, selected1280Url: selected.renditionUrl, sourceMediaType, decision: 'accepted', message: `Downloaded ${blob.size} source bytes as ${sourceMediaType}.` });
    const file = new File([blob], selected.sourceTitle, { type: sourceMediaType });
    const converted = await converter(file);
    context.diagnostics.push({ stage: 'conversion', pairId: selected.pairId, pairIndex: selected.pairIndex, familyKey: selected.familyKey, candidateFile: selected.sourceTitle, sourceMediaType, decision: 'accepted', message: `Converted ${selected.sourceTitle} to ${converted.width}x${converted.height} WebP (${converted.bytes.byteLength} bytes) at quality 0.86.` });
    return {
      ...selected,
      sourceMediaType,
      sourceByteLength: blob.size,
      sourceBytes: new Uint8Array(await blob.arrayBuffer()),
      webpBytes: converted.bytes,
      webpWidth: converted.width,
      webpHeight: converted.height,
    };
  } catch (error) {
    if (error instanceof DiscoveryLimitError) throw error;
    context.diagnostics.push({ stage: 'acquisition', pairId: selected.pairId, pairIndex: selected.pairIndex, familyKey: selected.familyKey, candidateFile: selected.sourceTitle, selected1280Url: selected.renditionUrl, decision: 'rejected', message: `Could not acquire and convert ${selected.sourceTitle}: ${error instanceof Error ? error.message : String(error)}` });
    return null;
  }
}

function uniqueNodes(nodes: PageNode[], visited: Set<string>): PageNode[] {
  const byTitle = new Map<string, PageNode>();
  nodes.forEach((node) => {
    const key = node.title.toLocaleLowerCase();
    if (visited.has(key)) return;
    const current = byTitle.get(key);
    if (!current || node.score > current.score) byTitle.set(key, node);
  });
  return Array.from(byTitle.values())
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, MAX_PAGES_PER_ROUND);
}

function emptyResult(
  notes: string,
  topicPlan: WikimediaTopicPlan,
  diagnostics: WikimediaDiscoveryDiagnostic[],
): WikimediaDiscoveryResult {
  return {
    input: { notes, imageResponses: [] },
    topicPlan,
    topics: topicPlan.topics,
    assets: [],
    unresolvedPairIds: [],
    diagnostics,
    stopReason: 'no-image-pairs',
    limits: DISCOVERY_LIMITS,
    requestsUsed: 0,
    acquisitionRequestsUsed: 0,
    pagesVisited: 0,
    roundsCompleted: 0,
  };
}

export async function discoverWikimediaImages(options: WikimediaDiscoveryOptions): Promise<WikimediaDiscoveryResult> {
  const notes = String(options.notes || '').trim();
  const imagePairs = options.pairs
    .map((pair, pairIndex) => ({ pair, pairIndex }))
    .filter(({ pair }) => pair.kind === 'image' && pair.image?.status !== 'resolved');
  const diagnostics: WikimediaDiscoveryDiagnostic[] = [];
  if (imagePairs.length === 0) return emptyResult(notes, { topics: [], attempts: [] }, diagnostics);
  const responseKeys = imagePairs.map(({ pair }) => pair.response.trim().toLocaleLowerCase());
  if (responseKeys.some((response) => !response) || new Set(responseKeys).size !== responseKeys.length) {
    throw new Error('Wikimedia discovery requires a unique nonblank response for every image pair.');
  }
  const topicPlanner = options.topicPlanner || planWikimediaTopics;
  const topicPlan = await topicPlanner(notes, imagePairs.map(({ pair }) => pair.response), options.model);
  diagnostics.push({
    stage: 'topic-planning',
    decision: 'accepted',
    message: `Topic planning produced ${topicPlan.topics.length} ordered Wikipedia topic${topicPlan.topics.length === 1 ? '' : 's'}: ${topicPlan.topics.join(', ')}.`,
  });
  const context: DiscoveryContext = {
    fetcher: options.fetcher || ((input, init) => globalThis.fetch(input, init)),
    diagnostics,
    requestCount: 0,
    acquisitionRequestCount: 0,
    pagesVisited: 0,
  };
  diagnostics.push({ stage: 'traversal', decision: 'accepted', message: `Traversal limits: ${MAX_TRAVERSAL_ROUNDS} rounds, ${MAX_PAGES_PER_ROUND} pages per round, ${MAX_PAGES_TOTAL} pages total, ${MAX_LINKS_PER_PAGE} links per page, ${MAX_IMAGES_PER_PAGE} images per page, ${MAX_SERIES_COLLECTIONS} Commons series collections, ${MAX_REQUESTS} Wikipedia/Commons API requests, and ${MAX_REQUEST_ATTEMPTS} attempts per request. Selected image acquisitions run afterward and are counted separately.` });

  const seeds: PageNode[] = [];
  let stopReason: WikimediaDiscoveryStopReason = 'frontier-empty';
  let roundsCompleted = 0;
  try {
    for (const topic of topicPlan.topics.slice(0, MAX_TOPICS)) {
      const titles = await searchTopic(topic, context);
      titles.forEach((title, index) => seeds.push({
        title,
        depth: 1,
        score: (MAX_SEARCH_RESULTS_PER_TOPIC - index) + linkScore(title, topicPlan.topics, notes, imagePairs.map(({ pair }) => pair)),
        path: [`Wikipedia search: ${topic}`, title],
      }));
    }
  } catch (error) {
    if (error instanceof DiscoveryLimitError) stopReason = error.stopReason;
    else throw error;
  }

  const visited = new Set<string>();
  const expandedSeriesCollections = new Set<string>();
  let frontier = uniqueNodes(seeds, visited);
  const candidateMap = new Map<string, CandidateAsset>();
  const contextRequired = imagePairs.length > 1
    && /\b(?:anatom|bone|joint|organ|part|component|system|structure|region|map|cycle|process)\w*\b/i.test(notes);
  let selection: Array<{ candidate: CandidateAsset; familyKey: string }> = [];
  if (stopReason !== 'request-limit') {
    for (let round = 1; round <= MAX_TRAVERSAL_ROUNDS; round += 1) {
      if (frontier.length === 0) {
        stopReason = 'frontier-empty';
        break;
      }
      if (context.pagesVisited >= MAX_PAGES_TOTAL) {
        stopReason = 'page-limit';
        break;
      }
      roundsCompleted = round;
      const current = frontier.slice(0, Math.min(MAX_PAGES_PER_ROUND, MAX_PAGES_TOTAL - context.pagesVisited));
      diagnostics.push({ stage: 'traversal', round, decision: 'selected', message: `Round ${round} frontier: ${current.map((node) => node.title).join(', ')}.` });
      const next: PageNode[] = [];
      for (const node of current) {
        const key = node.title.toLocaleLowerCase();
        if (visited.has(key)) continue;
        visited.add(key);
        context.pagesVisited += 1;
        try {
          const inspected = await inspectPage(node, round, context);
          const inspectedCandidates = collectCandidates(inspected, node, round, imagePairs, diagnostics);
          inspectedCandidates.forEach((candidate) => {
            const identity = candidateIdentity(candidate);
            const existing = candidateMap.get(identity);
            if (!existing || candidate.matchScore > existing.matchScore) candidateMap.set(identity, candidate);
          });
          const seriesCollections = Array.from(new Set(inspectedCandidates.flatMap((candidate) => {
            const metadata = candidate.page.imageinfo?.[0]?.extmetadata || {};
            return seriesCategories(metadata, candidate.response).map((title) => `Category:${title}`);
          })));
          for (const categoryTitle of seriesCollections) {
            const categoryKey = categoryTitle.toLocaleLowerCase();
            if (expandedSeriesCollections.has(categoryKey) || expandedSeriesCollections.size >= MAX_SERIES_COLLECTIONS) continue;
            expandedSeriesCollections.add(categoryKey);
            try {
              const familyImages = await commonsCollectionImages({ kind: 'category', title: categoryTitle, sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(categoryTitle).replace(/%20/g, '_')}` }, context, imagePairs.map(({ pair }) => pair.response));
              diagnostics.push({ stage: 'family', round, articleTitle: node.title, linkedArticleTitle: categoryTitle, traversalPath: [...node.path, categoryTitle], decision: familyImages.length > 0 ? 'accepted' : 'rejected', message: `${categoryTitle} exposed ${familyImages.length} response-matched series candidates for family completion.` });
              collectCandidates({ title: categoryTitle, articleLinks: [], fileTitles: [], commonsCollections: [], images: familyImages, extract: '' }, { ...node, title: categoryTitle, path: [...node.path, categoryTitle] }, round, imagePairs, diagnostics).forEach((candidate) => {
                const identity = candidateIdentity(candidate);
                const existing = candidateMap.get(identity);
                if (!existing || candidate.matchScore > existing.matchScore) candidateMap.set(identity, candidate);
              });
            } catch (error) {
              if (error instanceof DiscoveryLimitError) throw error;
              diagnostics.push({ stage: 'family', round, articleTitle: node.title, linkedArticleTitle: categoryTitle, traversalPath: [...node.path, categoryTitle], decision: 'rejected', message: `Could not expand ${categoryTitle}: ${error instanceof Error ? error.message : String(error)}` });
            }
          }
          selection = selectFamilies(Array.from(candidateMap.values()), imagePairs.length, contextRequired);
          const provisionallyResolved = new Set(selection.map(({ candidate }) => candidate.pairId));
          const unresolved = imagePairs.filter(({ pair }) => !provisionallyResolved.has(pair.id)).map(({ pair }) => pair);
          inspected.articleLinks.forEach((title) => {
            const score = linkScore(title, topicPlan.topics, notes, unresolved.length > 0 ? unresolved : imagePairs.map(({ pair }) => pair));
            diagnostics.push({
              stage: 'traversal',
              round,
              depth: node.depth,
              articleTitle: node.title,
              linkedArticleTitle: title,
              traversalPath: [...node.path, title],
              decision: score > 0 ? 'accepted' : 'rejected',
              message: score > 0 ? `Queued relevant link ${node.title} -> ${title} with score ${score.toFixed(2)}.` : `Rejected unrelated link ${node.title} -> ${title}.`,
            });
            if (score > 0) next.push({ title, depth: node.depth + 1, score, parentTitle: node.title, path: [...node.path, title] });
          });
        } catch (error) {
          if (error instanceof DiscoveryLimitError) {
            stopReason = error.stopReason;
            break;
          }
          diagnostics.push({ stage: 'traversal', round, articleTitle: node.title, traversalPath: node.path, decision: 'rejected', message: `Could not inspect ${node.title}: ${error instanceof Error ? error.message : String(error)}` });
        }
      }
      selection = selectFamilies(Array.from(candidateMap.values()), imagePairs.length, contextRequired);
      const provisionalResolved = new Set(selection.map(({ candidate }) => candidate.pairId));
      diagnostics.push({ stage: 'selection', round, decision: provisionalResolved.size > 0 ? 'selected' : 'unresolved', message: `After round ${round}, coherent selection covers ${provisionalResolved.size} of ${imagePairs.length} image responses.` });
      if (provisionalResolved.size === imagePairs.length) {
        stopReason = 'complete';
        break;
      }
      if (stopReason === 'request-limit') break;
      if (context.pagesVisited >= MAX_PAGES_TOTAL) {
        stopReason = 'page-limit';
        break;
      }
      frontier = uniqueNodes(next, visited);
      if (round === MAX_TRAVERSAL_ROUNDS) stopReason = 'depth-limit';
    }
  }

  const assets: WikimediaDiscoveredAsset[] = [];
  const converter = options.converter || convertAiImageToWebp;
  for (const selected of selection) {
    let asset: WikimediaDiscoveredAsset | null;
    try {
      asset = await acquireSelection(selected, context, converter);
    } catch (error) {
      if (error instanceof DiscoveryLimitError) {
        stopReason = error.stopReason;
        break;
      }
      throw error;
    }
    if (!asset) continue;
    assets.push(asset);
    diagnostics.push({ stage: 'selection', pairId: asset.pairId, pairIndex: asset.pairIndex, familyKey: asset.familyKey, candidateFile: asset.sourceTitle, selected1280Url: asset.renditionUrl, sourceMediaType: asset.sourceMediaType, decision: 'selected', message: `Selected and procured ${asset.sourceTitle} for pair ${asset.pairIndex + 1} from ${asset.familyKey}.` });
  }
  const resolved = new Set(assets.map((asset) => asset.pairId));
  const unresolvedPairIds = imagePairs.map(({ pair }) => pair.id).filter((pairId) => !resolved.has(pairId));
  unresolvedPairIds.forEach((pairId) => {
    const pair = imagePairs.find(({ pair: candidate }) => candidate.id === pairId)!;
    diagnostics.push({ stage: 'selection', pairId, pairIndex: pair.pairIndex, response: pair.pair.response, decision: 'unresolved', message: `No distinct allowed image was procured for pair ${pair.pairIndex + 1}: ${pair.pair.response}.` });
  });
  if (unresolvedPairIds.length === 0) stopReason = 'complete';
  else if (stopReason === 'complete') stopReason = 'acquisition-failed';
  return {
    input: {
      notes,
      imageResponses: imagePairs.map(({ pair, pairIndex }) => ({ pairId: pair.id, pairIndex, response: pair.response })),
    },
    topicPlan,
    topics: topicPlan.topics,
    assets,
    unresolvedPairIds,
    diagnostics,
    stopReason,
    limits: DISCOVERY_LIMITS,
    requestsUsed: context.requestCount,
    acquisitionRequestsUsed: context.acquisitionRequestCount,
    pagesVisited: context.pagesVisited,
    roundsCompleted,
  };
}

function canonicalMemberResponse(articleTitle: string): string {
  return canonicalTitle(articleTitle).replace(/\s+\((?:bone|anatomy)\)$/i, '').trim();
}

function exactOrFirstTopicResult(topic: string, titles: string[]): string | null {
  const topicKey = normalizedKey(topic);
  return titles.find((title) => normalizedKey(title) === topicKey) || titles[0] || null;
}

function authoritativeContextRequired(notes: string, pairCount: number): boolean {
  if (pairCount < 2) return false;
  return !/\b(?:different|various|unrelated)\s+(?:animals|species|people|places|objects)\b/i.test(notes);
}

export async function discoverAuthoritativeWikimediaPairs(
  options: WikimediaAuthoritativeDiscoveryOptions,
): Promise<WikimediaAuthoritativeDiscoveryResult> {
  const notes = String(options.notes || '').trim();
  if (!notes) throw new Error('Wikipedia collection discovery requires author notes.');
  const diagnostics: WikimediaDiscoveryDiagnostic[] = [];
  const topicPlanner = options.topicPlanner || planWikimediaTopics;
  const topicPlan = await topicPlanner(notes, [], options.model);
  diagnostics.push({
    stage: 'topic-planning',
    decision: 'accepted',
    message: `Authoritative topic planning produced ${topicPlan.topics.length} collection topic${topicPlan.topics.length === 1 ? '' : 's'} without an AI-generated item list: ${topicPlan.topics.join(', ')}.`,
  });
  const context: DiscoveryContext = {
    fetcher: options.fetcher || ((input, init) => globalThis.fetch(input, init)),
    diagnostics,
    requestCount: 0,
    acquisitionRequestCount: 0,
    pagesVisited: 0,
  };
  const groundings: Array<{ articleTitle: string; result: WikimediaStructuralGrounding }> = [];
  const seeds: PageNode[] = [];
  let stopReason: WikimediaDiscoveryStopReason = 'frontier-empty';
  try {
    for (const topic of topicPlan.topics.slice(0, MAX_TOPICS)) {
      const titles = await searchTopic(topic, context);
      const title = exactOrFirstTopicResult(topic, titles);
      if (title) seeds.push({ title, depth: 1, score: 1, role: 'collection', path: [`Wikipedia search: ${topic}`, title] });
    }
  } catch (error) {
    if (error instanceof DiscoveryLimitError) stopReason = error.stopReason;
    else throw error;
  }

  const pairs: AiContentPair[] = [];
  const pairByArticleKey = new Map<string, AiContentPair>();
  const memberNodeByArticleKey = new Map<string, PageNode>();
  const candidateMap = new Map<string, CandidateAsset>();
  const seriesCollectionTitles = new Set<string>();
  const visited = new Set<string>();
  let frontier = uniqueNodes(seeds, visited);
  let roundsCompleted = 0;

  const registerMember = (title: string, parent: PageNode): PageNode => {
    const articleTitle = canonicalTitle(title);
    const articleKey = articleTitle.toLocaleLowerCase();
    const existingNode = memberNodeByArticleKey.get(articleKey);
    if (existingNode) return existingNode;
    const response = canonicalMemberResponse(articleTitle);
    const responseKey = normalizedKey(response);
    const duplicate = pairs.find((pair) => normalizedKey(pair.response) === responseKey);
    if (duplicate) {
      const duplicateNode = Array.from(memberNodeByArticleKey.values()).find((node) => pairByArticleKey.get(node.title.toLocaleLowerCase())?.id === duplicate.id);
      if (duplicateNode) return duplicateNode;
    }
    const pair: AiContentPair = {
      id: `wikipedia-member-${pairs.length + 1}`,
      kind: 'image',
      stimulus: `image: ${response}`,
      response,
      image: { status: 'unresolved' },
    };
    const node: PageNode = {
      title: articleTitle,
      depth: parent.depth + 1,
      score: 1,
      role: 'member',
      parentTitle: parent.title,
      path: [...parent.path, articleTitle],
    };
    pairs.push(pair);
    pairByArticleKey.set(articleKey, pair);
    memberNodeByArticleKey.set(articleKey, node);
    diagnostics.push({ stage: 'grounding', articleTitle: parent.title, linkedArticleTitle: articleTitle, pairId: pair.id, pairIndex: pairs.length - 1, response, traversalPath: node.path, decision: 'accepted', message: `Wikipedia linked canonical member ${articleTitle}; created one unresolved image pair using response ${JSON.stringify(response)}.` });
    return node;
  };

  if (stopReason !== 'request-limit') {
    for (let round = 1; round <= MAX_TRAVERSAL_ROUNDS; round += 1) {
      if (frontier.length === 0) {
        stopReason = 'frontier-empty';
        break;
      }
      if (context.pagesVisited >= MAX_PAGES_TOTAL) {
        stopReason = 'page-limit';
        break;
      }
      roundsCompleted = round;
      const current = frontier.slice(0, Math.min(MAX_PAGES_PER_ROUND, MAX_PAGES_TOTAL - context.pagesVisited));
      const next: PageNode[] = [];
      diagnostics.push({ stage: 'traversal', round, decision: 'selected', message: `Authoritative round ${round}: ${current.map((node) => `${node.role || 'collection'} ${node.title}`).join(', ')}.` });
      for (const node of current) {
        const key = node.title.toLocaleLowerCase();
        if (visited.has(key)) continue;
        visited.add(key);
        context.pagesVisited += 1;
        try {
          const inspected = await inspectPage(node, round, context);
          if (node.role === 'member') {
            const pair = pairByArticleKey.get(key);
            if (!pair) continue;
            const pairIndex = pairs.findIndex((candidate) => candidate.id === pair.id);
            const memberCandidates = collectCandidates(inspected, node, round, [{ pair, pairIndex }], diagnostics);
            memberCandidates.forEach((candidate) => {
              const identity = candidateIdentity(candidate);
              const existing = candidateMap.get(identity);
              if (!existing || candidate.matchScore > existing.matchScore) candidateMap.set(identity, candidate);
              const metadata = candidate.page.imageinfo?.[0]?.extmetadata || {};
              seriesCategories(metadata, candidate.response).forEach((title) => seriesCollectionTitles.add(`Category:${title}`));
            });
            continue;
          }
          const groundingSection = await inspectRelevantGroundingSection(node, notes, round, context);
          const grounding: WikimediaStructuralGrounding = node.depth === 1
            ? { collections: groundingSection.articleLinks, members: [] }
            : { collections: [], members: await canonicalMemberLinks(node, inspected, round, context) };
          groundings.push({ articleTitle: inspected.title, result: grounding });
          diagnostics.push({ stage: 'grounding', round, articleTitle: inspected.title, traversalPath: node.path, decision: grounding.collections.length > 0 || grounding.members.length > 0 ? 'accepted' : 'rejected', message: `Wikipedia structure grounded section ${JSON.stringify(groundingSection.sectionTitle)} on ${inspected.title} to ${grounding.collections.length} collection branch${grounding.collections.length === 1 ? '' : 'es'} and ${grounding.members.length} canonical member page${grounding.members.length === 1 ? '' : 's'} without an AI-generated item list.` });
          grounding.collections.forEach((title) => next.push({ title, depth: node.depth + 1, score: 1, role: 'collection', parentTitle: node.title, path: [...node.path, title] }));
          grounding.members.forEach((title) => next.push(registerMember(title, node)));
        } catch (error) {
          if (error instanceof DiscoveryLimitError) {
            stopReason = error.stopReason;
            break;
          }
          diagnostics.push({ stage: node.role === 'member' ? 'candidate' : 'grounding', round, articleTitle: node.title, traversalPath: node.path, decision: 'rejected', message: `Could not process authoritative ${node.role || 'collection'} page ${node.title}: ${error instanceof Error ? error.message : String(error)}` });
        }
      }
      if (stopReason === 'request-limit') break;
      frontier = uniqueNodes(next, visited);
      if (round === MAX_TRAVERSAL_ROUNDS && frontier.length > 0) stopReason = 'depth-limit';
    }
  }

  const expandedSeries = new Set<string>();
  for (const categoryTitle of Array.from(seriesCollectionTitles).slice(0, MAX_SERIES_COLLECTIONS)) {
    if (context.requestCount >= MAX_REQUESTS) {
      stopReason = 'request-limit';
      break;
    }
    const categoryKey = categoryTitle.toLocaleLowerCase();
    if (expandedSeries.has(categoryKey)) continue;
    expandedSeries.add(categoryKey);
    try {
      const familyImages = await commonsCollectionImages({ kind: 'category', title: categoryTitle, sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(categoryTitle).replace(/%20/g, '_')}` }, context, pairs.map((pair) => pair.response));
      diagnostics.push({ stage: 'family', linkedArticleTitle: categoryTitle, decision: familyImages.length > 0 ? 'accepted' : 'rejected', message: `${categoryTitle} exposed ${familyImages.length} authoritative-member-matched series candidates.` });
      const familyNode: PageNode = { title: categoryTitle, depth: roundsCompleted + 1, score: 1, role: 'member', path: [categoryTitle] };
      collectCandidates({ title: categoryTitle, articleLinks: [], fileTitles: [], commonsCollections: [], images: familyImages, extract: '' }, familyNode, roundsCompleted, pairs.map((pair, pairIndex) => ({ pair, pairIndex })), diagnostics).forEach((candidate) => {
        const identity = candidateIdentity(candidate);
        const existing = candidateMap.get(identity);
        if (!existing || candidate.matchScore > existing.matchScore) candidateMap.set(identity, candidate);
      });
    } catch (error) {
      if (error instanceof DiscoveryLimitError) {
        stopReason = error.stopReason;
        break;
      }
      diagnostics.push({ stage: 'family', linkedArticleTitle: categoryTitle, decision: 'rejected', message: `Could not expand grounded series ${categoryTitle}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  const selection = selectFamilies(Array.from(candidateMap.values()), pairs.length, authoritativeContextRequired(notes, pairs.length));
  const assets: WikimediaDiscoveredAsset[] = [];
  const converter = options.converter || convertAiImageToWebp;
  for (const selected of selection) {
    let asset: WikimediaDiscoveredAsset | null;
    try {
      asset = await acquireSelection(selected, context, converter);
    } catch (error) {
      if (error instanceof DiscoveryLimitError) {
        stopReason = error.stopReason;
        break;
      }
      throw error;
    }
    if (!asset) continue;
    assets.push(asset);
    diagnostics.push({ stage: 'selection', pairId: asset.pairId, pairIndex: asset.pairIndex, familyKey: asset.familyKey, candidateFile: asset.sourceTitle, selected1280Url: asset.renditionUrl, sourceMediaType: asset.sourceMediaType, decision: 'selected', message: `Selected and procured ${asset.sourceTitle} for authoritative Wikipedia member pair ${asset.pairIndex + 1}.` });
  }
  const resolved = new Set(assets.map((asset) => asset.pairId));
  const unresolvedPairIds = pairs.map((pair) => pair.id).filter((pairId) => !resolved.has(pairId));
  unresolvedPairIds.forEach((pairId) => {
    const pairIndex = pairs.findIndex((pair) => pair.id === pairId);
    const response = pairs[pairIndex]?.response || pairId;
    diagnostics.push({ stage: 'selection', pairId, pairIndex, response, decision: 'unresolved', message: `Wikipedia identified ${JSON.stringify(response)} as a canonical member, but no distinct allowed contextual image was procured.` });
  });
  if (pairs.length > 0 && unresolvedPairIds.length === 0) stopReason = 'complete';
  else if (stopReason === 'complete') stopReason = 'acquisition-failed';
  return {
    input: { notes, imageResponses: pairs.map((pair, pairIndex) => ({ pairId: pair.id, pairIndex, response: pair.response })) },
    topicPlan,
    topics: topicPlan.topics,
    pairs,
    groundings,
    assets,
    unresolvedPairIds,
    diagnostics,
    stopReason,
    limits: DISCOVERY_LIMITS,
    requestsUsed: context.requestCount,
    acquisitionRequestsUsed: context.acquisitionRequestCount,
    pagesVisited: context.pagesVisited,
    roundsCompleted,
  };
}
