import { strict as assert } from 'node:assert';
import { SPARC_INSTRUCTIONAL_NEED_VERSION } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { instructionalEmbeddingFingerprint as fingerprint, replaceInstructionalEmbeddingBatch } from './sparcInstructionalEmbeddingMigration';

describe('Staged instructional embedding replacement', () => {
  const embedding = [1, ...new Array<number>(3071).fill(0)];
  it('preserves content and references, verifies readback, and makes a completed retry idempotent', async () => {
    let current: Record<string, unknown> = { _id: 'entry', content: { text: 'Saved teaching content.' }, previousEntryId: 'original', embedding: [0, 1] };
    const after = { ...current, embedding, embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION };
    const stage = { id: 'entry', before: fingerprint(current), after: fingerprint(after), embedding };
    const io = { read: async () => current, replace: async (_id: string, set: Record<string, unknown>) => { current = { ...current, ...set }; } };
    assert.equal(await replaceInstructionalEmbeddingBatch([stage], io), 1);
    assert.deepEqual(current, after);
    assert.equal(await replaceInstructionalEmbeddingBatch([stage], io), 0);
  });
  it('rejects changed sources, malformed vectors and failed persistence instead of keeping mixed representations', async () => {
    const current = { _id: 'entry', content: 'Changed content' };
    let writes = 0;
    const io = { read: async () => current, replace: async () => { writes++; } };
    const stage = { id: 'entry', before: 'obsolete', after: 'expected', embedding };
    await assert.rejects(replaceInstructionalEmbeddingBatch([stage], io), /changed/); assert.equal(writes, 0);
    await assert.rejects(replaceInstructionalEmbeddingBatch([{ ...stage, embedding: [0, 0] }], io), /zero length/);
    await assert.rejects(replaceInstructionalEmbeddingBatch([{ ...stage, before: fingerprint(current) }], io), /readback/);
  });
});
