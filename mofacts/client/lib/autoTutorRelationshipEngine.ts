import { callOpenRouterEmbeddings, type OpenRouterEmbeddingResult } from './openRouterClient';
import { computeClusterKcRelationshipsFromEmbeddings } from '../../../learning-components/runtime/clusterKcRelationshipEngine';
import { AUTO_TUTOR_RELATIONSHIP_GRAPH_VERSION, AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL, AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL } from '../../common/lib/autoTutorRelationshipConstants';
export { AUTO_TUTOR_RELATIONSHIP_GRAPH_VERSION, AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL, AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL } from '../../common/lib/autoTutorRelationshipConstants';

type RuntimeExpectation = { id?: string; label?: string; proposition?: string; assertion?: string };
type NormalizedExpectation = Required<Pick<RuntimeExpectation, 'id' | 'label' | 'proposition' | 'assertion'>>;
type RuntimeRelationshipProvenance = {
  graphVersion: string;
  generatedAt: string;
  model: string;
  attemptedModels: string[];
  metric: 'cosine_similarity_normalized_vectors';
  scoreTransform: 'clamp_negative_to_zero';
  sourceKeyType: AutoTutorRelationshipKeySource;
  cacheKey: string;
};

export type AutoTutorRelationshipKeySource = 'tdf' | 'user' | 'admin';
export type AutoTutorRelationshipGenerationOptions = {
  apiKey: string;
  sourceKeyType: AutoTutorRelationshipKeySource;
  generatedAt?: string;
  embeddingModels?: string[];
  callEmbeddings?: (model: string, input: string[]) => Promise<OpenRouterEmbeddingResult>;
};
export type AutoTutorRelationshipKeySelection = { apiKey: string; sourceKeyType: AutoTutorRelationshipKeySource };
export type AutoTutorRelationshipGenerationResult = {
  expectationRelationships: Record<string, Record<string, number>>;
  expectationRelationshipProvenance: RuntimeRelationshipProvenance;
  model: string;
  attemptedModels: string[];
  costUsd?: number;
};

export function selectAutoTutorRelationshipGenerationKey(options: { tdfOpenRouterApiKey?: unknown; userOpenRouterApiKey?: unknown }): AutoTutorRelationshipKeySelection {
  const tdfKey = typeof options.tdfOpenRouterApiKey === 'string' ? options.tdfOpenRouterApiKey.trim() : '';
  if (tdfKey) return { apiKey: tdfKey, sourceKeyType: 'tdf' };
  const userKey = typeof options.userOpenRouterApiKey === 'string' ? options.userOpenRouterApiKey.trim() : '';
  if (userKey) return { apiKey: userKey, sourceKeyType: 'user' };
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

function normalizeExpectation(expectation: RuntimeExpectation): NormalizedExpectation | null {
  const id = String(expectation.id || '').trim();
  const proposition = String(expectation.proposition || '').trim();
  const assertion = String(expectation.assertion || proposition).trim();
  if (!id || !proposition || !assertion) return null;
  return { id, label: String(expectation.label || id).trim(), proposition, assertion };
}

function expectationEmbeddingText(expectation: NormalizedExpectation): string {
  return [`Label: ${expectation.label}`, `Proposition: ${expectation.proposition}`, `Assertion: ${expectation.assertion}`].join('\n');
}

export function computeAutoTutorRelationshipCacheKey(expectations: RuntimeExpectation[], model: string): string {
  const normalized = expectations.map(normalizeExpectation).filter(Boolean) as NormalizedExpectation[];
  return stableHash(JSON.stringify({ graphVersion: AUTO_TUTOR_RELATIONSHIP_GRAPH_VERSION, model, expectations: normalized }));
}

export function computeAutoTutorExpectationRelationshipsFromEmbeddings(expectations: RuntimeExpectation[], embeddings: number[][]): Record<string, Record<string, number>> {
  const normalized = expectations.map(normalizeExpectation).filter(Boolean) as NormalizedExpectation[];
  if (normalized.length !== embeddings.length) throw new Error('AutoTutor relationship embedding count does not match expectation count');
  const graph = computeClusterKcRelationshipsFromEmbeddings({ nodes: normalized.map((expectation) => ({ clusterKC: expectation.id, description: expectationEmbeddingText(expectation) })), embeddings });
  const relationships: Record<string, Record<string, number>> = {};
  for (const relationship of graph) {
    relationships[relationship.sourceClusterKC] = relationships[relationship.sourceClusterKC] || {};
    relationships[relationship.sourceClusterKC]![relationship.targetClusterKC] = relationship.strength;
  }
  return relationships;
}

async function callEmbeddingModel(apiKey: string, model: string, input: string[], callEmbeddings?: (model: string, input: string[]) => Promise<OpenRouterEmbeddingResult>): Promise<OpenRouterEmbeddingResult> {
  if (callEmbeddings) return callEmbeddings(model, input);
  return callOpenRouterEmbeddings({ apiKey, model, input, telemetry: { surface: 'autotutor-runtime', operation: 'autotutor-relationship-embedding' } });
}

export async function generateAutoTutorExpectationRelationships(output: { expectations: RuntimeExpectation[] }, options: AutoTutorRelationshipGenerationOptions): Promise<AutoTutorRelationshipGenerationResult> {
  const normalized = (Array.isArray(output.expectations) ? output.expectations : []).map(normalizeExpectation).filter(Boolean) as NormalizedExpectation[];
  if (normalized.length < 2) throw new Error('AutoTutor relationship generation requires at least two usable expectations');
  const input = normalized.map(expectationEmbeddingText);
  const models = (options.embeddingModels?.length ? options.embeddingModels : [AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL, AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL]).map((model) => String(model || '').trim()).filter(Boolean);
  if (models.length === 0) throw new Error('AutoTutor relationship generation requires at least one embedding model');
  const attemptedModels: string[] = [];
  let lastError: unknown;
  for (const model of models) {
    attemptedModels.push(model);
    try {
      const embeddingResult = await callEmbeddingModel(options.apiKey, model, input, options.callEmbeddings);
      return {
        expectationRelationships: computeAutoTutorExpectationRelationshipsFromEmbeddings(normalized, embeddingResult.embeddings),
        expectationRelationshipProvenance: {
          graphVersion: AUTO_TUTOR_RELATIONSHIP_GRAPH_VERSION,
          generatedAt: options.generatedAt || new Date().toISOString(),
          model,
          attemptedModels,
          metric: 'cosine_similarity_normalized_vectors',
          scoreTransform: 'clamp_negative_to_zero',
          sourceKeyType: options.sourceKeyType,
          cacheKey: computeAutoTutorRelationshipCacheKey(normalized, model),
        },
        model,
        attemptedModels,
        ...(embeddingResult.costUsd !== undefined ? { costUsd: embeddingResult.costUsd } : {}),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`AutoTutor relationship generation failed for all embedding models: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
