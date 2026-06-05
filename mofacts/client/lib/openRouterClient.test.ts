import { expect } from 'chai';
import sinon from 'sinon';
import {
  callOpenRouterEmbeddings,
  callOpenRouterJson,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  OPENROUTER_EMBEDDINGS_URL,
} from './openRouterClient';
import {
  clearAiFlowEvents,
  getRecentAiFlowEvents,
} from './aiFlowLogger';

describe('openRouterClient', function() {
  beforeEach(function() {
    clearAiFlowEvents();
  });

  afterEach(function() {
    sinon.restore();
    clearAiFlowEvents();
  });

  it('posts structured JSON Schema requests with the provided key', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { cost: 0.001 },
    }), { status: 200 }));

    const result = await callOpenRouterJson({
      apiKey: 'sk-or-v1-test',
      model: 'openai/test-model',
      temperature: 0.2,
      requireUsageCost: true,
      messages: [{ role: 'user', content: 'Return ok.' }],
      intent: {
        title: 'MoFaCTS Test Intent',
        schemaName: 'mofacts_test_intent',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
        parse(value) {
          return value as { ok: boolean };
        },
      },
    });

    expect(result.value).to.deep.equal({ ok: true });
    expect(result.costUsd).to.equal(0.001);
    const events = getRecentAiFlowEvents();
    expect(events.map((event) => event.status)).to.deep.equal(['succeeded', 'started']);
    expect(events[0]).to.deep.include({
      provider: 'openrouter',
      status: 'succeeded',
      title: 'MoFaCTS Test Intent',
      model: 'openai/test-model',
      schemaName: 'mofacts_test_intent',
      messageCount: 1,
      httpStatus: 200,
      costUsd: 0.001,
    });
    const [url, request] = fetchStub.firstCall.args as [string, RequestInit];
    expect(url).to.equal(OPENROUTER_CHAT_COMPLETIONS_URL);
    expect((request.headers as Record<string, string>).Authorization).to.equal('Bearer sk-or-v1-test');
    const body = JSON.parse(String(request.body));
    expect(body.response_format).to.deep.equal({
      type: 'json_schema',
      json_schema: {
        name: 'mofacts_test_intent',
        strict: false,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
      },
    });
  });

  it('redacts OpenRouter keys from provider failures', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({
      error: { message: 'bad key sk-or-v1-secretvalue' },
    }), { status: 401 }));

    try {
      await callOpenRouterJson({
        apiKey: 'sk-or-v1-secretvalue',
        model: 'openai/test-model',
        messages: [{ role: 'user', content: 'Return ok.' }],
        intent: {
          title: 'MoFaCTS Test Intent',
          parse(value) {
            return value;
          },
        },
      });
      throw new Error('Expected request failure');
    } catch (error) {
      expect((error as Error).message).to.equal('bad key [redacted OpenRouter key]');
    }
    const failure = getRecentAiFlowEvents()[0];
    expect(failure).to.deep.include({
      provider: 'openrouter',
      status: 'failed',
      title: 'MoFaCTS Test Intent',
      model: 'openai/test-model',
      httpStatus: 401,
      error: 'bad key [redacted OpenRouter key]',
    });
  });

  it('reports local parser validation failures', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":false}' } }],
    }), { status: 200 }));

    try {
      await callOpenRouterJson({
        apiKey: 'test-key',
        model: 'openai/test-model',
        messages: [{ role: 'user', content: 'Return ok.' }],
        intent: {
          title: 'MoFaCTS Test Intent',
          parse() {
            throw new Error('schema validation failed');
          },
        },
      });
      throw new Error('Expected parser failure');
    } catch (error) {
      expect((error as Error).message).to.equal('schema validation failed');
    }
  });

  it('uses float encoding for embeddings', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({
      data: [
        { embedding: [1, 0] },
        { embedding: [0, 1] },
      ],
      usage: { cost: 0.0003 },
    }), { status: 200 }));

    const result = await callOpenRouterEmbeddings({
      apiKey: 'sk-or-v1-test',
      model: 'google/gemini-embedding-001',
      input: ['first idea', 'second idea'],
    });

    expect(result.embeddings).to.deep.equal([[1, 0], [0, 1]]);
    expect(result.costUsd).to.be.closeTo(0.0003, 0.0000000001);
    expect(fetchStub.callCount).to.equal(1);
    const [url, request] = fetchStub.firstCall.args as [string, RequestInit];
    expect(url).to.equal(OPENROUTER_EMBEDDINGS_URL);
    expect(JSON.parse(String(request.body))).to.deep.equal({
      model: 'google/gemini-embedding-001',
      input: ['first idea', 'second idea'],
      encoding_format: 'float',
    });
  });

  it('retries malformed successful embedding responses once', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.onFirstCall().resolves(new Response(JSON.stringify({
      error: { message: 'No successful provider responses' },
    }), { status: 200 }));
    fetchStub.onSecondCall().resolves(new Response(JSON.stringify({
      data: [{ embedding: [1, 0] }],
    }), { status: 200 }));

    const result = await callOpenRouterEmbeddings({
      apiKey: 'sk-or-v1-test',
      model: 'google/gemini-embedding-001',
      input: ['first idea'],
    });

    expect(result.embeddings).to.deep.equal([[1, 0]]);
    expect(fetchStub.callCount).to.equal(2);
  });
});
