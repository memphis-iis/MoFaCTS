import { expect } from 'chai';
import {
  CLIENT_VERBOSITY_SETTING,
  SERVER_VERBOSITY_SETTING,
} from '../../common/loggingSettings';
import { createSystemMethods } from './systemMethods';

type SettingDocument = { _id: string; key: string; value: unknown };

function createLoggingMethodHarness() {
  const documents = new Map<string, SettingDocument>();
  let runtimeServerLevel: number | null = null;
  const DynamicSettings = {
    async upsertAsync(selector: { _id: string }, modifier: { $set: { key: string; value: unknown } }) {
      documents.set(selector._id, { _id: selector._id, ...modifier.$set });
      return 1;
    },
  };
  const methods = createSystemMethods({
    DynamicSettings,
    requireAdminUser: async () => undefined,
    setVerbosityLevel: (level: number) => {
      runtimeServerLevel = level;
    },
    serverConsole: () => undefined,
  } as any);
  return {
    documents,
    methods,
    runtimeServerLevel: () => runtimeServerLevel,
  };
}

describe('system logging setting methods', function() {
  it('persists and applies the authoritative server verbosity value', async function() {
    const harness = createLoggingMethodHarness();
    const result = await harness.methods.setVerbosity.call({ userId: 'admin-user' }, '2');

    expect(result).to.equal(2);
    expect(harness.runtimeServerLevel()).to.equal(2);
    expect(harness.documents.get(SERVER_VERBOSITY_SETTING.id)).to.deep.include({
      key: SERVER_VERBOSITY_SETTING.key,
      value: 2,
    });
  });

  it('atomically upserts the authoritative client verbosity value', async function() {
    const harness = createLoggingMethodHarness();
    const result = await harness.methods.setClientVerbosity.call({ userId: 'admin-user' }, 1);

    expect(result).to.equal(1);
    expect(harness.documents.get(CLIENT_VERBOSITY_SETTING.id)).to.deep.include({
      key: CLIENT_VERBOSITY_SETTING.key,
      value: 1,
    });
  });

  it('accepts consecutive changes without an intermediate reset', async function() {
    const harness = createLoggingMethodHarness();

    expect(await harness.methods.setVerbosity.call({ userId: 'admin-user' }, 1)).to.equal(1);
    expect(await harness.methods.setVerbosity.call({ userId: 'admin-user' }, 2)).to.equal(2);
    expect(harness.runtimeServerLevel()).to.equal(2);
    expect(harness.documents.get(SERVER_VERBOSITY_SETTING.id)?.value).to.equal(2);

    expect(await harness.methods.setClientVerbosity.call({ userId: 'admin-user' }, 1)).to.equal(1);
    expect(await harness.methods.setClientVerbosity.call({ userId: 'admin-user' }, 0)).to.equal(0);
    expect(harness.documents.get(CLIENT_VERBOSITY_SETTING.id)?.value).to.equal(0);
  });

  it('rejects malformed values instead of partially parsing them', async function() {
    const harness = createLoggingMethodHarness();

    for (const value of ['1-extra', Number.NaN, 3]) {
      try {
        await harness.methods.setVerbosity.call({ userId: 'admin-user' }, value as any);
        expect.fail(`Expected ${String(value)} to be rejected`);
      } catch (error: any) {
        expect(error.error).to.equal('invalid-value');
      }
    }
    expect(harness.documents.size).to.equal(0);
  });

});
