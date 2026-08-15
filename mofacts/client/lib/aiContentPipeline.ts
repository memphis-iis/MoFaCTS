import {
  AI_CONTENT_CONTRACT_VERSION,
  imageStimulusForResponse,
  type AiContentAuthorRequest,
  type AiContentImageFilenamePattern,
  type AiContentIntent,
  type AiContentItemResolution,
  type AiContentPair,
  type AiContentPipelineRun,
  type AiContentStageName,
  type AiContentStageTrace,
  type AiCreationMode,
  type ImageCandidateDecision,
  type WikimediaImageCandidate,
  type WikipediaDetailLinkCandidate,
  type WikipediaListCandidate,
  type WikipediaListEntry,
} from '../../common/aiContentContract';
import type { OpenRouterJsonSchema } from '../../common/lib/openRouterClient';
import type { OpenRouterReasoningLevel } from '../../common/lib/openRouterModelCatalog';
import type { ConvertedImage } from './aiContentImageAssets';
import {
  inferAiContentImageFilenamePattern,
  isAiContentImagePatternSeed,
  predictedAiContentImageFileTitle,
  type AiContentImagePatternSeed,
} from './aiContentImageFilenamePattern';
import {
  callAiContentStage,
  type AiContentStageCallResult,
  type AiContentStageCaller,
} from './aiContentOpenRouterClient';
import {
  AI_CONTENT_DEFINITION_SCHEMA,
  AI_CONTENT_INTENT_SCHEMA,
  DEFAULT_AI_CONTENT_STAGE_PROMPTS,
  buildCandidateSelectionPrompt,
  buildDefinitionPrompt,
  buildInterpretRequestPrompt,
  candidateSelectionSchema,
  imageCandidateDecisionSchema,
  regionSelectionSchema,
  validateAiContentIntent,
  validateCandidateSelection,
  validateDefinition,
  validateImageCandidateDecision,
  validateRegionSelection,
  type AiContentAiStageId,
  type AiContentStagePrompt,
} from './aiContentPrompts';
import {
  extractWikipediaListRegions,
  extractWikipediaPageFileReferences,
  fetchWikipediaPage,
  hydrateWikipediaDetailLinks,
  searchWikipediaListCandidates,
  wikipediaDetailLinkRequestUrls,
  wikipediaListSearchRequestUrl,
  wikipediaPageRequestUrl,
  type ExtractedWikipediaListEntry,
  type ExtractedWikipediaListRegion,
  type RetrievedWikipediaPage,
} from './aiContentWikipediaSource';
import {
  acquireWikimediaImageCandidate,
  hydrateWikimediaImageCandidates,
  predictedWikimediaFileRequestUrls,
  resolvePredictedWikimediaFiles,
  wikimediaCandidateHydrationRequestUrls,
  type AcquiredWikimediaAsset,
  type PredictedWikimediaFileTitle,
} from './aiContentWikimediaFiles';

export type AiContentPipelineStageSettings = AiContentStagePrompt & {
  reasoningLevel: OpenRouterReasoningLevel;
};

export type AiContentPipelineSettings = Record<AiContentAiStageId, AiContentPipelineStageSettings>;

export type AiContentPipelineResult = {
  run: AiContentPipelineRun;
  pairs: AiContentPair[];
  assets: AcquiredWikimediaAsset[];
  warnings: string[];
};

type AiContentPipelineOptions = {
  notes: string;
  mode: AiCreationMode;
  model: string;
  reasoningLevel: OpenRouterReasoningLevel;
  runId?: string;
  revision?: number;
  settings?: AiContentPipelineSettings;
  stageCaller?: AiContentStageCaller;
  fetcher?: typeof fetch;
  converter?: (file: File) => Promise<ConvertedImage>;
  onRunUpdated?: (run: AiContentPipelineRun) => void;
  assertCurrent?: () => void;
  reusedAiOutputs?: Readonly<Record<string, unknown>>;
  retryTarget?: Readonly<{ key: string; input: unknown }>;
};

type AiExecution<T> = {
  parsedContent: T;
  result: AiContentStageCallResult;
};

export function aiContentAiStageOutputKey(stage: AiContentAiStageId, itemId?: string): string {
  return `${stage}:${itemId || ''}`;
}

export function createAiContentPipelineSettings(
  reasoningLevel: OpenRouterReasoningLevel,
): AiContentPipelineSettings {
  return Object.fromEntries(Object.entries(DEFAULT_AI_CONTENT_STAGE_PROMPTS).map(([stage, prompt]) => [
    stage,
    { ...prompt, reasoningLevel },
  ])) as AiContentPipelineSettings;
}

function now(): string {
  return new Date().toISOString();
}

function copyRun(run: AiContentPipelineRun): AiContentPipelineRun {
  return {
    ...run,
    request: { ...run.request },
    listCandidates: run.listCandidates.map((candidate) => ({ ...candidate })),
    listRegions: run.listRegions.map((region) => ({ ...region, sampleEntries: [...region.sampleEntries] })),
    entries: run.entries.map((entry) => ({
      ...entry,
      directImageCandidateIds: [...entry.directImageCandidateIds],
      detailLinkCandidateIds: [...entry.detailLinkCandidateIds],
    })),
    ...(run.imageFilenamePattern ? {
      imageFilenamePattern: {
        ...run.imageFilenamePattern,
        seedItemIds: [run.imageFilenamePattern.seedItemIds[0], run.imageFilenamePattern.seedItemIds[1]],
        seedResponses: [run.imageFilenamePattern.seedResponses[0], run.imageFilenamePattern.seedResponses[1]],
        seedFileTitles: [run.imageFilenamePattern.seedFileTitles[0], run.imageFilenamePattern.seedFileTitles[1]],
      },
    } : {}),
    resolutions: run.resolutions.map((resolution) => ({ ...resolution })),
    traces: run.traces.map((trace) => ({ ...trace })),
  };
}

function publish(run: AiContentPipelineRun, options: AiContentPipelineOptions): void {
  run.updatedAt = now();
  options.assertCurrent?.();
  options.onRunUpdated?.(copyRun(run));
}

function startTrace(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  stage: AiContentStageName,
  input: unknown,
  itemId?: string,
): AiContentStageTrace {
  const trace: AiContentStageTrace = {
    traceId: `${run.runId}:${run.traces.length + 1}:${stage}${itemId ? `:${itemId}` : ''}`,
    stage,
    status: 'running',
    ...(itemId ? { itemId } : {}),
    startedAt: now(),
    input,
  };
  run.traces.push(trace);
  publish(run, options);
  return trace;
}

function finishTrace(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  trace: AiContentStageTrace,
  status: AiContentStageTrace['status'],
  output?: unknown,
  error?: string,
): void {
  Object.assign(trace, {
    status,
    completedAt: now(),
    ...(output !== undefined ? { output } : {}),
    ...(error ? { error } : {}),
  });
  publish(run, options);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function executeAiStage<T>(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  stage: AiContentAiStageId,
  userPrompt: string,
  schema: OpenRouterJsonSchema,
  schemaName: string,
  input: unknown,
  validate: (value: unknown) => T,
  itemId?: string,
): Promise<AiExecution<T>> {
  const trace = startTrace(run, options, stage, input, itemId);
  const settings = (options.settings || createAiContentPipelineSettings(options.reasoningLevel))[stage];
  const outputKey = aiContentAiStageOutputKey(stage, itemId);
  try {
    if (Object.prototype.hasOwnProperty.call(options.reusedAiOutputs || {}, outputKey)) {
      const parsedContent = validate(options.reusedAiOutputs![outputKey]);
      Object.assign(trace, {
        request: { reusedValidatedUpstreamOutput: true, outputKey },
        response: { parsedContent, validation: { ok: true, reusedValidatedUpstreamOutput: true } },
        model: options.model,
        reasoningLevel: settings.reasoningLevel,
        visibleOutputTokens: settings.visibleOutputTokens,
      });
      finishTrace(run, options, trace, 'succeeded', parsedContent);
      return {
        parsedContent,
        result: {
          parsedContent,
          request: trace.request,
          rawContent: '',
          responseBody: null,
          usage: null,
          costUsd: null,
          model: options.model,
          reasoningLevel: settings.reasoningLevel,
        },
      };
    }
    if (options.retryTarget?.key === outputKey
      && JSON.stringify(options.retryTarget.input) !== JSON.stringify(input)) {
      throw new Error('The recorded stage input no longer matches the current source objects; start a complete run instead.');
    }
    const result = await (options.stageCaller || callAiContentStage)({
      stage,
      model: options.model,
      systemPrompt: settings.systemPrompt,
      userPrompt,
      schemaName,
      schema,
      visibleOutputTokens: settings.visibleOutputTokens,
      reasoningLevel: settings.reasoningLevel,
      ...(itemId ? { itemId } : {}),
    });
    const parsedContent = validate(result.parsedContent);
    Object.assign(trace, {
      request: result.request,
      response: {
        rawContent: result.rawContent,
        parsedContent,
        responseBody: result.responseBody,
        usage: result.usage,
        costUsd: result.costUsd,
        source: result.source,
        providerValidation: result.validation,
        execution: result.execution,
        semanticValidation: { ok: true },
      },
      model: result.model,
      reasoningLevel: result.reasoningLevel,
      visibleOutputTokens: settings.visibleOutputTokens,
    });
    finishTrace(run, options, trace, 'succeeded', parsedContent);
    return { parsedContent, result };
  } catch (error) {
    trace.response = {
      ...(trace.response && typeof trace.response === 'object' ? trace.response : {}),
      semanticValidation: { ok: false, error: errorMessage(error) },
    };
    finishTrace(run, options, trace, 'failed', undefined, errorMessage(error));
    throw error;
  }
}

async function executeDeterministicStage<T>(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  stage: AiContentStageName,
  input: unknown,
  action: () => Promise<T> | T,
  itemId?: string,
  traceOutput: (value: T) => unknown = (value) => value,
): Promise<T> {
  const trace = startTrace(run, options, stage, input, itemId);
  try {
    const output = await action();
    finishTrace(run, options, trace, 'succeeded', traceOutput(output));
    return output;
  } catch (error) {
    finishTrace(run, options, trace, 'failed', undefined, errorMessage(error));
    throw error;
  }
}

function stageSettings(options: AiContentPipelineOptions, stage: AiContentAiStageId): AiContentPipelineStageSettings {
  return (options.settings || createAiContentPipelineSettings(options.reasoningLevel))[stage];
}

async function interpretRequest(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
): Promise<AiContentIntent> {
  const settings = stageSettings(options, 'interpret-request');
  const execution = await executeAiStage(
    run,
    options,
    'interpret-request',
    buildInterpretRequestPrompt(options.notes, settings.instructions),
    AI_CONTENT_INTENT_SCHEMA,
    `mofacts_ai_content_intent_v${AI_CONTENT_CONTRACT_VERSION}`,
    { notes: options.notes },
    validateAiContentIntent,
  );
  return execution.parsedContent;
}

async function selectListPage(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  intent: AiContentIntent,
  candidates: WikipediaListCandidate[],
): Promise<WikipediaListCandidate> {
  if (candidates.length === 0) throw new Error('Wikipedia search returned no list-page candidates.');
  const settings = stageSettings(options, 'select-list-page');
  const publicCandidates = candidates.map(({ candidateId, rank, pageId, title, canonicalUrl, snippet, leadExcerpt }) => ({
    candidateId, rank, pageId, title, canonicalUrl, snippet, leadExcerpt,
  }));
  const execution = await executeAiStage(
    run,
    options,
    'select-list-page',
    buildCandidateSelectionPrompt({ authorNotes: options.notes, intent }, publicCandidates, settings.instructions),
    candidateSelectionSchema(candidates.map(({ candidateId }) => candidateId)),
    `mofacts_ai_content_list_page_v${AI_CONTENT_CONTRACT_VERSION}`,
    { intent, candidates: publicCandidates },
    (value) => validateCandidateSelection(value, candidates.map(({ candidateId }) => candidateId), 'Wikipedia list-page decision'),
  );
  const decision = execution.parsedContent;
  run.listDecision = decision;
  publish(run, options);
  if (!decision.selectedCandidateId) throw new Error('No supplied Wikipedia search result was accepted as the authoritative list page.');
  return candidates.find(({ candidateId }) => candidateId === decision.selectedCandidateId)!;
}

async function selectListRegion(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  intent: AiContentIntent,
  regions: ExtractedWikipediaListRegion[],
): Promise<ExtractedWikipediaListRegion> {
  if (regions.length === 0) throw new Error('The selected Wikipedia page exposed no usable table, list, or gallery.');
  if (regions.length === 1) {
    const trace = startTrace(run, options, 'select-list-region', { intent, regions: regions.map(({ candidate }) => candidate) });
    finishTrace(run, options, trace, 'succeeded', { selectedRegionId: regions[0]!.candidate.regionId, rationale: 'The page exposed exactly one usable list region.' });
    return regions[0]!;
  }
  const settings = stageSettings(options, 'select-list-region');
  const candidates = regions.map(({ candidate }) => candidate);
  const execution = await executeAiStage(
    run,
    options,
    'select-list-region',
    buildCandidateSelectionPrompt({ authorNotes: options.notes, intent }, candidates, settings.instructions),
    regionSelectionSchema(candidates.map(({ regionId }) => regionId)),
    `mofacts_ai_content_list_region_v${AI_CONTENT_CONTRACT_VERSION}`,
    { intent, regions: candidates },
    (value) => validateRegionSelection(value, candidates.map(({ regionId }) => regionId)),
  );
  const decision = execution.parsedContent;
  if (!decision.selectedRegionId) throw new Error('No structural region was accepted as the authoritative list.');
  return regions.find(({ candidate }) => candidate.regionId === decision.selectedRegionId)!;
}

function provenance(entry: WikipediaListEntry, sourcePath: AiContentItemResolution['sourcePath']): AiContentPair['provenance'] {
  return {
    listPageId: entry.sourcePageId,
    listPageTitle: entry.sourcePageTitle,
    listPageUrl: entry.sourcePageUrl,
    regionId: entry.regionId,
    sourceLocator: entry.sourceLocator,
    sourcePath,
  };
}

async function createTextItem(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  intent: AiContentIntent,
  entry: ExtractedWikipediaListEntry,
): Promise<{ pair: AiContentPair; resolution: AiContentItemResolution; warning?: string }> {
  const item = entry.item;
  const aliases = entry.detailLinks.map(({ anchorText }) => anchorText)
    .filter((alias) => alias.toLocaleLowerCase() !== item.displayedResponse.toLocaleLowerCase());
  const settings = stageSettings(options, 'generate-definition');
  try {
    const execution = await executeAiStage(
      run,
      options,
      'generate-definition',
      buildDefinitionPrompt(options.notes, intent.subject, item.displayedResponse, aliases, settings.instructions),
      AI_CONTENT_DEFINITION_SCHEMA,
      `mofacts_ai_content_definition_v${AI_CONTENT_CONTRACT_VERSION}`,
      { response: item.displayedResponse, aliases, subject: intent.subject },
      (value) => validateDefinition(value, item.displayedResponse, aliases),
      item.itemId,
    );
    const prompt = execution.parsedContent;
    return {
      pair: {
        id: item.itemId,
        kind: 'text',
        stimulus: prompt,
        response: item.displayedResponse,
        provenance: provenance(item, 'text-definition'),
      },
      resolution: {
        itemId: item.itemId,
        response: item.displayedResponse,
        promptType: 'text',
        sourcePath: 'text-definition',
        prompt,
      },
    };
  } catch (error) {
    const reason = `Definition generation failed: ${errorMessage(error)}`;
    return {
      pair: {
        id: item.itemId,
        kind: 'text',
        stimulus: '',
        response: item.displayedResponse,
        provenance: provenance(item, 'unresolved'),
      },
      resolution: {
        itemId: item.itemId,
        response: item.displayedResponse,
        promptType: 'text',
        sourcePath: 'unresolved',
        unresolvedReason: reason,
      },
      warning: `${item.displayedResponse}: ${reason}`,
    };
  }
}

async function evaluateImages(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  stage: 'evaluate-direct-images' | 'evaluate-detail-images',
  intent: AiContentIntent,
  entry: WikipediaListEntry,
  candidates: WikimediaImageCandidate[],
): Promise<ImageCandidateDecision> {
  if (candidates.length === 0) {
    const decision = { rankedCandidateIds: [], selectedCandidateId: null, rationale: 'No technically eligible Wikimedia file candidates were supplied.' };
    const trace = startTrace(run, options, stage, { response: entry.displayedResponse, imageRequirement: intent.imageRequirement, candidates: [] }, entry.itemId);
    finishTrace(run, options, trace, 'unresolved', decision);
    return decision;
  }
  const settings = stageSettings(options, stage);
  const execution = await executeAiStage(
    run,
    options,
    stage,
    buildCandidateSelectionPrompt(
      { authorNotes: options.notes, response: entry.displayedResponse, imageRequirement: intent.imageRequirement },
      candidates,
      settings.instructions,
    ),
    imageCandidateDecisionSchema(candidates.map(({ candidateId }) => candidateId)),
    `mofacts_ai_content_${stage.replaceAll('-', '_')}_v${AI_CONTENT_CONTRACT_VERSION}`,
    { response: entry.displayedResponse, imageRequirement: intent.imageRequirement, candidates },
    (value) => validateImageCandidateDecision(value, candidates.map(({ candidateId }) => candidateId), `${stage} decision`),
    entry.itemId,
  );
  return execution.parsedContent;
}

async function acquireRankedCandidate(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  entry: WikipediaListEntry,
  candidates: WikimediaImageCandidate[],
  decision: ImageCandidateDecision,
): Promise<{ asset: AcquiredWikimediaAsset | null; failures: string[] }> {
  if (!decision.selectedCandidateId) return { asset: null, failures: [] };
  const candidatesById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const failures: string[] = [];
  for (const candidateId of decision.rankedCandidateIds) {
    const candidate = candidatesById.get(candidateId);
    if (!candidate) continue;
    try {
      const asset = await executeDeterministicStage(
        run,
        options,
        'acquire-image',
        { candidate },
        () => acquireWikimediaImageCandidate(candidate, options.fetcher || globalThis.fetch, options.converter),
        entry.itemId,
        (value) => ({
          candidateId: value.candidate.candidateId,
          fileTitle: value.candidate.fileTitle,
          sourceMediaType: value.sourceMediaType,
          sourceByteLength: value.sourceByteLength,
          webpByteLength: value.webpBytes.byteLength,
          webpWidth: value.webpWidth,
          webpHeight: value.webpHeight,
        }),
      );
      return { asset, failures };
    } catch (error) {
      failures.push(`${candidate.fileTitle}: ${errorMessage(error)}`);
    }
  }
  return { asset: null, failures };
}

function exactEntityLinks(entry: WikipediaListEntry, links: WikipediaDetailLinkCandidate[]): WikipediaDetailLinkCandidate[] {
  const responseKey = entry.normalizedResponseKey;
  return links.filter((link) => {
    const anchorKey = link.anchorText.normalize('NFKC').toLocaleLowerCase().trim();
    const titleKey = link.title.normalize('NFKC').toLocaleLowerCase().trim();
    return anchorKey === responseKey || titleKey === responseKey;
  });
}

async function selectDetailLink(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  intent: AiContentIntent,
  entry: WikipediaListEntry,
  links: WikipediaDetailLinkCandidate[],
): Promise<WikipediaDetailLinkCandidate | null> {
  if (links.length === 0) {
    const trace = startTrace(run, options, 'select-detail-link', { response: entry.displayedResponse, candidates: [] }, entry.itemId);
    finishTrace(run, options, trace, 'unresolved', { selectedCandidateId: null, rationale: 'The list entry exposed no canonical article-link candidates.' });
    return null;
  }
  const exact = exactEntityLinks(entry, links);
  if (exact.length === 1) {
    const trace = startTrace(run, options, 'select-detail-link', { response: entry.displayedResponse, candidates: links }, entry.itemId);
    finishTrace(run, options, trace, 'succeeded', { selectedCandidateId: exact[0]!.candidateId, rationale: 'One supplied link exactly identifies the response.' });
    return exact[0]!;
  }
  if (links.length === 1) {
    const trace = startTrace(run, options, 'select-detail-link', { response: entry.displayedResponse, candidates: links }, entry.itemId);
    finishTrace(run, options, trace, 'succeeded', { selectedCandidateId: links[0]!.candidateId, rationale: 'The list entry exposed exactly one canonical article link.' });
    return links[0]!;
  }
  const settings = stageSettings(options, 'select-detail-link');
  const execution = await executeAiStage(
    run,
    options,
    'select-detail-link',
    buildCandidateSelectionPrompt(
      { authorNotes: options.notes, response: entry.displayedResponse, subject: intent.subject },
      links,
      settings.instructions,
    ),
    candidateSelectionSchema(links.map(({ candidateId }) => candidateId)),
    `mofacts_ai_content_detail_link_v${AI_CONTENT_CONTRACT_VERSION}`,
    { response: entry.displayedResponse, candidates: links },
    (value) => validateCandidateSelection(value, links.map(({ candidateId }) => candidateId), 'Wikipedia detail-link decision'),
    entry.itemId,
  );
  const decision = execution.parsedContent;
  return decision.selectedCandidateId
    ? links.find(({ candidateId }) => candidateId === decision.selectedCandidateId) || null
    : null;
}

function resolvedImagePair(
  entry: WikipediaListEntry,
  asset: AcquiredWikimediaAsset,
  detailPage?: RetrievedWikipediaPage,
  filenamePatternId?: string,
): AiContentPair {
  return {
    id: entry.itemId,
    kind: 'image',
    stimulus: imageStimulusForResponse(entry.displayedResponse),
    response: entry.displayedResponse,
    provenance: {
      ...provenance(entry, asset.candidate.sourcePath),
      ...(detailPage ? { detailPageTitle: detailPage.title, detailPageUrl: detailPage.canonicalUrl } : {}),
      selectedFileTitle: asset.candidate.fileTitle,
      ...(filenamePatternId ? { filenamePatternId } : {}),
    },
    image: {
      status: 'resolved',
      source: 'wikimedia',
      sourceTitle: asset.candidate.fileTitle.replace(/^File:/i, ''),
      sourceUrl: asset.candidate.commonsUrl,
      attribution: asset.candidate.attribution,
    },
  };
}

type ImageItemResult = {
  pair: AiContentPair;
  resolution: AiContentItemResolution;
  asset?: AcquiredWikimediaAsset;
  warning?: string;
};

type FilenamePatternObserver = (
  entry: ExtractedWikipediaListEntry,
  candidates: WikimediaImageCandidate[],
) => AiContentImageFilenamePattern | null;

type ImageItemAttempt = ImageItemResult | Readonly<{
  discoveredPattern: AiContentImageFilenamePattern;
}>;

function unresolvedImageItem(
  entry: WikipediaListEntry,
  reason: string,
  detailPage?: RetrievedWikipediaPage,
): ImageItemResult & { warning: string } {
  return {
    pair: {
      id: entry.itemId,
      kind: 'image',
      stimulus: imageStimulusForResponse(entry.displayedResponse),
      response: entry.displayedResponse,
      provenance: {
        ...provenance(entry, 'unresolved'),
        ...(detailPage ? { detailPageTitle: detailPage.title, detailPageUrl: detailPage.canonicalUrl } : {}),
      },
      image: { status: 'unresolved', failureReason: reason },
    },
    resolution: {
      itemId: entry.itemId,
      response: entry.displayedResponse,
      promptType: 'image',
      sourcePath: 'unresolved',
      unresolvedReason: reason,
    },
    warning: `${entry.displayedResponse}: ${reason}`,
  };
}

async function createImageItem(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  intent: AiContentIntent,
  entry: ExtractedWikipediaListEntry,
  observeFilenamePattern?: FilenamePatternObserver,
): Promise<ImageItemAttempt> {
  const fetcher = options.fetcher || globalThis.fetch;
  const directHydration = await executeDeterministicStage(
    run,
    options,
    'hydrate-direct-images',
    { requestUrls: wikimediaCandidateHydrationRequestUrls(entry.directImages), references: entry.directImages },
    () => hydrateWikimediaImageCandidates(entry.directImages, {
      sourcePath: 'list-page',
      parentListPageId: entry.item.sourcePageId,
    }, fetcher),
    entry.item.itemId,
  );
  const directPattern = observeFilenamePattern?.(entry, directHydration.candidates);
  if (directPattern) return { discoveredPattern: directPattern };
  const directDecision = await evaluateImages(run, options, 'evaluate-direct-images', intent, entry.item, directHydration.candidates);
  if (directDecision.selectedCandidateId) {
    const acquired = await acquireRankedCandidate(run, options, entry.item, directHydration.candidates, directDecision);
    if (acquired.asset) {
      return {
        pair: resolvedImagePair(entry.item, acquired.asset),
        resolution: {
          itemId: entry.item.itemId,
          response: entry.item.displayedResponse,
          promptType: 'image',
          sourcePath: 'list-page',
          selectedImageCandidateId: acquired.asset.candidate.candidateId,
        },
        asset: acquired.asset,
      };
    }
    return unresolvedImageItem(entry.item, `Direct Wikimedia candidates failed acquisition: ${acquired.failures.join(' ') || 'no ranked candidate was usable'}.`);
  }

  const detailLinks = await executeDeterministicStage(
    run,
    options,
    'hydrate-detail-links',
    { requestUrls: wikipediaDetailLinkRequestUrls(entry.detailLinks), references: entry.detailLinks },
    () => hydrateWikipediaDetailLinks(entry.detailLinks, fetcher),
    entry.item.itemId,
  );
  const selectedDetail = await selectDetailLink(run, options, intent, entry.item, detailLinks);
  if (!selectedDetail) {
    return unresolvedImageItem(entry.item, 'No appropriate direct image or unambiguous canonical detail-page link was found.');
  }
  let detailPage: RetrievedWikipediaPage;
  try {
    detailPage = await executeDeterministicStage(
      run,
      options,
      'fetch-detail-page',
      { candidate: selectedDetail, requestUrl: wikipediaPageRequestUrl(selectedDetail.pageId) },
      () => fetchWikipediaPage(selectedDetail.pageId, fetcher),
      entry.item.itemId,
      (page) => ({ pageId: page.pageId, title: page.title, canonicalUrl: page.canonicalUrl, htmlCharacters: page.html.length }),
    );
  } catch (error) {
    return unresolvedImageItem(entry.item, `The canonical detail page could not be retrieved: ${errorMessage(error)}`);
  }
  const detailReferences = await executeDeterministicStage(
    run,
    options,
    'extract-detail-images',
    { pageId: detailPage.pageId, title: detailPage.title },
    () => extractWikipediaPageFileReferences(detailPage, entry.item.itemId),
    entry.item.itemId,
  );
  const detailHydration = await executeDeterministicStage(
    run,
    options,
    'hydrate-detail-images',
    { requestUrls: wikimediaCandidateHydrationRequestUrls(detailReferences), references: detailReferences },
    () => hydrateWikimediaImageCandidates(detailReferences, {
      sourcePath: 'detail-page',
      parentListPageId: entry.item.sourcePageId,
      detailPageId: detailPage.pageId,
    }, fetcher),
    entry.item.itemId,
  );
  const detailPattern = observeFilenamePattern?.(entry, detailHydration.candidates);
  if (detailPattern) return { discoveredPattern: detailPattern };
  const detailDecision = await evaluateImages(run, options, 'evaluate-detail-images', intent, entry.item, detailHydration.candidates);
  const acquired = await acquireRankedCandidate(run, options, entry.item, detailHydration.candidates, detailDecision);
  if (!acquired.asset) {
    const semanticReason = detailDecision.selectedCandidateId
      ? `Detail-page Wikimedia candidates failed acquisition: ${acquired.failures.join(' ') || 'no ranked candidate was usable'}.`
      : 'The canonical detail page contained no textually supported image for the requested role.';
    return unresolvedImageItem(entry.item, semanticReason, detailPage);
  }
  return {
    pair: resolvedImagePair(entry.item, acquired.asset, detailPage),
    resolution: {
      itemId: entry.item.itemId,
      response: entry.item.displayedResponse,
      promptType: 'image',
      sourcePath: 'detail-page',
      detailPageCandidateId: selectedDetail.candidateId,
      selectedImageCandidateId: acquired.asset.candidate.candidateId,
    },
    asset: acquired.asset,
  };
}

async function createImageItemSafely(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  intent: AiContentIntent,
  entry: ExtractedWikipediaListEntry,
  observeFilenamePattern?: FilenamePatternObserver,
): Promise<ImageItemAttempt> {
  try {
    return await createImageItem(run, options, intent, entry, observeFilenamePattern);
  } catch (error) {
    return unresolvedImageItem(entry.item, `Image resolution failed: ${errorMessage(error)}`);
  }
}

async function resolveImageItemIndividually(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  intent: AiContentIntent,
  entry: ExtractedWikipediaListEntry,
): Promise<ImageItemResult> {
  const result = await createImageItemSafely(run, options, intent, entry);
  if ('discoveredPattern' in result) {
    throw new Error(`Individual image resolution unexpectedly stopped at filename inference for ${entry.item.itemId}.`);
  }
  return result;
}

function traceFilenamePatternInference(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  validatedSeeds: AiContentImagePatternSeed[],
  observedSeeds: AiContentImagePatternSeed[],
): AiContentImageFilenamePattern | null {
  const trace = startTrace(run, options, 'infer-image-filename-pattern', { validatedSeeds, observedSeeds });
  if (validatedSeeds.length < 1 || observedSeeds.length < 1) {
    const output = {
      pattern: null,
      reason: 'Pattern inference requires one individually validated image and one response-bearing canonical filename from another item.',
    };
    finishTrace(run, options, trace, 'unresolved', output);
    return null;
  }
  const comparisons = observedSeeds.flatMap((observedSeed) => validatedSeeds
    .filter((validatedSeed) => validatedSeed.itemId !== observedSeed.itemId)
    .map((validatedSeed) => ({
      seedItemIds: [validatedSeed.itemId, observedSeed.itemId],
      ...inferAiContentImageFilenamePattern(validatedSeed, observedSeed),
    })));
  const adopted = comparisons.find(({ pattern }) => pattern)?.pattern || null;
  const output = adopted
    ? {
      pattern: adopted,
      reason: 'A response-bearing canonical filename on a later item page agreed with an individually validated image and established one deterministic filename pattern.',
      comparisons,
    }
    : {
      pattern: null,
      reason: 'No response-bearing canonical filename on this item agreed with an individually validated image.',
      comparisons,
    };
  finishTrace(run, options, trace, adopted ? 'succeeded' : 'unresolved', output);
  return adopted;
}

function queuePatternFallback(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  entry: ExtractedWikipediaListEntry,
  pattern: AiContentImageFilenamePattern,
  predictedFileTitle: string,
  reason: string,
): void {
  const trace = startTrace(run, options, 'queue-pattern-fallback', {
    patternId: pattern.patternId,
    response: entry.item.displayedResponse,
    predictedFileTitle,
    reason,
  }, entry.item.itemId);
  finishTrace(run, options, trace, 'unresolved', { queuedForIndividualResolution: true, reason });
}

async function resolveImageEntries(
  run: AiContentPipelineRun,
  options: AiContentPipelineOptions,
  intent: AiContentIntent,
  entries: ExtractedWikipediaListEntry[],
): Promise<{ pairs: AiContentPair[]; assets: AcquiredWikimediaAsset[]; warnings: string[] }> {
  const resultByItemId = new Map<string, ImageItemResult>();
  const validatedSeeds: AiContentImagePatternSeed[] = [];
  let nextIndex = 0;
  let pattern: AiContentImageFilenamePattern | null = null;
  let inferenceAttempted = false;

  while (nextIndex < entries.length && !pattern) {
    options.assertCurrent?.();
    const entry = entries[nextIndex]!;
    const attempt = await createImageItemSafely(run, options, intent, entry, (observedEntry, candidates) => {
      if (validatedSeeds.length < 1) return null;
      const observedSeeds = candidates
        .filter(({ sourcePath }) => sourcePath === 'list-page' || sourcePath === 'detail-page')
        .map((candidate): AiContentImagePatternSeed => ({
          itemId: observedEntry.item.itemId,
          response: observedEntry.item.displayedResponse,
          fileTitle: candidate.fileTitle,
          sourcePath: candidate.sourcePath as 'list-page' | 'detail-page',
        }))
        .filter(isAiContentImagePatternSeed);
      if (observedSeeds.length < 1) return null;
      inferenceAttempted = true;
      return traceFilenamePatternInference(run, options, validatedSeeds, observedSeeds);
    });
    if ('discoveredPattern' in attempt) {
      pattern = attempt.discoveredPattern;
      publish(run, options);
      break;
    }
    const result = attempt;
    resultByItemId.set(entry.item.itemId, result);
    if (result.asset && (result.asset.candidate.sourcePath === 'list-page' || result.asset.candidate.sourcePath === 'detail-page')) {
      validatedSeeds.push({
        itemId: entry.item.itemId,
        response: entry.item.displayedResponse,
        fileTitle: result.asset.candidate.fileTitle,
        sourcePath: result.asset.candidate.sourcePath,
      });
    }
    nextIndex += 1;
    publish(run, options);
  }

  if (!pattern && !inferenceAttempted) traceFilenamePatternInference(run, options, validatedSeeds, []);
  if (!pattern) {
    for (; nextIndex < entries.length; nextIndex += 1) {
      options.assertCurrent?.();
      const entry = entries[nextIndex]!;
      resultByItemId.set(entry.item.itemId, await resolveImageItemIndividually(run, options, intent, entry));
      publish(run, options);
    }
  } else {
    const activePattern = pattern as AiContentImageFilenamePattern;
    run.imageFilenamePattern = activePattern;
    publish(run, options);
    const remaining = entries.slice(nextIndex);
    const predictions: PredictedWikimediaFileTitle[] = remaining.map((entry) => ({
      itemId: entry.item.itemId,
      response: entry.item.displayedResponse,
      predictedFileTitle: predictedAiContentImageFileTitle(activePattern, entry.item.displayedResponse),
      parentListPageId: entry.item.sourcePageId,
      filenamePatternId: activePattern.patternId,
    }));
    const requestUrls = predictedWikimediaFileRequestUrls(predictions);
    let resolved: Awaited<ReturnType<typeof resolvePredictedWikimediaFiles>> | null = null;
    let resolutionFailure = '';
    try {
      resolved = await executeDeterministicStage(
        run,
        options,
        'resolve-pattern-file-titles',
        { pattern: activePattern, predictions, requestUrls },
        () => resolvePredictedWikimediaFiles(predictions, options.fetcher || globalThis.fetch),
      );
    } catch (error) {
      resolutionFailure = `Canonical Wikimedia pattern resolution failed: ${errorMessage(error)}`;
    }
    const candidatesByItemId = new Map((resolved?.candidates || []).map((candidate) => [candidate.itemId, candidate]));
    const rejectionsByItemId = new Map((resolved?.rejections || []).map((rejection) => [rejection.itemId, rejection.reason]));
    const fallbackEntries: ExtractedWikipediaListEntry[] = [];
    for (const entry of remaining) {
      options.assertCurrent?.();
      const predictedFileTitle = predictedAiContentImageFileTitle(activePattern, entry.item.displayedResponse);
      const candidate = candidatesByItemId.get(entry.item.itemId);
      const matchTrace = startTrace(run, options, 'match-image-filename-pattern', {
        patternId: activePattern.patternId,
        response: entry.item.displayedResponse,
        predictedFileTitle,
      }, entry.item.itemId);
      if (!candidate) {
        const reason = resolutionFailure || rejectionsByItemId.get(entry.item.itemId) || 'Wikimedia returned no canonical file for the predicted title.';
        finishTrace(run, options, matchTrace, 'unresolved', { matched: false, reason });
        queuePatternFallback(run, options, entry, activePattern, predictedFileTitle, reason);
        fallbackEntries.push(entry);
        continue;
      }
      finishTrace(run, options, matchTrace, 'succeeded', {
        matched: true,
        predictedFileTitle,
        canonicalFileTitle: candidate.fileTitle,
        candidateId: candidate.candidateId,
        filePageId: candidate.filePageId,
      });
      const decision: ImageCandidateDecision = {
        rankedCandidateIds: [candidate.candidateId],
        selectedCandidateId: candidate.candidateId,
        rationale: 'The canonical Wikimedia file resolved from the validated filename pattern.',
      };
      const acquired = await acquireRankedCandidate(run, options, entry.item, [candidate], decision);
      if (!acquired.asset) {
        const reason = `Pattern-resolved Wikimedia file failed acquisition: ${acquired.failures.join(' ') || 'the candidate was not usable'}.`;
        queuePatternFallback(run, options, entry, activePattern, predictedFileTitle, reason);
        fallbackEntries.push(entry);
        continue;
      }
      resultByItemId.set(entry.item.itemId, {
        pair: resolvedImagePair(entry.item, acquired.asset, undefined, activePattern.patternId),
        resolution: {
          itemId: entry.item.itemId,
          response: entry.item.displayedResponse,
          promptType: 'image',
          sourcePath: 'filename-pattern',
          selectedImageCandidateId: acquired.asset.candidate.candidateId,
          filenamePatternId: activePattern.patternId,
        },
        asset: acquired.asset,
      });
      publish(run, options);
    }
    const unresolvedSeedEntries = entries.slice(0, nextIndex).filter((entry) => !resultByItemId.get(entry.item.itemId)?.asset);
    for (const entry of unresolvedSeedEntries) {
      const earlierReason = resultByItemId.get(entry.item.itemId)?.resolution.unresolvedReason || 'The seed attempt did not resolve an image.';
      queuePatternFallback(
        run,
        options,
        entry,
        activePattern,
        predictedAiContentImageFileTitle(activePattern, entry.item.displayedResponse),
        `The item remained unresolved while collecting pattern seeds and is queued for one post-pattern individual retry. Earlier result: ${earlierReason}`,
      );
    }
    const entryOrder = new Map(entries.map((entry, index) => [entry.item.itemId, index]));
    const queuedFallbackEntries = [...unresolvedSeedEntries, ...fallbackEntries]
      .sort((left, right) => entryOrder.get(left.item.itemId)! - entryOrder.get(right.item.itemId)!);
    for (const entry of queuedFallbackEntries) {
      options.assertCurrent?.();
      resultByItemId.set(entry.item.itemId, await resolveImageItemIndividually(run, options, intent, entry));
      publish(run, options);
    }
  }

  const ordered = entries.map((entry) => {
    const result = resultByItemId.get(entry.item.itemId);
    if (!result) throw new Error(`AI Content image pipeline lost authoritative item ${entry.item.itemId}.`);
    return result;
  });
  run.resolutions = ordered.map(({ resolution }) => resolution);
  publish(run, options);
  return {
    pairs: ordered.map(({ pair }) => pair),
    assets: ordered.flatMap(({ asset }) => asset ? [asset] : []),
    warnings: Array.from(new Set(ordered.flatMap(({ warning }) => warning ? [warning] : []))),
  };
}

export async function runAiContentPipeline(options: AiContentPipelineOptions): Promise<AiContentPipelineResult> {
  const notes = String(options.notes || '').trim();
  if (!notes) throw new Error('AI Content Creator author notes are required.');
  const model = String(options.model || '').trim();
  if (!model) throw new Error('AI Content Creator requires a configured OpenRouter model.');
  const runId = options.runId || globalThis.crypto.randomUUID();
  const revision = Number.isInteger(options.revision) && Number(options.revision) > 0 ? Number(options.revision) : 1;
  const request: AiContentAuthorRequest = { runId, revision, notes, mode: options.mode };
  const run: AiContentPipelineRun = {
    runId,
    revision,
    request,
    listCandidates: [],
    listRegions: [],
    entries: [],
    resolutions: [],
    traces: [],
    startedAt: now(),
    updatedAt: now(),
  };
  publish(run, options);

  const intent = await interpretRequest(run, options);
  run.intent = intent;
  publish(run, options);

  const fetcher = options.fetcher || globalThis.fetch;
  const candidates = await executeDeterministicStage(
    run,
    options,
    'search-wikipedia',
    { query: intent.listSearchQuery, requestUrl: wikipediaListSearchRequestUrl(intent.listSearchQuery) },
    () => searchWikipediaListCandidates(intent.listSearchQuery, fetcher),
  );
  run.listCandidates = candidates;
  publish(run, options);

  const selectedCandidate = await selectListPage(run, options, intent, candidates);
  const selectedPage = await executeDeterministicStage(
    run,
    options,
    'fetch-list-page',
    { candidate: selectedCandidate, requestUrl: wikipediaPageRequestUrl(selectedCandidate.pageId) },
    () => fetchWikipediaPage(selectedCandidate.pageId, fetcher),
    undefined,
    (page) => ({ pageId: page.pageId, title: page.title, canonicalUrl: page.canonicalUrl, htmlCharacters: page.html.length }),
  );
  run.selectedListPage = {
    pageId: selectedPage.pageId,
    title: selectedPage.title,
    canonicalUrl: selectedPage.canonicalUrl,
  };
  publish(run, options);

  const extraction = await executeDeterministicStage(
    run,
    options,
    'extract-list-entries',
    { pageId: selectedPage.pageId, title: selectedPage.title },
    () => extractWikipediaListRegions(selectedPage),
    undefined,
    (value) => ({
      page: {
        pageId: value.page.pageId,
        title: value.page.title,
        canonicalUrl: value.page.canonicalUrl,
        htmlCharacters: value.page.html.length,
      },
      regions: value.regions,
    }),
  );
  run.listRegions = extraction.regions.map(({ candidate }) => candidate);
  publish(run, options);

  const selectedRegion = await selectListRegion(run, options, intent, extraction.regions);
  run.selectedRegionId = selectedRegion.candidate.regionId;
  run.entries = selectedRegion.entries.map(({ item }) => item);
  publish(run, options);

  const pairs: AiContentPair[] = [];
  const assets: AcquiredWikimediaAsset[] = [];
  const warnings: string[] = [];
  if (intent.promptType === 'text') {
    for (const entry of selectedRegion.entries) {
      options.assertCurrent?.();
      const result = await createTextItem(run, options, intent, entry);
      pairs.push(result.pair);
      run.resolutions.push(result.resolution);
      if (result.warning) warnings.push(result.warning);
      publish(run, options);
    }
  } else {
    const imageResult = await resolveImageEntries(run, options, intent, selectedRegion.entries);
    pairs.push(...imageResult.pairs);
    assets.push(...imageResult.assets);
    warnings.push(...imageResult.warnings);
  }
  if (pairs.length !== run.entries.length) throw new Error('AI Content pipeline lost one or more authoritative list entries.');
  return { run, pairs, assets, warnings: Array.from(new Set(warnings)) };
}
