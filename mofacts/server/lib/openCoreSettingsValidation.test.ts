import { expect } from 'chai';
import { validateOpenCoreSettings } from './openCoreSettingsValidation';

const validSelfHostedMongoUrl = [
  'mongodb://',
  'mofacts_app',
  ':',
  'secret',
  '@mongodb:27017/MoFACT-meteor3?authSource=MoFACT-meteor3',
].join('');
const validEncryptionKeyFixture = [
  'mofacts',
  'validation',
  'fixture',
  'key',
  '0001',
].join('-');

const completeSettings = {
  owner: 'admin@operator.test',
  ROOT_URL: 'https://mofacts.operator.test',
  encryptionKey: validEncryptionKeyFixture,
  prod: true,
  enableEmail: true,
  MAIL_URL: 'smtp://smtp-user:smtp-password@mail.operator.test:587',
  emailFrom: 'MoFaCTS <no-reply@operator.test>',
  emailReplyTo: 'admin@operator.test',
  initRoles: {
    admins: ['admin@operator.test'],
    teachers: [],
  },
  auth: {
    allowPublicSignup: true,
    requireEmailVerification: true,
    argon2Enabled: true,
  },
  public: {
    packages: {
      accounts: {
        clientStorage: 'session',
      },
    },
  },
  openCore: {
    requireRedis: true,
  },
};

const completeEnv = {
  ROOT_URL: 'https://mofacts.operator.test',
  MONGO_URL: validSelfHostedMongoUrl,
  EXPECTED_MONGO_DB_NAME: 'MoFACT-meteor3',
  MOFACTS_MONGO_REPLICA_SET_NAME: 'mofacts-rs',
  METEOR_REACTIVITY_ORDER: 'polling',
  DDP_TRANSPORT: 'sockjs',
  MOFACTS_SELF_HOSTED: 'true',
  REDIS_URL: 'redis://redis:6379/0',
};

describe('open-core settings validation', function() {
  it('accepts complete self-hosted settings', function() {
    const result = validateOpenCoreSettings(completeSettings, completeEnv);
    expect(result.ok).to.equal(true);
    expect(result.issues).to.deep.equal([]);
  });

  it('requires first-admin and owner settings', function() {
    const result = validateOpenCoreSettings({
      ...completeSettings,
      owner: '',
      initRoles: { admins: [] },
    }, completeEnv);
    expect(result.ok).to.equal(false);
    expect(result.issues.map((issue) => issue.path)).to.include('owner');
    expect(result.issues.map((issue) => issue.path)).to.include('initRoles.admins');
  });

  it('rejects placeholder values', function() {
    const result = validateOpenCoreSettings({
      ...completeSettings,
      ROOT_URL: 'https://your-domain.example.org',
    }, {
      ...completeEnv,
      ROOT_URL: 'https://your-domain.example.org',
    });
    expect(result.ok).to.equal(false);
    expect(result.issues.some((issue) => issue.path === 'ROOT_URL')).to.equal(true);
  });

  it('treats MONGO_URL as an opaque required connection input', function() {
    const result = validateOpenCoreSettings(completeSettings, {
      ...completeEnv,
      MONGO_URL: 'opaque-to-connected-driver-validation',
    });
    expect(result.ok).to.equal(true);
  });

  it('requires the replica-set identity for self-hosted MongoDB', function() {
    const result = validateOpenCoreSettings(completeSettings, {
      ...completeEnv,
      MOFACTS_MONGO_REPLICA_SET_NAME: '',
    });
    expect(result.ok).to.equal(false);
    expect(result.issues.map((issue) => issue.path)).to.include('MOFACTS_MONGO_REPLICA_SET_NAME');
  });

  it('requires the documented per-tab Accounts storage setting', function() {
    const result = validateOpenCoreSettings({
      ...completeSettings,
      public: {},
    }, completeEnv);
    expect(result.ok).to.equal(false);
    expect(result.issues.map((issue) => issue.path)).to.include('public.packages.accounts.clientStorage');
  });

  it('requires the contained Meteor 3.5 transport and reactivity settings', function() {
    const result = validateOpenCoreSettings(completeSettings, {
      ...completeEnv,
      METEOR_REACTIVITY_ORDER: 'changeStreams,polling',
      DDP_TRANSPORT: 'uws',
    });
    expect(result.ok).to.equal(false);
    expect(result.issues.map((issue) => issue.path)).to.include('METEOR_REACTIVITY_ORDER');
    expect(result.issues.map((issue) => issue.path)).to.include('DDP_TRANSPORT');
  });

  it('accepts the explicit isolated Change Streams qualification settings', function() {
    const result = validateOpenCoreSettings(completeSettings, {
      ...completeEnv,
      MOFACTS_CHANGE_STREAMS_ENABLED: 'true',
      MOFACTS_CHANGE_STREAMS_QUALIFICATION: 'true',
      METEOR_REACTIVITY_ORDER: 'changeStreams,polling',
    });
    expect(result.ok).to.equal(true);
    expect(result.issues).to.deep.equal([]);
  });

  it('accepts Change Streams outside the test-only qualification mode', function() {
    const result = validateOpenCoreSettings(completeSettings, {
      ...completeEnv,
      MOFACTS_CHANGE_STREAMS_ENABLED: 'true',
      METEOR_REACTIVITY_ORDER: 'changeStreams,polling',
    });
    expect(result.ok).to.equal(true);
    expect(result.issues).to.deep.equal([]);
  });

  it('rejects a Change Streams enablement gate without the exact driver order', function() {
    const result = validateOpenCoreSettings(completeSettings, {
      ...completeEnv,
      MOFACTS_CHANGE_STREAMS_ENABLED: 'true',
    });
    expect(result.ok).to.equal(false);
    expect(result.issues.map((issue) => issue.path)).to.include('METEOR_REACTIVITY_ORDER');
  });

  it('requires Redis when open-core Redis is enabled', function() {
    const result = validateOpenCoreSettings(completeSettings, {
      ...completeEnv,
      REDIS_URL: '',
    });
    expect(result.ok).to.equal(false);
    expect(result.issues.map((issue) => issue.path)).to.include('REDIS_URL');
  });

  it('requires an authenticated sender address when email is enabled', function() {
    const result = validateOpenCoreSettings({
      ...completeSettings,
      emailFrom: '',
    }, completeEnv);
    expect(result.ok).to.equal(false);
    expect(result.issues.map((issue) => issue.path)).to.include('emailFrom');
  });

  it('validates optional reply-to address when email is enabled', function() {
    const result = validateOpenCoreSettings({
      ...completeSettings,
      emailReplyTo: 'not-an-email',
    }, completeEnv);
    expect(result.ok).to.equal(false);
    expect(result.issues.map((issue) => issue.path)).to.include('emailReplyTo');
  });
});
