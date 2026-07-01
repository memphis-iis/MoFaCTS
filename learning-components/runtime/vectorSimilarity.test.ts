import { strict as assert } from 'node:assert';
import {
  cosineSimilarityFromEmbeddings,
  cosineSimilarityScore,
  normalizeEmbeddingVector,
  roundUnitSimilarityScore,
} from './vectorSimilarity';

describe('vector similarity utilities', function() {
  it('normalizes finite non-zero vectors', function() {
    assert.deepEqual(normalizeEmbeddingVector([3, 4]), [0.6, 0.8]);
  });

  it('computes rounded clamped cosine similarity for normalized vectors', function() {
    assert.equal(cosineSimilarityScore({
      normalizedA: [1, 0],
      normalizedB: [0.5, 0.5],
    }), 0.5);
    assert.equal(cosineSimilarityScore({
      normalizedA: [1, 0],
      normalizedB: [-1, 0],
    }), 0);
  });

  it('computes cosine similarity directly from raw embeddings', function() {
    assert.equal(cosineSimilarityFromEmbeddings({
      a: [1, 0],
      b: [1, 1],
    }), 0.707107);
  });

  it('fails clearly for invalid vectors', function() {
    assert.throws(
      () => normalizeEmbeddingVector([0, 0], 'test vector'),
      /test vector has zero magnitude/,
    );
    assert.throws(
      () => cosineSimilarityScore({ normalizedA: [1], normalizedB: [1, 0] }),
      /embedding vectors dimensions do not match/,
    );
    assert.throws(
      () => normalizeEmbeddingVector([Number.NaN], 'test vector'),
      /test vector must contain only finite numbers/,
    );
  });

  it('rounds scores to six decimals', function() {
    assert.equal(roundUnitSimilarityScore(0.1234567), 0.123457);
  });
});
