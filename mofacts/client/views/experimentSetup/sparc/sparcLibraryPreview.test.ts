import { strict as assert } from 'node:assert';
import { sparcLibraryPreviewNode } from './sparcLibraryPreview';

describe('Matched instruction library preview', () => {
  it('renders both paired components with their existing learner node identities', () => {
    const preview = sparcLibraryPreviewNode({ id: 'pair', kind: 'instruction', move: 'instruction.dynamic.explanation-visual-question.text',
      content: { text: 'The explanation.', support: { text: 'The teaching image.', figure: { assetId: 'image123', description: 'The teaching image.' } } } });
    assert.ok('children' in preview);
    if (!('children' in preview)) throw new Error('Missing paired preview');
    assert.deepEqual(preview.children.map(node => node.component), ['explanation', 'richContent']);
    assert.deepEqual(preview.children.map(node => node.value), ['The explanation.', 'The teaching image.']);
    assert.equal(preview.children[1]!.figure?.assetId, 'image123');
  });
});
