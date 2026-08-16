import { expect } from 'chai';
import {
  AI_CONTENT_AI_STAGE_IDS,
  AI_CONTENT_INTENT_SCHEMA,
  DEFAULT_AI_CONTENT_STAGE_PROMPTS,
  candidateSelectionSchema,
  generatedTableSchema,
  imageCandidateDecisionSchema,
  sourceFieldSelectionSchema,
  regionSelectionSchema,
  validateAiContentIntent,
  validateCandidateSelection,
  validateDefinition,
  validateGeneratedTable,
  validateImageCandidateDecision,
  validateRegionSelection,
  validateSourceFieldSelection,
} from './aiContentPrompts';

describe('AI Content bounded stage prompts', function() {
  it('defines one editable strict prompt for every AI stage', function() {
    expect(AI_CONTENT_AI_STAGE_IDS).to.have.length(9);
    AI_CONTENT_AI_STAGE_IDS.forEach((stage) => {
      expect(DEFAULT_AI_CONTENT_STAGE_PROMPTS[stage].systemPrompt).to.be.a('string').and.not.empty;
      expect(DEFAULT_AI_CONTENT_STAGE_PROMPTS[stage].instructions).to.be.a('string').and.not.empty;
      expect(DEFAULT_AI_CONTENT_STAGE_PROMPTS[stage].visibleOutputTokens).to.be.greaterThan(0);
    });
    expect(DEFAULT_AI_CONTENT_STAGE_PROMPTS['select-list-page'].systemPrompt)
      .to.include('even when its title does not begin with "List of"');
    expect(DEFAULT_AI_CONTENT_STAGE_PROMPTS['interpret-request'].systemPrompt)
      .to.include('return only the core list subject in subject');
    expect(DEFAULT_AI_CONTENT_STAGE_PROMPTS['interpret-request'].systemPrompt)
      .to.include('application constructs the Wikipedia list search deterministically');
    expect(AI_CONTENT_INTENT_SCHEMA.additionalProperties).to.equal(false);
    expect(AI_CONTENT_INTENT_SCHEMA.properties).not.to.have.property('listSearchQuery');
  });

  it('keeps list-search construction outside the AI-owned intent', function() {
    expect(validateAiContentIntent({
      promptType: 'image',
      responseType: 'text',
      textPairingStrategy: 'not-applicable',
      subject: 'U.S. states',
      imageRequirement: 'plain outline map',
    }).promptType).to.equal('image');
    expect(() => validateAiContentIntent({
      promptType: 'image',
      responseType: 'text',
      textPairingStrategy: 'not-applicable',
      subject: 'U.S. states',
      listSearchQuery: 'U.S. states',
      imageRequirement: 'plain outline map',
    })).to.throw('unsupported fields: listSearchQuery');
  });

  it('recognizes source-field mapping and constrains both selected columns', function() {
    expect(validateAiContentIntent({
      promptType: 'text',
      responseType: 'text',
      textPairingStrategy: 'source-field-mapping',
      subject: 'U.S. state capitals',
      imageRequirement: '',
    }).textPairingStrategy).to.equal('source-field-mapping');
    const schema = sourceFieldSelectionSchema(['state', 'capital']);
    expect((schema.properties as any).promptFieldId.enum).to.deep.equal(['state', 'capital', null]);
    expect(() => validateSourceFieldSelection({
      promptFieldId: 'state', responseFieldId: 'state', rationale: 'same',
    }, ['state', 'capital'])).to.throw('must be different');
    expect(() => validateSourceFieldSelection({
      promptFieldId: 'invented', responseFieldId: 'capital', rationale: 'guess',
    }, ['state', 'capital'])).to.throw('unknown prompt field');
  });

  it('validates one bounded generated table without duplicate prompts', function() {
    const intent = validateAiContentIntent({
      promptType: 'text',
      responseType: 'text',
      textPairingStrategy: 'generated-table',
      subject: 'division facts through 9',
      imageRequirement: '',
      tableInstructions: 'Generate divisors and quotients from 1 through 9.',
      tableScopeSummary: 'The 81 inverse facts for the 1 through 9 multiplication table.',
      expectedItemCount: 81,
      tableIssue: '',
    });
    expect(intent.expectedItemCount).to.equal(81);
    const schema = generatedTableSchema(2);
    expect((schema.properties as any).pairs.minItems).to.equal(2);
    expect((schema.properties as any).pairs.maxItems).to.equal(2);
    expect(validateGeneratedTable({
      scopeSummary: 'Two facts.',
      pairs: [{ prompt: '2 ÷ 1', response: '2' }, { prompt: '2 ÷ 2', response: '1' }],
    }, 2).pairs).to.have.length(2);
    expect(() => validateGeneratedTable({
      scopeSummary: 'Duplicate facts.',
      pairs: [{ prompt: '2 ÷ 1', response: '2' }, { prompt: ' 2 ÷ 1 ', response: '2' }],
    }, 2)).to.throw('same prompt');
  });

  it('requires an exact count and unambiguous direction for a supplied table', function() {
    expect(() => validateAiContentIntent({
      promptType: 'text',
      responseType: 'text',
      textPairingStrategy: 'provided-table',
      subject: 'supplied facts',
      imageRequirement: '',
      tableInstructions: 'Format the supplied table.',
      tableScopeSummary: 'Author-supplied rows.',
      expectedItemCount: null,
      tableIssue: 'The prompt and response columns are ambiguous.',
    })).to.throw('columns are ambiguous');
  });

  it('constrains selection schemas and validators to supplied opaque IDs', function() {
    expect((candidateSelectionSchema(['candidate-1']).properties as any).selectedCandidateId.enum)
      .to.deep.equal(['candidate-1', null]);
    expect((candidateSelectionSchema(['candidate-1'], false).properties as any).selectedCandidateId)
      .to.deep.equal({ type: 'string', enum: ['candidate-1'] });
    expect((regionSelectionSchema(['region-1'], false).properties as any).selectedRegionId)
      .to.deep.equal({ type: 'string', enum: ['region-1'] });
    const rankedCandidateSchema = (imageCandidateDecisionSchema(['image-1']).properties as any).rankedCandidateIds;
    expect(rankedCandidateSchema.items.enum)
      .to.deep.equal(['image-1']);
    expect(rankedCandidateSchema).not.to.have.property('uniqueItems');
    expect(() => validateCandidateSelection(
      { selectedCandidateId: 'invented', rationale: 'guess' },
      ['candidate-1'],
      'List choice',
    )).to.throw('unknown candidate ID');
    expect(() => validateCandidateSelection(
      { selectedCandidateId: null, rationale: 'none' },
      ['candidate-1'],
      'List choice',
      false,
    )).to.throw('must select one supplied candidate ID');
    expect(() => validateRegionSelection(
      { selectedRegionId: null, rationale: 'none' },
      ['region-1'],
      false,
    )).to.throw('must select one supplied region ID');
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
