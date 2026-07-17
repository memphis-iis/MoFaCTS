import { expect } from 'chai';
import { enforceAiImageAuthorization, sourceExplicitlyRequestsImages } from './aiContentImagePolicy';
import { validateAiOutput } from './aiContentValidation';

describe('aiContentImagePolicy', function() {
  it('does not infer image permission from a naturally visual topic or model-selected prompt type', function() {
    const validation = validateAiOutput({
      promptType: 'text-image',
      items: [{
        prompt: { text: 'Smallest unit of matter.', imgSrc: 'https://example.test/atom.png', attribution: { sourceName: 'Atom' } },
        response: { correctResponse: 'atom' },
      }],
    });

    const authorized = enforceAiImageAuthorization(validation, 'Make the prompt the definition and the response the term.', 0);

    expect(authorized.output.promptType).to.equal('text');
    expect(authorized.output.items[0]!.prompt).to.deep.equal({ text: 'Smallest unit of matter.' });
    expect(authorized.warnings).to.include('Removed 1 unrequested generated image.');
  });

  it('recognizes uploads as image permission and honors explicit negative instructions', function() {
    expect(sourceExplicitlyRequestsImages('Create identification cards from these photos.')).to.equal(true);
    expect(sourceExplicitlyRequestsImages('Do not add any images.')).to.equal(false);
    const validation = validateAiOutput({
      promptType: 'text-image',
      items: [{ prompt: { text: 'Identify this.', imgSrc: 'bird.webp' }, response: { correctResponse: 'warbler' } }],
    });
    expect(enforceAiImageAuthorization(validation, 'Use the uploaded files.', 1).output.items[0]!.prompt!.imgSrc).to.equal('bird.webp');
  });
});
