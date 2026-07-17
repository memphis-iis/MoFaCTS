import { expect } from 'chai';
import { createOpenRouterMethods } from './openRouterMethods';

describe('openRouterMethods Admin Tests configuration', function() {
  it('uses the global Admin OpenRouter settings instead of the signed-in admin user settings', async function() {
    const methods = createOpenRouterMethods({
      serverConsole: () => undefined,
      getMethodAuthorizationDeps: () => ({
        userIsInRoleAsync: async () => true,
      }),
      openRouterModelCatalogService: {
        getCatalog: async () => [{
          id: 'openai/admin-model',
          name: 'Admin model',
          reasoning: { mandatory: false, supportedLevels: null, defaultLevel: 'medium' },
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
        userIsInRoleAsync: async () => true,
        decryptData: (value: string) => value === 'encrypted-admin-key' ? 'admin-key' : value,
      }),
    });

    const capability = await methods.getAdminTestOpenRouterCapability.call({ userId: 'admin-user' });

    expect(capability).to.deep.equal({
      configured: true,
      source: 'admin',
      model: 'openai/admin-model',
      reasoningLevel: 'high',
    });
  });
});
