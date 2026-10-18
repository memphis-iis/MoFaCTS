import { SPARC_EMBEDDING_MODEL } from './sparcEmbeddingModel';
import { SPARC_LIBRARY_SIMILARITY } from '../../../learning-components/runtime/sparcInstructionalNeed';

/** Initial experimental cutoff, not an empirically calibrated correctness probability. */
export const SPARC_FIGURE_LIBRARY_SETTINGS = Object.freeze({
  version: 'sparc-teaching-figure-library-v1',
  embeddingModel: SPARC_EMBEDDING_MODEL,
  minimumSimilarity: SPARC_LIBRARY_SIMILARITY.minimumSimilarity,
  batchSize: 100,
  inspectionPageSize: 24,
});

export type SparcLibraryImage = Readonly<{
  assetId: string; description: string; createdAt: string; model: string;
}>;
export type SparcLibraryImagePage = Readonly<{ images: SparcLibraryImage[]; nextCursor: string | null }>;

export function sparcFigureMinimumSimilarity(value: unknown): number {
  if (value === undefined) return SPARC_FIGURE_LIBRARY_SETTINGS.minimumSimilarity;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('SPARC figure minimum cosine similarity must be between 0 and 1');
  }
  return value;
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
