import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import {
  resolvePreferredApiKey,
  type ApiKeyResolutionDeps,
} from './apiKeyResolution';

function createDeps(overrides: Partial<ApiKeyResolutionDeps> = {}): ApiKeyResolutionDeps {
  return {
    getUserById: async () => ({
      speechAPIKey: 'enc-user-speech',
      ttsAPIKey: 'enc-user-tts',
      services: { openRouter: { keyEncrypted: 'enc-user-openrouter' } },
    }),
    getTdfById: async () => ({
      ownerId: 'owner',
      content: {
        tdfs: {
          tutor: {
            setspec: {
              userselect: 'true',
              speechAPIKey: 'enc-tdf-speech',
              textToSpeechAPIKey: 'enc-tdf-tts',
              openRouterApiKey: 'enc-tdf-openrouter',
            },
          },
        },
      },
    }),
    getAdminApiKeySettings: async () => ({
      value: {
        googleSpeech: { keyEncrypted: 'enc-admin-speech' },
        googleTts: { keyEncrypted: 'enc-admin-tts' },
        openRouter: { keyEncrypted: 'enc-admin-openrouter', model: 'openai/test' },
      },
    }),
    hasHistoryWithTdf: async () => false,
    userIsInRoleAsync: async () => false,
    decryptData: (value: string) => value.replace(/^enc-/, ''),
    ...overrides,
  };
}

describe('apiKeyResolution', function() {
  it('prefers TDF keys over user and admin alternatives for all providers', async function() {
    for (const kind of ['speech', 'tts', 'openrouter'] as const) {
      const result = await resolvePreferredApiKey(createDeps(), {
        userId: 'learner',
        tdfId: 'tdf',
        kind,
      });
      expect(result.source).to.equal('tdf');
      expect(result.apiKey).to.equal(`tdf-${kind === 'openrouter' ? 'openrouter' : kind === 'speech' ? 'speech' : 'tts'}`);
    }
  });

  it('uses user keys before admin alternatives when the TDF has no key', async function() {
    const deps = createDeps({
      getTdfById: async () => ({
        ownerId: 'owner',
        content: { tdfs: { tutor: { setspec: { userselect: 'true' } } } },
      }),
    });

    const result = await resolvePreferredApiKey(deps, {
      userId: 'learner',
      tdfId: 'tdf',
      kind: 'openrouter',
    });

    expect(result.source).to.equal('user');
    expect(result.apiKey).to.equal('user-openrouter');
  });

  it('uses admin alternatives when TDF and user keys are absent', async function() {
    const deps = createDeps({
      getTdfById: async () => ({
        ownerId: 'owner',
        content: { tdfs: { tutor: { setspec: { userselect: 'true' } } } },
      }),
      getUserById: async () => ({}),
    });

    const result = await resolvePreferredApiKey(deps, {
      userId: 'learner',
      tdfId: 'tdf',
      kind: 'tts',
    });

    expect(result.source).to.equal('admin');
    expect(result.apiKey).to.equal('admin-tts');
  });

  it('does not continue to user or admin alternatives when TDF access is denied', async function() {
    const deps = createDeps({
      getTdfById: async () => ({
        ownerId: 'owner',
        content: { tdfs: { tutor: { setspec: { userselect: 'false' } } } },
      }),
    });

    try {
      await resolvePreferredApiKey(deps, {
        userId: 'learner',
        tdfId: 'private-tdf',
        kind: 'speech',
      });
      throw new Error('Expected access denial');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal(403);
    }
  });
});
