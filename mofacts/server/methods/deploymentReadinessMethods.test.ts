import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import { createDeploymentReadinessMethods } from './deploymentReadinessMethods';

const validSelfHostedMongoUrl = [
  'mongodb://',
  'mofacts_app',
  ':',
  'secret',
  '@mongodb:27017/MoFACT-meteor3?authSource=MoFACT-meteor3',
].join('');

async function makeLocalStorageSettings() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-readiness-test-'));
  const dynamicAssetsPath = path.join(base, 'dynamic-assets');
  const h5pContentPath = path.join(base, 'h5p-content');
  const h5pLibrariesPath = path.join(base, 'h5p-libraries');
  await fs.mkdir(dynamicAssetsPath);
  await fs.mkdir(h5pContentPath);
  await fs.mkdir(h5pLibrariesPath);
  return {
    storage: {
      backend: 'local',
      local: {
        dynamicAssetsPath,
        h5pContentPath,
        h5pLibrariesPath,
      },
    },
  };
}

describe('deploymentReadinessMethods', function() {
  const savedEnv = { ...process.env };
  let savedSettings: unknown;

  beforeEach(function() {
    savedSettings = Meteor.settings;
  });

  afterEach(function() {
    process.env = { ...savedEnv };
    (Meteor as any).settings = savedSettings;
  });

  it('requires a logged-in admin', async function() {
    const methods = createDeploymentReadinessMethods({
      Roles: { userIsInRoleAsync: async () => false },
      Tdfs: { rawDatabase: () => ({ command: async () => undefined }) },
      usersCollection: { findOneAsync: async () => null },
      redisBoundary: { enabled: false, async ping() { return undefined; } },
    });

    try {
      await methods.deploymentReadiness.call({});
      throw new Error('Expected readiness to reject anonymous users');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('not-authorized');
    }
  });

  it('rejects logged-in non-admin users', async function() {
    const methods = createDeploymentReadinessMethods({
      Roles: { userIsInRoleAsync: async () => false },
      Tdfs: { rawDatabase: () => ({ command: async () => undefined }) },
      usersCollection: { findOneAsync: async () => null },
      redisBoundary: { enabled: false, async ping() { return undefined; } },
    });

    try {
      await methods.deploymentReadiness.call({ userId: 'teacher-user' });
      throw new Error('Expected readiness to reject non-admin users');
    } catch (error) {
      expect(error).to.be.instanceOf(Meteor.Error);
      expect((error as Meteor.Error).error).to.equal('not-authorized');
    }
  });

  it('returns passing checks for a valid local-storage self-hosted configuration', async function() {
    process.env.METEOR_SETTINGS_WORKAROUND = '/run/mofacts/settings.json';
    process.env.ROOT_URL = 'https://mofacts.operator.test';
    process.env.MONGO_URL = validSelfHostedMongoUrl;
    process.env.EXPECTED_MONGO_DB_NAME = 'MoFACT-meteor3';
    process.env.MOFACTS_SELF_HOSTED = 'true';
    process.env.REDIS_URL = '';

    (Meteor as any).settings = {
      owner: 'admin@operator.test',
      ROOT_URL: 'https://mofacts.operator.test',
      encryptionKey: '0123456789abcdef0123456789abcdef',
      prod: false,
      enableEmail: false,
      initRoles: {
        admins: ['admin@operator.test'],
        teachers: [],
      },
      auth: {
        allowPublicSignup: true,
        requireEmailVerification: false,
        argon2Enabled: true,
      },
      openCore: {
        requireRedis: false,
      },
      ...(await makeLocalStorageSettings()),
    };

    const methods = createDeploymentReadinessMethods({
      Roles: { userIsInRoleAsync: async () => true },
      Tdfs: { rawDatabase: () => ({ command: async () => undefined }) },
      usersCollection: { findOneAsync: async () => ({ _id: 'admin-user' }) },
      redisBoundary: { enabled: false, async ping() { return undefined; } },
    });

    const result = await methods.deploymentReadiness.call({ userId: 'admin-user' });

    expect(result.ok).to.equal(true);
    expect(result.checks.map((check) => check.name)).to.include.members([
      'settings.source',
      'settings.required',
      'mongo.connection',
      'firstAdmin.account',
      'storage.local.dynamicAssetsPath',
    ]);
  });
});
