import {
  isOpenRouterReasoningLevel,
  type OpenRouterReasoningLevel,
} from './lib/openRouterModelCatalog';

export const AI_CONTENT_CONTRACT_VERSION = 4 as const;
export const AI_CONTENT_WORKING_RECORD_KEY = 'mofacts.aiContentCreator.workingRecord';

export type AiCreationMode = 'learning' | 'test';
export type AiContentPromptType = 'text' | 'image';
export type AiContentResponseType = 'text';
export type AiContentPhase =
  | 'input'
  | 'interpreting'
  | 'searching-source'
  | 'extracting-items'
  | 'generating-prompts'
  | 'resolving-images'
  | 'review'
  | 'saving'
  | 'failed';

export type AiPromptAttribution = {
  creatorName: string;
  sourceName: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
};

export type AiContentAuthorRequest = {
  runId: string;
  revision: number;
  notes: string;
  mode: AiCreationMode;
};

export type AiContentIntent = {
  promptType: AiContentPromptType;
  responseType: AiContentResponseType;
  subject: string;
  listSearchQuery: string;
  imageRequirement: string;
};

export type WikipediaListCandidate = {
  candidateId: string;
  rank: number;
  pageId: number;
  title: string;
  canonicalUrl: string;
  snippet: string;
  leadExcerpt: string;
};

export type WikipediaListDecision = {
  selectedCandidateId: string | null;
  rationale: string;
};

export type WikipediaListRegionCandidate = {
  regionId: string;
  kind: 'table' | 'list' | 'gallery';
  heading: string;
  entryCount: number;
  sampleEntries: string[];
};

export type WikipediaDetailLinkCandidate = {
  candidateId: string;
  itemId: string;
  anchorText: string;
  pageId: number;
  title: string;
  canonicalUrl: string;
  structuralRole: string;
};

export type WikipediaListEntry = {
  itemId: string;
  sourcePageId: number;
  sourcePageTitle: string;
  sourcePageUrl: string;
  regionId: string;
  sourceLocator: string;
  displayedResponse: string;
  normalizedResponseKey: string;
  directImageCandidateIds: string[];
  detailLinkCandidateIds: string[];
};

export type AiContentImageFilenamePattern = {
  patternId: string;
  prefix: string;
  suffix: string;
  extension: string;
  seedSourcePath: 'list-page' | 'detail-page';
  seedItemIds: [string, string];
  seedResponses: [string, string];
  seedFileTitles: [string, string];
};

export type WikimediaImageCandidate = {
  candidateId: string;
  itemId: string;
  sourcePath: 'list-page' | 'detail-page' | 'filename-pattern';
  parentListPageId: number;
  detailPageId?: number;
  filePageId: number;
  fileTitle: string;
  commonsUrl: string;
  renditionUrl: string;
  caption: string;
  altText: string;
  surroundingText: string;
  structuralRole: string;
  mimeType: string;
  width: number;
  height: number;
  attribution: AiPromptAttribution;
};

export type ImageCandidateDecision = {
  rankedCandidateIds: string[];
  selectedCandidateId: string | null;
  rationale: string;
};

export type AiContentItemResolution = {
  itemId: string;
  response: string;
  promptType: AiContentPromptType;
  sourcePath: 'text-definition' | 'list-page' | 'detail-page' | 'filename-pattern' | 'unresolved';
  prompt?: string;
  detailPageCandidateId?: string;
  selectedImageCandidateId?: string;
  filenamePatternId?: string;
  unresolvedReason?: string;
};

export type AiContentStageName =
  | 'interpret-request'
  | 'search-wikipedia'
  | 'select-list-page'
  | 'fetch-list-page'
  | 'select-list-region'
  | 'extract-list-entries'
  | 'generate-definition'
  | 'evaluate-direct-images'
  | 'hydrate-direct-images'
  | 'hydrate-detail-links'
  | 'select-detail-link'
  | 'fetch-detail-page'
  | 'extract-detail-images'
  | 'hydrate-detail-images'
  | 'evaluate-detail-images'
  | 'infer-image-filename-pattern'
  | 'resolve-pattern-file-titles'
  | 'match-image-filename-pattern'
  | 'queue-pattern-fallback'
  | 'acquire-image';

export type AiContentStageTrace = {
  traceId: string;
  stage: AiContentStageName;
  status: 'running' | 'succeeded' | 'failed' | 'unresolved';
  itemId?: string;
  startedAt: string;
  completedAt?: string;
  input: unknown;
  output?: unknown;
  request?: unknown;
  response?: unknown;
  model?: string;
  reasoningLevel?: OpenRouterReasoningLevel;
  visibleOutputTokens?: number;
  error?: string;
};

export type AiContentPipelineRun = {
  runId: string;
  revision: number;
  request: AiContentAuthorRequest;
  intent?: AiContentIntent;
  listCandidates: WikipediaListCandidate[];
  listDecision?: WikipediaListDecision;
  selectedListPage?: {
    pageId: number;
    title: string;
    canonicalUrl: string;
  };
  listRegions: WikipediaListRegionCandidate[];
  selectedRegionId?: string;
  entries: WikipediaListEntry[];
  imageFilenamePattern?: AiContentImageFilenamePattern;
  resolutions: AiContentItemResolution[];
  traces: AiContentStageTrace[];
  startedAt: string;
  updatedAt: string;
};

export type AiPairImage = {
  status: 'unresolved' | 'resolved';
  source?: 'wikimedia' | 'user-replacement';
  assetId?: string;
  fileName?: string;
  previewUrl?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  attribution?: AiPromptAttribution;
  failureReason?: string;
};

export type AiContentPairProvenance = {
  listPageId: number;
  listPageTitle: string;
  listPageUrl: string;
  regionId: string;
  sourceLocator: string;
  sourcePath: AiContentItemResolution['sourcePath'];
  detailPageTitle?: string;
  detailPageUrl?: string;
  selectedFileTitle?: string;
  filenamePatternId?: string;
};

export type AiContentPair = {
  id: string;
  kind: AiContentPromptType;
  stimulus: string;
  response: string;
  provenance: AiContentPairProvenance;
  image?: AiPairImage;
};

export type AiContentSavePair = {
  id: string;
  kind: AiContentPromptType;
  stimulus: string;
  response: string;
  image?: {
    source: 'wikimedia' | 'user-replacement';
    fileName: string;
    attribution?: AiPromptAttribution;
  };
};

export type AiContentFailure = {
  stage: AiContentPhase;
  code: string;
  message: string;
};

export type AiContentWorkingRecord = {
  contractVersion: typeof AI_CONTENT_CONTRACT_VERSION;
  phase: AiContentPhase;
  notes: string;
  mode: AiCreationMode;
  title: string;
  model: string;
  reasoningLevel: OpenRouterReasoningLevel;
  promptType?: AiContentPromptType;
  responseType: AiContentResponseType;
  pipelineRun?: AiContentPipelineRun;
  pairs: AiContentPair[];
  warnings: string[];
  failure?: AiContentFailure | null;
  updatedAt: string;
};

export type AiContentSaveContract = {
  contractVersion: typeof AI_CONTENT_CONTRACT_VERSION;
  mode: AiCreationMode;
  title: string;
  pairs: AiContentSavePair[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalized(value: unknown): string {
  return String(value || '').trim();
}

function rejectExtraFields(value: Record<string, unknown>, allowed: string[], label: string): void {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length > 0) throw new Error(`${label} contains unsupported fields: ${extra.join(', ')}.`);
}

export function imageStimulusForResponse(response: string): string {
  return `image: ${normalized(response)}`;
}

function hasCompleteAttribution(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Boolean(
    normalized(value.creatorName)
    && normalized(value.sourceName)
    && normalized(value.sourceUrl)
    && normalized(value.licenseName)
    && normalized(value.licenseUrl),
  );
}

export function requireAiContentWorkingRecordVersion(value: unknown): AiContentWorkingRecord {
  if (!isRecord(value) || value.contractVersion !== AI_CONTENT_CONTRACT_VERSION) {
    throw new Error(`AI Content Creator browser work uses an obsolete contract. Contract version ${AI_CONTENT_CONTRACT_VERSION} is required.`);
  }
  rejectExtraFields(value, [
    'contractVersion', 'phase', 'notes', 'mode', 'title', 'model', 'reasoningLevel', 'promptType',
    'responseType', 'pipelineRun', 'pairs', 'warnings', 'failure', 'updatedAt',
  ], 'AI Content Creator browser work');
  const phases: AiContentPhase[] = [
    'input', 'interpreting', 'searching-source', 'extracting-items', 'generating-prompts',
    'resolving-images', 'review', 'saving', 'failed',
  ];
  if (!phases.includes(value.phase as AiContentPhase)) throw new Error('AI Content Creator browser work has an invalid phase.');
  if (value.mode !== 'learning' && value.mode !== 'test') throw new Error('AI Content Creator browser work has an invalid mode.');
  if (value.responseType !== 'text') throw new Error('AI Content Creator browser work must use text responses.');
  if (!isOpenRouterReasoningLevel(value.reasoningLevel)) throw new Error('AI Content Creator browser work has an invalid reasoning level.');
  if (value.promptType !== undefined && value.promptType !== 'text' && value.promptType !== 'image') {
    throw new Error('AI Content Creator browser work has an invalid prompt type.');
  }
  for (const field of ['notes', 'title', 'model', 'updatedAt'] as const) {
    if (typeof value[field] !== 'string') throw new Error(`AI Content Creator browser work ${field} must be a string.`);
  }
  if (!Array.isArray(value.warnings) || value.warnings.some((warning) => typeof warning !== 'string')) {
    throw new Error('AI Content Creator browser work warnings must be strings.');
  }
  if (!Array.isArray(value.pairs)) throw new Error('AI Content Creator browser work pairs must be an array.');
  const kinds = new Set<AiContentPromptType>();
  value.pairs.forEach((pair, index) => {
    if (!isRecord(pair)) throw new Error(`AI Content Creator browser pair ${index + 1} must be an object.`);
    rejectExtraFields(pair, ['id', 'kind', 'stimulus', 'response', 'provenance', 'image'], `AI Content Creator browser pair ${index + 1}`);
    if (pair.kind !== 'text' && pair.kind !== 'image') throw new Error(`AI Content Creator browser pair ${index + 1} has an invalid prompt type.`);
    kinds.add(pair.kind);
    for (const field of ['id', 'stimulus', 'response'] as const) {
      if (typeof pair[field] !== 'string') throw new Error(`AI Content Creator browser pair ${index + 1} ${field} must be a string.`);
    }
    if (!isRecord(pair.provenance)) throw new Error(`AI Content Creator browser pair ${index + 1} is missing provenance.`);
    rejectExtraFields(pair.provenance, [
      'listPageId', 'listPageTitle', 'listPageUrl', 'regionId', 'sourceLocator', 'sourcePath',
      'detailPageTitle', 'detailPageUrl', 'selectedFileTitle', 'filenamePatternId',
    ], `AI Content Creator browser pair ${index + 1} provenance`);
    if (!Number.isInteger(pair.provenance.listPageId) || Number(pair.provenance.listPageId) <= 0) {
      throw new Error(`AI Content Creator browser pair ${index + 1} has an invalid list-page ID.`);
    }
    for (const field of ['listPageTitle', 'listPageUrl', 'regionId', 'sourceLocator'] as const) {
      if (typeof pair.provenance[field] !== 'string' || !pair.provenance[field]) {
        throw new Error(`AI Content Creator browser pair ${index + 1} has incomplete provenance.`);
      }
    }
    if (!['text-definition', 'list-page', 'detail-page', 'filename-pattern', 'unresolved'].includes(String(pair.provenance.sourcePath))) {
      throw new Error(`AI Content Creator browser pair ${index + 1} has an invalid provenance path.`);
    }
    if (pair.provenance.filenamePatternId !== undefined
      && (typeof pair.provenance.filenamePatternId !== 'string' || !pair.provenance.filenamePatternId)) {
      throw new Error(`AI Content Creator browser pair ${index + 1} has an invalid filename-pattern ID.`);
    }
    if (pair.provenance.sourcePath === 'filename-pattern' && !pair.provenance.filenamePatternId) {
      throw new Error(`AI Content Creator browser pair ${index + 1} is missing its filename-pattern ID.`);
    }
    if (pair.kind === 'text' && pair.image !== undefined) throw new Error(`AI Content Creator browser text pair ${index + 1} cannot contain image state.`);
    if (pair.kind === 'image' && !isRecord(pair.image)) throw new Error(`AI Content Creator browser image pair ${index + 1} requires image state.`);
    if (isRecord(pair.image)) {
      rejectExtraFields(pair.image, [
        'status', 'source', 'assetId', 'fileName', 'previewUrl', 'sourceTitle', 'sourceUrl', 'attribution', 'failureReason',
      ], `AI Content Creator browser pair ${index + 1} image`);
      if (pair.image.status !== 'resolved' && pair.image.status !== 'unresolved') {
        throw new Error(`AI Content Creator browser pair ${index + 1} has invalid image state.`);
      }
      if (pair.image.source !== undefined && pair.image.source !== 'wikimedia' && pair.image.source !== 'user-replacement') {
        throw new Error(`AI Content Creator browser pair ${index + 1} has an invalid image source.`);
      }
    }
  });
  if (kinds.size > 1) throw new Error('AI Content Creator browser work must use one universal prompt type.');
  if (value.promptType && kinds.size === 1 && !kinds.has(value.promptType as AiContentPromptType)) {
    throw new Error('AI Content Creator browser work prompt type does not match its pairs.');
  }
  if (value.pipelineRun !== undefined) {
    if (!isRecord(value.pipelineRun)
      || typeof value.pipelineRun.runId !== 'string'
      || !Number.isInteger(value.pipelineRun.revision)
      || !isRecord(value.pipelineRun.request)
      || !Array.isArray(value.pipelineRun.entries)
      || !Array.isArray(value.pipelineRun.resolutions)
      || !Array.isArray(value.pipelineRun.traces)) {
      throw new Error('AI Content Creator browser work contains an invalid pipeline run.');
    }
    if (value.pipelineRun.imageFilenamePattern !== undefined) {
      const pattern = value.pipelineRun.imageFilenamePattern;
      if (!isRecord(pattern)) throw new Error('AI Content Creator browser work contains an invalid image filename pattern.');
      rejectExtraFields(pattern, [
        'patternId', 'prefix', 'suffix', 'extension', 'seedSourcePath',
        'seedItemIds', 'seedResponses', 'seedFileTitles',
      ], 'AI Content Creator image filename pattern');
      for (const field of ['patternId', 'prefix', 'suffix', 'extension'] as const) {
        if (typeof pattern[field] !== 'string' || !pattern[field]) {
          throw new Error(`AI Content Creator image filename pattern ${field} must be a nonblank string.`);
        }
      }
      if (pattern.seedSourcePath !== 'list-page' && pattern.seedSourcePath !== 'detail-page') {
        throw new Error('AI Content Creator image filename pattern has an invalid seed source path.');
      }
      for (const field of ['seedItemIds', 'seedResponses', 'seedFileTitles'] as const) {
        if (!Array.isArray(pattern[field]) || pattern[field].length !== 2
          || pattern[field].some((entry) => typeof entry !== 'string' || !entry)) {
          throw new Error(`AI Content Creator image filename pattern ${field} must contain two nonblank strings.`);
        }
      }
    }
  }
  return value as AiContentWorkingRecord;
}

export function validateAiContentSaveContract(value: unknown): AiContentSaveContract {
  if (!isRecord(value)) throw new Error('AI content save contract must be an object.');
  rejectExtraFields(value, ['contractVersion', 'mode', 'title', 'pairs'], 'AI content save contract');
  if (value.contractVersion !== AI_CONTENT_CONTRACT_VERSION) {
    throw new Error(`AI content contract version must be ${AI_CONTENT_CONTRACT_VERSION}.`);
  }
  if (value.mode !== 'learning' && value.mode !== 'test') throw new Error('AI content mode must be Learning or Test.');
  if (!Array.isArray(value.pairs)) throw new Error('AI content save contract must contain pairs.');
  const pairs = value.pairs.map((entry, index): AiContentSavePair => {
    if (!isRecord(entry)) throw new Error(`Pair ${index + 1} must be an object.`);
    rejectExtraFields(entry, ['id', 'kind', 'stimulus', 'response', 'image'], `Pair ${index + 1}`);
    const pair = {
      id: normalized(entry.id),
      kind: normalized(entry.kind),
      stimulus: normalized(entry.stimulus),
      response: normalized(entry.response),
    };
    if (pair.kind !== 'text' && pair.kind !== 'image') throw new Error(`Pair ${index + 1} has an invalid stimulus kind.`);
    if (pair.kind === 'text') {
      if (entry.image !== undefined) throw new Error(`Pair ${index + 1} text stimulus cannot contain image metadata.`);
      return { ...pair, kind: 'text' };
    }
    if (!isRecord(entry.image)) return { ...pair, kind: 'image' };
    rejectExtraFields(entry.image, ['source', 'fileName', 'attribution'], `Pair ${index + 1} image`);
    const source = normalized(entry.image.source);
    if (source !== 'wikimedia' && source !== 'user-replacement') {
      throw new Error(`Pair ${index + 1} image source is invalid.`);
    }
    let attribution: AiPromptAttribution | undefined;
    if (entry.image.attribution !== undefined) {
      if (!isRecord(entry.image.attribution)) throw new Error(`Pair ${index + 1} attribution must be an object.`);
      rejectExtraFields(entry.image.attribution, ['creatorName', 'sourceName', 'sourceUrl', 'licenseName', 'licenseUrl'], `Pair ${index + 1} attribution`);
      attribution = {
        creatorName: normalized(entry.image.attribution.creatorName),
        sourceName: normalized(entry.image.attribution.sourceName),
        sourceUrl: normalized(entry.image.attribution.sourceUrl),
        licenseName: normalized(entry.image.attribution.licenseName),
        licenseUrl: normalized(entry.image.attribution.licenseUrl),
      };
    }
    return {
      ...pair,
      kind: 'image',
      image: {
        source,
        fileName: normalized(entry.image.fileName),
        ...(attribution ? { attribution } : {}),
      },
    };
  });
  return {
    contractVersion: AI_CONTENT_CONTRACT_VERSION,
    mode: value.mode,
    title: normalized(value.title),
    pairs,
  };
}

export function getAiContentSaveBlockingIssues(contract: AiContentSaveContract): string[] {
  const issues: string[] = [];
  if (!contract || contract.contractVersion !== AI_CONTENT_CONTRACT_VERSION) {
    issues.push(`AI content contract version must be ${AI_CONTENT_CONTRACT_VERSION}.`);
    return issues;
  }
  if (contract.mode !== 'learning' && contract.mode !== 'test') issues.push('Choose Learning or Test.');
  if (!normalized(contract.title)) issues.push('A title is required.');
  if (!Array.isArray(contract.pairs) || contract.pairs.length === 0) {
    issues.push('At least one stimulus-response pair is required.');
    return issues;
  }
  const promptTypes = new Set(contract.pairs.map((pair) => pair.kind));
  if (promptTypes.size > 1) issues.push('A generation run must use one universal prompt type.');
  const ids = new Set<string>();
  contract.pairs.forEach((pair, index) => {
    const label = `Pair ${index + 1}`;
    if (!normalized(pair.id)) issues.push(`${label} has no id.`);
    if (ids.has(pair.id)) issues.push(`${label} has a duplicate id.`);
    ids.add(pair.id);
    if (pair.kind !== 'text' && pair.kind !== 'image') issues.push(`${label} has an invalid stimulus kind.`);
    if (!normalized(pair.stimulus)) issues.push(`${label} has no stimulus.`);
    if (!normalized(pair.response)) issues.push(`${label} has no correct response.`);
    if (pair.kind === 'image') {
      const fileName = normalized(pair.image?.fileName);
      if (!fileName) {
        issues.push(`${label} is missing its required image.`);
      } else if (!/\.webp$/i.test(fileName)) {
        issues.push(`${label} image must be stored as WebP.`);
      }
      if (pair.image?.source === 'wikimedia' && !hasCompleteAttribution(pair.image.attribution)) {
        issues.push(`${label} Wikimedia image is missing source or license attribution.`);
      }
    }
  });
  return Array.from(new Set(issues));
}

export function getAiContentSaveWarnings(contract: AiContentSaveContract): string[] {
  if (!contract || !Array.isArray(contract.pairs)) return [];
  const warnings: string[] = [];
  const responseKeys = contract.pairs.map((pair) => normalized(pair.response).toLocaleLowerCase());
  if (new Set(responseKeys).size !== responseKeys.length) {
    warnings.push('Two or more pairs use the same correct response.');
  }
  return warnings;
}
