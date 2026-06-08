import {
  callOpenRouterEmbeddings,
  type OpenRouterEmbeddingResult,
} from './openRouterClient';
import type {
  AiAutoTutorExpectation,
  AiAutoTutorOutput,
  AiAutoTutorRelationshipProvenance,
} from './aiContentTypes';

export const AUTO_TUTOR_RELATIONSHIP_GRAPH_VERSION = 'autotutor-expectation-relationships-v1';
export const AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL = 'google/gemini-embedding-001';
export const AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL = 'openai/text-embedding-3-large';

type NormalizedExpectation = Required<Pick<AiAutoTutorExpectation, 'id' | 'label' | 'proposition' | 'assertion'>>;

export type AutoTutorRelationshipKeySource = 'tdf' | 'user' | 'admin';

export type AutoTutorRelationshipGenerationOptions = {
  apiKey: string;
  sourceKeyType: AutoTutorRelationshipKeySource;
  generatedAt?: string;
  embeddingModels?: string[];
  callEmbeddings?: (model: string, input: string[]) => Promise<OpenRouterEmbeddingResult>;
};

export type AutoTutorRelationshipKeySelection = {
  apiKey: string;
  sourceKeyType: AutoTutorRelationshipKeySource;
};

export type AutoTutorRelationshipGenerationResult = {
  expectationRelationships: Record<string, Record<string, number>>;
  expectationRelationshipProvenance: AiAutoTutorRelationshipProvenance;
  model: string;
  attemptedModels: string[];
  costUsd?: number;
};

export function selectAutoTutorRelationshipGenerationKey(options: {
  tdfOpenRouterApiKey?: unknown;
  userOpenRouterApiKey?: unknown;
}): AutoTutorRelationshipKeySelection {
  const tdfKey = typeof options.tdfOpenRouterApiKey === 'string'
    ? options.tdfOpenRouterApiKey.trim()
    : '';
  if (tdfKey) {
    return {
      apiKey: tdfKey,
      sourceKeyType: 'tdf',
    };
  }
  const userKey = typeof options.userOpenRouterApiKey === 'string'
    ? options.userOpenRouterApiKey.trim()
    : '';
  if (userKey) {
    return {
      apiKey: userKey,
      sourceKeyType: 'user',
    };
  }
  throw new Error('AutoTutor relationship generation requires a TDF or user OpenRouter key');
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeExpectation(expectation: AiAutoTutorExpectation): NormalizedExpectation | null {
  const id = String(expectation.id || '').trim();
  const proposition = String(expectation.proposition || '').trim();
  const assertion = String(expectation.assertion || proposition).trim();
  if (!id || !proposition || !assertion) {
    return null;
  }
  return {
    id,
    label: String(expectation.label || id).trim(),
    proposition,
    assertion,
  };
}

function expectationEmbeddingText(expectation: NormalizedExpectation): string {
  return [
    `Label: ${expectation.label}`,
    `Proposition: ${expectation.proposition}`,
    `Assertion: ${expectation.assertion}`,
  ].join('\n');
}

export function computeAutoTutorRelationshipCacheKey(
  expectations: AiAutoTutorExpectation[],
  model: string,
): string {
  const normalized = expectations
    .map(normalizeExpectation)
    .filter(Boolean) as NormalizedExpectation[];
  const payload = {
    graphVersion: AUTO_TUTOR_RELATIONSHIP_GRAPH_VERSION,
    model,
    expectations: normalized.map((expectation) => ({
      id: expectation.id,
      label: expectation.label,
      proposition: expectation.proposition,
      assertion: expectation.assertion,
    })),
  };
  return stableHash(JSON.stringify(payload));
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error('AutoTutor relationship embedding vector has zero magnitude');
  }
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(normalizedA: number[], normalizedB: number[]): number {
  if (normalizedA.length !== normalizedB.length) {
    throw new Error('AutoTutor relationship embedding dimensions do not match');
  }
  const cosine = normalizedA.reduce((sum, value, index) => sum + value * (normalizedB[index] || 0), 0);
  return Math.round(Math.max(0, Math.min(1, cosine)) * 1_000_000) / 1_000_000;
}

export function computeAutoTutorExpectationRelationshipsFromEmbeddings(
  expectations: AiAutoTutorExpectation[],
  embeddings: number[][],
): Record<string, Record<string, number>> {
  const normalizedExpectations = expectations
    .map(normalizeExpectation)
    .filter(Boolean) as NormalizedExpectation[];
  if (normalizedExpectations.length !== embeddings.length) {
    throw new Error('AutoTutor relationship embedding count does not match expectation count');
  }
  const normalizedEmbeddings = embeddings.map(normalizeVector);
  const relationships: Record<string, Record<string, number>> = {};
  for (let sourceIndex = 0; sourceIndex < normalizedExpectations.length; sourceIndex += 1) {
    const source = normalizedExpectations[sourceIndex]!;
    relationships[source.id] = {};
    for (let targetIndex = 0; targetIndex < normalizedExpectations.length; targetIndex += 1) {
      if (sourceIndex === targetIndex) {
        continue;
      }
      const target = normalizedExpectations[targetIndex]!;
      relationships[source.id]![target.id] = cosineSimilarity(
        normalizedEmbeddings[sourceIndex]!,
        normalizedEmbeddings[targetIndex]!,
      );
    }
  }
  return relationships;
}

async function callEmbeddingModel(
  apiKey: string,
  model: string,
  input: string[],
  callEmbeddings?: (model: string, input: string[]) => Promise<OpenRouterEmbeddingResult>,
): Promise<OpenRouterEmbeddingResult> {
  if (callEmbeddings) {
    return callEmbeddings(model, input);
  }
  return callOpenRouterEmbeddings({
    apiKey,
    model,
    input,
    telemetry: {
      surface: 'ai-content-creator',
      operation: 'autotutor-relationship-embedding',
    },
  });
}

export async function generateAutoTutorExpectationRelationships(
  output: Pick<AiAutoTutorOutput, 'expectations'>,
  options: AutoTutorRelationshipGenerationOptions,
): Promise<AutoTutorRelationshipGenerationResult> {
  const expectations = Array.isArray(output.expectations) ? output.expectations : [];
  const normalizedExpectations = expectations
    .map(normalizeExpectation)
    .filter(Boolean) as NormalizedExpectation[];
  if (normalizedExpectations.length < 2) {
    throw new Error('AutoTutor relationship generation requires at least two usable expectations');
  }
  const input = normalizedExpectations.map(expectationEmbeddingText);
  const models = (options.embeddingModels && options.embeddingModels.length > 0
    ? options.embeddingModels
    : [AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL, AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL])
    .map((model) => String(model || '').trim())
    .filter(Boolean);
  if (models.length === 0) {
    throw new Error('AutoTutor relationship generation requires at least one embedding model');
  }

  const attemptedModels: string[] = [];
  let lastError: unknown;
  for (const model of models) {
    attemptedModels.push(model);
    try {
      const embeddingResult = await callEmbeddingModel(options.apiKey, model, input, options.callEmbeddings);
      const expectationRelationships = computeAutoTutorExpectationRelationshipsFromEmbeddings(
        normalizedExpectations,
        embeddingResult.embeddings,
      );
      const generatedAt = options.generatedAt || new Date().toISOString();
      return {
        expectationRelationships,
        expectationRelationshipProvenance: {
          graphVersion: AUTO_TUTOR_RELATIONSHIP_GRAPH_VERSION,
          generatedAt,
          model,
          attemptedModels,
          metric: 'cosine_similarity_normalized_vectors',
          scoreTransform: 'clamp_negative_to_zero',
          sourceKeyType: options.sourceKeyType,
          cacheKey: computeAutoTutorRelationshipCacheKey(normalizedExpectations, model),
        },
        model,
        attemptedModels,
        ...(embeddingResult.costUsd !== undefined ? { costUsd: embeddingResult.costUsd } : {}),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `AutoTutor relationship generation failed for all embedding models: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
