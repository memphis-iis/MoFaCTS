import { expect } from 'chai';
import {
  AI_CONTENT_CONTRACT_VERSION,
  AI_GENERATED_PAIR_ARRAY_SCHEMA,
  AI_GENERATED_PAIR_RESPONSE_SCHEMA,
  canonicalizeGeneratedImageStimuli,
  getAiContentSaveBlockingIssues,
  getAiContentSaveWarnings,
  validateAiContentSaveContract,
  validateGeneratedPairs,
  validateGeneratedPairResponse,
  type AiContentSaveContract,
} from './aiContentContract';

function validContract(): AiContentSaveContract {
  return {
    contractVersion: AI_CONTENT_CONTRACT_VERSION,
    mode: 'learning',
    title: 'Hand bones',
    pairs: [
      {
        id: 'pair-1',
        kind: 'image',
        stimulus: 'An unlabeled image showing the scaphoid bone.',
        response: 'Scaphoid',
        image: {
          source: 'wikimedia',
          fileName: 'scaphoid.webp',
          attribution: {
            creatorName: 'Example creator',
            sourceName: 'Wikimedia Commons',
            sourceUrl: 'https://commons.wikimedia.org/wiki/File:ArticulatedScaphoid.png',
            licenseName: 'CC BY-SA 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
          },
        },
      },
    ],
  };
}

describe('AI Content pair contract', function() {
  it('keeps an array application contract inside the provider-required object envelope', function() {
    expect(AI_GENERATED_PAIR_ARRAY_SCHEMA.type).to.equal('array');
    expect(AI_GENERATED_PAIR_RESPONSE_SCHEMA.type).to.equal('object');
    expect(AI_GENERATED_PAIR_RESPONSE_SCHEMA.required).to.deep.equal(['pairs']);
    const items = AI_GENERATED_PAIR_ARRAY_SCHEMA.items as Record<string, any>;
    expect(items.required).to.deep.equal(['kind', 'stimulus', 'response']);
    expect(items.additionalProperties).to.equal(false);
  });

  it('unwraps the provider envelope without admitting it into application state', function() {
    expect(validateGeneratedPairResponse({ pairs: [{ kind: 'text', stimulus: '2 + 2', response: '4' }] }))
      .to.deep.equal([{ kind: 'text', stimulus: '2 + 2', response: '4' }]);
    expect(() => validateGeneratedPairResponse({ pairs: [], title: 'Not allowed' })).to.throw('unsupported fields: title');
  });

  it('accepts only pair fields and rejects lesson settings from model output', function() {
    expect(validateGeneratedPairs([{ kind: 'text', stimulus: '2 + 2', response: '4' }])).to.have.length(1);
    expect(() => validateGeneratedPairs([{ kind: 'text', stimulus: '2 + 2', response: '4', title: 'Math' }]))
      .to.throw('unsupported fields: title');
    expect(() => validateGeneratedPairs({ pairs: [] })).to.throw('must be an array');
  });

  it('requires deterministic image stimuli and unique image responses', function() {
    expect(validateGeneratedPairs([{ kind: 'image', stimulus: 'image: Scaphoid', response: 'Scaphoid' }]))
      .to.deep.equal([{ kind: 'image', stimulus: 'image: Scaphoid', response: 'Scaphoid' }]);
    expect(() => validateGeneratedPairs([{ kind: 'image', stimulus: 'A scaphoid diagram', response: 'Scaphoid' }]))
      .to.throw('image stimulus must be exactly "image: Scaphoid"');
    expect(() => validateGeneratedPairs([
      { kind: 'image', stimulus: 'image: Scaphoid', response: 'Scaphoid' },
      { kind: 'image', stimulus: 'image: scaphoid', response: 'scaphoid' },
    ])).to.throw('every image response must be unique');
  });

  it('canonicalizes only the redundant image stimulus before validation', function() {
    expect(canonicalizeGeneratedImageStimuli({ pairs: [
      { kind: 'image', stimulus: 'highlight this bone', response: 'Scaphoid' },
      { kind: 'text', stimulus: '2 + 2', response: '4' },
    ] })).to.deep.equal({ pairs: [
      { kind: 'image', stimulus: 'image: Scaphoid', response: 'Scaphoid' },
      { kind: 'text', stimulus: '2 + 2', response: '4' },
    ] });
  });

  it('rejects browser-only metadata at the final server save boundary', function() {
    const contract = validContract() as unknown as Record<string, any>;
    contract.pairs[0].image.previewUrl = 'blob:browser-only';
    expect(() => validateAiContentSaveContract(contract)).to.throw('unsupported fields: previewUrl');
  });

  it('blocks unresolved images, non-WebP assets, blank fields, and incomplete Wikimedia attribution', function() {
    const contract = validContract();
    contract.title = '';
    contract.pairs[0]!.response = '';
    delete contract.pairs[0]!.image;
    contract.pairs.push({
      id: 'pair-2',
      kind: 'image',
      stimulus: 'A lunate image',
      response: 'Lunate',
      image: { source: 'wikimedia', fileName: 'lunate.png' },
    });
    const issues = getAiContentSaveBlockingIssues(contract).join(' ');
    expect(issues).to.contain('A title is required');
    expect(issues).to.contain('no correct response');
    expect(issues).to.contain('missing its required image');
    expect(issues).to.contain('must be stored as WebP');
    expect(issues).to.contain('missing source or license attribution');
  });

  it('warns without blocking when responses are duplicated', function() {
    const contract = validContract();
    contract.pairs.push({ id: 'pair-2', kind: 'text', stimulus: 'A second prompt', response: 'Scaphoid' });
    expect(getAiContentSaveBlockingIssues(contract)).to.deep.equal([]);
    expect(getAiContentSaveWarnings(contract)).to.deep.equal(['Two or more pairs use the same correct response.']);
  });
});
