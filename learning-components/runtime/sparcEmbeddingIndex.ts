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

  maximum(embedding: readonly number[], minimumSimilarity: number): { entryId: string; similarity: number } | null {
    if (!Number.isFinite(minimumSimilarity) || minimumSimilarity < 0 || minimumSimilarity > 1) {
      throw new Error('Invalid library similarity threshold');
    }
    const query = normalizeEmbeddingVector(embedding);
    let best: { entryId: string; similarity: number } | null = null;
    for (const [entryId, row] of this.rows) {
      if (row.length !== query.length) throw new Error('Library embedding dimensions do not match the query');
      let similarity = 0;
      for (let i = 0; i < row.length; i++) similarity += row[i]! * query[i]!;
      similarity = Math.max(-1, Math.min(1, similarity));
      if (!best || similarity > best.similarity || (similarity === best.similarity && entryId < best.entryId)) {
        best = { entryId, similarity };
      }
    }
    return best && best.similarity >= minimumSimilarity ? best : null;
  }
}
