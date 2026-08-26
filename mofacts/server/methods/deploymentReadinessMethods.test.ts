import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Meteor } from 'meteor/meteor';
import { expect } from 'chai';
import { createDeploymentReadinessMethods, inspectTdfExpressions } from './deploymentReadinessMethods';

const emptyTdfCursor = () => ({ fetchAsync: async () => [] });

const validSelfHostedMongoUrl = [
  'mongodb://',
  'mofacts_app',
  ':',
  'secret',
  '@mongodb:27017/MoFACT-meteor3?authSource=MoFACT-meteor3',
].join('');
const validEncryptionKeyFixture = [
  'mofacts',
  'readiness',
  'fixture',
  'key',
  '0001',
].join('-');

async function makeLocalStorageSettings() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-readiness-test-'));
  const dynamicAssetsPath = path.join(base, 'dynamic-assets');
  const localBackupPath = path.join(base, 'backups');
  await fs.mkdir(dynamicAssetsPath);
  await fs.mkdir(localBackupPath);
  return {
    storage: {
      backend: 'local',
      local: {
        dynamicAssetsPath,
      },
    },
    openCore: {
      requireRedis: false,
      backups: {
        localBackupPath,
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
      Tdfs: { rawDatabase: () => ({ command: async () => undefined }), find: emptyTdfCursor },
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
      Tdfs: { rawDatabase: () => ({ command: async () => undefined }), find: emptyTdfCursor },
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

  it('batches the live TDF expression inventory and returns bounded paths without formula text', async function() {
    const docs = Array.from({ length: 201 }, (_, index) => ({
      _id: `tdf-${String(index).padStart(3, '0')}`,
      content: { tdfs: { tutor: { unit: index === 200 ? [{ learningsession: {
        calculateProbability: 'p.probability = process.env.SECRET; return p',
      } }] : [] } } },
    }));
    const Tdfs = {
      find(selector: any, options: any) {
        const after = selector?._id?.$gt;
        const selected = docs.filter((doc) => after === undefined || doc._id > after).slice(0, options.limit);
        return { fetchAsync: async () => selected };
      },
    };
    const result = await inspectTdfExpressions(Tdfs);
    expect(result).to.include({ tdfCount: 201, expressionCount: 1, failureCount: 1 });
    expect(result.failures).to.have.length(1);
    expect(result.failures[0]).to.include({
      tdfId: 'tdf-200',
      fieldPath: 'tdfs.tutor.unit[0].learningsession.calculateProbability',
    });
    expect(JSON.stringify(result.failures)).not.to.include('SECRET');
  });

  it('returns passing checks for a valid session-storage self-hosted configuration', async function() {
    process.env.METEOR_SETTINGS_FILE = '/run/mofacts/settings.json';
    process.env.ROOT_URL = 'https://mofacts.operator.test';
    process.env.MONGO_URL = validSelfHostedMongoUrl;
    process.env.EXPECTED_MONGO_DB_NAME = 'MoFACT-meteor3';
    process.env.MOFACTS_MONGO_REPLICA_SET_NAME = 'mofacts-rs';
    process.env.METEOR_REACTIVITY_ORDER = 'changeStreams';
    process.env.DDP_TRANSPORT = 'sockjs';
    process.env.MOFACTS_SELF_HOSTED = 'true';
    process.env.REDIS_URL = '';

    (Meteor as any).settings = {
      owner: 'admin@operator.test',
      ROOT_URL: 'https://mofacts.operator.test',
      encryptionKey: validEncryptionKeyFixture,
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
      public: {
        packages: {
          accounts: {
            clientStorage: 'session',
          },
        },
      },
      ...(await makeLocalStorageSettings()),
    };

    const methods = createDeploymentReadinessMethods({
      Roles: { userIsInRoleAsync: async () => true },
      Tdfs: {
        find: emptyTdfCursor,
        rawDatabase: () => ({
          databaseName: 'MoFACT-meteor3',
          command: async (command: Record<string, unknown>) => {
            if ('buildInfo' in command) {
              return { version: '8.0.0' };
            }
            if ('connectionStatus' in command) {
              return { authInfo: { authenticatedUsers: [{ user: 'app', db: 'MoFACT-meteor3' }] } };
            }
            if ('hello' in command) {
              return { ok: 1, setName: 'mofacts-rs' };
            }
            return { ok: 1 };
          },
        }),
      },
      usersCollection: { findOneAsync: async () => ({ _id: 'admin-user' }) },
      redisBoundary: { enabled: false, async ping() { return undefined; } },
    });

    const result = await methods.deploymentReadiness.call({ userId: 'admin-user' });

    expect(
      result.ok,
      JSON.stringify(result.checks.filter((readinessCheck) => readinessCheck.status !== 'pass'), null, 2),
    ).to.equal(true);
    expect(result.checks.map((check) => check.name)).to.include.members([
      'settings.source',
      'settings.required',
      'mongo.connection',
      'mongo.reactivity',
      'firstAdmin.account',
      'tdf.expressions',
      'storage.local.dynamicAssetsPath',
    ]);
  });
});
