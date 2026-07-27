import { expect } from 'chai';
import sinon from 'sinon';
import { createOpenRouterMethods } from './openRouterMethods';
import { openRouterSessionCorrelationId } from '../lib/openRouterPrefixCaching';

function adminDeps(isAdmin = true, openRouterPrefixCachingEnabled?: boolean) {
  return {
    serverConsole: () => undefined,
    getMethodAuthorizationDeps: () => ({
      userIsInRoleAsync: async () => isAdmin,
    }),
    openRouterModelCatalogService: {
      getCatalog: async () => [{
        id: 'openai/admin-model',
        name: 'Admin model',
        reasoning: { mandatory: false, supportedLevels: null, defaultLevel: 'medium' as const },
      }],
    },
    getApiKeyResolutionDeps: () => ({
      getUserById: async () => {
        throw new Error('Admin Tests must not read personal OpenRouter settings');
      },
      getTdfById: async () => null,
      getAdminApiKeySettings: async () => ({
        value: {
          openRouter: {
            keyEncrypted: 'encrypted-admin-key',
            model: 'openai/admin-model',
            reasoningLevel: 'high',
            prefixCachingEnabled: openRouterPrefixCachingEnabled === true,
          },
        },
      }),
      hasHistoryWithTdf: async () => false,
      userIsInRoleAsync: async () => isAdmin,
      decryptData: (value: string) => value === 'encrypted-admin-key' ? 'admin-key' : value,
    }),
  };
}

describe('openRouterMethods Admin Tests configuration', function() {
  afterEach(function() {
    sinon.restore();
  });

  it('creates stable opaque session correlation ids', function() {
    expect(openRouterSessionCorrelationId('opaque-session'))
      .to.equal(openRouterSessionCorrelationId('opaque-session'));
    expect(openRouterSessionCorrelationId('opaque-session'))
      .to.not.equal(openRouterSessionCorrelationId('another-opaque-session'));
    expect(openRouterSessionCorrelationId('opaque-session')).to.not.contain('opaque-session');
  });

  it('forwards a valid session id only when prefix caching is enabled', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch').callsFake(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 12,
        prompt_tokens_details: { cached_tokens: 6, cache_write_tokens: 2 },
      },
    }), { status: 200 }));
    const params = {
      sessionId: 'opaque-session',
      messages: [{ role: 'user', content: 'Return ok.' }],
      intent: { title: 'Prefix caching test' },
    };

    const disabledResult = await createOpenRouterMethods(adminDeps(true, false)).callAdminTestResolvedOpenRouterJson.call(
      { userId: 'admin-user' },
      params,
    );
    const enabledResult = await createOpenRouterMethods(adminDeps(true, true)).callAdminTestResolvedOpenRouterJson.call(
      { userId: 'admin-user' },
      params,
    );

    const disabledBody = JSON.parse(String((fetchStub.firstCall.args[1] as RequestInit).body));
    const enabledBody = JSON.parse(String((fetchStub.secondCall.args[1] as RequestInit).body));
    expect(disabledBody).not.to.have.property('session_id');
    expect(disabledResult.sessionIdApplied).to.equal(false);
    expect(enabledBody.session_id).to.equal('opaque-session');
    expect(enabledResult.sessionIdApplied).to.equal(true);
    delete enabledBody.session_id;
    expect(enabledBody).to.deep.equal(disabledBody);
    expect(enabledResult.usage).to.deep.equal({
      promptTokens: 10,
      cachedPromptTokens: 6,
      cacheWritePromptTokens: 2,
      cacheReadRatio: 0.6,
      completionTokens: 2,
      totalTokens: 12,
    });
  });

  it('rejects blank and oversized session ids before calling OpenRouter', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    const method = createOpenRouterMethods(adminDeps(true, true)).callAdminTestResolvedOpenRouterJson;
    const base = {
      messages: [{ role: 'user', content: 'Return ok.' }],
      intent: { title: 'Prefix caching validation test' },
    };
    for (const sessionId of ['   ', 'x'.repeat(257)]) {
      try {
        await method.call({ userId: 'admin-user' }, { ...base, sessionId });
        throw new Error('Expected invalid sessionId to fail');
      } catch (error) {
        expect(String((error as { reason?: unknown }).reason || (error as Error).message)).to.contain('sessionId');
      }
    }
    expect(fetchStub.callCount).to.equal(0);
  });

  it('uses the global Admin OpenRouter settings instead of the signed-in admin user settings', async function() {
    const methods = createOpenRouterMethods(adminDeps());

    const capability = await methods.getAdminTestOpenRouterCapability.call({ userId: 'admin-user' });

    expect(capability).to.deep.equal({
      configured: true,
      source: 'admin',
      model: 'openai/admin-model',
      reasoningLevel: 'high',
    });
  });

  it('runs an editable strict request with the admin key without returning credentials', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(JSON.stringify({
      model: 'openai/admin-model:resolved',
      choices: [{ message: { content: '[{"kind":"text","stimulus":"2 + 2","response":"4"}]' } }],
      usage: { prompt_tokens: 10, completion_tokens: 12, cost: 0.001 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    try {
      const methods = createOpenRouterMethods(adminDeps());
      const request = {
        model: 'openai/admin-model',
        messages: [{ role: 'user', content: 'Return one pair.' }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'pair_test',
            strict: true,
            schema: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'stimulus', 'response'], properties: { kind: { type: 'string' }, stimulus: { type: 'string' }, response: { type: 'string' } } } },
          },
        },
        provider: { require_parameters: true, allow_fallbacks: false },
        stream: false,
      };
      const result = await methods.callAdminTestOpenRouterRequest.call({ userId: 'admin-user' }, request);
      const fetchOptions = fetchStub.firstCall.args[1] as RequestInit;
      const sentBody = JSON.parse(String(fetchOptions.body));

      expect((fetchOptions.headers as Record<string, string>).Authorization).to.equal('Bearer admin-key');
      expect(sentBody).to.deep.include({ model: 'openai/admin-model', provider: request.provider, stream: false });
      expect(sentBody).not.to.have.property('reasoning');
      expect(sentBody).not.to.have.property('temperature');
      expect(result.validation).to.deep.equal({ ok: true, errors: [] });
      expect(result.model).to.equal('openai/admin-model:resolved');
      expect(result.requestedModel).to.equal('openai/admin-model');
      expect(result.usage).to.deep.equal({ prompt_tokens: 10, completion_tokens: 12, cost: 0.001 });
      expect(result.costUsd).to.equal(0.001);
      expect(JSON.stringify(result)).not.to.include('admin-key');
      expect(result.requestWithoutCredentials).to.equal(request);
    } finally {
      fetchStub.restore();
    }
  });

  it('does not allow non-admins to run Prompt Lab requests', async function() {
    const methods = createOpenRouterMethods(adminDeps(false));
    try {
      await methods.callAdminTestOpenRouterRequest.call({ userId: 'learner-user' }, { stream: false });
      throw new Error('Expected the admin authorization check to fail');
    } catch (error) {
      expect(String((error as { reason?: unknown }).reason || (error as Error).message)).to.contain('Only admins');
    }
  });

  it('preserves sanitized provider status details for resolved request failures', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(JSON.stringify({
      error: {
        message: 'Provider temporarily rate-limited upstream.',
        code: 429,
        metadata: { provider_name: 'Example Provider' },
      },
    }), { status: 429, headers: { 'content-type': 'application/json' } }));
    try {
      const methods = createOpenRouterMethods(adminDeps());
      await methods.callAdminTestResolvedOpenRouterJson.call({ userId: 'admin-user' }, {
        messages: [{ role: 'user', content: 'Return one pair.' }],
        intent: {
          title: 'Strict failure test',
          schemaName: 'strict_failure_test',
          strictSchema: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
          },
        },
      });
      throw new Error('Expected the provider request to fail');
    } catch (error) {
      const meteorError = error as { error?: unknown; details?: unknown };
      expect(meteorError.error).to.equal('openrouter-request-failed');
      expect(fetchStub.callCount).to.equal(1);
      const details = JSON.parse(String(meteorError.details || '{}'));
      expect(details).to.deep.include({
        httpStatus: 429,
        diagnostics: {
          providerName: 'Example Provider',
          providerErrorCode: 429,
        },
      });
    } finally {
      fetchStub.restore();
    }
  });

});
