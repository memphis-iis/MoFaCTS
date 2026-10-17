import { strict as assert } from 'node:assert';
import { transferInstructionalBatch } from './sparcInstructionalLibraryMigration';

describe('Single instructional repository transfer', () => {
  it('preserves vectors, image versions, component identities and original values; admits identical retries', async () => {
    const image = { _id: 'image1', embedding: [1, 0], currentAssetId: 'replacement1', revision: 2, createdAt: new Date(1000), reusable: false };
    const primitive = { _id: 'a'.repeat(64), kind: 'explanation', embedding: [0, 1], content: { text: 'Saved instruction.' }, previousEntryId: 'b'.repeat(64) };
    const saved = new Map<string, Record<string, unknown>>(), removed: string[] = [];
    const io = { async insert(entry: Record<string, unknown>) { if (!saved.has(String(entry._id))) saved.set(String(entry._id), structuredClone(entry)); }, async read(id: string) { return saved.get(id) ?? null; }, async remove(id: string) { removed.push(id); } };
    await transferInstructionalBatch('sparc_figure_library', [image], io);
    await transferInstructionalBatch('sparc_move_library', [primitive], io);
    await transferInstructionalBatch('sparc_figure_library', [image], io);
    assert.deepEqual(saved.get(image._id), { ...image, kind: 'image' });
    assert.deepEqual(saved.get(primitive._id), primitive);
    assert.equal('kind' in image, false); assert.equal(saved.size, 2); assert.equal(removed.length, 3);
  });
  it('rejects identity collisions and invalid vectors before removing the source', async () => {
    let removed = 0;
    const io = { async insert() {}, async read() { return { _id: 'same', embedding: [0, 1], kind: 'image' }; }, async remove() { removed++; } };
    await assert.rejects(transferInstructionalBatch('sparc_figure_library', [{ _id: 'same', embedding: [1, 0] }], io), /identity conflict/);
    await assert.rejects(transferInstructionalBatch('sparc_move_library', [{ _id: 'same', kind: 'question', embedding: [NaN] }], io), /invalid embedding/);
    assert.equal(removed, 0);
  });
});
