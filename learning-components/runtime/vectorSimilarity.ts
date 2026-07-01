export function roundUnitSimilarityScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function normalizeEmbeddingVector(vector: readonly number[], label = 'embedding vector'): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`${label} must be a non-empty number vector`);
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must contain only finite numbers`);
    }
    return sum + value * value;
  }, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error(`${label} has zero magnitude`);
  }
  return vector.map((value) => value / magnitude);
}

export function cosineSimilarityScore(params: {
  readonly normalizedA: readonly number[];
  readonly normalizedB: readonly number[];
  readonly label?: string;
  readonly clampToUnit?: boolean;
}): number {
  const label = params.label ?? 'embedding vectors';
  if (params.normalizedA.length !== params.normalizedB.length) {
    throw new Error(`${label} dimensions do not match`);
  }
  const cosine = params.normalizedA.reduce((sum, value, index) => {
    const other = params.normalizedB[index]!;
    if (!Number.isFinite(value) || !Number.isFinite(other)) {
      throw new Error(`${label} must contain only finite numbers`);
    }
    return sum + value * other;
  }, 0);
  const score = params.clampToUnit === false
    ? cosine
    : Math.max(0, Math.min(1, cosine));
  return roundUnitSimilarityScore(score);
}

export function cosineSimilarityFromEmbeddings(params: {
  readonly a: readonly number[];
  readonly b: readonly number[];
  readonly label?: string;
  readonly clampToUnit?: boolean;
}): number {
  const label = params.label ?? 'embedding vectors';
  return cosineSimilarityScore({
    normalizedA: normalizeEmbeddingVector(params.a, `${label} A`),
    normalizedB: normalizeEmbeddingVector(params.b, `${label} B`),
    label,
    ...(params.clampToUnit !== undefined ? { clampToUnit: params.clampToUnit } : {}),
  });
}
