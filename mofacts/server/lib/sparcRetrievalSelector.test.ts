import { strict as assert } from 'node:assert';
import { sparcRetrievalSelector } from './sparcRetrievalSelector';
import { sparcRetrievalCategoryKey, type SparcRetrievalCategory } from '../../common/lib/sparcRetrieval';

describe('Embedding-only descriptive matching', () => {
  it('shares candidate pools and indexes across descriptive labels', () => {
    for (const kind of ['feedback', 'instruction', 'question'] as const) {
      const reference: SparcRetrievalCategory = { kind, responseFormat: 'text' };
      for (const readingLevel of ['unbiased', 'college-freshman', 'junior-high-freshman'] as const) {
        for (const supportKind of [undefined, 'written', 'visual'] as const) {
          const labelled: SparcRetrievalCategory = { ...reference, readingLevel, ...(supportKind ? { supportKind } : {}) };
          assert.deepEqual(sparcRetrievalSelector(labelled), sparcRetrievalSelector(reference));
          assert.equal(sparcRetrievalCategoryKey(labelled), sparcRetrievalCategoryKey(reference));
        }
      }
    }
  });
  it('partitions text by orientation ownership while sharing descriptive labels within each pool', () => {
    for (const kind of ['feedback', 'instruction', 'question'] as const) {
      const reference: SparcRetrievalCategory = { kind, responseFormat: 'text' };
      const owned: SparcRetrievalCategory = { ...reference, orientationOwned: true };
      assert.deepEqual(sparcRetrievalSelector(reference)['context.orientationOwned'], { $ne: true });
      assert.equal(sparcRetrievalSelector(owned)['context.orientationOwned'], true);
      assert.notEqual(sparcRetrievalCategoryKey(owned), sparcRetrievalCategoryKey(reference));
      const labelled: SparcRetrievalCategory = { ...owned, readingLevel: 'college-freshman', supportKind: 'visual' };
      assert.deepEqual(sparcRetrievalSelector(labelled), sparcRetrievalSelector(owned));
      assert.equal(sparcRetrievalCategoryKey(labelled), sparcRetrievalCategoryKey(owned));
    }
    assert.equal(sparcRetrievalSelector({ kind: 'visual', language: 'en' })['context.orientationOwned'], undefined);
  });
  it('includes videos regardless of requested language, including unspecified language', () => {
    const reference = sparcRetrievalSelector({ kind: 'visual', language: '' });
    for (const language of ['en', 'es', 'ja']) {
      assert.deepEqual(sparcRetrievalSelector({ kind: 'visual', language }), reference);
      assert.equal(sparcRetrievalCategoryKey({ kind: 'visual', language }), sparcRetrievalCategoryKey({ kind: 'visual', language: '' }));
    }
    assert.ok(JSON.stringify(reference).includes('video'));
    assert.ok(!JSON.stringify(reference).includes('language'));
  });
  it('preserves the approved component type and question format boundaries', () => {
    assert.notDeepEqual(sparcRetrievalSelector({ kind: 'question', responseFormat: 'text' }), sparcRetrievalSelector({ kind: 'question', responseFormat: 'multiple-choice' }));
    assert.notEqual(sparcRetrievalCategoryKey({ kind: 'instruction', responseFormat: 'text' }), sparcRetrievalCategoryKey({ kind: 'feedback', responseFormat: 'text' }));
  });
});
