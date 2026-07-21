import type { OpenRouterJsonSchema } from './lib/openRouterClient';

export const AI_CONTENT_CONTRACT_VERSION = 3 as const;
export const AI_CONTENT_WORKING_RECORD_KEY = 'mofacts.aiContentCreator.workingRecord';

export type AiCreationMode = 'learning' | 'test';
export type AiContentPhase = 'input' | 'generating' | 'discovering-media' | 'review' | 'saving' | 'failed';

export type GeneratedPair = {
  kind: 'text' | 'image';
  stimulus: string;
  response: string;
};

export type AiPromptAttribution = {
  creatorName: string;
  sourceName: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
};

export type AiPairImage = {
  status: 'unresolved' | 'resolved';
  source?: 'wikimedia' | 'uploaded' | 'user-replacement';
  assetId?: string;
  fileName?: string;
  previewUrl?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  familyKey?: string;
  attribution?: AiPromptAttribution;
  failureReason?: string;
};

export type AiContentPair = GeneratedPair & {
  id: string;
  image?: AiPairImage;
};

export type AiContentSavePair = GeneratedPair & {
  id: string;
  image?: {
    source: 'wikimedia' | 'uploaded' | 'user-replacement';
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
  inputAssetIds: string[];
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

export const AI_GENERATED_PAIR_ARRAY_SCHEMA: OpenRouterJsonSchema = {
  type: 'array',
  minItems: 1,
  maxItems: 500,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'stimulus', 'response'],
    properties: {
      kind: { type: 'string', enum: ['text', 'image'] },
      stimulus: { type: 'string', minLength: 1 },
      response: { type: 'string', minLength: 1 },
    },
  },
};

export const AI_GENERATED_PAIR_RESPONSE_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pairs'],
  properties: {
    pairs: AI_GENERATED_PAIR_ARRAY_SCHEMA,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalized(value: unknown): string {
  return String(value || '').trim();
}

export function imageStimulusForResponse(response: string): string {
  return `image: ${normalized(response)}`;
}

function hasCompleteAttribution(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Boolean(
    normalized(value.creatorName) &&
    normalized(value.sourceName) &&
    normalized(value.sourceUrl) &&
    normalized(value.licenseName) &&
    normalized(value.licenseUrl)
  );
}

export function validateGeneratedPairs(value: unknown): GeneratedPair[] {
  if (!Array.isArray(value)) throw new Error('The AI response must be an array of stimulus-response pairs.');
  if (value.length < 1 || value.length > 500) {
    throw new Error('The AI response must contain 1-500 stimulus-response pairs.');
  }
  const pairs = value.map((entry, index): GeneratedPair => {
    if (!isRecord(entry)) throw new Error(`Pair ${index + 1} must be an object.`);
    const keys = Object.keys(entry);
    const extra = keys.filter((key) => !['kind', 'stimulus', 'response'].includes(key));
    if (extra.length > 0) throw new Error(`Pair ${index + 1} contains unsupported fields: ${extra.join(', ')}.`);
    const kind = normalized(entry.kind);
    const stimulus = normalized(entry.stimulus);
    const response = normalized(entry.response);
    if (kind !== 'text' && kind !== 'image') throw new Error(`Pair ${index + 1} kind must be text or image.`);
    if (!stimulus) throw new Error(`Pair ${index + 1} stimulus is required.`);
    if (!response) throw new Error(`Pair ${index + 1} response is required.`);
    if (kind === 'image' && stimulus !== imageStimulusForResponse(response)) {
      throw new Error(`Pair ${index + 1} image stimulus must be exactly "${imageStimulusForResponse(response)}".`);
    }
    return { kind, stimulus, response };
  });
  const imageResponses = new Set<string>();
  pairs.forEach((pair, index) => {
    if (pair.kind !== 'image') return;
    const responseKey = pair.response.toLocaleLowerCase();
    if (imageResponses.has(responseKey)) {
      throw new Error(`Pair ${index + 1} duplicates an image response; every image response must be unique.`);
    }
    imageResponses.add(responseKey);
  });
  return pairs;
}

export function validateGeneratedPairResponse(value: unknown): GeneratedPair[] {
  if (!isRecord(value)) throw new Error('The AI provider response must be an object containing pairs.');
  const extra = Object.keys(value).filter((key) => key !== 'pairs');
  if (extra.length > 0) throw new Error(`The AI provider response contains unsupported fields: ${extra.join(', ')}.`);
  return validateGeneratedPairs(value.pairs);
}

export function canonicalizeGeneratedImageStimuli(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.pairs)) return value;
  return {
    ...value,
    pairs: value.pairs.map((entry) => {
      if (!isRecord(entry) || normalized(entry.kind) !== 'image') return entry;
      const response = normalized(entry.response);
      if (!response) return entry;
      return { ...entry, stimulus: imageStimulusForResponse(response) };
    }),
  };
}

function rejectExtraFields(value: Record<string, unknown>, allowed: string[], label: string): void {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length > 0) throw new Error(`${label} contains unsupported fields: ${extra.join(', ')}.`);
}

export function validateAiContentSaveContract(value: unknown): AiContentSaveContract {
  if (!isRecord(value)) throw new Error('AI content save contract must be an object.');
  rejectExtraFields(value, ['contractVersion', 'mode', 'title', 'pairs'], 'AI content save contract');
  if (value.contractVersion !== AI_CONTENT_CONTRACT_VERSION) throw new Error(`AI content contract version must be ${AI_CONTENT_CONTRACT_VERSION}.`);
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
    if (pair.kind !== 'text' && pair.kind !== 'image') throw new Error(`Pair ${index + 1} kind must be text or image.`);
    if (pair.kind === 'text') {
      if (entry.image !== undefined) throw new Error(`Pair ${index + 1} text stimulus cannot contain image metadata.`);
      return { ...pair, kind: 'text' };
    }
    if (!isRecord(entry.image)) return { ...pair, kind: 'image' };
    rejectExtraFields(entry.image, ['source', 'fileName', 'attribution'], `Pair ${index + 1} image`);
    const source = normalized(entry.image.source);
    if (source !== 'wikimedia' && source !== 'uploaded' && source !== 'user-replacement') {
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
