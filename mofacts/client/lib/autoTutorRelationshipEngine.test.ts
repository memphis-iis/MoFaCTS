import { expect } from 'chai';
import { AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL, computeAutoTutorExpectationRelationshipsFromEmbeddings, computeAutoTutorRelationshipCacheKey, generateAutoTutorExpectationRelationships, selectAutoTutorRelationshipGenerationKey } from './autoTutorRelationshipEngine';

describe('autoTutorRelationshipEngine runtime helper', function() {
  it('computes pairwise relationships from embeddings', function() {
    expect(computeAutoTutorExpectationRelationshipsFromEmbeddings([
      { id: 'E1', proposition: 'One idea', assertion: 'One idea' },
      { id: 'E2', proposition: 'Related idea', assertion: 'Related idea' },
    ], [[1, 0], [0.6, 0.8]])).to.deep.equal({ E1: { E2: 0.6 }, E2: { E1: 0.6 } });
  });

  it('selects a TDF key before a user key', function() {
    expect(selectAutoTutorRelationshipGenerationKey({ tdfOpenRouterApiKey: ' tdf-key ', userOpenRouterApiKey: ' user-key ' })).to.deep.equal({ apiKey: 'tdf-key', sourceKeyType: 'tdf' });
  });

  it('keeps runtime relationship generation independent from AI authoring types', async function() {
    const expectations = [
      { id: 'E1', label: 'first', proposition: 'First concept.', assertion: 'First concept.' },
      { id: 'E2', label: 'second', proposition: 'Second concept.', assertion: 'Second concept.' },
    ];
    const result = await generateAutoTutorExpectationRelationships({ expectations }, {
      apiKey: '__server_resolved_openrouter__', sourceKeyType: 'user', generatedAt: '2026-06-05T00:00:00.000Z', embeddingModels: ['test/model'],
      callEmbeddings: async () => ({ embeddings: [[1, 0], [0.5, 0.5]], model: 'test/model', responseBody: {} }),
    });
    expect(result.expectationRelationships.E1?.E2).to.be.closeTo(0.707107, 0.000001);
    expect(result.expectationRelationshipProvenance.cacheKey).to.equal(computeAutoTutorRelationshipCacheKey(expectations, 'test/model'));
    expect(computeAutoTutorRelationshipCacheKey(expectations, AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL)).not.to.equal(result.expectationRelationshipProvenance.cacheKey);
  });
});
