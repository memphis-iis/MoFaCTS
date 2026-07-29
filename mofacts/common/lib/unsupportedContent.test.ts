import { strict as assert } from 'node:assert';

import { assertNoH5PContent, containsH5PContent, UnsupportedH5PContentError } from './unsupportedContent';

describe('unsupported content', function() {
  it('rejects nested H5P authoring while allowing ordinary display content', function() {
    assert.equal(containsH5PContent({ setspec: { clusters: [{ stims: [{ display: { h5p: {} } }] }] } }), true);
    assert.throws(() => assertNoH5PContent({ display: { h5p: {} } }), /no longer supported/);
    assert.doesNotThrow(() => assertNoH5PContent({ display: { text: 'Prompt' } }));
    try {
      assertNoH5PContent({ display: { h5p: {} } });
      assert.fail('expected H5P content to be rejected');
    } catch (error) {
      assert.ok(error instanceof UnsupportedH5PContentError);
      assert.equal((error as UnsupportedH5PContentError).code, 'unsupported-h5p-content');
    }
  });
});
