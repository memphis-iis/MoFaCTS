import { expect } from 'chai';
import {
  buildWikimediaTopicPrompt,
  planWikimediaTopics,
  validateWikimediaTopics,
  WIKIMEDIA_TOPIC_ARRAY_SCHEMA,
  WIKIMEDIA_TOPIC_RESPONSE_SCHEMA,
} from './aiContentWikimediaTopics';

describe('AI Content Wikimedia topic planning', function() {
  it('keeps an array topic contract inside the provider-required object envelope', function() {
    expect(WIKIMEDIA_TOPIC_ARRAY_SCHEMA).to.include({ type: 'array', minItems: 1, maxItems: 5 });
    expect(WIKIMEDIA_TOPIC_RESPONSE_SCHEMA).to.include({ type: 'object', additionalProperties: false });
    expect(buildWikimediaTopicPrompt('hand bones', ['Scaphoid', 'Lunate']))
      .to.contain('1. Scaphoid\n2. Lunate');
  });

  it('accepts one to five unique collection topics and rejects URLs or file names', function() {
    expect(validateWikimediaTopics(['Bones of the hand', 'Carpal bones']))
      .to.deep.equal(['Bones of the hand', 'Carpal bones']);
    expect(() => validateWikimediaTopics(['Carpal bones', 'carpal bones'])).to.throw('must be unique');
    expect(() => validateWikimediaTopics(['File:ArticulatedScaphoid.png'])).to.throw('not a URL or file name');
  });

  it('plans collection topics without an AI-generated item list for authoritative enumeration', async function() {
    expect(buildWikimediaTopicPrompt('bones of the hand', [])).to.contain('Wikipedia must enumerate the requested set');
    const result = await planWikimediaTopics('bones of the hand', [], 'test/model', async () => ({
      rawContent: '{"topics":["Hand"]}',
      parsedContent: { topics: ['Hand'] },
    }));
    expect(result.topics).to.deep.equal(['Hand']);
  });

  it('repairs one invalid response and exposes both complete attempts', async function() {
    const requests: Record<string, unknown>[] = [];
    const responses = [
      { rawContent: '{}', parsedContent: {}, responseBody: { id: 'first' }, model: 'test/model', source: 'server' },
      { rawContent: '{"topics":["Bones of the hand","Carpal bones"]}', parsedContent: { topics: ['Bones of the hand', 'Carpal bones'] }, responseBody: { id: 'second' }, model: 'test/model', source: 'server' },
    ];
    const result = await planWikimediaTopics('hand bones', ['Scaphoid', 'Lunate'], 'test/model', async (_name, request) => {
      requests.push(request);
      return responses.shift();
    });
    expect(result.topics).to.deep.equal(['Bones of the hand', 'Carpal bones']);
    expect(result.attempts).to.have.length(2);
    expect(result.attempts[0]!.validation.ok).to.equal(false);
    expect(result.attempts[1]!.validation.ok).to.equal(true);
    expect(JSON.stringify(requests[1])).to.contain('REJECTED TOPIC RESPONSE');
  });

  it('stops after one failed repair', async function() {
    let calls = 0;
    let message = '';
    try {
      await planWikimediaTopics('hand bones', ['Scaphoid'], 'test/model', async () => {
        calls += 1;
        return { rawContent: '{}', parsedContent: {} };
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(calls).to.equal(2);
    expect(message).to.contain('failed after one repair request');
  });
});
