import { expect } from 'chai';
import {
  extractJsonObject,
  validateAiOutput,
  validateAutoTutorOutput,
} from './aiContentValidation';

describe('aiContentValidation', function() {
  it('extracts JSON from markdown fences and surrounding prose', function() {
    const parsed = extractJsonObject([
      'Here is the result:',
      '```json',
      '{"lessonName":"Photosynthesis","items":[]}',
      '```',
    ].join('\n'));

    expect(parsed).to.deep.equal({ lessonName: 'Photosynthesis', items: [] });
  });

  it('extracts a balanced JSON object without being confused by braces inside strings', function() {
    const parsed = extractJsonObject('prefix {"lessonName":"Braces { inside } text","items":[]} suffix');

    expect(parsed).to.deep.equal({ lessonName: 'Braces { inside } text', items: [] });
  });

  it('normalizes valid item output and rejects malformed or duplicate items with warnings', function() {
    const result = validateAiOutput({
      lessonName: 'Spanish Basics',
      promptType: 'not-real',
      responseType: 'multiple-choice',
      visibility: 'public',
      tags: ['spanish'],
      items: [
        {
          prompt: { text: 'rojo' },
          response: { correctResponse: 'red', incorrectResponses: ['blue', 'green'] },
          sourceType: 'choice',
        },
        {
          prompt: { text: 'rojo' },
          response: { correctResponse: 'red', incorrectResponses: ['blue', 'green'] },
          sourceType: 'choice',
        },
        {
          prompt: { text: 'azul' },
          response: { correctResponse: 'blue', incorrectResponses: ['blue', 'green'] },
          sourceType: 'choice',
        },
        {
          prompt: {},
          response: { correctResponse: 'unused', incorrectResponses: ['a', 'b'] },
          sourceType: 'choice',
        },
      ],
    });

    expect(result.output.lessonName).to.equal('Spanish Basics');
    expect(result.output.promptType).to.equal('text');
    expect(result.output.responseType).to.equal('multiple-choice');
    expect(result.output.visibility).to.equal('public');
    expect(result.output.items).to.have.length(1);
    expect(result.rejectedItems.map((entry) => entry.reason)).to.deep.equal([
      'Item duplicates an earlier prompt/answer pair.',
      'Multiple-choice item repeats the correct answer as an incorrect response.',
      'Item has no usable prompt.',
    ]);
    expect(result.warnings).to.deep.equal([
      'Unsupported promptType "not-real" replaced with "text".',
      '3 generated items rejected during validation.',
    ]);
  });

  it('throws when no usable item survives validation', function() {
    expect(() => validateAiOutput({
      lessonName: 'Empty',
      items: [
        { prompt: { text: '' }, response: { correctResponse: '' } },
      ],
    })).to.throw('AI response did not contain any usable prompt/response items.');
  });

  it('normalizes valid AutoTutor output and rejects incomplete misconceptions', function() {
    const result = validateAutoTutorOutput({
      lessonName: 'Krebs Tutor',
      topic: 'Krebs cycle',
      expectations: [
        { id: 'E1', label: 'Acetyl-CoA', proposition: 'Acetyl-CoA enters the Krebs cycle.', assertion: 'Acetyl-CoA enters the Krebs cycle.' },
        { id: 'E2', proposition: 'The cycle produces electron carriers.' },
      ],
      expectationRelationships: {
        E1: { E2: 0.7 },
        E2: { E1: 0.6 },
      },
      expectationRelationshipProvenance: {
        graphVersion: 'autotutor-expectation-relationships-v1',
        generatedAt: '2026-06-05T00:00:00.000Z',
        model: 'google/gemini-embedding-001',
        attemptedModels: ['google/gemini-embedding-001'],
        metric: 'cosine_similarity_normalized_vectors',
        scoreTransform: 'clamp_negative_to_zero',
        sourceKeyType: 'user',
        cacheKey: 'abc123',
      },
      misconceptions: [
        {
          id: 'M1',
          misconception: 'The Krebs cycle directly makes most ATP.',
          correction: 'It mainly produces electron carriers.',
          repairQuestion: 'What does the cycle mainly produce?',
          contrastWithExpectations: ['E2'],
        },
        { id: 'M2', misconception: 'Incomplete misconception' },
      ],
      requiredExpectationCount: 10,
      maxActiveMisconceptions: 5,
      visibility: 'public',
    });

    expect(result.output.expectations.map((entry) => entry.id)).to.deep.equal(['E1', 'E2']);
    expect(result.output.requiredExpectationCount).to.equal(2);
    expect(result.output.maxActiveMisconceptions).to.equal(1);
    expect(result.output.misconceptions).to.have.length(1);
    expect(result.output.expectationRelationships).to.deep.equal({
      E1: { E2: 0.7 },
      E2: { E1: 0.6 },
    });
    expect(result.output.expectationRelationshipProvenance?.cacheKey).to.equal('abc123');
    expect(result.output.visibility).to.equal('public');
    expect(result.warnings).to.deep.equal(['1 AutoTutor misconception rejected during validation.']);
  });

  it('throws on duplicate AutoTutor expectation and misconception IDs', function() {
    expect(() => validateAutoTutorOutput({
      expectations: [
        { id: 'E1', proposition: 'One', assertion: 'One' },
        { id: 'E1', proposition: 'Two', assertion: 'Two' },
      ],
    })).to.throw('duplicate expectation ID "E1"');

    expect(() => validateAutoTutorOutput({
      expectations: [
        { id: 'E1', proposition: 'One', assertion: 'One' },
      ],
      misconceptions: [
        { id: 'M1', misconception: 'Wrong one', correction: 'Right one', repairQuestion: 'Repair?' },
        { id: 'M1', misconception: 'Wrong two', correction: 'Right two', repairQuestion: 'Repair?' },
      ],
    })).to.throw('duplicate misconception ID "M1"');
  });
});
