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
    expect(result.requestBody).to.deep.equal(body);
    expect(body).not.to.have.property('reasoning');
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

  it('serializes enabled-default and explicit reasoning efforts', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    const responseBody = JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    });
    fetchStub.onFirstCall().resolves(new Response(responseBody, { status: 200 }));
    fetchStub.onSecondCall().resolves(new Response(responseBody, { status: 200 }));

    const baseOptions = {
      apiKey: 'sk-or-v1-test',
      model: 'openai/test-model',
      messages: [{ role: 'user' as const, content: 'Return ok.' }],
      intent: {
        title: 'MoFaCTS Reasoning Test',
        parse(value: unknown) {
          return value;
        },
      },
    };

    await callOpenRouterJson({ ...baseOptions, reasoningLevel: 'default' });
    await callOpenRouterJson({ ...baseOptions, reasoningLevel: 'high' });

    const defaultBody = JSON.parse(String((fetchStub.firstCall.args[1] as RequestInit).body));
    const highBody = JSON.parse(String((fetchStub.secondCall.args[1] as RequestInit).body));
    expect(defaultBody).not.to.have.property('temperature');
    expect(highBody).not.to.have.property('temperature');
    expect(defaultBody.reasoning).to.deep.equal({ enabled: true });
    expect(highBody.reasoning).to.deep.equal({ effort: 'high' });
  });

  it('requires strict-schema support while allowing compatible providers for the same model', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200 }));

    await callOpenRouterJson({
      apiKey: 'sk-or-v1-test',
      model: 'openai/test-model',
      messages: [{ role: 'user', content: 'Return ok.' }],
      intent: {
        title: 'MoFaCTS Strict Test',
        schemaName: 'mofacts_strict_test',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
        strictSchema: true,
        parse(value) {
          return value;
        },
      },
    });

    const body = JSON.parse(String((fetchStub.firstCall.args[1] as RequestInit).body));
    expect(body).not.to.have.property('reasoning');
    expect(body.response_format.json_schema.strict).to.equal(true);
    expect(body.provider).to.deep.equal({ require_parameters: true, allow_fallbacks: true });
  });

  it('adds only a session id and records sanitized prompt-cache usage', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    const responseBody = JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      cache_discount: 0.0004,
      usage: {
        prompt_tokens: 100,
        completion_tokens: 5,
        total_tokens: 105,
        cost: 0.001,
        prompt_tokens_details: {
          cached_tokens: 75,
          cache_write_tokens: 20,
        },
      },
    });
    fetchStub.onFirstCall().resolves(new Response(responseBody, { status: 200 }));
    fetchStub.onSecondCall().resolves(new Response(responseBody, { status: 200 }));
    const baseOptions = {
      apiKey: 'test-key',
      model: 'openai/test-model',
      messages: [{ role: 'user' as const, content: 'Return ok.' }],
      intent: { title: 'Cache test', parse: (value: unknown) => value },
    };

    const withoutSession = await callOpenRouterJson(baseOptions);
    const withSession = await callOpenRouterJson({ ...baseOptions, sessionId: 'opaque-session' });
    const withoutBody = JSON.parse(String((fetchStub.firstCall.args[1] as RequestInit).body));
    const withBody = JSON.parse(String((fetchStub.secondCall.args[1] as RequestInit).body));
    expect(withoutBody).not.to.have.property('session_id');
    expect(withBody.session_id).to.equal('opaque-session');
    delete withBody.session_id;
    expect(withBody).to.deep.equal(withoutBody);
    expect(withoutSession.usage).to.deep.equal(withSession.usage);
    expect(withSession.usage).to.deep.equal({
      promptTokens: 100,
      cachedPromptTokens: 75,
      cacheWritePromptTokens: 20,
      cacheReadRatio: 0.75,
      completionTokens: 5,
      totalTokens: 105,
      costUsd: 0.001,
      cacheDiscountUsd: 0.0004,
    });
    expect(getRecentAiFlowEvents()[0]).to.deep.include({
      cachedPromptTokens: 75,
      cacheWritePromptTokens: 20,
      cacheReadRatio: 0.75,
      cacheDiscountUsd: 0.0004,
      sessionIdApplied: true,
    });
    expect(JSON.stringify(getRecentAiFlowEvents()[0])).not.to.contain('opaque-session');
    expect(JSON.stringify(getRecentAiFlowEvents()[0])).not.to.contain('Return ok.');
  });

  it('ignores missing and malformed cache usage without affecting response parsing', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.onFirstCall().resolves(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      cache_discount: 'not-a-number',
      usage: {
        prompt_tokens: 0,
        prompt_tokens_details: {
          cached_tokens: -1,
          cache_write_tokens: 'unknown',
        },
      },
    }), { status: 200 }));
    fetchStub.onSecondCall().resolves(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200 }));
    const options = {
      apiKey: 'test-key',
      model: 'openai/test-model',
      messages: [{ role: 'user' as const, content: 'Return ok.' }],
      intent: { title: 'Malformed cache usage test', parse: (value: unknown) => value },
    };

    const malformed = await callOpenRouterJson(options);
    const missing = await callOpenRouterJson(options);

    expect(malformed.value).to.deep.equal({ ok: true });
    expect(malformed.usage).to.deep.equal({ promptTokens: 0 });
    expect(missing.value).to.deep.equal({ ok: true });
    expect(missing.usage).to.deep.equal({});
  });

  it('omits unsupported optional parameters from strict requests with known model metadata', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200 }));

    await callOpenRouterJson({
      apiKey: 'sk-or-v1-test',
      model: 'openai/test-model',
      temperature: 0.2,
      maxTokens: 64,
      supportedParameters: ['response_format', 'max_tokens'],
      messages: [{ role: 'user', content: 'Return ok.' }],
      intent: {
        title: 'MoFaCTS Strict Test',
        schemaName: 'mofacts_strict_test',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
        strictSchema: true,
        parse(value) {
          return value;
        },
      },
    });

    const body = JSON.parse(String((fetchStub.firstCall.args[1] as RequestInit).body));
    expect(body).not.to.have.property('temperature');
    expect(body).to.have.property('max_tokens', 64);
    expect(body.response_format.json_schema.strict).to.equal(true);
    expect(body.provider).to.deep.equal({ require_parameters: true, allow_fallbacks: true });
  });

  it('fails locally when a strict request needs structured output unsupported by known model metadata', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');

    try {
      await callOpenRouterJson({
        apiKey: 'sk-or-v1-test',
        model: 'openai/test-model',
        supportedParameters: ['max_tokens'],
        messages: [{ role: 'user', content: 'Return ok.' }],
        intent: {
          title: 'MoFaCTS Strict Test',
          schemaName: 'mofacts_strict_test',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
          },
          strictSchema: true,
          parse(value) {
            return value;
          },
        },
      });
      throw new Error('Expected unsupported structured output to fail');
    } catch (error) {
      expect((error as Error).message).to.contain('does not support response_format');
    }
    expect(fetchStub.callCount).to.equal(0);
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
      expect((error as Error).message).to.equal(
        'OpenRouter request failed with HTTP 401: bad key [redacted OpenRouter key]',
      );
    }
    const failure = getRecentAiFlowEvents()[0];
    expect(failure).to.deep.include({
      provider: 'openrouter',
      status: 'failed',
      title: 'MoFaCTS Test Intent',
      model: 'openai/test-model',
      httpStatus: 401,
      error: 'OpenRouter request failed with HTTP 401: bad key [redacted OpenRouter key]',
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

  it('attaches provider completion diagnostics to malformed JSON responses without exposing content', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({
      model: 'deepseek/deepseek-v4-flash',
      provider: 'Example Provider',
      choices: [{
        finish_reason: 'length',
        native_finish_reason: 'max_tokens',
        message: { content: 'not json', reasoning: 'internal reasoning' },
      }],
      usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
    }), { status: 200 }));

    try {
      await callOpenRouterJson({
        apiKey: 'test-key',
        model: 'deepseek/deepseek-v4-flash',
        messages: [{ role: 'user', content: 'Return ok.' }],
        intent: {
          title: 'MoFaCTS malformed response test',
          parse(value) {
            return value;
          },
        },
      });
      throw new Error('Expected malformed JSON to fail');
    } catch (error) {
      expect((error as Error).message).to.equal('AI response did not include a valid JSON value.');
      expect((error as { diagnostics?: unknown }).diagnostics).to.deep.include({
        providerName: 'Example Provider',
        responseModel: 'deepseek/deepseek-v4-flash',
        finishReason: 'length',
        nativeFinishReason: 'max_tokens',
        messageContentCharacters: 8,
        reasoningCharacters: 18,
        promptTokens: 40,
        completionTokens: 20,
        totalTokens: 60,
      });
      expect(JSON.stringify((error as { diagnostics?: unknown }).diagnostics)).not.to.contain('not json');
      expect(JSON.stringify((error as { diagnostics?: unknown }).diagnostics)).not.to.contain('internal reasoning');
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
