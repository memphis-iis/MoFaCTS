import { expect } from 'chai';
import { validateOpenCoreSettings } from './openCoreSettingsValidation';

const validSelfHostedMongoUrl = [
  'mongodb://',
  'mofacts_app',
  ':',
  'secret',
  '@mongodb:27017/MoFACT-meteor3?authSource=MoFACT-meteor3',
].join('');

const completeSettings = {
  owner: 'admin@operator.test',
  ROOT_URL: 'https://mofacts.operator.test',
  encryptionKey: '0123456789abcdef0123456789abcdef',
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
  openCore: {
    requireRedis: true,
  },
};

const completeEnv = {
  ROOT_URL: 'https://mofacts.operator.test',
  MONGO_URL: validSelfHostedMongoUrl,
  EXPECTED_MONGO_DB_NAME: 'MoFACT-meteor3',
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

  it('requires authenticated MongoDB for self-hosted production', function() {
    const result = validateOpenCoreSettings(completeSettings, {
      ...completeEnv,
      MONGO_URL: 'mongodb://mongodb:27017/MoFACT-meteor3',
    });
    expect(result.ok).to.equal(false);
    expect(result.issues.some((issue) => issue.path === 'MONGO_URL')).to.equal(true);
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
