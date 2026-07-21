import { expect } from 'chai';
import sinon from 'sinon';
import { createOpenRouterMethods } from './openRouterMethods';

function adminDeps(isAdmin = true) {
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
});
