import { isDeepStrictEqual } from 'node:util';

/** Runs inside the owning store's snapshot transaction. A conflict must abort it. */
export async function transferInstructionalBatch(source: 'sparc_figure_library' | 'sparc_move_library', rows: Record<string, unknown>[], io: {
  insert(entry: Record<string, unknown>): Promise<void>;
  read(id: string): Promise<Record<string, unknown> | null>;
  remove(id: string): Promise<void>;
}) {
  if (rows.length > 100) throw new Error('Instructional transfer exceeds its batch limit');
  for (const original of rows) {
    const entry: Record<string, unknown> = { ...original, ...(source === 'sparc_figure_library' ? { kind: 'image' } : {}) };
    if (typeof entry._id !== 'string' || !/^[a-zA-Z0-9]{1,64}$/.test(entry._id)) throw new Error('Invalid instructional transfer identity');
    if (!Array.isArray(entry.embedding) || !entry.embedding.length || entry.embedding.some(value => !Number.isFinite(value))) throw new Error('Instructional library transfer found an invalid embedding');
    if (!['image', 'feedback', 'explanation', 'richContent', 'question'].includes(String(entry.kind))) throw new Error('Instructional library transfer found an invalid component type');
    await io.insert(entry);
    if (!isDeepStrictEqual(await io.read(entry._id), entry)) throw new Error('Instructional library transfer identity conflict');
    await io.remove(entry._id);
  }
}
