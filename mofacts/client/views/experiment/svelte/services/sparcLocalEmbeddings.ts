import { Meteor } from 'meteor/meteor';
import { SPARC_EMBEDDING_MODEL } from '../../../../../common/lib/sparcEmbeddingModel';
import { normalizeEmbeddingVector } from '../../../../../../learning-components/runtime/vectorSimilarity';
import type { OpenRouterUsageSummary } from '../../../../../common/lib/openRouterClient';

const completed = new Map<string, number[]>();
let account: string | null = null;

/** Completed results only: concurrent misses call the key-bearing API independently. */
export async function embedSparcTexts(tdfId: string | null | undefined, input: readonly string[], onUsage?: (usage: OpenRouterUsageSummary) => void): Promise<number[][]> {
  const userId = Meteor.userId();
  if (!userId) throw new Error('Embeddings require an authenticated account');
  if (account !== userId) { completed.clear(); account = userId; }
  const keys = input.map(text => JSON.stringify([userId, tdfId, SPARC_EMBEDDING_MODEL, text]));
  const missing = new Map<string, string>();
  keys.forEach((key, index) => { if (!completed.has(key)) missing.set(key, input[index]!); });
  if (missing.size) {
    const result = await Meteor.callAsync('callResolvedOpenRouterEmbeddings', {
      tdfId, model: SPARC_EMBEDDING_MODEL, input: [...missing.values()],
      telemetry: { surface: 'sparc-library', operation: 'embed-local-query' },
    });
    if (!Array.isArray(result.embeddings) || result.embeddings.length !== missing.size) throw new Error('Embedding count does not match input');
    const normalized = result.embeddings.map((vector: number[]) => normalizeEmbeddingVector(vector));
    if (typeof result.costUsd === 'number') onUsage?.({ costUsd: result.costUsd });
    if (Meteor.userId() !== userId) throw new Error('Account changed while embedding the query');
    [...missing.keys()].forEach((key, index) => completed.set(key, normalized[index]!));
  }
  return keys.map(key => completed.get(key)!);
}
