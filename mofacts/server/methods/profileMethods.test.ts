import { expect } from 'chai';
import { createProfileMethods } from './profileMethods';

type UpdateCall = {
  selector: Record<string, unknown>;
  modifier: Record<string, any>;
};

function createDeps(updateCalls: UpdateCall[] = []) {
  return {
    usersCollection: {
      findOneAsync: async () => null,
      updateAsync: async (selector: Record<string, unknown>, modifier: Record<string, any>) => {
        updateCalls.push({ selector, modifier });
        return 1;
      },
    },
    encryptData: (value: string) => `encrypted:${value}`,
    decryptData: (value: string) => value.replace(/^encrypted:/, ''),
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
});
