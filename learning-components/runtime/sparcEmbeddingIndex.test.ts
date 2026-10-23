import { strict as assert } from 'node:assert';
import { SparcEmbeddingIndex } from './sparcEmbeddingIndex';

describe('Browser SPARC embedding index', () => {
  it('returns only the exact maximum above the threshold with stable tie ordering', () => {
    const index = new SparcEmbeddingIndex();
    index.set('lower', [.96, Math.sqrt(1 - .96 ** 2)]);
    index.set('z', [4, 0]); index.set('a', [2, 0]);
    assert.deepEqual(index.maximum([10, 0], .95), { entryId: 'a', similarity: 1 });
    index.remove('a'); assert.equal(index.maximum([1, 0], .95)?.entryId, 'z');
    index.remove('z'); assert.equal(index.maximum([1, 0], .97), null);
    assert.equal(index.maximum([1, 0], .95)?.entryId, 'lower');
  });
  it('applies cache updates and removals and rejects incompatible vectors', () => {
    const index = new SparcEmbeddingIndex();
    index.set('a', [1, 0]); index.set('a', [0, 1]);
    assert.equal(index.maximum([1, 0], .95), null);
    assert.equal(index.maximum([0, 1], .95)?.entryId, 'a');
    assert.throws(() => index.maximum([1, 0, 0], .95), /dimensions/);
    assert.throws(() => index.set('bad', [0, 0]), /zero/);
    index.clear(); assert.equal(index.size, 0); assert.equal(index.maximum([1, 0], .95), null);
  });
  it('uses one maximum and one 0.95 boundary for images and videos without type priority', () => {
    const index = new SparcEmbeddingIndex();
    index.set('video', [.96, Math.sqrt(1 - .96 ** 2)]);
    index.set('image', [.99, Math.sqrt(1 - .99 ** 2)]);
    assert.equal(index.maximum([1, 0], .95)?.entryId, 'image');
    index.set('video', [1, 0]);
    assert.equal(index.maximum([1, 0], .95)?.entryId, 'video');
    index.remove('video'); index.set('image', [.94, Math.sqrt(1 - .94 ** 2)]);
    assert.equal(index.maximum([1, 0], .95), null);
  });
});
