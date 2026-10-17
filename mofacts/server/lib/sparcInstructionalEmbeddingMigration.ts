import { createHash } from 'node:crypto';
import { SPARC_INSTRUCTIONAL_NEED_VERSION, sparcInstructionalNeedText } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { normalizeSparcFigureEmbedding } from '../../common/lib/sparcFigureLibrary';

export const instructionalEmbeddingFingerprint = (row: unknown) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
export type StagedInstructionalEmbedding = {
  id: string; before: string; after: string; embedding: number[];
  // Image need source is shared; feedback question/answer input stays in private requests.
  situation?: string; queryText?: string;
};

/** Offline, explicitly invoked reindex only. The caller owns one snapshot transaction.
 * All staged sources must still match. No provider call or automatic old-vector read path.
 */
export async function replaceInstructionalEmbeddingBatch(rows: readonly StagedInstructionalEmbedding[], io: {
  read(id: string): Promise<Record<string, unknown> | null>;
  replace(id: string, set: Record<string, unknown>): Promise<void>;
}) {
  if (rows.length > 100 || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Invalid embedding replacement batch');
  let changed = 0;
  for (const row of rows) {
    const normalized = normalizeSparcFigureEmbedding(row.embedding);
    if (normalized.length !== 3072 || row.embedding.some((v, i) => Math.abs(v - normalized[i]!) > 1e-10)) throw new Error('Invalid staged embedding');
    if (row.situation !== undefined && sparcInstructionalNeedText(JSON.parse(row.situation)) !== row.situation) throw new Error('Invalid staged image need');
    if (row.queryText !== undefined && sparcInstructionalNeedText(JSON.parse(row.queryText)) !== row.queryText) throw new Error('Invalid staged private need');
    const current = await io.read(row.id);
    if (!current) throw new Error('Embedding source is missing');
    const fingerprint = instructionalEmbeddingFingerprint(current);
    if (fingerprint === row.after) continue;
    if (fingerprint !== row.before) throw new Error('Embedding source changed after evaluation');
    const set = { embedding: row.embedding, embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION,
      ...(row.situation === undefined ? {} : { situation: row.situation }),
      ...(row.queryText === undefined ? {} : { 'query.queryText': row.queryText }) };
    await io.replace(row.id, set);
    if (instructionalEmbeddingFingerprint(await io.read(row.id)) !== row.after) throw new Error('Embedding replacement readback mismatch');
    changed++;
  }
  return changed;
}
