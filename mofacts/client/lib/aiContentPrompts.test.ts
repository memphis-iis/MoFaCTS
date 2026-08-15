import { expect } from 'chai';
import {
  AI_CONTENT_AI_STAGE_IDS,
  AI_CONTENT_INTENT_SCHEMA,
  DEFAULT_AI_CONTENT_STAGE_PROMPTS,
  candidateSelectionSchema,
  imageCandidateDecisionSchema,
  validateAiContentIntent,
  validateCandidateSelection,
  validateDefinition,
  validateImageCandidateDecision,
} from './aiContentPrompts';

describe('AI Content bounded stage prompts', function() {
  it('defines one editable strict prompt for every AI stage', function() {
    expect(AI_CONTENT_AI_STAGE_IDS).to.have.length(7);
    AI_CONTENT_AI_STAGE_IDS.forEach((stage) => {
      expect(DEFAULT_AI_CONTENT_STAGE_PROMPTS[stage].systemPrompt).to.be.a('string').and.not.empty;
      expect(DEFAULT_AI_CONTENT_STAGE_PROMPTS[stage].instructions).to.be.a('string').and.not.empty;
      expect(DEFAULT_AI_CONTENT_STAGE_PROMPTS[stage].visibleOutputTokens).to.be.greaterThan(0);
    });
    expect(AI_CONTENT_INTENT_SCHEMA.additionalProperties).to.equal(false);
  });

  it('requires one universal prompt type and a list-search intent', function() {
    expect(validateAiContentIntent({
      promptType: 'image',
      responseType: 'text',
      subject: 'U.S. states',
      listSearchQuery: 'list of U.S. states outline maps',
      imageRequirement: 'plain outline map',
    }).promptType).to.equal('image');
    expect(() => validateAiContentIntent({
      promptType: 'text',
      responseType: 'text',
      subject: 'states',
      listSearchQuery: 'U.S. states',
      imageRequirement: '',
    })).to.throw('explicitly search for a list');
  });

  it('constrains selection schemas and validators to supplied opaque IDs', function() {
    expect((candidateSelectionSchema(['candidate-1']).properties as any).selectedCandidateId.enum)
      .to.deep.equal(['candidate-1', null]);
    const rankedCandidateSchema = (imageCandidateDecisionSchema(['image-1']).properties as any).rankedCandidateIds;
    expect(rankedCandidateSchema.items.enum)
      .to.deep.equal(['image-1']);
    expect(rankedCandidateSchema).not.to.have.property('uniqueItems');
    expect(() => validateCandidateSelection(
      { selectedCandidateId: 'invented', rationale: 'guess' },
      ['candidate-1'],
      'List choice',
    )).to.throw('unknown candidate ID');
    expect(() => validateImageCandidateDecision(
      { rankedCandidateIds: ['image-2'], selectedCandidateId: 'image-2', rationale: 'guess' },
      ['image-1'],
      'Image choice',
    )).to.throw('unknown candidate ID');
    expect(() => validateImageCandidateDecision(
      { rankedCandidateIds: ['image-1', 'image-2'], selectedCandidateId: 'image-2', rationale: 'guess' },
      ['image-1', 'image-2'],
      'Image choice',
    )).to.throw('first ranked candidate');
    expect(() => validateImageCandidateDecision(
      { rankedCandidateIds: ['image-1', 'image-1'], selectedCandidateId: 'image-1', rationale: 'guess' },
      ['image-1'],
      'Image choice',
    )).to.throw('duplicate candidates');
  });

  it('rejects answer-revealing definitions without substring false positives', function() {
    expect(() => validateDefinition({ prompt: 'The Alabama member of this list.' }, 'Alabama')).to.throw('reveals');
    expect(validateDefinition({ prompt: 'A domesticated feline recognized as a distinct lineage.' }, 'cat'))
      .to.contain('domesticated');
  });
});
