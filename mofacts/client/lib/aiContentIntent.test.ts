import { expect } from 'chai';
import { materializeAiDraftOutput, parseStrictAiJson, validateAiAuthoringIntent } from './aiContentIntent';

describe('AI content authoring intent', function() {
  const stateMapRequest = 'I want to practice identifying the fifty U.S. states from map pictures that show this state in its location with nothing labeled. The prompt would be the picture and the response would be the name of the state.';

  it('accepts exact image evidence and the requested fifty-item contract', function() {
    const intent = validateAiAuthoringIntent({
      requestedItemCount: 50,
      promptModality: 'image',
      responseModality: 'typed',
      imagesExplicitlyRequested: true,
      imageRequestEvidence: ['map pictures', 'The prompt would be the picture'],
      imageConstraints: ['show this state in its location', 'nothing labeled'],
    }, stateMapRequest);

    expect(intent.requestedItemCount).to.equal(50);
    expect(intent.promptModality).to.equal('image');
    expect(intent.imageRequestEvidence).to.deep.equal(['map pictures', 'The prompt would be the picture']);
  });

  it('rejects image authorization evidence that is not present in the request', function() {
    expect(() => validateAiAuthoringIntent({
      requestedItemCount: 50,
      promptModality: 'image',
      responseModality: 'typed',
      imagesExplicitlyRequested: true,
      imageRequestEvidence: ['use photographs'],
      imageConstraints: [],
    }, stateMapRequest)).to.throw('exact source-text evidence');
  });

  it('rejects image authorization that contradicts an explicit negation', function() {
    expect(() => validateAiAuthoringIntent({
      requestedItemCount: 20,
      promptModality: 'image',
      responseModality: 'typed',
      imagesExplicitlyRequested: true,
      imageRequestEvidence: ['images'],
      imageConstraints: [],
    }, 'Create twenty text prompts with no images.')).to.throw('explicit image negation');
  });

  it('materializes stable pending media slots before image resolution', function() {
    const items = Array.from({ length: 50 }, (_, index) => ({
      prompt: { mediaQuery: `State ${index + 1} location map`, mediaConstraints: ['nothing labeled'] },
      response: { correctResponse: `State ${index + 1}` },
      sourceType: 'freeResponse' as const,
    }));
    const output = materializeAiDraftOutput({ lessonName: 'States', items }, {
      requestedItemCount: 50,
      promptModality: 'image',
      responseModality: 'typed',
      imagesExplicitlyRequested: true,
      imageRequestEvidence: ['map pictures'],
      imageConstraints: ['nothing labeled'],
    });
    expect(output.items).to.have.length(50);
    expect(output.items?.every((item) => item.id && item.prompt?.mediaSlot?.status === 'pending')).to.equal(true);
  });

  it('does not extract JSON from prose or fenced output', function() {
    expect(() => parseStrictAiJson('Here is the result: {"items":[]}', 'AI item response')).to.throw('schema-conforming JSON');
  });
});
