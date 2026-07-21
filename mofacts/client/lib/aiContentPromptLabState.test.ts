import { expect } from 'chai';
import { copyablePromptLabPairs } from './aiContentPromptLabState';

describe('AI Content Prompt Lab handoff', function() {
  it('copies only a successfully validated pair array', function() {
    const json = copyablePromptLabPairs({
      parsedContent: { pairs: [{ kind: 'image', stimulus: 'image: Scaphoid', response: 'Scaphoid' }] },
      responseBody: { secretIrrelevantProviderData: true },
    });
    expect(JSON.parse(json)).to.deep.equal([
      { kind: 'image', stimulus: 'image: Scaphoid', response: 'Scaphoid' },
    ]);
    expect(json).not.to.contain('secretIrrelevantProviderData');
  });

  it('rejects an invalid result instead of copying it', function() {
    expect(() => copyablePromptLabPairs({ parsedContent: { pairs: { invalid: true } } })).to.throw('must be an array');
  });
});
