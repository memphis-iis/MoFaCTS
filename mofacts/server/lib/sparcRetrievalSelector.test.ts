import { strict as assert } from 'node:assert';
import { sparcRetrievalSelector } from './sparcRetrievalSelector';

describe('Matched instruction retrieval categories', () => {
  it('separates whole instructions by support type and excludes unpaired entries', () => {
    for (const supportKind of [undefined, 'written', 'visual'] as const) {
      const selector = sparcRetrievalSelector({ kind: 'instruction', readingLevel: 'unbiased', responseFormat: 'text', ...(supportKind ? { supportKind } : {}) });
      assert.equal(selector.kind, 'instruction');
      assert.deepEqual(selector['context.supportKind'], supportKind ?? { $exists: false });
      assert.equal(selector['content.figure'], undefined);
      assert.equal(selector['content.video'], undefined);
    }
  });
});
