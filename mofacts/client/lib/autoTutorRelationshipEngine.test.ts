import { expect } from 'chai';
import sinon from 'sinon';

import {
  AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL,
  AUTO_TUTOR_RELATIONSHIP_GRAPH_VERSION,
  AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL,
  computeAutoTutorExpectationRelationshipsFromEmbeddings,
  computeAutoTutorRelationshipCacheKey,
  generateAutoTutorExpectationRelationships,
  selectAutoTutorRelationshipGenerationKey,
} from './autoTutorRelationshipEngine';
import {
  OPENROUTER_EMBEDDINGS_URL,
} from './openRouterClient';

describe('autoTutorRelationshipEngine', function() {
  afterEach(function() {
    sinon.restore();
  });

  it('computes pairwise cosine relationships from normalized vectors', function() {
    const relationships = computeAutoTutorExpectationRelationshipsFromEmbeddings([
      { id: 'E1', proposition: 'One idea', assertion: 'One idea' },
      { id: 'E2', proposition: 'Related idea', assertion: 'Related idea' },
    ], [
      [1, 0],
      [0.6, 0.8],
    ]);

    expect(relationships).to.deep.equal({
      E1: { E2: 0.6 },
      E2: { E1: 0.6 },
    });
  });

  it('selects a TDF key before a user key without exposing either in provenance', function() {
    expect(selectAutoTutorRelationshipGenerationKey({
      tdfOpenRouterApiKey: ' tdf-key ',
      userOpenRouterApiKey: ' user-key ',
    })).to.deep.equal({
      apiKey: 'tdf-key',
      sourceKeyType: 'tdf',
    });
    expect(selectAutoTutorRelationshipGenerationKey({
      tdfOpenRouterApiKey: '',
      userOpenRouterApiKey: ' user-key ',
    })).to.deep.equal({
      apiKey: 'user-key',
      sourceKeyType: 'user',
    });
  });

  it('changes the relationship cache key when authored expectation content changes', function() {
    const original = [
      { id: 'E1', label: 'connection', proposition: 'NVC supports connection.', assertion: 'NVC supports connection.' },
      { id: 'E2', label: 'request', proposition: 'A request leaves room for no.', assertion: 'A request leaves room for no.' },
    ];
    const changed = [
      original[0]!,
      { id: 'E2', label: 'request', proposition: 'A request is concrete and negotiable.', assertion: 'A request leaves room for no.' },
    ];

    expect(computeAutoTutorRelationshipCacheKey(original, AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL))
      .to.not.equal(computeAutoTutorRelationshipCacheKey(changed, AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL));
  });

  it('falls back from the primary embedding model and records provenance without secrets', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch' as any);
    fetchStub.onFirstCall().resolves(new Response(JSON.stringify({
      error: { message: 'No successful provider responses' },
    }), { status: 404 }));
    fetchStub.onSecondCall().resolves(new Response(JSON.stringify({
      data: [
        { embedding: [1, 0] },
        { embedding: [0.5, 0.5] },
      ],
      usage: { cost: 0.001 },
    }), { status: 200 }));

    const result = await generateAutoTutorExpectationRelationships({
      expectations: [
        { id: 'E1', label: 'first', proposition: 'First concept.', assertion: 'First concept.' },
        { id: 'E2', label: 'second', proposition: 'Second concept.', assertion: 'Second concept.' },
      ],
    }, {
      apiKey: 'test-openrouter-key',
      sourceKeyType: 'user',
      generatedAt: '2026-06-05T00:00:00.000Z',
    });

    expect(fetchStub.callCount).to.equal(2);
    const [firstUrl, firstRequest] = fetchStub.firstCall.args as [string, RequestInit];
    expect(firstUrl).to.equal(OPENROUTER_EMBEDDINGS_URL);
    expect((firstRequest.headers as Record<string, string>).Authorization).to.equal('Bearer test-openrouter-key');
    expect(JSON.parse(String(firstRequest.body)).model).to.equal(AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL);
    const [, secondRequest] = fetchStub.secondCall.args as [string, RequestInit];
    expect(JSON.parse(String(secondRequest.body)).model).to.equal(AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL);
    expect(result.expectationRelationships.E1?.E2).to.be.closeTo(0.707107, 0.000001);
    expect(result.expectationRelationshipProvenance).to.include({
      graphVersion: AUTO_TUTOR_RELATIONSHIP_GRAPH_VERSION,
      generatedAt: '2026-06-05T00:00:00.000Z',
      model: AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL,
      metric: 'cosine_similarity_normalized_vectors',
      scoreTransform: 'clamp_negative_to_zero',
      sourceKeyType: 'user',
    });
    expect(result.expectationRelationshipProvenance.attemptedModels).to.deep.equal([
      AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL,
      AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL,
    ]);
    expect(result.expectationRelationshipProvenance.cacheKey).to.be.a('string').and.not.equal('');
    expect(JSON.stringify(result.expectationRelationshipProvenance)).to.not.contain('test-openrouter-key');
  });
});
