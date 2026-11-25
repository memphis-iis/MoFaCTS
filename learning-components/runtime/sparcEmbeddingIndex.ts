import { normalizeEmbeddingVector } from './vectorSimilarity';

/** Browser-owned exact search. Rows are normalized once when their cached vector changes. */
export class SparcEmbeddingIndex {
  private readonly rows = new Map<string, Float64Array>();

  set(id: string, embedding: readonly number[]): void {
    if (!id) throw new Error('An embedding requires its library identity');
    this.rows.set(id, Float64Array.from(normalizeEmbeddingVector(embedding)));
  }

  remove(id: string): void { this.rows.delete(id); }
  clear(): void { this.rows.clear(); }
  get size(): number { return this.rows.size; }

  private *scores(embedding: readonly number[], minimumSimilarity: number) {
    if (!Number.isFinite(minimumSimilarity) || minimumSimilarity < 0 || minimumSimilarity > 1) {
      throw new Error('Invalid library similarity threshold');
    }
    const query = normalizeEmbeddingVector(embedding);
    for (const [entryId, row] of this.rows) {
      if (row.length !== query.length) throw new Error('Library embedding dimensions do not match the query');
      let similarity = 0;
      for (let i = 0; i < row.length; i++) similarity += row[i]! * query[i]!;
      similarity = Math.max(-1, Math.min(1, similarity));
      if (similarity >= minimumSimilarity) yield { entryId, similarity };
    }
  }

  ranked(embedding: readonly number[], minimumSimilarity: number) {
    return [...this.scores(embedding, minimumSimilarity)].sort((a, b) => b.similarity - a.similarity
      || (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0));
  }

  maximum(embedding: readonly number[], minimumSimilarity: number) {
    let best: { entryId: string; similarity: number } | null = null;
    for (const row of this.scores(embedding, minimumSimilarity)) {
      if (!best || row.similarity > best.similarity || (row.similarity === best.similarity && row.entryId < best.entryId)) best = row;
    }
    return best;
  }
}
