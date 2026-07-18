import { expect } from 'chai';
import { createProfileMethods } from './profileMethods';

type UpdateCall = {
  selector: Record<string, unknown>;
  modifier: Record<string, any>;
};

function createDeps(
  updateCalls: UpdateCall[] = [],
  existingUser: any = null,
  catalog: any[] = [{
    id: 'openai/test-model',
    name: 'Test model',
    reasoning: { mandatory: false, supportedLevels: null, defaultLevel: 'medium' },
  }],
) {
  return {
    usersCollection: {
      findOneAsync: async () => existingUser,
      updateAsync: async (selector: Record<string, unknown>, modifier: Record<string, any>) => {
        updateCalls.push({ selector, modifier });
        return 1;
      },
    },
    Tdfs: {
      findOneAsync: async (): Promise<any> => null,
    },
    encryptData: (value: string) => `encrypted:${value}`,
    decryptData: (value: string) => value.replace(/^encrypted:/, ''),
    openRouterModelCatalogService: {
      getCatalog: async () => catalog,
    },
  };
}

describe('profile methods', function() {
  it('saves supported UI locale preferences on the user profile', async function() {
    const updateCalls: UpdateCall[] = [];
    const methods = createProfileMethods(createDeps(updateCalls));

    await methods.updateOwnProfile.call({ userId: 'user-1' }, {
      name: 'Ada',
      displayName: 'Ada',
      uiLocale: 'es',
    });

    expect(updateCalls).to.have.length(1);
    expect(updateCalls[0]?.selector).to.deep.equal({ _id: 'user-1' });
    expect(updateCalls[0]?.modifier.$set['profile.uiLocale']).to.equal('es');
  });

  it('requires content owners to keep a public display name', async function() {
    const updateCalls: UpdateCall[] = [];
    const deps = createDeps(updateCalls);
    deps.Tdfs.findOneAsync = async () => ({ _id: 'tdf-1' });
    const methods = createProfileMethods(deps);

    let thrown: any;
    try {
      await methods.updateOwnProfile.call({ userId: 'user-1' }, {
        name: 'Ada',
        displayName: '',
        uiLocale: 'en',
      });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown?.error).to.equal('content-creator-display-name-required');
    expect(updateCalls).to.have.length(0);
  });

  it('rejects unsupported UI locale preferences without substituting another locale', async function() {
    const updateCalls: UpdateCall[] = [];
    const methods = createProfileMethods(createDeps(updateCalls));

    let thrown: unknown;
    try {
      await methods.updateOwnProfile.call({ userId: 'user-1' }, {
        name: 'Ada',
        displayName: 'Ada',
        uiLocale: 'de',
      });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect((thrown as Error).message).to.equal('Unsupported UI locale "de"');
    expect(updateCalls).to.have.length(0);
  });

  it('saves top-level UI locale changes without rewriting the rest of the profile', async function() {
    const updateCalls: UpdateCall[] = [];
    const methods = createProfileMethods(createDeps(updateCalls));

    await methods.updateOwnUiLocale.call({ userId: 'user-1' }, {
      uiLocale: 'fr',
    });

    expect(updateCalls).to.have.length(1);
    expect(updateCalls[0]?.selector).to.deep.equal({ _id: 'user-1' });
    expect(updateCalls[0]?.modifier.$set['profile.uiLocale']).to.equal('fr');
    expect(updateCalls[0]?.modifier.$set).not.to.have.property('profile.name');
    expect(updateCalls[0]?.modifier.$set).not.to.have.property('profile.displayName');
  });

  it('rejects unsupported top-level UI locale changes without substituting another locale', async function() {
    const updateCalls: UpdateCall[] = [];
    const methods = createProfileMethods(createDeps(updateCalls));

    let thrown: unknown;
    try {
      await methods.updateOwnUiLocale.call({ userId: 'user-1' }, {
        uiLocale: 'de',
      });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect((thrown as Error).message).to.equal('Unsupported UI locale "de"');
    expect(updateCalls).to.have.length(0);
  });

  it('persists the selected OpenRouter reasoning level with the user model', async function() {
    const updateCalls: UpdateCall[] = [];
    const methods = createProfileMethods(createDeps(updateCalls));

    await methods.updateOwnOpenRouterSettings.call({ userId: 'user-1' }, {
      model: 'openai/test-model',
      reasoningLevel: 'high',
    });

    expect(updateCalls).to.have.length(1);
    expect(updateCalls[0]?.modifier.$set['profile.openRouterDefaultModel']).to.equal('openai/test-model');
    expect(updateCalls[0]?.modifier.$set['profile.openRouterReasoningLevel']).to.equal('high');
  });

  it('normalizes an absent user OpenRouter reasoning level to none', async function() {
    const updateCalls: UpdateCall[] = [];
    const methods = createProfileMethods(createDeps(updateCalls));

    await methods.updateOwnOpenRouterSettings.call({ userId: 'user-1' }, {
      model: 'openai/test-model',
    });

    expect(updateCalls[0]?.modifier.$set['profile.openRouterReasoningLevel']).to.equal('none');
  });

  it('rejects an unsupported user OpenRouter reasoning level without writing settings', async function() {
    const updateCalls: UpdateCall[] = [];
    const methods = createProfileMethods(createDeps(updateCalls));

    let thrown: unknown;
    try {
      await methods.updateOwnOpenRouterSettings.call({ userId: 'user-1' }, {
        model: 'openai/test-model',
        reasoningLevel: 'extreme',
      });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect(updateCalls).to.have.length(0);
  });

  it('does not persist none for a model whose live catalog requires reasoning', async function() {
    const updateCalls: UpdateCall[] = [];
    const methods = createProfileMethods(createDeps(updateCalls, null, [{
      id: 'openai/required-reasoning',
      name: 'Required reasoning',
      reasoning: { mandatory: true, supportedLevels: ['low', 'medium'], defaultLevel: 'medium' },
    }]));

    let thrown: unknown;
    try {
      await methods.updateOwnOpenRouterSettings.call({ userId: 'user-1' }, {
        model: 'openai/required-reasoning',
        reasoningLevel: 'none',
      });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect(updateCalls).to.have.length(0);
  });

  it('rejects a submitted profile model that is unavailable in the live catalog', async function() {
    const updateCalls: UpdateCall[] = [];
    const methods = createProfileMethods(createDeps(updateCalls));

    let thrown: unknown;
    try {
      await methods.updateOwnOpenRouterSettings.call({ userId: 'user-1' }, {
        model: 'openai/unavailable-model',
        reasoningLevel: 'none',
      });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(Error);
    expect(updateCalls).to.have.length(0);
  });

  it('returns none for an older user profile with no stored reasoning level', async function() {
    const methods = createProfileMethods(createDeps([], {
      profile: {
        openRouterDefaultModel: 'openai/test-model',
        openRouterHasKey: true,
      },
    }));

    const result = await methods.getOwnOpenRouterSettings.call({ userId: 'user-1' });

    expect(result).to.deep.include({
      model: 'openai/test-model',
      reasoningLevel: 'none',
      hasOpenRouterKey: true,
    });
  });
});
