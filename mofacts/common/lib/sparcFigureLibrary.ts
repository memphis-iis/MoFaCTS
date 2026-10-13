import { AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL } from './autoTutorRelationshipConstants';

/** Initial experimental cutoff, not an empirically calibrated correctness probability. */
export const SPARC_FIGURE_LIBRARY_SETTINGS = Object.freeze({
  version: 'sparc-teaching-figure-library-v1',
  embeddingModel: AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL,
  minimumSimilarity: 0.9,
  batchSize: 100,
});

export type SparcFigureSituation = Readonly<{
  targetType: 'learningTarget' | 'misconception';
  targetTexts: readonly string[];
  currentValue: number | null;
  assistance: number;
  illustrationBrief: string;
}>;

export function sparcFigureMinimumSimilarity(value: unknown): number {
  if (value === undefined) return SPARC_FIGURE_LIBRARY_SETTINGS.minimumSimilarity;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('SPARC figure minimum cosine similarity must be between 0 and 1');
  }
  return value;
}

/** No learner identity, raw response, history, or session IDs enter the shared index. */
export function sparcFigureSituationText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SPARC figure situation requires an object');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 5 || !['learningTarget', 'misconception'].includes(String(data.targetType))
    || !Array.isArray(data.targetTexts) || data.targetTexts.length < 1 || data.targetTexts.length > 20
    || data.targetTexts.some(text => typeof text !== 'string' || !text.trim() || text.length > 2048)
    || (data.currentValue !== null && (typeof data.currentValue !== 'number' || !Number.isFinite(data.currentValue)))
    || typeof data.assistance !== 'number' || !Number.isFinite(data.assistance)
    || typeof data.illustrationBrief !== 'string' || !data.illustrationBrief.trim() || data.illustrationBrief.length > 8000) {
    throw new Error('Invalid SPARC figure situation');
  }
  const result = JSON.stringify({ version: SPARC_FIGURE_LIBRARY_SETTINGS.version, targetType: data.targetType,
    targetTexts: data.targetTexts.map(text => String(text).trim()), currentValue: data.currentValue,
    assistance: data.assistance, illustrationBrief: data.illustrationBrief.trim() });
  if (result.length > 12000) throw new Error('SPARC figure situation exceeds its embedding input budget');
  return result;
}

export function normalizeSparcFigureEmbedding(value: unknown): number[] {
  if (!Array.isArray(value) || !value.length || value.length > 8192
    || value.some(number => typeof number !== 'number' || !Number.isFinite(number))) {
    throw new Error('SPARC figure embedding must be a bounded finite vector');
  }
  const norm = Math.hypot(...value);
  if (!Number.isFinite(norm) || norm === 0) throw new Error('SPARC figure embedding cannot have zero length');
  return value.map(number => number / norm);
}

export function sparcFigureCosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) throw new Error('SPARC figure embedding dimensions do not match');
  const normalizedLeft = normalizeSparcFigureEmbedding(left);
  const normalizedRight = normalizeSparcFigureEmbedding(right);
  return Math.max(-1, Math.min(1, normalizedLeft.reduce((sum, number, index) => sum + number * normalizedRight[index]!, 0)));
}
