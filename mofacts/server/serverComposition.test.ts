import { COURSE_SNAPSHOT_VERSION } from './lib/courseLearnerSnapshotCache';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { AUDIO_PROVIDER_VERIFICATIONS, LESSON_EDIT_VERIFICATIONS, PUBLIC_READ_VERIFICATIONS, PUBLIC_ACCOUNT_VERIFICATIONS, RUNTIME_LESSON_VERIFICATIONS, SPARC_LESSON_VERIFICATIONS, ACCOUNT_SELF_VERIFICATIONS, CLASS_PERFORMANCE_VERIFICATION, ACCOUNT_DIAGNOSTIC_VERIFICATIONS, COURSE_DELETE_VERIFICATION, COURSE_READ_VERIFICATIONS } from '../common/securityAudit/verificationCatalog';
import { ProlificConnections, ProlificStudies, ProlificParticipations, ProlificOperations, ProlificReminders } from './lib/prolificCollections';
import { CourseLearnerSnapshotCache } from '../common/Collections';
import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/alanning:roles';
import { asyncMethods, methods } from './serverComposition';
import sinon from 'sinon';
import { Random } from 'meteor/random';
import { expect } from 'chai';
import { compressHistoryRecord } from '../common/historyCompression';
import { SERVER_VERBOSITY_SETTING } from '../common/loggingSettings';
import { encryptData } from './lib/encryption';
import { Accounts } from 'meteor/accounts-base';
import { createHash, randomBytes } from 'node:crypto';
import { unusedExpiredResetPrecondition, resetAttemptOutcome } from '../common/securityAudit/resetProtocol';
import { sessionLifetimeStatus } from '../common/securityAudit/sessionLifetime';
import { CONDITION_COUNT_VERIFICATIONS, STIMULUS_FILE_VERIFICATION } from '../common/securityAudit/verificationCatalog';
import { FRAMEWORK_AUTH_VERIFICATIONS } from '../common/securityAudit/verificationCatalog';
import { registeredFrameworkAuthSurfaces } from './securitySurfaces/registerFrameworkAuth';
import { registeredMeteorMethodSurfaces } from './securitySurfaces/registerMeteorMethods';
import { LOGIN_AUTH_THROTTLE_POLICY } from './startup/serverStartup';

const MeteorAny = Meteor as any;
const MeteorUsersAny = Meteor.users as any;
const AssignmentsAny = (globalThis as any).Assignments as any;
const CoursesAny = (globalThis as any).Courses as any;
const DynamicSettingsAny = (globalThis as any).DynamicSettings as any;
const GlobalExperimentStatesAny = (globalThis as any).GlobalExperimentStates as any;
const HistoriesAny = (globalThis as any).Histories as any;
const StimulusCrowdStatsAny = (globalThis as any).StimulusCrowdStats as any;
const SectionsAny = (globalThis as any).Sections as any;
const SectionUserMapAny = (globalThis as any).SectionUserMap as any;
const TdfsAny = (globalThis as any).Tdfs as any;
const UserDashboardCacheAny = (globalThis as any).UserDashboardCache as any;
const UserMetricsAny = (globalThis as any).UserMetrics as any;
const UserTimesLogAny = (globalThis as any).UserTimesLog as any;
const UserUploadQuotaAny = (globalThis as any).UserUploadQuota as any;
const AuditLogAny = (globalThis as any).AuditLog as any;
const AuthThrottleStateAny = (globalThis as any).AuthThrottleState as any;
const PasswordResetTokensAny = (globalThis as any).PasswordResetTokens as any;

(Meteor.settings as any).auth.requireEmailVerification = false;

type RemovableCollection = {
  removeAsync: (selector: Record<string, unknown>) => Promise<unknown>;
};

function requireRemovableCollection(collection: unknown, name: string): RemovableCollection {
  if (
    !collection ||
    typeof collection !== 'object' ||
    typeof (collection as Partial<RemovableCollection>).removeAsync !== 'function'
  ) {
    throw new Error(`Expected ${name} to expose removeAsync in Meteor integration tests`);
  }
  return collection as RemovableCollection;
}

async function clearServerCompositionCollections() {
  const collections: Array<[string, unknown]> = [
    ['ProlificConnections', ProlificConnections],
    ['ProlificStudies', ProlificStudies],
    ['ProlificParticipations', ProlificParticipations],
    ['ProlificOperations', ProlificOperations],
    ['ProlificReminders', ProlificReminders],
    ['AuditLog', AuditLogAny],
    ['Assignments', AssignmentsAny],
    ['AuthThrottleState', AuthThrottleStateAny],
    ['Courses', CoursesAny],
    ['GlobalExperimentStates', GlobalExperimentStatesAny],
    ['Histories', HistoriesAny],
    ['StimulusCrowdStats', StimulusCrowdStatsAny],
    ['Meteor.users', MeteorUsersAny],
    ['PasswordResetTokens', PasswordResetTokensAny],
    ['Sections', SectionsAny],
    ['SectionUserMap', SectionUserMapAny],
    ['Tdfs', TdfsAny],
    ['UserDashboardCache', UserDashboardCacheAny],
    ['UserMetrics', UserMetricsAny],
    ['UserTimesLog', UserTimesLogAny],
    ['UserUploadQuota', UserUploadQuotaAny],
    ['Meteor.roleAssignment', (Meteor as any).roleAssignment],
  ];

  await Promise.all([
    ...collections.map(([name, collection]) => requireRemovableCollection(collection, name).removeAsync({})),
    // The running server observes this startup-owned record throughout the suite.
    requireRemovableCollection(DynamicSettingsAny, 'DynamicSettings').removeAsync({
      _id: { $ne: SERVER_VERBOSITY_SETTING.id },
    }),
  ]);
}

describe('server composition test cleanup', function() {
  it('preserves the live server verbosity setting while removing test settings', async function() {
    const setting = await DynamicSettingsAny.findOneAsync(SERVER_VERBOSITY_SETTING.id);
    expect(setting, 'startup must initialize the required server verbosity setting').to.exist;
    const temporaryId = `test-cleanup-${Random.id()}`;
    await DynamicSettingsAny.insertAsync({ _id: temporaryId, value: 2 });

    await clearServerCompositionCollections();

    expect(await DynamicSettingsAny.findOneAsync(SERVER_VERBOSITY_SETTING.id)).to.deep.equal(setting);
    expect(await DynamicSettingsAny.findOneAsync(temporaryId)).to.equal(undefined);
  });
});

function createServerHistoryRecord(overrides: Record<string, unknown> = {}) {
  return compressHistoryRecord({
    historySchemaVersion: 1,
    userId: 'current-user',
    TDFId: 'history-root',
    stimuliSetId: 'set-1',
    stimulusKC: 'kc-1',
    clusterKC: 'cluster-1',
    KCId: 'kc-1',
    KCDefault: 'kc-1',
    KCCluster: 'cluster-1',
    anonStudentId: 'student-1',
    sessionID: 'session-1',
    levelUnit: 0,
    levelUnitType: 'model',
    time: 2000,
    problemStartTime: 1000,
    selection: 'answer',
    action: 'respond',
    outcome: 'correct',
    typeOfResponse: 'text',
    responseValue: 'answer',
    input: 'answer',
    displayedStimulus: { text: 'Prompt' },
    eventType: '',
    ...overrides,
  });
}

describe('server auth and session methods', function() {
  type ExternalLoginResult = { type: 'google' | 'microsoft'; userId: string };
  const accounts = Accounts as typeof Accounts & {
    updateOrCreateUserFromExternalService(
      provider: ExternalLoginResult['type'],
      identity: { id: string; email: string; verified_email?: boolean },
      options: Record<string, never>,
    ): Promise<ExternalLoginResult>;
    _attemptLogin(
      invocation: { connection: null }, methodName: string, args: unknown[], result: ExternalLoginResult,
    ): Promise<{ id: string; type: ExternalLoginResult['type'] }>;
    _loginUser(invocation: { connection: null }, userId: string): Promise<{ id: string }>;
  };

  beforeEach(async function() {
    await clearServerCompositionCollections();
    await Roles.createRoleAsync('admin', { unlessExists: true });
    await Roles.createRoleAsync('teacher', { unlessExists: true });
  });

  it('observes installed account hooks, native methods and provider service owners', function() {
    const observed = registeredFrameworkAuthSurfaces();
    if (observed.state !== 'observed') throw Error(observed.reason);
    expect(observed.surfaces.map(row => row.verification.verificationId)).to.have.members(
      Object.values(FRAMEWORK_AUTH_VERIFICATIONS).map(row => row.verificationId),
    );
    expect(observed.surfaces.map(row => row.surfaceId)).to.have.members(
      Object.values(FRAMEWORK_AUTH_VERIFICATIONS).map(row => row.surfaceId),
    );
  });

  it('creates and grants admin to the configured owner on their first Google sign-in', async function() {
    const email = `google-owner-${Random.id().toLowerCase()}@example.com`;
    const settings = Meteor.settings as any;
    const previousSettings = { owner: settings.owner, initRoles: settings.initRoles, auth: settings.auth };
    // Stub only the DDP session handoff. The real MongoDB account and admission hooks run.
    const loginUser = sinon.stub(accounts, '_loginUser').callsFake(async (_invocation, userId) => ({ id: userId }));
    try {
      settings.owner = email;
      settings.initRoles = { admins: [email] };
      settings.auth = { ...settings.auth, allowPublicSignup: false, requireEmailVerification: true };
      expect(await MeteorUsersAny.find().countAsync()).to.equal(0);

      const identity = { id: Random.id(), email, verified_email: true };
      const result = await accounts.updateOrCreateUserFromExternalService('google', identity, {});
      const user = await MeteorUsersAny.findOneAsync(result.userId);
      expect(user.username).to.equal(email);
      expect(user.emails).to.deep.equal([{ address: email, verified: true }]);
      expect(user.services.google.id).to.equal(identity.id);
      expect(user.services.password).to.equal(undefined);
      expect(await Roles.userIsInRoleAsync(result.userId, 'admin')).to.equal(false);

      expect(await accounts._attemptLogin({ connection: null }, 'login', [], result))
        .to.deep.equal({ id: result.userId, type: 'google' });
      expect(await Roles.userIsInRoleAsync(result.userId, 'admin')).to.equal(true);
      expect(await accounts.updateOrCreateUserFromExternalService('google', identity, {})).to.deep.equal(result);
      expect(await MeteorUsersAny.find().countAsync()).to.equal(1);
    } finally {
      loginUser.restore();
      Object.assign(settings, previousSettings);
    }
  });

  it('reports an OAuth email conflict and preserves sign-in for a distinct Google identity', async function() {
    const email = `microsoft-${Random.id().toLowerCase()}@example.com`;
    const microsoftIdentity = { id: Random.id(), email };
    const microsoft = await accounts.updateOrCreateUserFromExternalService('microsoft', microsoftIdentity, {});
    const conflict = await accounts.updateOrCreateUserFromExternalService('google', { id: Random.id(), email }, {})
      .catch((error: unknown) => error);
    expect(conflict).to.be.instanceOf(Meteor.Error).and.to.include({ error: 'oauth-account-exists-microsoft' });

    const existing = await MeteorUsersAny.findOneAsync(microsoft.userId);
    expect(existing.services.microsoft.id).to.equal(microsoftIdentity.id);
    expect(existing.services.google).to.equal(undefined);
    expect(await MeteorUsersAny.find({ username: email }).countAsync()).to.equal(1);

    const googleIdentity = { id: Random.id(), email: `google-${Random.id().toLowerCase()}@example.com` };
    const google = await accounts.updateOrCreateUserFromExternalService('google', googleIdentity, {});
    expect(google.userId).to.be.a('string').and.not.equal(microsoft.userId);
    expect(await accounts.updateOrCreateUserFromExternalService('google', googleIdentity, {})).to.include(google);
  });

  it('serves only public sign-in configuration and active help with per-connection limits', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed public reads');
    const limiter = DDPRateLimiter as typeof DDPRateLimiter & {
      findAllMatchingRulesAsync(input: { type: string; name: string; connectionId: string; userId: null }): Promise<unknown[]>;
    };
    for (const verification of PUBLIC_READ_VERIFICATIONS) {
      const row = observed.surfaces.find(item => item.name === verification.method);
      expect(row?.verification).to.equal(verification);
      expect(row?.policy).to.deep.equal({ kind: 'public-read', operation: verification.method,
        rateLimit: { requests: 60, windowMs: 60000, scope: 'connection' } });
      const rules = await limiter.findAllMatchingRulesAsync({
        type: 'method', name: verification.method, connectionId: Random.id(), userId: null,
      });
      expect(rules).to.have.length(1);
    }
    const handlers = MeteorAny.server.method_handlers;
    const config = await handlers.getAuthClientConfig.call({ userId: null });
    expect(config).to.have.all.keys('allowPublicSignup', 'requireEmailVerification', 'minPasswordLength',
      'memphisSamlEnabled', 'memphisSamlDisplayName');
    const help = await handlers.getCustomHelpPage.call({ userId: null });
    expect(help === null || typeof help === 'string').to.equal(true);
  });

  it('acknowledges unknown verification recipients and binds public account limits', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed public account methods');
    const limiter = DDPRateLimiter as typeof DDPRateLimiter & {
      findAllMatchingRulesAsync(input: { type: string; name: string; connectionId: string; userId: null }): Promise<unknown[]>;
    };
    for (const verification of PUBLIC_ACCOUNT_VERIFICATIONS) {
      const row = observed.surfaces.find(item => item.name === verification.method);
      expect(row?.verification).to.equal(verification);
      const requests = ['requestPasswordReset', 'resendVerificationEmail'].includes(verification.method) ? 3 : 5;
      expect(row?.policy).to.deep.equal({ kind: 'public-account', operation: verification.method,
        rateLimit: { requests, windowMs: 3600000, scope: 'connection' } });
      const rules = await limiter.findAllMatchingRulesAsync({
        type: 'method', name: verification.method, connectionId: Random.id(), userId: null,
      });
      expect(rules).to.have.length(1);
    }
    const result = await MeteorAny.server.method_handlers.resendVerificationEmail.call({ userId: null }, Random.id() + '@example.invalid');
    expect(result).to.deep.equal({ success: true });
  });

  it('binds password login connection, identifier and IP throttle policies', async function() {
    const limiter = DDPRateLimiter as typeof DDPRateLimiter & {
      findAllMatchingRulesAsync(input: {
        type: string; name: string; connectionId: string; userId: null;
      }): Promise<unknown[]>;
    };
    const rules = await limiter.findAllMatchingRulesAsync({
      type: 'method', name: 'login', connectionId: Random.id(), userId: null,
    });
    expect(rules.length).to.be.greaterThan(0);
    expect(LOGIN_AUTH_THROTTLE_POLICY).to.deep.equal({
      ip: { limit: 20, windowMs: 900000 },
      identifier: { limit: 10, windowMs: 900000 },
      softLock: { threshold: 8, windowMs: 900000, lockMs: 900000 },
    });
  });

  it('keeps installed account settings and sign-in updates scoped to the caller', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed account handlers');
    for (const verification of ACCOUNT_SELF_VERIFICATIONS) {
      const row = observed.surfaces.find(item => item.name === verification.method);
      expect(row?.verification).to.equal(verification);
      expect(row?.policy).to.deep.equal({ kind: 'account-self', operation: 'current-caller' });
    }
    const handlers = MeteorAny.server.method_handlers;
    const actor = { userId: await MeteorUsersAny.insertAsync({ username: Random.id() }) };
    const other = { userId: await MeteorUsersAny.insertAsync({ username: Random.id() }) };
    const anon = { userId: null };
    expect(await handlers.getCurrentUserRoleFlags.call(anon)).to.deep.equal({ admin: false, teacher: false });
    expect(await handlers.hasUserPersonalKeys.call(anon)).to.deep.equal({ hasSR: false, hasTTS: false });
    expect(await handlers.isUserSpeechAPIKeySetup.call(anon)).to.equal(false);
    await handlers.saveUserSpeechAPIKey.call(actor, Random.secret());
    expect(await handlers.isUserSpeechAPIKeySetup.call(actor)).to.equal(true);
    expect(await handlers.isUserSpeechAPIKeySetup.call(other)).to.equal(false);
    await handlers.deleteUserSpeechAPIKey.call(other);
    expect(await handlers.isUserSpeechAPIKeySetup.call(actor)).to.equal(true);
    await handlers.deleteUserSpeechAPIKey.call(actor);
    expect(await handlers.isUserSpeechAPIKeySetup.call(actor)).to.equal(false);
    await handlers.setUserLoginData.call(actor, 'section-invite', 'password');
    expect((await MeteorUsersAny.findOneAsync(actor.userId)).loginParams.entryPoint).to.equal('section-invite');
    expect((await MeteorUsersAny.findOneAsync(other.userId)).loginParams).to.equal(undefined);
    await handlers.recordSessionRevocation.call(actor, 'auth-route-logout');
    expect(await AuditLogAny.findOneAsync({ actorUserId: actor.userId, targetUserId: actor.userId, action: 'auth.sessionRevoked' })).to.exist;
  });

  it('writes auth.signupCompleted for native signup', async function() {
    const email = `signup-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;

    const result = await methods.signUpUser.call({}, email, password);
    const createdUser = await MeteorUsersAny.findOneAsync({ _id: result.userId });
    expect(createdUser).to.not.have.property('aws');
    expect(createdUser.profile).to.not.have.property('aws');
    const auditEntry = await AuditLogAny.findOneAsync({
      action: 'auth.signupCompleted',
      targetUserId: result.userId
    }) as any;

    expect(auditEntry).to.exist;
    expect(auditEntry.details.emailCanonical).to.equal(email.toLowerCase());
    expect(auditEntry.details.loginType).to.equal('password');
  });

  it('does not expose a reset token in requestPasswordReset responses', async function() {
    const email = `reset-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;

    await methods.signUpUser.call({}, email, password);
    const result = await methods.requestPasswordReset.call({}, email);

    expect(result).to.have.property('success', true);
    expect(result).to.not.have.property('token');
  });

  it('rejects an unused aged reset token and verifies current reset, replay denial and stored-session revocation', async function() {
    const email = `reset-protocol-${Random.id()}@example.com`.toLowerCase();
    const originalPassword = `Original-${Random.secret()}-Aa7!`;
    const nextPassword = `Changed-${Random.secret()}-Aa7!`;
    const replayPassword = `Replay-${Random.secret()}-Aa7!`;
    const { userId } = await methods.signUpUser.call({}, email, originalPassword);
    expect((await MeteorUsersAny.findOneAsync(userId)).email_canonical).to.equal(email);
    const accounts = Accounts as any;
    const passwordMatches = async (password: string) => {
      const user = await MeteorUsersAny.findOneAsync(userId);
      const checked = await accounts._checkPasswordAsync(user, password);
      return checked.userId === userId && !checked.error;
    };
    expect(await passwordMatches(originalPassword)).to.equal(true);
    const nativeStamp = accounts._generateStampedLoginToken();
    const nativeExpiry = accounts._tokenExpiration(nativeStamp.when);
    // Check native duration generation, not an unexecuted DDP login baseline.
    expect(sessionLifetimeStatus((nativeExpiry.getTime() - nativeStamp.when.getTime()) / 86400000)).to.equal('PASS');
    expect(accounts._getTokenLifetimeMs()).to.equal(30 * 86400000);
    const now = Date.now(), lifetimeMs = 3600000;
    const expired = randomBytes(32).toString('hex'), current = randomBytes(32).toString('hex');
    const expiredId = await PasswordResetTokensAny.insertAsync({ userId, email,
      tokenHash: createHash('sha256').update(expired).digest('hex'), used: false,
      createdAt: new Date(now - 3601000), expiresAt: new Date(now - 1000) });
    const eligibleExpired = await PasswordResetTokensAny.findOneAsync({ userId, email,
      tokenHash: createHash('sha256').update(expired).digest('hex'), used: false });
    expect(eligibleExpired?._id).to.equal(expiredId);
    expect(eligibleExpired.expiresAt.getTime()).to.be.lessThan(now);
    // Synthetic record age in isolated Mongo, not a live mailbox/wall-clock claim.
    expect(unusedExpiredResetPrecondition({ owned: true, unused: true,
      ageMs: 3601000, lifetimeMs, remainingMs: -1000 })).to.equal(true);
    let expiredCode: unknown;
    try { await methods.resetPasswordWithToken.call({}, email, expired, nextPassword); }
    catch (error: any) { expiredCode = error.error; }
    expect(expiredCode).to.equal('invalid-token');
    expect((await PasswordResetTokensAny.findOneAsync(expiredId)).used).to.equal(false);
    expect(await passwordMatches(originalPassword)).to.equal(true);
    expect(await passwordMatches(nextPassword)).to.equal(false);

    const currentId = await PasswordResetTokensAny.insertAsync({ userId, email,
      tokenHash: createHash('sha256').update(current).digest('hex'), used: false,
      createdAt: new Date(now), expiresAt: new Date(now + lifetimeMs) });
    await MeteorUsersAny.updateAsync(userId, { $set: { 'services.resume.loginTokens': [
      { hashedToken: createHash('sha256').update(Random.secret()).digest('base64'), when: new Date(now) },
    ] } });
    expect((await MeteorUsersAny.findOneAsync(userId)).services.resume.loginTokens.length).to.equal(1);
    expect(await methods.resetPasswordWithToken.call({}, email, current, nextPassword)).to.deep.equal({ success: true });
    expect(await passwordMatches(nextPassword)).to.equal(true);
    expect(await passwordMatches(originalPassword)).to.equal(false);
    const used = await PasswordResetTokensAny.findOneAsync(currentId);
    expect(used.used).to.equal(true);
    expect((await MeteorUsersAny.findOneAsync(userId)).services.resume.loginTokens ?? []).to.have.length(0);
    let replayCode: unknown;
    try { await methods.resetPasswordWithToken.call({}, email, current, replayPassword); }
    catch (error: any) { replayCode = error.error; }
    expect(replayCode).to.equal('invalid-token');
    expect(resetAttemptOutcome({ state: 'rejected', code: String(replayCode) })).to.equal('DENIED_BY_POLICY');
    expect(await PasswordResetTokensAny.findOneAsync(currentId)).to.deep.equal(used);
    expect(await passwordMatches(nextPassword)).to.equal(true);
    expect(await passwordMatches(replayPassword)).to.equal(false);
  });

  it('binds SSO profile completion to the account holder or an administrator', async function() {
    const registry = registeredMeteorMethodSurfaces();
    if (registry.state !== 'observed') throw new Error('Expected observed Meteor methods');
    const rows = registry.surfaces.filter(row => row.name === 'populateSSOProfile');
    expect(rows).to.have.length(1);
    expect(rows[0]?.policy).to.deep.equal({ kind: 'sso-profile', operation: 'self-or-admin' });
    const handler = MeteorAny.server.method_handlers.populateSSOProfile;
    const subject = Random.id();
    for (const [userId, code] of [[null, 401], [Random.id(), 403]] as const) {
      let denial: unknown;
      try { await handler.call({ userId }, subject); } catch (error) { denial = error; }
      expect(denial).to.be.instanceOf(Meteor.Error);
      expect(denial).to.include({ error: code });
    }
    const admin = await MeteorUsersAny.insertAsync({ username: Random.id() });
    await Roles.createRoleAsync('admin', { unlessExists: true });
    await Roles.addUsersToRolesAsync(admin, 'admin');
    const email = subject + '@example.com';
    await MeteorUsersAny.insertAsync({ _id: subject, services: { google: { email } } });
    expect(await handler.call({ userId: admin }, subject)).to.equal('success: ' + email);
  });

  it('keeps the SSO credential in provider storage and logs canonical email changes', async function() {
    const originalEmail = `original-${Random.id()}@example.com`;
    const nextEmail = `updated-${Random.id()}@example.com`;
    const providerCredential = Random.id();
    const password = `LongPassword-${Random.id()}123`;

    const result = await methods.signUpUser.call({}, originalEmail, password);
    const userId = result.userId;

    await MeteorUsersAny.updateAsync({_id: userId}, {$set: {
      services: {
        google: {
          email: nextEmail,
          refreshToken: providerCredential
        }
      }
    }});

    const populateResult = await methods.populateSSOProfile.call({ userId }, userId);
    const updatedUser = await MeteorUsersAny.findOneAsync({_id: userId}) as any;
    const auditEntry = await AuditLogAny.findOneAsync({
      action: 'auth.emailChanged',
      targetUserId: userId
    }) as any;

    expect(populateResult).to.equal(`success: ${nextEmail}`);
    expect(updatedUser.profile).to.deep.equal({ email: nextEmail, service: 'google', username: nextEmail.toLowerCase() });
    expect(updatedUser.services.google.refreshToken).to.equal(providerCredential);
    expect(updatedUser.email_canonical).to.equal(nextEmail.toLowerCase());
    expect(auditEntry).to.exist;
    expect(auditEntry.details.previousEmailCanonical).to.equal(originalEmail.toLowerCase());
    expect(auditEntry.details.nextEmailCanonical).to.equal(nextEmail.toLowerCase());
    expect(auditEntry.details.source).to.equal('populateSSOProfile');
  });

  it('keeps retired maintenance commands and package helpers out of Meteor', function() {
    const handlers = MeteorAny.server.method_handlers;
    for (const name of ['auditPublicAssetsWithoutSharedTdf', 'repairAiGeneratedPackageMedia', 'generateFaviconsFromLogo',
      'getMaxResponseKC', 'upsertStimFile', 'importPrivateRepoTdfBatch', 'normalizeOptionalString']) {
      expect(handlers).not.to.have.own.property(name);
    }
    for (const name of ['saveAiGeneratedPackageContent', 'confirmPackageUpload', 'getResponseKCMapForTdf']) {
      expect(handlers[name]).to.be.a('function');
    }
  });

  it('exposes individual package deletion without installation-wide deletion', function() {
    for (const name of ['deleteAllFiles', 'cleanupOrphanDynamicAssets']) {
      expect(MeteorAny.server.method_handlers).not.to.have.own.property(name);
    }
    expect(MeteorAny.server.method_handlers.deletePackageFile).to.be.a('function');
  });

  it('retires manual reset cleanup and login-data clearing', function() {
    for (const name of ['cleanupExpiredPasswordResetTokens', 'clearLoginData']) {
      expect(MeteorAny.server.method_handlers).not.to.have.own.property(name);
    }
  });

  it('automatically removes expired reset requests while preserving current requests', async function() {
    this.timeout(110000);
    const raw = PasswordResetTokensAny.rawCollection();
    const indexes = await raw.indexes();
    expect(indexes.some((index: any) => index.key.expiresAt === 1 && Object.keys(index.key).length === 1 &&
      index.expireAfterSeconds === 120)).to.equal(true);
    const now = Date.now();
    const insert = (expiresAt: Date) => PasswordResetTokensAny.insertAsync({
      userId: Random.id(), tokenHash: Random.id(), expiresAt, used: false,
    });
    const expired = await insert(new Date(now - 180000));
    const current = await insert(new Date(now + 3600000));
    const deadline = Date.now() + 95000;
    while (await raw.countDocuments({ _id: expired }) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    expect(await raw.countDocuments({ _id: expired })).to.equal(0);
    expect(await raw.countDocuments({ _id: current })).to.equal(1);
  });

  it('blocks admin user deletion when the target owns authored content', async function() {
    const adminEmail = `admin-${Random.id()}@example.com`;
    const userEmail = `owner-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;

    const adminResult = await methods.signUpUser.call({}, adminEmail, password);
    const userResult = await methods.signUpUser.call({}, userEmail, password);
    const adminUserId = adminResult.userId;
    const targetUserId = userResult.userId;

    await Roles.addUsersToRolesAsync(adminUserId, 'admin');
    await TdfsAny.insertAsync({
      _id: Random.id(),
      ownerId: targetUserId,
      content: { fileName: 'owned-lesson.tdf' }
    });

    try {
      await methods.userAdminDeleteUser.call({ userId: adminUserId }, targetUserId);
      expect.fail('Expected user deletion to be blocked');
    } catch (error: any) {
      expect(error.error).to.equal('delete-user-blocked');
      expect(error.reason).to.contain('owns 1 lesson');
    }

    const stillExists = await MeteorUsersAny.findOneAsync({ _id: targetUserId });
    expect(stillExists).to.exist;
  });

  it('deletes a user and cleans up obvious user-scoped records when no authored content exists', async function() {
    const adminEmail = `admin-${Random.id()}@example.com`;
    const userEmail = `delete-${Random.id()}@example.com`;
    const password = `LongPassword-${Random.id()}123`;

    const adminResult = await methods.signUpUser.call({}, adminEmail, password);
    const userResult = await methods.signUpUser.call({}, userEmail, password);
    const adminUserId = adminResult.userId;
    const targetUserId = userResult.userId;

    await Roles.addUsersToRolesAsync(adminUserId, 'admin');
    await HistoriesAny.insertAsync({ _id: Random.id(), userId: targetUserId, TDFId: Random.id() });
    await GlobalExperimentStatesAny.insertAsync({ _id: Random.id(), userId: targetUserId, TDFId: Random.id() });
    await SectionUserMapAny.insertAsync({ _id: Random.id(), userId: targetUserId, sectionId: Random.id() });
    await UserTimesLogAny.insertAsync({ _id: Random.id(), userId: targetUserId });
    await UserMetricsAny.insertAsync({ _id: targetUserId, score: 1 });
    await PasswordResetTokensAny.insertAsync({ _id: Random.id(), userId: targetUserId, tokenHash: Random.id() });
    await UserDashboardCacheAny.insertAsync({ _id: Random.id(), userId: targetUserId });
    await UserUploadQuotaAny.insertAsync({ _id: Random.id(), userId: targetUserId, date: '2026-04-12' });

    const result = await methods.userAdminDeleteUser.call({ userId: adminUserId }, targetUserId);

    expect(result.RESULT).to.equal('SUCCESS');
    expect(await MeteorUsersAny.findOneAsync({ _id: targetUserId })).to.equal(undefined);
    expect(await HistoriesAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await GlobalExperimentStatesAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await SectionUserMapAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await UserTimesLogAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await UserMetricsAny.findOneAsync({ _id: targetUserId })).to.equal(undefined);
    expect(await PasswordResetTokensAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await UserDashboardCacheAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
    expect(await UserUploadQuotaAny.findOneAsync({ userId: targetUserId })).to.equal(undefined);
  });
});

describe('public TDF and stimulus method authorization', function() {
  it('checks the installed lesson reads and rejects anonymous response mappings', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed lesson reads');
    for (const verification of RUNTIME_LESSON_VERIFICATIONS) {
      expect(observed.surfaces.find(row => row.name === verification.method)?.verification).to.equal(verification);
    }
    let code;
    try {
      await MeteorAny.server.method_handlers.getResponseKCMapForTdf.call({ userId: null }, Random.id());
    } catch (error: any) { code = error.error; }
    expect(code).to.equal(401);
  });

  it('requires access to the selected SPARC lesson before library or image operations', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed lesson methods');
    const tdfId = Random.id();
    const args = {
      getSparcAdministrativeRemovals: [[], tdfId],
      getSparcPromptImage: ['synthetic', tdfId],
      lookupSparcPrimitive: [{ tdfId }, {}, []],
      publishSparcPrimitive: [{ query: { tdfId } }, {}],
      generateSparcPromptImage: [{ tdfId }],
      resolveSparcVisualSupport: [{ tdfId }],
    };
    for (const verification of SPARC_LESSON_VERIFICATIONS) {
      const row = observed.surfaces.find(item => item.name === verification.method);
      expect(row?.verification).to.equal(verification);
      expect(row?.policy).to.deep.equal({ kind: 'sparc-lesson', operation: 'accessible-lesson-or-admin' });
      const handler = MeteorAny.server.method_handlers[verification.method];
      for (const userId of [null, Random.id()]) {
        let code;
        try { await handler.apply({ userId }, args[verification.method]); } catch (error: any) { code = error.error; }
        expect(userId ? [403, 404] : [401]).to.include(code, verification.method);
      }
    }
  });

  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('denies unauthenticated public TDF lookup by id', async function() {
    await TdfsAny.insertAsync({
      _id: 'private-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 101,
      content: {
        fileName: 'private.json',
        tdfs: { tutor: { setspec: { lessonname: 'Private', userselect: 'false' } } },
      },
    });

    try {
      await (asyncMethods.getTdfById as any).call({}, 'private-tdf');
      expect.fail('Expected unauthenticated TDF lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(401);
    }
  });

  it('allows owner public TDF lookup by id', async function() {
    await TdfsAny.insertAsync({
      _id: 'owned-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 102,
      content: {
        fileName: 'owned.json',
        tdfs: { tutor: { setspec: { lessonname: 'Owned', userselect: 'false' } } },
      },
    });

    const tdf = await (asyncMethods.getTdfById as any).call({ userId: 'owner-user' }, 'owned-tdf');

    expect(tdf._id).to.equal('owned-tdf');
  });

  it('blocks direct TDF lookup for a student with an active course assignment', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-direct-block',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-direct-block',
      courseId: 'course-direct-block',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-direct-block',
      userId: 'assigned-student',
      sectionId: 'section-direct-block',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-direct-block',
      courseId: 'course-direct-block',
      assignmentType: 'lesson',
      TDFId: 'assigned-direct-tdf',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-direct-tdf',
      ownerId: 'teacher-user',
      stimuliSetId: 108,
      accessors: [{ userId: 'assigned-student' }],
      content: {
        fileName: 'AssignedDirect.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Direct', userselect: 'true' } } },
      },
    });

    try {
      await (asyncMethods.getTdfById as any).call({ userId: 'assigned-student' }, 'assigned-direct-tdf');
      expect.fail('Expected direct assigned TDF lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Launch this TDF through its active course assignment');
    }
  });

  it('allows active course-assignment TDF lookup with matching launch context', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-launch-context',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-launch-context',
      courseId: 'course-launch-context',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-launch-context',
      userId: 'assigned-student',
      sectionId: 'section-launch-context',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-launch-context',
      courseId: 'course-launch-context',
      assignmentType: 'lesson',
      TDFId: 'assigned-context-tdf',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-context-tdf',
      ownerId: 'teacher-user',
      stimuliSetId: 109,
      content: {
        fileName: 'AssignedContext.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Context', userselect: 'false', experimentTarget: 'course-access-test' } } },
      },
    });

    const tdf = await (asyncMethods.getTdfById as any).call(
      { userId: 'assigned-student' },
      'assigned-context-tdf',
      {
        courseAssignment: {
          assignmentId: 'assignment-launch-context',
          courseId: 'course-launch-context',
          TDFId: 'assigned-context-tdf',
          launchSource: 'courses',
          launchMode: 'individual',
        },
      },
    );

    expect(tdf._id).to.equal('assigned-context-tdf');
    const actor = { userId: 'assigned-student' };
    const id = tdf._id;
    await MeteorUsersAny.insertAsync({ _id: actor.userId, accessedTDFs: [id] });
    await GlobalExperimentStatesAny.insertAsync({ userId: actor.userId, TDFId: id, experimentState: { currentUnitNumber: 2 } });
    await methods.setUserLoginData.call(actor, 'section-invite', 'password', null, null, ['unused-id']);
    const user = await MeteorUsersAny.findOneAsync(actor.userId);
    expect(user.loginParams).not.to.have.property('assignedTdfs');
    expect(user.accessedTDFs).to.deep.equal([id]);

    const context = { courseAssignment: { assignmentId: 'assignment-launch-context', courseId: 'course-launch-context',
      TDFId: id, launchSource: 'courses', launchMode: 'individual' } };
    const lookup = (options = {}) => (asyncMethods.getTdfById as any).call(actor, id, options);
    await AssignmentsAny.removeAsync(context.courseAssignment.assignmentId);
    async function expectDenied(options: Record<string, unknown>, code: number) {
      let denied: unknown;
      try { await lookup(options); } catch (error) { denied = error; }
      expect(denied).to.be.instanceOf(Meteor.Error);
      expect(denied).to.include({ error: code });
    }
    async function dashboardIds() {
      const snapshot = await MeteorAny.server.method_handlers.getPracticeDashboardSnapshot.call(actor);
      return snapshot.lessons.map((lesson: { TDFId: string }) => lesson.TDFId);
    }
    expect(await dashboardIds()).not.to.include(id);
    await expectDenied(context, 400);
    await expectDenied({}, 403);
    await AssignmentsAny.insertAsync({ _id: context.courseAssignment.assignmentId, courseId: context.courseAssignment.courseId, assignmentType: 'lesson', TDFId: id });
    expect((await lookup(context))._id).to.equal(id);
    await AssignmentsAny.removeAsync(context.courseAssignment.assignmentId);
    await TdfsAny.updateAsync(id, { $set: { accessors: [{ userId: actor.userId }] } });
    expect((await lookup())._id).to.equal(id);
    expect(await dashboardIds()).to.include(id);
    await TdfsAny.updateAsync(id, { $unset: { accessors: 1 } });
    await CoursesAny.insertAsync({ _id: 'other-course', semester: 'SU_2022', teacherUserId: 'teacher-user' });
    await SectionsAny.insertAsync({ _id: 'other-section', courseId: 'other-course' });
    await SectionUserMapAny.insertAsync({ userId: actor.userId, sectionId: 'other-section' });
    Object.assign(context.courseAssignment, { courseId: 'other-course', assignmentId: 'other-assignment' });
    await AssignmentsAny.insertAsync({ _id: 'other-assignment', courseId: 'other-course', assignmentType: 'lesson', TDFId: id });
    expect((await lookup(context))._id).to.equal(id);
    expect((await GlobalExperimentStatesAny.findOneAsync({ userId: actor.userId, TDFId: id })).experimentState.currentUnitNumber).to.equal(2);
  });

  it('blocks direct condition-child lookup for a student with an active root course assignment', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-condition-direct-block',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-condition-direct-block',
      courseId: 'course-condition-direct-block',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-condition-direct-block',
      userId: 'assigned-student',
      sectionId: 'section-condition-direct-block',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-condition-direct-block',
      courseId: 'course-condition-direct-block',
      assignmentType: 'lesson',
      TDFId: 'assigned-condition-root',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-condition-root',
      ownerId: 'teacher-user',
      stimuliSetId: 112,
      content: {
        fileName: 'AssignedConditionRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Assigned Condition Root',
              userselect: 'true',
              condition: ['AssignedConditionChild.json'],
              conditionTdfIds: ['assigned-condition-child'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-condition-child',
      ownerId: 'teacher-user',
      stimuliSetId: 113,
      accessors: [{ userId: 'assigned-student' }],
      content: {
        fileName: 'AssignedConditionChild.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Condition Child', userselect: 'true' } } },
      },
    });

    try {
      await (asyncMethods.getTdfById as any).call({ userId: 'assigned-student' }, 'assigned-condition-child');
      expect.fail('Expected direct assigned condition-child TDF lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Launch this TDF through its active course assignment');
    }
  });

  it('allows condition-child TDF lookup with matching root course-assignment launch context', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-condition-launch-context',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-condition-launch-context',
      courseId: 'course-condition-launch-context',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-condition-launch-context',
      userId: 'assigned-student',
      sectionId: 'section-condition-launch-context',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-condition-launch-context',
      courseId: 'course-condition-launch-context',
      assignmentType: 'lesson',
      TDFId: 'assigned-condition-context-root',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-condition-context-root',
      ownerId: 'teacher-user',
      stimuliSetId: 114,
      content: {
        fileName: 'AssignedConditionContextRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Assigned Condition Context Root',
              userselect: 'false',
              condition: ['AssignedConditionContextChild.json'],
              conditionTdfIds: ['assigned-condition-context-child'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-condition-context-child',
      ownerId: 'teacher-user',
      stimuliSetId: 115,
      content: {
        fileName: 'AssignedConditionContextChild.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Condition Context Child', userselect: 'false' } } },
      },
    });

    const tdf = await (asyncMethods.getTdfById as any).call(
      { userId: 'assigned-student' },
      'assigned-condition-context-child',
      {
        courseAssignment: {
          assignmentId: 'assignment-condition-launch-context',
          courseId: 'course-condition-launch-context',
          TDFId: 'assigned-condition-context-root',
          launchSource: 'courses',
          launchMode: 'individual',
        },
      },
    );

    expect(tdf._id).to.equal('assigned-condition-context-child');
  });

  it('allows direct TDF lookup for a member of a released progressive assignment', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-progressive-direct',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-progressive-direct',
      courseId: 'course-progressive-direct',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-progressive-direct',
      userId: 'assigned-student',
      sectionId: 'section-progressive-direct',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-progressive-direct',
      courseId: 'course-progressive-direct',
      assignmentType: 'progressive',
      title: 'Progressive direct access',
      memberTdfIds: ['progressive-direct-one', 'progressive-direct-two'],
      releaseAt: null,
    });
    await TdfsAny.insertAsync({
      _id: 'progressive-direct-one',
      ownerId: 'teacher-user',
      stimuliSetId: 116,
      content: {
        fileName: 'ProgressiveDirectOne.json',
        tdfs: { tutor: { setspec: { lessonname: 'Progressive Direct One', userselect: 'false' } } },
      },
    });

    const tdf = await (asyncMethods.getTdfById as any).call(
      { userId: 'assigned-student' },
      'progressive-direct-one',
    );

    expect(tdf._id).to.equal('progressive-direct-one');
  });

  it('allows public course-assignment TDF lookup without section enrollment', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-launch-public',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
      visibility: 'public',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-launch-public',
      courseId: 'course-launch-public',
      assignmentType: 'lesson',
      TDFId: 'assigned-public-tdf',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-public-tdf',
      ownerId: 'teacher-user',
      stimuliSetId: 111,
      content: {
        fileName: 'AssignedPublic.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Public', userselect: 'false' } } },
      },
    });

    const tdf = await (asyncMethods.getTdfById as any).call(
      { userId: 'not-enrolled-student' },
      'assigned-public-tdf',
      {
        courseAssignment: {
          assignmentId: 'assignment-launch-public',
          courseId: 'course-launch-public',
          TDFId: 'assigned-public-tdf',
          launchSource: 'courses',
          launchMode: 'individual',
        },
      },
    );

    expect(tdf._id).to.equal('assigned-public-tdf');
  });

  it('rejects course-assignment TDF lookup when the current user is not enrolled in that course', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-launch-unenrolled',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-launch-unenrolled',
      courseId: 'course-launch-unenrolled',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-launch-unenrolled',
      courseId: 'course-launch-unenrolled',
      assignmentType: 'lesson',
      TDFId: 'assigned-unenrolled-tdf',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-unenrolled-tdf',
      ownerId: 'teacher-user',
      stimuliSetId: 110,
      accessors: [{ userId: 'not-enrolled-student' }],
      content: {
        fileName: 'AssignedUnenrolled.json',
        tdfs: { tutor: { setspec: { lessonname: 'Assigned Unenrolled', userselect: 'true' } } },
      },
    });

    try {
      await (asyncMethods.getTdfById as any).call(
        { userId: 'not-enrolled-student' },
        'assigned-unenrolled-tdf',
        {
          courseAssignment: {
            assignmentId: 'assignment-launch-unenrolled',
            courseId: 'course-launch-unenrolled',
            TDFId: 'assigned-unenrolled-tdf',
            launchSource: 'courses',
          launchMode: 'individual',
          },
        },
      );
      expect.fail('Expected unenrolled course-assignment TDF lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Course assignment launch context is not available for current user');
    }
  });

  it('does not expose a public filename-based TDF lookup method', function() {
    expect(asyncMethods.getTdfByFileName).to.equal(undefined);
  });

  it('requires course context when an enrolled student loads condition children of an assigned root', async function() {
    await CoursesAny.insertAsync({
      _id: 'assigned-course',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'assigned-section',
      courseId: 'assigned-course',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'assigned-enrollment',
      userId: 'assigned-student',
      sectionId: 'assigned-section',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assigned-row',
      courseId: 'assigned-course',
      assignmentType: 'lesson',
      TDFId: 'assigned-root',
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-root',
      ownerId: 'teacher-user',
      stimuliSetId: 106,
      content: {
        fileName: 'AssignedRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Assigned Root',
              userselect: 'false',
              condition: ['AssignedCondition.json'],
              conditionTdfIds: ['assigned-condition'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'assigned-condition',
      ownerId: 'teacher-user',
      stimuliSetId: 107,
      content: {
        fileName: 'AssignedCondition.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Assigned Condition',
              userselect: 'false',
            },
          },
        },
      },
    });

    try {
      await (asyncMethods.getTdfById as any).call({ userId: 'assigned-student' }, 'assigned-condition');
      expect.fail('Expected assigned condition-child lookup without course context to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Launch this TDF through its active course assignment');
    }

    const byCourseContext = await (asyncMethods.getTdfById as any).call(
      { userId: 'assigned-student' },
      'assigned-condition',
      {
        courseAssignment: {
          assignmentId: 'assigned-row',
          courseId: 'assigned-course',
          TDFId: 'assigned-root',
          launchSource: 'courses',
          launchMode: 'individual',
        },
      },
    );

    expect(byCourseContext._id).to.equal('assigned-condition');
  });

  it('denies unrelated user public stimulus lookup by stimuliSetId', async function() {
    await TdfsAny.insertAsync({
      _id: 'stim-private-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 104,
      rawStimuliFile: {
        setspec: { clusters: [] },
      },
      stimuli: [
        { stimulusKC: 2, clusterKC: 1, correctResponse: 'answer' },
      ],
      content: {
        fileName: 'stim-private.json',
        tdfs: { tutor: { setspec: { lessonname: 'Stim Private', userselect: 'false' } } },
      },
    });

    try {
      await (asyncMethods.getStimuliSetById as any).call({ userId: 'other-user' }, 104);
      expect.fail('Expected unrelated user stimulus lookup to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('allows owner public stimulus lookup by stimuliSetId', async function() {
    await TdfsAny.insertAsync({
      _id: 'different-private-lesson', ownerId: 'different-owner', stimuliSetId: 105,
      stimuli: [{ stimulusKC: 9, clusterKC: 1, correctResponse: 'separate lesson' }],
      content: { fileName: 'different.json', tdfs: { tutor: { setspec: { userselect: 'false' } } } },
    });
    await TdfsAny.insertAsync({
      _id: 'stim-owned-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 105,
      rawStimuliFile: {
        setspec: { clusters: [] },
      },
      stimuli: [
        { stimulusKC: 3, clusterKC: 1, correctResponse: 'answer' },
      ],
      content: {
        fileName: 'stim-owned.json',
        tdfs: { tutor: { setspec: { lessonname: 'Stim Owned', userselect: 'false' } } },
      },
    });

    const stimuli = await (asyncMethods.getStimuliSetById as any).call({ userId: 'owner-user' }, 105);

    expect(stimuli).to.have.length(1);
    expect(stimuli[0].stimulusKC).to.equal(3);
  });

  it('allows experiment participants to access stimuli for their assigned condition TDF', async function() {
    await TdfsAny.insertAsync({
      _id: 'condition-root-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 106,
      content: {
        fileName: 'AllConditionsRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Condition Root',
              experimentTarget: 'flashcardtest-fast',
              userselect: 'false',
              condition: ['Keywordflashcard2.json'],
              conditionTdfIds: ['condition-child-tdf'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'condition-child-tdf',
      ownerId: 'owner-user',
      stimuliSetId: 107,
      rawStimuliFile: {
        setspec: { clusters: [] },
      },
      stimuli: [
        { stimulusKC: 4, clusterKC: 1, correctResponse: 'answer' },
      ],
      content: {
        fileName: 'Keywordflashcard2.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Keyword Flashcard 2',
              experimentTarget: 'kf2',
              userselect: 'false',
            },
          },
        },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: { experimentTarget: 'flashcardtest-fast' },
      loginParams: { loginMode: 'experiment' },
    });
    await GlobalExperimentStatesAny.insertAsync({
      userId: 'current-user',
      TDFId: 'condition-root-tdf',
      experimentState: {
        currentRootTdfId: 'condition-root-tdf',
        currentTdfId: 'condition-child-tdf',
        conditionTdfId: 'condition-child-tdf',
        experimentTarget: 'flashcardtest-fast',
        lastActionTimeStamp: Date.now(),
      },
    });

    const stimuli = await (asyncMethods.getStimuliSetById as any).call({ userId: 'current-user' }, 107);

    expect(stimuli).to.have.length(1);
    expect(stimuli[0].stimulusKC).to.equal(4);
  });

  it('resumes a progress-backed participant without a password or explicit experiment markers', async function() {
    const userId = Random.id(), progressId = Random.id();
    await TdfsAny.insertAsync({ _id: 'progress-return-root', ownerId: 'researcher', tdfAvailability: 'available',
      content: { tdfs: { tutor: { setspec: { lessonname: 'Progress return', experimentTarget: 'progress-return', userselect: 'false' }, unit: [{}] } } } });
    await MeteorUsersAny.insertAsync({ _id: userId, username: 'AUDIT-PROGRESS-RETURN', createdAt: new Date(), profile: {} });
    await GlobalExperimentStatesAny.insertAsync({ _id: progressId, userId, TDFId: 'progress-return-root',
      experimentState: { currentUnitNumber: 0, lastUnitCompleted: -1, lastActionTimeStamp: Date.now() } });
    const before = await GlobalExperimentStatesAny.findOneAsync({ _id: progressId });
    const first = await methods.provisionExperimentUser.call({}, 'progress-return', 'AUDIT-PROGRESS-RETURN');
    const second = await methods.provisionExperimentUser.call({}, 'progress-return', 'AUDIT-PROGRESS-RETURN');
    expect(first.userExists).to.equal(true); expect(first.userId).to.equal(userId); expect(second.userId).to.equal(userId);
    expect(first.loginToken).to.be.a('string').and.not.equal(''); expect(second.loginToken).not.to.equal(first.loginToken);
    const after = await MeteorUsersAny.findOneAsync({ _id: userId });
    expect(after.services?.password).to.equal(undefined); expect(after.emails).to.equal(undefined);
    expect(after.profile.experimentTarget).to.equal('progress-return');
    expect(after.services.resume.loginTokens.some((row: any) => row.hashedToken === (Accounts as any)._hashLoginToken(first.loginToken))).to.equal(true);
    expect(after.services.resume.loginTokens.some((row: any) => row.hashedToken === (Accounts as any)._hashLoginToken(second.loginToken))).to.equal(true);
    expect(await GlobalExperimentStatesAny.findOneAsync({ _id: progressId })).to.deep.equal(before);
    const publishProgress = (Meteor as any).server.publish_handlers.userExperimentState;
    const cursor = publishProgress.call({ userId: first.userId, ready() {} }, 'progress-return-root');
    expect((await cursor.fetchAsync()).map((row: { _id: string }) => row._id)).to.deep.equal([progressId]);
  });

  it('retains the recorded experiment binding when a progress-backed participant tries another target', async function() {
    const userId = Random.id();
    for (const target of ['progress-original', 'progress-other']) await TdfsAny.insertAsync({ _id: target, ownerId: 'researcher',
      tdfAvailability: 'available', content: { tdfs: { tutor: { setspec: { experimentTarget: target, userselect: 'false' }, unit: [{}] } } } });
    await MeteorUsersAny.insertAsync({ _id: userId, username: 'AUDIT-BOUND-RETURN', profile: { experimentTarget: 'progress-original' } });
    await GlobalExperimentStatesAny.insertAsync({ userId, TDFId: 'progress-original', experimentState: { lastUnitCompleted: -1 } });
    const baseline = await methods.provisionExperimentUser.call({}, 'progress-original', 'AUDIT-BOUND-RETURN');
    expect(baseline.userId).to.equal(userId); expect(baseline.loginToken).to.be.a('string').and.not.equal('');
    try { await methods.provisionExperimentUser.call({}, 'progress-other', 'AUDIT-BOUND-RETURN'); expect.fail('Expected target mismatch'); }
    catch (error: any) { expect(error.error).to.equal('experiment-target-mismatch'); }
    expect((await MeteorUsersAny.findOneAsync({ _id: userId })).profile.experimentTarget).to.equal('progress-original');
  });

  it('requires lesson access for teacher audio while retaining administrator testing', async function() {
    const teacher = Random.id(), admin = Random.id(), lessonId = Random.id();
    await Roles.createRoleAsync('teacher', { unlessExists: true });
    await Roles.createRoleAsync('admin', { unlessExists: true });
    await Roles.addUsersToRolesAsync(teacher, 'teacher');
    await Roles.addUsersToRolesAsync(admin, 'admin');
    await TdfsAny.insertAsync({
      _id: lessonId, ownerId: 'different-owner', tdfAvailability: 'available',
      content: { tdfs: { tutor: { setspec: {
        userselect: 'false', speechAPIKey: encryptData('synthetic-lesson-speech'),
        textToSpeechAPIKey: encryptData('synthetic-lesson-tts'),
      } } } },
    });
    await HistoriesAny.insertAsync({ userId: teacher, TDFId: lessonId });
    const provider = sinon.stub(globalThis, 'fetch').callsFake(async () => new Response(JSON.stringify({
      audioContent: 'synthetic-audio', results: [{ alternatives: [{ transcript: 'cat' }] }],
    }), { status: 200 }));
    try {
      const observed = registeredMeteorMethodSurfaces();
      if (observed.state !== 'observed') throw Error(observed.reason);
      const inputs = {
        makeGoogleSpeechAPICall: [lessonId, null, { config: { languageCode: 'en-US' }, audio: { content: 'synthetic' } }, ['cat']],
        makeGoogleTTSApiCall: [lessonId, 'cat', 1, 0, 'en-US-Standard-A', 'en-US'],
      };
      for (const verification of AUDIO_PROVIDER_VERIFICATIONS) {
        const row: typeof observed.surfaces[number] | undefined = observed.surfaces.find(entry => entry.name === verification.method);
        expect(row?.verification).to.equal(verification);
        const handler = MeteorAny.server.method_handlers[verification.method];
        try {
          await handler.call({ userId: teacher }, ...inputs[verification.method]);
          expect.fail('Teacher role and prior history must not authorize this private lesson');
        } catch (error: any) {
          expect(error.error).to.equal(403);
        }
      }
      expect(provider.callCount).to.equal(0);
      await TdfsAny.updateAsync({ _id: lessonId }, { $set: { accessors: [{ userId: teacher }] } });
      for (const userId of [teacher, admin]) {
        for (const verification of AUDIO_PROVIDER_VERIFICATIONS) {
          const result = await MeteorAny.server.method_handlers[verification.method].call({ userId }, ...inputs[verification.method]);
          expect(result).to.exist;
        }
      }
      expect(provider.callCount).to.equal(4);
    } finally {
      provider.restore();
      await Roles.removeUsersFromRolesAsync(teacher, 'teacher');
      await Roles.removeUsersFromRolesAsync(admin, 'admin');
    }
  });

  it('resolves shared audio keys for a new experiment participant before any history or profile audio setup', async function() {
    await TdfsAny.insertAsync({
      _id: 'audio-root', ownerId: 'researcher', tdfAvailability: 'available',
      content: { tdfs: { tutor: { setspec: {
        lessonname: 'Audio experiment', experimentTarget: 'audio-fresh-id', userselect: 'false',
        tags: ['Experiment'], condition: ['AudioCondition.json'], conditionTdfIds: ['audio-condition'],
      } } } },
    });
    await TdfsAny.insertAsync({
      _id: 'audio-condition', ownerId: 'researcher', tdfAvailability: 'available',
      content: { fileName: 'AudioCondition.json', tdfs: { tutor: {
        setspec: { lessonname: 'Audio condition', userselect: 'false', tags: ['Experiment'], audioInputEnabled: 'true' },
        unit: [{ unitname: 'Speaking', audioInputEnabled: 'true', assessmentsession: {} }],
      } } },
    });
    await TdfsAny.insertAsync({
      _id: 'unrelated-private-audio', ownerId: 'other-researcher', tdfAvailability: 'available',
      content: { tdfs: { tutor: { setspec: { lessonname: 'Unrelated lesson', userselect: 'false' } } } },
    });
    const provisioned = await methods.provisionExperimentUser.call({}, 'audio-fresh-id', 'FRESH-AUDIO-PARTICIPANT');
    expect(provisioned.userExists).to.equal(false);
    const actor = { userId: provisioned.userId };
    await MeteorUsersAny.updateAsync({ _id: actor.userId }, { $set: { loginParams: { loginMode: 'experiment' } } });
    const previousKeys = await DynamicSettingsAny.findOneAsync({ key: 'apiKeyAlternatives' });
    await DynamicSettingsAny.upsertAsync({ key: 'apiKeyAlternatives' }, { $set: { value: {
      googleSpeech: { keyEncrypted: encryptData('synthetic-shared-speech') },
      googleTts: { keyEncrypted: encryptData('synthetic-shared-tts') },
    } } });
    try {
      const rootKeys = await methods.hasUserPersonalKeys.call(actor, 'audio-root');
      expect(rootKeys).to.deep.equal({ hasSR: true, hasTTS: true, speechSource: 'admin', ttsSource: 'admin' });
      await GlobalExperimentStatesAny.insertAsync({
        userId: actor.userId, TDFId: 'audio-root', experimentState: {
          currentRootTdfId: 'audio-root', currentTdfId: 'audio-condition', conditionTdfId: 'audio-condition',
          experimentTarget: 'audio-fresh-id', currentUnitNumber: 0, lastActionTimeStamp: Date.now(),
        },
      });
      expect(await methods.hasUserPersonalKeys.call(actor, 'audio-condition')).to.deep.equal(rootKeys);
      expect(await HistoriesAny.find({ userId: actor.userId }).countAsync()).to.equal(0);
      const user = await MeteorUsersAny.findOneAsync({ _id: actor.userId });
      expect(user.audioSettings).to.equal(undefined);
      expect(user.speechAPIKey).to.equal(undefined);
      expect(JSON.stringify(rootKeys)).not.to.include('synthetic-shared');
      const provider = sinon.stub(globalThis, 'fetch').callsFake(async () => new Response(JSON.stringify({
        audioContent: 'synthetic-audio', results: [{ alternatives: [{ transcript: 'cat' }] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      try {
        const speech = asyncMethods.makeGoogleSpeechAPICall as (...args: any[]) => Promise<any>;
        const tts = asyncMethods.makeGoogleTTSApiCall as (...args: any[]) => Promise<any>;
        const recognized = await speech.call(actor, 'audio-condition', null, {
          config: { languageCode: 'en-US' }, audio: { content: 'synthetic-audio' },
        }, ['cat']);
        expect(recognized[1].results[0].alternatives[0].transcript).to.equal('cat');
        expect(await tts.call(actor, 'audio-condition', 'cat', 1, 0, 'en-US-Standard-A', 'en-US')).to.equal('synthetic-audio');
        expect(provider.callCount).to.equal(2);
      } finally {
        provider.restore();
      }
      try {
        await methods.hasUserPersonalKeys.call(actor, 'unrelated-private-audio');
        expect.fail('Unrelated private lesson must remain inaccessible');
      } catch (error) {
        expect((error as Meteor.Error).error).to.equal(403);
      }
    } finally {
      if (previousKeys) await DynamicSettingsAny.updateAsync({ _id: previousKeys._id }, { $set: { value: previousKeys.value } });
      else await DynamicSettingsAny.removeAsync({ key: 'apiKeyAlternatives' });
    }
  });

  it('removes the retired stimulus display cache methods from Meteor', function() {
    for (const name of ['getStimDisplayTypeMap', 'getStimDisplayTypeMapVersion', 'updateStimDisplayTypeMap']) {
      expect(MeteorAny.server.method_handlers).not.to.have.own.property(name);
    }
  });

  it('does not expose helper-only content and analytics methods publicly', function() {
    expect(asyncMethods.getUserIdforUsername).to.equal(undefined);
    expect(asyncMethods.getStimSetFromLearningSessionByClusterList).to.equal(undefined);
    expect(asyncMethods.getUserLastFeedbackTypeFromHistory).to.equal(undefined);
    expect(asyncMethods.getSourceSentences).to.equal(undefined);
    expect(asyncMethods.checkForTDFData).to.equal(undefined);
    expect(asyncMethods.getTdfIdsByOwnerId).to.equal(undefined);
    expect(asyncMethods.resolveAssignedRootTdfIdsForUser).to.equal(undefined);
    expect(asyncMethods.applyDashboardHistoryRecord).to.equal(undefined);
  });

  it('projects public experiment-target lookup instead of returning the full TDF anonymously', async function() {
    await TdfsAny.insertAsync({
      _id: 'experiment-root',
      ownerId: 'owner-user',
      tdfAvailability: 'available',
      stimuliSetId: 106,
      stimuli: [{ stimulusKC: 4 }],
      rawStimuliFile: { setspec: { clusters: [{ stims: [] }] } },
      content: {
        isMultiTdf: true,
        fileName: 'experiment-root.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Experiment Root',
              experimentTarget: 'study-a',
              experimentPasswordRequired: false,
              prolificCompletionUrl: 'https://app.prolific.com/submissions/complete?cc=ABC123',
              srfilterclose: 'false',
              speechAPIKey: 'encrypted-speech-key',
              textToSpeechAPIKey: 'encrypted-tts-key',
              condition: ['condition-a.json'],
              conditionTdfIds: ['experiment-condition-a'],
            },
            deliverySettings: {
              experimentLoginText: 'Participant ID',
              privateAdminNote: 'do not expose',
            },
          },
        },
      },
    });

    await TdfsAny.insertAsync({
      _id: 'experiment-condition-a',
      ownerId: 'owner-user',
      tdfAvailability: 'available',
      content: {
        fileName: 'condition-a.json',
        tdfs: { tutor: { setspec: { lessonname: 'Experiment Condition A' }, unit: [{}] } },
      },
    });

    const entry = await (asyncMethods.getTdfByExperimentTarget as any).call({}, 'study-a');

    expect(entry._id).to.equal('experiment-root');
    expect(entry.stimuli).to.equal(undefined);
    expect(entry.rawStimuliFile).to.equal(undefined);
    expect(entry.content.fileName).to.equal(undefined);
    expect(entry.content.tdfs.tutor.unit).to.equal(undefined);
    expect(entry.content.tdfs.tutor.setspec.speechAPIKey).to.equal(undefined);
    expect(entry.content.tdfs.tutor.setspec.textToSpeechAPIKey).to.equal(undefined);
    expect(entry.content.tdfs.tutor.setspec.srfilterclose).to.equal('false');
    expect(entry.content.tdfs.tutor.setspec.prolificCompletionUrl).to.equal('https://app.prolific.com/submissions/complete?cc=ABC123');
    expect(entry.content.tdfs.tutor.deliverySettings).to.deep.equal({
      experimentLoginText: 'Participant ID',
    });
  });

  it('returns the full experiment TDF for an authenticated authorized caller', async function() {
    await TdfsAny.insertAsync({
      _id: 'owned-experiment-root',
      ownerId: 'owner-user',
      tdfAvailability: 'available',
      stimuliSetId: 107,
      content: {
        fileName: 'owned-experiment-root.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Owned Experiment Root',
              experimentTarget: 'study-b',
              speechAPIKey: 'synthetic', textToSpeechAPIKey: 'synthetic', openRouterApiKey: 'synthetic',
              userselect: 'false',
            },
            unit: [{ unitname: 'owner-visible unit' }],
          },
        },
      },
    });

    const tdf = await (asyncMethods.getTdfByExperimentTarget as any).call({ userId: 'owner-user' }, 'study-b');

    expect(tdf._id).to.equal('owned-experiment-root');
    for (const field of ['speechAPIKey', 'textToSpeechAPIKey', 'openRouterApiKey']) {
      expect(tdf.content.tdfs.tutor.setspec).not.to.have.property(field);
    }
    expect(tdf.content.fileName).to.equal('owned-experiment-root.json');
    expect(tdf.content.tdfs.tutor.unit).to.have.length(1);
  });
});

describe('editor save shape preservation methods', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('limits installed editor saves to users who manage the lesson', async function() {
    const lessonId = Random.id();
    const content = { tdfs: { tutor: { setspec: { lessonname: 'Synthetic lesson' }, unit: [{}] } } };
    await TdfsAny.insertAsync({ _id: lessonId, ownerId: 'synthetic-owner', content });
    const inputs = { saveTdfContent: [content], saveTdfStimuli: [{ setspec: { clusters: [] } }, null] };
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw Error(observed.reason);
    for (const verification of LESSON_EDIT_VERIFICATIONS) {
      const row: typeof observed.surfaces[number] | undefined = observed.surfaces.find(entry => entry.name === verification.method);
      expect(row?.verification).to.equal(verification);
      try {
        await MeteorAny.server.method_handlers[verification.method].call({ userId: 'unrelated-editor' }, lessonId, ...inputs[verification.method]);
        expect.fail('An unrelated account cannot write to a lesson');
      } catch (error: any) {
        expect(error.error).to.equal('not-authorized');
      }
    }
    expect((await TdfsAny.findOneAsync(lessonId)).content).to.deep.equal(content);
  });

  it('preserves condition-root fields and absence of tutor.unit when saving TDF editor changes', async function() {
    await TdfsAny.insertAsync({
      _id: 'condition-a',
      ownerId: 'owner-user',
      content: { fileName: 'condition-a.json', tdfs: { tutor: { setspec: { lessonname: 'A' }, unit: [] } } },
    });
    await TdfsAny.insertAsync({
      _id: 'condition-b',
      ownerId: 'owner-user',
      content: { fileName: 'condition-b.json', tdfs: { tutor: { setspec: { lessonname: 'B' }, unit: [] } } },
    });
    await TdfsAny.insertAsync({
      _id: 'condition-root-save',
      ownerId: 'owner-user',
      stimuliSetId: 501,
      conditionCounts: [7, 9],
      content: {
        fileName: 'condition-root.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Condition Root',
              condition: ['condition-a.json', 'condition-b.json'],
              conditionTdfIds: ['condition-a', 'condition-b'],
              loadbalancing: 'min',
            },
            deliverySettings: {
              experimentLoginText: 'Prolific ID',
            },
          },
        },
      },
    });

    await (asyncMethods.saveTdfContent as any).call({ userId: 'owner-user' }, 'condition-root-save', {
      tdfs: {
        tutor: {
          setspec: {
            lessonname: 'Condition Root',
            condition: ['forged.json'],
            conditionTdfIds: ['foreign-child'],
            loadbalancing: 'max',
          },
          unit: [],
        },
      },
    }, {}, ['setspec.condition', 'setspec.conditionTdfIds']);

    const updated = await TdfsAny.findOneAsync({ _id: 'condition-root-save' });
    expect(updated.content.fileName).to.equal('condition-root.json');
    expect(updated.content.tdfs.tutor).to.not.have.property('unit');
    expect(updated.content.tdfs.tutor.setspec.loadbalancing).to.equal('max');
    expect(updated.content.tdfs.tutor.setspec.condition).to.deep.equal(['condition-a.json', 'condition-b.json']);
    expect(updated.content.tdfs.tutor.setspec.conditionTdfIds).to.deep.equal(['condition-a', 'condition-b']);
    expect(updated.content.tdfs.tutor.deliverySettings).to.deep.equal({ experimentLoginText: 'Prolific ID' });
    expect(updated.conditionCounts).to.deep.equal([7, 9]);
  });

  it('does not add TDF wrapper fields when saving stimuli editor changes', async function() {
    await TdfsAny.insertAsync({
      _id: 'stimulus-editor-save',
      ownerId: 'owner-user',
      stimuliSetId: 502,
      rawStimuliFile: {
        setspec: {
          prompt: 'Keep prompt metadata',
          clusters: [{ stims: [] }],
        },
      },
      stimuli: [],
      content: {
        fileName: 'stimulus-editor-root.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Stimulus Editor Root',
              stimulusfile: 'stimulus-editor-stims.json',
            },
          },
        },
      },
    });

    await (asyncMethods.saveTdfStimuli as any).call({ userId: 'owner-user' }, 'stimulus-editor-save', {
      setspec: {
        prompt: 'Keep prompt metadata',
        clusters: [{ stims: [] }],
      },
    }, null);

    const updated = await TdfsAny.findOneAsync({ _id: 'stimulus-editor-save' });
    expect(updated.content.tdfs.tutor).to.not.have.property('unit');
    expect(updated.rawStimuliFile.setspec.prompt).to.equal('Keep prompt metadata');
    expect(updated.rawStimuliFile.setspec.clusters).to.deep.equal([{ stims: [] }]);
  });

  it('honors explicit TDF editor removal paths without stripping source-only fields', async function() {
    await TdfsAny.insertAsync({
      _id: 'tdf-editor-removal',
      ownerId: 'owner-user',
      content: {
        fileName: 'tdf-editor-removal.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Removal Test',
              tips: ['remove me'],
            },
            deliverySettings: {
              experimentLoginText: 'Keep login prompt',
            },
            unit: [{}],
          },
        },
      },
    });

    await (asyncMethods.saveTdfContent as any).call({ userId: 'owner-user' }, 'tdf-editor-removal', {
      tdfs: {
        tutor: {
          setspec: {
            lessonname: 'Removal Test',
          },
        },
      },
    }, {}, ['setspec.tips']);

    const updated = await TdfsAny.findOneAsync({ _id: 'tdf-editor-removal' });
    expect(updated.content.tdfs.tutor.setspec).to.not.have.property('tips');
    expect(updated.content.tdfs.tutor.deliverySettings).to.deep.equal({ experimentLoginText: 'Keep login prompt' });
  });
});

describe('learner analytics method authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('denies cross-user learner history helper reads', async function() {
    try {
      await (asyncMethods.getLearningHistoryForUnit as any).call(
        { userId: 'current-user' },
        'other-user',
        'tdf-1',
        0
      );
      expect.fail('Expected cross-user learning history read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('denies cross-user SPARC history helper reads', async function() {
    try {
      await (asyncMethods.getSparcHistoryForUnit as any).call(
        { userId: 'current-user' },
        'other-user',
        'tdf-1',
        0
      );
      expect.fail('Expected cross-user SPARC history read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('returns explicit identity fields for learning history reconstruction', async function() {
    await HistoriesAny.insertAsync({
      _id: 'learning-history-explicit-identity',
      userId: 'current-user',
      TDFId: 'tdf-identity',
      levelUnit: 0,
      levelUnitType: 'model',
      time: 1000,
      problemStartTime: 900,
      outcome: 'correct',
      eventType: 'sparc',
      stimuliSetId: 'set-a',
      stimulusKC: 'stim-a',
      clusterKC: 'cluster-a',
      KCCluster: 'cluster-a',
      KCId: 'stim-a',
      CFCorrectAnswer: 'Alpha',
      responseKey: 'Alpha',
      responseDuration: 75,
      practiceDurationMs: 75,
      responseValue: 'Alpha',
      CFEndLatency: 100,
      CFFeedbackLatency: 100,
    });

    const rows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-identity',
      0
    );

    expect(rows).to.have.length(1);
    expect(rows[0]).to.deep.include({
      stimuliSetId: 'set-a',
      stimulusKC: 'stim-a',
      clusterKC: 'cluster-a',
      KCCluster: 'cluster-a',
      KCId: 'stim-a',
      eventType: 'sparc',
      levelUnitType: 'model',
      responseKey: 'Alpha',
      responseDuration: 75,
      practiceDurationMs: 75,
      responseValue: 'Alpha',
      problemStartTime: 900,
    });
  });

  it('returns prior-unit model history for later units unless unit-scoped history is requested', async function() {
    const assessment = {
      userId: 'current-user', TDFId: 'tdf-shared-model', levelUnit: 0, levelUnitType: 'schedule',
      modelEvidenceSource: 'assessment', time: 500, outcome: 'correct', eventType: '',
      stimuliSetId: 'set-a', stimulusKC: 'stim-a', clusterKC: 'cluster-a', KCCluster: 'cluster-a',
      KCId: 'stim-a', responseKey: 'Alpha', responseDuration: 60,
    };
    await HistoriesAny.insertAsync({ ...assessment, _id: 'assessment-original' });
    await HistoriesAny.insertAsync({ ...assessment, _id: 'assessment-copy', levelUnitType: 'model' });
    await HistoriesAny.insertAsync({ ...assessment, _id: 'other-learner-assessment', userId: 'other-user' });
    await HistoriesAny.insertAsync({
      _id: 'sparc-model-unit-1',
      userId: 'current-user',
      TDFId: 'tdf-shared-model',
      levelUnit: 1,
      levelUnitType: 'model',
      time: 1000,
      outcome: 'correct',
      eventType: 'sparc',
      stimuliSetId: 'set-a',
      stimulusKC: 'stim-a',
      clusterKC: 'cluster-a',
      KCCluster: 'cluster-a',
      KCId: 'stim-a',
      responseKey: 'Alpha',
      responseDuration: 75,
    });
    await HistoriesAny.insertAsync({
      _id: 'flashcard-model-unit-2',
      userId: 'current-user',
      TDFId: 'tdf-shared-model',
      levelUnit: 2,
      levelUnitType: 'model',
      time: 2000,
      outcome: 'incorrect',
      eventType: '',
      stimuliSetId: 'set-a',
      stimulusKC: 'stim-a',
      clusterKC: 'cluster-a',
      KCCluster: 'cluster-a',
      KCId: 'stim-a',
      responseKey: 'Alpha',
      responseDuration: 90,
    });

    const cumulativeRows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-shared-model',
      2,
      false
    );
    expect(cumulativeRows.map((row: any) => row.time)).to.deep.equal([500, 1000, 2000]);
    expect(cumulativeRows.map((row: any) => row.eventType)).to.deep.equal(['', 'sparc', '']);
    expect(cumulativeRows[0].levelUnitType).to.equal('schedule');
    expect(cumulativeRows[0].modelEvidenceSource).to.equal('assessment');

    const unitScopedRows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-shared-model',
      2,
      true
    );
    expect(unitScopedRows.map((row: any) => row.time)).to.deep.equal([2000]);
  });

  it('returns exact source-TDF history for an individual course launch', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-a',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-course-a',
      courseId: 'course-a',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-course-a',
      userId: 'current-user',
      sectionId: 'section-course-a',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-a',
      courseId: 'course-a',
      assignmentType: 'lesson',
      TDFId: 'tdf-current',
      order: 0,
      required: true,
    });
    const baseRow = {
      userId: 'current-user',
      levelUnitType: 'model',
      clusterKC: 'fractions.lcd',
      KCCluster: 'fractions.lcd',
      stimuliSetId: 'set-a',
      stimulusKC: 'stim-a',
      KCId: 'stim-a',
      responseKey: 'answer',
      outcome: 'correct',
    };
    await HistoriesAny.insertAsync({
      ...baseRow,
      _id: 'course-current-tdf',
      TDFId: 'tdf-current',
      levelUnit: 4,
      time: 2000,
      courseAssignment: {
        assignmentId: 'assignment-a',
        courseId: 'course-a',
        TDFId: 'tdf-current',
        launchSource: 'courses',
          launchMode: 'individual',
      },
    });
    await HistoriesAny.insertAsync({
      ...baseRow,
      _id: 'course-prior-tdf-same-cluster',
      TDFId: 'tdf-prior',
      levelUnit: 9,
      time: 1000,
      stimuliSetId: 'other-set',
      stimulusKC: 'other-stim',
      KCId: 'other-stim',
      courseAssignment: {
        assignmentId: 'assignment-prior',
        courseId: 'course-a',
        TDFId: 'tdf-prior',
        launchSource: 'courses',
          launchMode: 'individual',
      },
    });
    await HistoriesAny.insertAsync({
      ...baseRow,
      _id: 'course-other-cluster',
      TDFId: 'tdf-current',
      levelUnit: 1,
      time: 1500,
      clusterKC: 'fractions.unlike',
      KCCluster: 'fractions.unlike',
      courseAssignment: {
        assignmentId: 'assignment-a',
        courseId: 'course-a',
        TDFId: 'tdf-current',
        launchSource: 'courses',
          launchMode: 'individual',
      },
    });
    await HistoriesAny.insertAsync({
      ...baseRow,
      _id: 'course-other-course',
      TDFId: 'tdf-other-course',
      levelUnit: 1,
      time: 1700,
      courseAssignment: {
        assignmentId: 'assignment-other',
        courseId: 'course-b',
        TDFId: 'tdf-other-course',
        launchSource: 'courses',
          launchMode: 'individual',
      },
    });

    const rows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-current',
      4,
      false,
      {
        courseAssignment: {
          assignmentId: 'assignment-a',
          courseId: 'course-a',
          TDFId: 'tdf-current',
          launchSource: 'courses',
          launchMode: 'individual',
        },
      }
    );

    expect(rows.map((row: any) => row._id)).to.deep.equal([
      'course-other-cluster',
      'course-current-tdf',
    ]);
    expect(rows.map((row: any) => row.TDFId)).to.deep.equal(['tdf-current', 'tdf-current']);
  });

  it('allows course-scoped learning history without caller-provided cluster KCs', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-a',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-course-a',
      courseId: 'course-a',
    });
    await SectionUserMapAny.insertAsync({
      _id: 'enrollment-course-a',
      userId: 'current-user',
      sectionId: 'section-course-a',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-a',
      courseId: 'course-a',
      assignmentType: 'lesson',
      TDFId: 'tdf-current',
      order: 0,
      required: true,
    });

    const rows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-current',
      4,
      false,
      {
        courseAssignment: {
          assignmentId: 'assignment-a',
          courseId: 'course-a',
          TDFId: 'tdf-current',
          launchSource: 'courses',
          launchMode: 'individual',
        },
      }
    );

    expect(rows).to.deep.equal([]);
  });

  it('allows public course-scoped learning history without section enrollment', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-public-history',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
      visibility: 'public',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-public-history',
      courseId: 'course-public-history',
      assignmentType: 'lesson',
      TDFId: 'tdf-public-history',
      order: 0,
      required: true,
    });

    const rows = await (asyncMethods.getLearningHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-public-history',
      4,
      false,
      {
        courseAssignment: {
          assignmentId: 'assignment-public-history',
          courseId: 'course-public-history',
          TDFId: 'tdf-public-history',
          launchSource: 'courses',
          launchMode: 'individual',
        },
      }
    );

    expect(rows).to.deep.equal([]);
  });

  it('rejects course-scoped learning history when the current user is not enrolled in that course', async function() {
    await CoursesAny.insertAsync({
      _id: 'course-unenrolled-history',
      teacherUserId: 'teacher-user',
      semester: 'SU_2022',
    });
    await SectionsAny.insertAsync({
      _id: 'section-unenrolled-history',
      courseId: 'course-unenrolled-history',
    });
    await AssignmentsAny.insertAsync({
      _id: 'assignment-unenrolled-history',
      courseId: 'course-unenrolled-history',
      assignmentType: 'lesson',
      TDFId: 'tdf-unenrolled-history',
      order: 0,
      required: true,
    });

    try {
      await (asyncMethods.getLearningHistoryForUnit as any).call(
        { userId: 'current-user' },
        'current-user',
        'tdf-unenrolled-history',
        4,
        false,
        {
          courseAssignment: {
            assignmentId: 'assignment-unenrolled-history',
            courseId: 'course-unenrolled-history',
            TDFId: 'tdf-unenrolled-history',
            launchSource: 'courses',
          launchMode: 'individual',
          },
        }
      );
      expect.fail('Expected unenrolled course-scoped learning history read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
      expect(error.reason).to.equal('Course assignment history context is not available for current user');
    }
  });

  it('returns exact-unit durable SPARC history with canonical extension fields', async function() {
    const sparcExtension = {
      pageKey: 'doc-1',
      sourceAddress: {
        pageKey: 'doc-1',
        nodeId: 'node-1',
      },
      practiceObservation: {
        observationId: 'obs-1',
        sourceAddress: {
          pageKey: 'doc-1',
          nodeId: 'node-1',
        },
        time: 1000,
        problemStartTime: 900,
        outcome: 'correct',
        responseValue: '4',
      },
    };
    await HistoriesAny.insertAsync({
      _id: 'sparc-history-model',
      historySchemaVersion: 1,
      userId: 'current-user',
      TDFId: 'tdf-sparc',
      sessionID: 'session-1',
      levelUnit: 2,
      levelUnitType: 'model',
      time: 1000,
      recordedServerTime: 1100,
      eventId: 1,
      problemStartTime: 900,
      outcome: 'correct',
      eventType: 'sparc',
      responseValue: '4',
      stimulusKC: 'stim-a',
      clusterKC: 'cluster-a',
      KCCluster: 'cluster-a',
      KCId: 'stim-a',
      responseKC: 'response-a',
      responseKey: '4',
      sparc: sparcExtension,
      serverOnlyLargePayload: {
        shouldNotHydrateToClient: true,
        nested: {
          rawDocument: 'not part of the SPARC resume projection',
        },
      },
    });
    await HistoriesAny.insertAsync({
      _id: 'sparc-history-state-transition',
      historySchemaVersion: 1,
      userId: 'current-user',
      TDFId: 'tdf-sparc',
      sessionID: 'session-1',
      levelUnit: 2,
      levelUnitType: 'sparc',
      time: 1200,
      recordedServerTime: 1300,
      eventId: 2,
      problemStartTime: 1150,
      outcome: 'study',
      eventType: 'sparc',
      responseValue: 'next',
      sparc: {
        pageKey: 'doc-1',
        sourceAddress: {
          pageKey: 'doc-1',
          nodeId: 'node-2',
        },
      },
    });
    await HistoriesAny.insertAsync({
      _id: 'sparc-history-other-user',
      userId: 'other-user',
      TDFId: 'tdf-sparc',
      levelUnit: 2,
      levelUnitType: 'sparc',
      time: 900,
      eventType: 'sparc',
      sparc: { pageKey: 'doc-ignored' },
    });
    await HistoriesAny.insertAsync({
      _id: 'sparc-history-other-unit',
      userId: 'current-user',
      TDFId: 'tdf-sparc',
      levelUnit: 1,
      levelUnitType: 'sparc',
      time: 950,
      eventType: 'sparc',
      sparc: { pageKey: 'doc-ignored' },
    });
    await HistoriesAny.insertAsync({
      _id: 'sparc-history-non-sparc-event',
      userId: 'current-user',
      TDFId: 'tdf-sparc',
      levelUnit: 2,
      levelUnitType: 'sparc',
      time: 975,
      eventType: 'obsolete-component',
      sparc: { pageKey: 'doc-ignored' },
    });

    const rows = await (asyncMethods.getSparcHistoryForUnit as any).call(
      { userId: 'current-user' },
      'current-user',
      'tdf-sparc',
      2
    );

    expect(rows.map((row: any) => row._id)).to.deep.equal([
      'sparc-history-model',
      'sparc-history-state-transition',
    ]);
    expect(rows[0]).to.deep.include({
      TDFId: 'tdf-sparc',
      sessionID: 'session-1',
      userId: 'current-user',
      levelUnit: 2,
      levelUnitType: 'model',
      eventType: 'sparc',
      stimulusKC: 'stim-a',
      responseKC: 'response-a',
      responseKey: '4',
    });
    expect(rows[0].sparc).to.deep.equal(sparcExtension);
    expect(rows[0]).not.to.have.property('serverOnlyLargePayload');
    expect(rows[1]).to.have.nested.property('sparc.pageKey', 'doc-1');
  });

  it('denies cross-user experiment-state reads', async function() {
    try {
      await (asyncMethods.getExperimentState as any).call({ userId: 'current-user' }, 'other-user', 'tdf-1');
      expect.fail('Expected cross-user experiment state read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }

  });

  it('keeps the supported study, learner settings, SPARC and audited performance operations', function() {
    const handlers = MeteorAny.server.method_handlers;
    for (const name of [
      'listSparcMoveLibrary', 'listSparcLibraryImages', 'getLearnerProgressSignals', 'resetLearnerTdfConfig', 'setExperimentState',
    ]) expect(handlers).not.to.have.own.property(name);
    for (const name of [
      'createExperimentState', 'updateExperimentState', 'getExperimentState', 'getLearnerTdfConfig', 'saveLearnerTdfConfig',
      'listSparcInstructionalComponents', 'getSparcPromptImage', 'getStudentPerformanceByIdAndTDFIdFromHistory',
    ]) expect(handlers[name]).to.be.a('function');
  });

  it('exposes the active dashboard, draft, theme and user operations without the retired commands', function() {
    const handlers = MeteorAny.server.method_handlers;
    for (const name of [
      'initializeDashboardCache', 'refreshDashboardCache', 'removeTdfFromCache',
      'listManualContentDrafts', 'toggleCustomTheme', 'adminCreateOrUpdateUser',
    ]) {
      expect(handlers).not.to.have.own.property(name);
    }
    for (const name of [
      'ensureDashboardCacheCurrent', 'refreshUserAdminUsageCaches', 'getManualContentDraft',
      'saveManualContentDraft', 'setActiveTheme', 'insertNewUsers',
    ]) {
      expect(handlers[name]).to.be.a('function');
    }
  });

  it('excludes retired analytics reads and internal helpers from the Meteor registry', function() {
    const handlers = MeteorAny.server.method_handlers;
    for (const name of [
      'getLastTDFAccessed',
      'getUserRecentTDFs',
      'getNumDroppedItemsByUserIDAndTDFId',
      'getStudentPerformanceForClassAndTdfId',
      'getHistoryByTDFID',
      'getStimSetFromLearningSessionByClusterList',
      'getUserLastFeedbackTypeFromHistory',
    ]) {
      expect(handlers).not.to.have.own.property(name);
    }
    expect(handlers.getStimuliSetById).to.be.a('function');
    expect(handlers.getClassPerformanceByTDF).to.be.a('function');
    expect(handlers.getExperimentState).to.be.a('function');
  });

  it('derives experiment-state creation actor from method context', async function() {
    await TdfsAny.insertAsync({
      _id: 'state-tdf',
      ownerId: 'current-user',
      content: {
        fileName: 'state-tdf.json',
        tdfs: { tutor: { setspec: { lessonname: 'State TDF', userselect: 'false' }, unit: [{}] } },
      },
    });

    await (asyncMethods.createExperimentState as any).call(
      { userId: 'current-user' },
      { currentTdfId: 'state-tdf', currentRootTdfId: 'state-tdf' },
    );

    expect(await GlobalExperimentStatesAny.findOneAsync({ userId: 'other-user' })).to.equal(undefined);
    const stateDoc = await GlobalExperimentStatesAny.findOneAsync({ userId: 'current-user', TDFId: 'state-tdf' }) as any;
    expect(stateDoc).to.exist;
  });
});

describe('system method authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('requires admin access for server status and verbosity controls', async function() {
    try {
      await methods.getServerStatus.call({ userId: 'student-user' });
      expect.fail('Expected server status to require admin access');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }

    try {
      await methods.setVerbosity.call({ userId: 'student-user' }, 1);
      expect.fail('Expected verbosity changes to require admin access');
    } catch (error: any) {
      expect(error.error).to.equal('not-authorized');
    }
  });

  it('records ordinary account diagnostics and suppresses private study writes', async function() {
    const current = Random.id(), study = Random.id();
    const reports = (globalThis as any).ErrorReports;
    const handlers = MeteorAny.server.method_handlers;
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed diagnostic methods');
    for (const verification of ACCOUNT_DIAGNOSTIC_VERIFICATIONS) {
      const row = observed.surfaces.find(item => item.name === verification.method);
      expect(row?.verification).to.equal(verification);
      expect(row?.policy).to.deep.equal({ kind: 'diagnostic-telemetry', operation: 'non-private-account' });
    }
    const record = async (id: string) => {
      const context = { userId: id };
      await handlers.sendUserErrorReport.call(context, id, 'Invalid timestamps', '/content', { unit: 1 },
        'test-agent', ['trial start'], { currentUnitNumber: 1 });
      await handlers.logUserAgentAndLoginTime.call(context, id, 'test-agent');
      await handlers.setUserSessionId.call(context, 'practice-session', 12);
    };
    try {
      await MeteorUsersAny.insertAsync({ _id: current, username: current });
      await MeteorUsersAny.insertAsync({ _id: study, username: study, profile: { experiment: true } });
      await record(current);
      await record(study);
      const ordinary = await MeteorUsersAny.findOneAsync(current);
      expect(ordinary.status.userAgent).to.equal('test-agent');
      expect(ordinary.lastSessionId).to.equal('practice-session');
      const report = await reports.findOneAsync({ user: current });
      expect(report.logs).to.deep.equal(['trial start']);
      expect(report.currentExperimentState).to.deep.equal({ currentUnitNumber: 1 });
      expect(report.sessionVars).to.deep.equal({ unit: 1 });
      const participant = await MeteorUsersAny.findOneAsync(study);
      expect(participant.status).to.equal(undefined);
      expect(participant.lastSessionId).to.equal(undefined);
      expect(await reports.find({ user: study }).countAsync()).to.equal(0);
    } finally {
      await reports.removeAsync({ user: { $in: [current, study] } });
      await MeteorUsersAny.removeAsync({ _id: { $in: [current, study] } });
    }
  });

  it('requires login user-agent updates to target the current user', async function() {
    try {
      await methods.logUserAgentAndLoginTime.call({ userId: 'current-user' }, 'other-user', 'test-agent');
      expect.fail('Expected cross-user login status update to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('requires self-only error reports', async function() {
    try {
      await methods.sendUserErrorReport.call(
        { userId: 'current-user' },
        'other-user',
        'description',
        '/test',
        {},
        'agent',
        [],
        {}
      );
      expect.fail('Expected cross-user error report to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('requires admin access to change client verbosity settings', async function() {
    try {
      await methods.setClientVerbosity.call({ userId: 'student-user' }, 1);
      expect.fail('Expected client verbosity changes to require admin access');
    } catch (error: any) {
      expect(error.error).to.equal('not-authorized');
    }
  });
});

describe('not-max condition allocation transactions', function() {
  async function seed(countcompletion = 'end') {
    await TdfsAny.insertAsync({ _id: 'block-root', ownerId: 'block-owner', conditionCounts: [0, 0, 0],
      content: { fileName: 'block-root.json', tdfs: { tutor: { setspec: { lessonname: 'Blocks',
        userselect: 'true', loadbalancing: 'not-max', countcompletion,
        condition: ['block-a.json', 'block-b.json', 'block-c.json'],
        conditionTdfIds: ['block-a', 'block-b', 'block-c'],
      } } } } });
    for (const id of ['block-a', 'block-b', 'block-c']) {
      await TdfsAny.insertAsync({ _id: id, ownerId: 'block-owner',
        content: { fileName: `${id}.json`, tdfs: { tutor: { setspec: { lessonname: id }, unit: [{}] } } } });
    }
  }
  const allocate = (userId: string) => (asyncMethods.createExperimentState as any).call(
    { userId }, { currentRootTdfId: 'block-root', currentTdfId: 'block-root' }, { allocateCondition: true },
  );
  beforeEach(async function() { await clearServerCompositionCollections(); });

  it('commits concurrent distinct participants in balanced blocks using real Mongo transactions', async function() {
    await seed();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => allocate(`block-user-${i}`)));
    for (const id of ['block-a', 'block-b', 'block-c']) {
      expect(results.filter(result => result.conditionTdfId === id)).to.have.length(4);
    }
    expect(await GlobalExperimentStatesAny.find({ TDFId: 'block-root' }).countAsync()).to.equal(12);
    const root = await TdfsAny.findOneAsync('block-root');
    expect(root.conditionAllocation.cursor).to.equal(3);
    expect(root.conditionCounts).to.deep.equal([0, 0, 0]);
  });

  it('allocates a simultaneous same-user launch once, including beginning counts', async function() {
    await seed('beginning');
    const results = await Promise.all(Array.from({ length: 8 }, () => allocate('block-same-user')));
    expect(new Set(results.map(result => result.id)).size).to.equal(1);
    expect(new Set(results.map(result => result.conditionTdfId)).size).to.equal(1);
    const root = await TdfsAny.findOneAsync('block-root');
    expect(root.conditionCounts.reduce((sum: number, n: number) => sum + n, 0)).to.equal(1);
    expect(root.conditionAllocation.cursor).to.equal(1);
    const index = root.content.tdfs.tutor.setspec.conditionTdfIds.indexOf(results[0].conditionTdfId);
    let error: any;
    try { await (asyncMethods.incrementTdfConditionCount as any).call({ userId: 'block-same-user' }, 'block-root', index); }
    catch (caught) { error = caught; }
    expect(error?.error).to.equal(400);
  });

  it('preserves assignments on stale replacement writes and rejects client-selected reassignment', async function() {
    await seed();
    const assigned = await allocate('block-stable-user');
    const replaced = await (asyncMethods.createExperimentState as any).call(
      { userId: 'block-stable-user' }, { currentRootTdfId: 'block-root', currentTdfId: 'block-root' },
      { replaceExistingState: true },
    );
    expect(replaced.conditionTdfId).to.equal(assigned.conditionTdfId);
    const other = ['block-a', 'block-b', 'block-c'].find(id => id !== assigned.conditionTdfId);
    let rejected = false;
    try { await (asyncMethods.updateExperimentState as any).call({ userId: 'block-stable-user' },
      { currentRootTdfId: 'block-root', conditionTdfId: other }, assigned.id); }
    catch { rejected = true; }
    expect(rejected).to.equal(true);
    expect((await allocate('block-stable-user')).conditionTdfId).to.equal(assigned.conditionTdfId);
  });

  it('denies unauthenticated allocation and participant count replacement; permits the assigned later milestone', async function() {
    await seed();
    let error: any;
    try { await allocate(''); } catch (caught) { error = caught; }
    expect(error?.error).to.equal(401);
    const result = await allocate('block-milestone-user');
    const index = ['block-a', 'block-b', 'block-c'].indexOf(result.conditionTdfId);
    await (asyncMethods.incrementTdfConditionCount as any).call({ userId: 'block-milestone-user' }, 'block-root', index);
    error = null;
    try { await (asyncMethods.updateTdfConditionCounts as any).call({ userId: 'block-milestone-user' }, 'block-root', [0, 0, 0]); }
    catch (caught) { error = caught; }
    expect(error).to.exist;
    await (asyncMethods.resetTdfConditionCounts as any).call({ userId: 'block-owner' }, 'block-root');
    const root = await TdfsAny.findOneAsync('block-root');
    expect(root.conditionAllocation).to.equal(undefined);
    expect(root.conditionCounts).to.deep.equal([0, 0, 0]);
    expect((await allocate('block-milestone-user')).conditionTdfId).to.equal(result.conditionTdfId);
  });
});

describe('condition count method authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('binds all count methods to their installed study policies', function() {
    const observation = registeredMeteorMethodSurfaces();
    if (observation.state !== 'observed') throw new Error(observation.reason);
    const operations = {
      updateTdfConditionCounts: 'replace', incrementTdfConditionCount: 'increment', resetTdfConditionCounts: 'reset',
    } as const;
    for (const verification of Object.values(CONDITION_COUNT_VERIFICATIONS)) {
      const entries = observation.surfaces.filter(entry => entry.name === verification.method);
      expect(entries).to.have.length(1);
      expect(entries[0]?.verification).to.equal(verification);
      expect(entries[0]?.policy).to.deep.equal({ kind: 'study-condition-count', operation: operations[verification.method] });
      expect(entries[0]?.dataEgress).to.equal('none');
    }
  });

  it('requires the exact assigned condition for a later block milestone', async function() {
    const userId = 'audit-condition-participant';
    const root = 'audit-condition-root';
    await TdfsAny.insertAsync({ _id: root, ownerId: 'audit-condition-owner', conditionCounts: [0, 0],
      content: { tdfs: { tutor: { setspec: { lessonname: 'Synthetic study', userselect: 'true', loadbalancing: 'not-max',
        countcompletion: 'end', condition: ['left.json', 'right.json'], conditionTdfIds: ['left', 'right'] } } } } });
    await GlobalExperimentStatesAny.insertAsync({ userId, TDFId: root, experimentState: { conditionTdfId: 'left' } });
    const increment = MeteorAny.server.method_handlers.incrementTdfConditionCount;
    let failure: any;
    try { await increment.call({ userId }, root, 1); }
    catch (error) { failure = error; }
    expect(failure?.error).to.equal(403);
    expect(failure?.reason).to.equal('Can only count the participant’s assigned condition');
    expect((await TdfsAny.findOneAsync(root)).conditionCounts).to.deep.equal([0, 0]);
    await increment.call({ userId }, root, 0);
    expect((await TdfsAny.findOneAsync(root)).conditionCounts).to.deep.equal([1, 0]);
  });

  it('denies unauthenticated condition count updates', async function() {
    await TdfsAny.insertAsync({
      _id: 'condition-root',
      ownerId: 'owner-user',
      content: {
        fileName: 'condition-root.json',
        tdfs: { tutor: { setspec: { lessonname: 'Root', userselect: 'true', condition: ['a.json'] } } },
      },
    });

    try {
      await (asyncMethods.updateTdfConditionCounts as any).call({}, 'condition-root', [1]);
      expect.fail('Expected unauthenticated condition count update to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(401);
    }
  });

  it('denies condition count resets by unrelated users', async function() {
    await TdfsAny.insertAsync({
      _id: 'condition-reset-root',
      ownerId: 'owner-user',
      conditionCounts: [3],
      content: {
        fileName: 'condition-reset-root.json',
        tdfs: { tutor: { setspec: { lessonname: 'Root', userselect: 'false', condition: ['a.json'] } } },
      },
    });

    try {
      await (asyncMethods.resetTdfConditionCounts as any).call({ userId: 'other-user' }, 'condition-reset-root');
      expect.fail('Expected unrelated condition count reset to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('denies history insertion for another user', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-root',
      ownerId: 'owner-user',
      content: {
        fileName: 'history-root.json',
        tdfs: { tutor: { setspec: { lessonname: 'History Root', userselect: 'true' } } },
      },
    });

    try {
      await (asyncMethods.insertHistory as any).call({ userId: 'current-user' }, {
        userId: 'other-user',
        TDFId: 'history-root',
      });
      expect.fail('Expected cross-user history insertion to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('rejects non-canonical history envelopes before writing', async function() {
    try {
      await (asyncMethods.insertHistory as any).call({ userId: 'current-user' }, {
        userId: 'current-user',
        TDFId: 'history-incomplete',
      });
      expect.fail('Expected incomplete history insertion to be rejected');
    } catch (error: any) {
      expect(error.error).to.equal(400);
      expect(error.reason).to.contain('History record missing canonical core fields');
    }

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-incomplete',
    });
    expect(insertedHistory).to.equal(undefined);
  });

  it('rejects oversized history wire payloads before writing', async function() {
    try {
      await (asyncMethods.insertHistory as any).call(
        { userId: 'current-user' },
        createServerHistoryRecord({
          TDFId: 'history-oversized',
          CFNote: 'x'.repeat(40 * 1024),
        })
      );
      expect.fail('Expected oversized history insertion to be rejected');
    } catch (error: any) {
      expect(error.error).to.equal(400);
      expect(error.reason).to.contain('History wire payload exceeds');
    }

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-oversized',
    });
    expect(insertedHistory).to.equal(undefined);
  });

  it('rejects unsupported history schema versions before writing', async function() {
    try {
      await (asyncMethods.insertHistory as any).call(
        { userId: 'current-user' },
        createServerHistoryRecord({
          TDFId: 'history-unsupported-version',
          historySchemaVersion: 2,
        })
      );
      expect.fail('Expected unsupported history schema version to be rejected');
    } catch (error: any) {
      expect(error.error).to.equal(400);
      expect(error.reason).to.equal('History record historySchemaVersion must be 1');
    }

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-unsupported-version',
    });
    expect(insertedHistory).to.equal(undefined);
  });

  it('rejects oversized history extension fields before writing', async function() {
    try {
      await (asyncMethods.insertHistory as any).call(
        { userId: 'current-user' },
        createServerHistoryRecord({
          TDFId: 'history-extension-oversized',
          CFNote: 'x'.repeat(20 * 1024),
        })
      );
      expect.fail('Expected oversized history extension insertion to be rejected');
    } catch (error: any) {
      expect(error.error).to.equal(400);
      expect(error.reason).to.contain('History extension field CFNote exceeds');
    }

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-extension-oversized',
    });
    expect(insertedHistory).to.equal(undefined);
  });

  it('allows regular TDF history insertion when experiment state currentTdfId is the root', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-regular',
      ownerId: 'owner-user',
      stimuliSetId: 'set-1',
      content: {
        fileName: 'history-regular.json',
        tdfs: { tutor: { setspec: { lessonname: 'History Regular', userselect: 'true' } } },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: {},
      loginParams: {},
    });
    await GlobalExperimentStatesAny.insertAsync({
      userId: 'current-user',
      TDFId: 'history-regular',
      experimentState: {
        currentRootTdfId: 'history-regular',
        currentTdfId: 'history-regular',
        lastActionTimeStamp: Date.now(),
      },
    });

    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-regular' })
    );

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-regular',
    }) as any;
    expect(insertedHistory).to.exist;
    expect(insertedHistory.historySchemaVersion).to.equal(1);
  });

  it('updates stimulus crowd stats only after an accepted history insert', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-crowd-stats',
      ownerId: 'owner-user',
      stimuliSetId: 'set-1',
      content: {
        fileName: 'history-crowd-stats.json',
        tdfs: { tutor: { setspec: { lessonname: 'Crowd Stats', userselect: 'true' } } },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: {},
      loginParams: {},
    });

    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-crowd-stats', outcome: 'correct' })
    );
    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-crowd-stats', outcome: 'incorrect' })
    );

    const stat = await StimulusCrowdStatsAny.findOneAsync({ stimulusKey: 'set-1:kc-1' }) as any;
    expect(stat).to.exist;
    expect(stat.correctCount).to.equal(1);
    expect(stat.incorrectCount).to.equal(1);
    expect(stat.totalCount).to.equal(2);
    expect(stat.KCId).to.equal('kc-1');
  });

  it('returns scoped batched stimulus crowd stats for the current deck', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-crowd-read',
      ownerId: 'owner-user',
      stimuliSetId: 'set-1',
      content: {
        fileName: 'history-crowd-read.json',
        tdfs: { tutor: { setspec: { lessonname: 'Crowd Stats Read', userselect: 'true' } } },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: {},
      loginParams: {},
    });
    await StimulusCrowdStatsAny.insertAsync({
      stimulusKey: 'set-1:kc-1',
      stimuliSetId: 'set-1',
      stimulusKC: 'kc-1',
      KCId: 'kc-1',
      correctCount: 3,
      incorrectCount: 2,
      totalCount: 5,
      lastOutcomeAt: 1000,
      updatedAt: new Date(),
    });
    await StimulusCrowdStatsAny.insertAsync({
      stimulusKey: 'other-set:kc-1',
      stimuliSetId: 'other-set',
      stimulusKC: 'kc-1',
      KCId: 'kc-1',
      correctCount: 99,
      incorrectCount: 99,
      totalCount: 198,
      lastOutcomeAt: 1000,
      updatedAt: new Date(),
    });

    const stats = await (asyncMethods.getStimulusCrowdStatsForDeck as any).call(
      { userId: 'current-user' },
      'history-crowd-read',
      [
        { stimuliSetId: 'set-1', stimulusKC: 'kc-1' },
        { stimuliSetId: 'set-1', stimulusKC: 'missing-kc' },
      ]
    );

    expect(stats).to.deep.equal([{
      stimulusKey: 'set-1:kc-1',
      stimuliSetId: 'set-1',
      stimulusKC: 'kc-1',
      KCId: 'kc-1',
      correctCount: 3,
      incorrectCount: 2,
      totalCount: 5,
    }]);
  });

  it('denies stimulus crowd stats reads for inaccessible TDFs', async function() {
    await TdfsAny.insertAsync({
      _id: 'private-crowd-read',
      ownerId: 'owner-user',
      stimuliSetId: 'set-1',
      content: {
        fileName: 'private-crowd-read.json',
        tdfs: { tutor: { setspec: { lessonname: 'Private Crowd Stats', userselect: 'false' } } },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: {},
      loginParams: {},
    });

    try {
      await (asyncMethods.getStimulusCrowdStatsForDeck as any).call(
        { userId: 'current-user' },
        'private-crowd-read',
        [{ stimuliSetId: 'set-1', stimulusKC: 'kc-1' }]
      );
      expect.fail('Expected inaccessible crowd stats read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('allows history insertion for a condition assigned in root experiment state', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-root',
      ownerId: 'owner-user',
      content: {
        fileName: 'AllConditionsRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'History Root',
              experimentTarget: 'flashcardtest',
              userselect: 'false',
              condition: ['Generalflashcard1.json'],
              conditionTdfIds: ['history-condition'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'history-condition',
      ownerId: 'owner-user',
      content: {
        fileName: 'Generalflashcard1.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'General Flashcard 1',
              experimentTarget: 'GF1',
              userselect: 'false',
            },
          },
        },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: { experimentTarget: 'flashcardtest' },
      loginParams: { loginMode: 'experiment' },
    });
    await GlobalExperimentStatesAny.insertAsync({
      userId: 'current-user',
      TDFId: 'history-root',
      experimentState: {
        currentRootTdfId: 'history-root',
        currentTdfId: 'history-condition',
        conditionTdfId: 'history-condition',
        experimentTarget: 'flashcardtest',
        lastActionTimeStamp: Date.now(),
      },
    });

    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-condition' })
    );

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-condition',
    }) as any;
    expect(insertedHistory).to.exist;
  });

  it('allows condition history insertion when assignment state only has currentTdfId', async function() {
    await TdfsAny.insertAsync({
      _id: 'history-root',
      ownerId: 'owner-user',
      content: {
        fileName: 'AllConditionsRoot.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'History Root',
              experimentTarget: 'flashcardtest',
              userselect: 'false',
              condition: ['Generalflashcard1.json'],
              conditionTdfIds: ['history-condition'],
            },
          },
        },
      },
    });
    await TdfsAny.insertAsync({
      _id: 'history-condition',
      ownerId: 'owner-user',
      content: {
        fileName: 'Generalflashcard1.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'General Flashcard 1',
              experimentTarget: 'GF1',
              userselect: 'false',
            },
          },
        },
      },
    });
    await MeteorUsersAny.insertAsync({
      _id: 'current-user',
      profile: { experimentTarget: 'flashcardtest' },
      loginParams: { loginMode: 'experiment' },
    });
    await GlobalExperimentStatesAny.insertAsync({
      userId: 'current-user',
      TDFId: 'history-root',
      experimentState: {
        currentRootTdfId: 'history-root',
        currentTdfId: 'history-condition',
        experimentTarget: 'flashcardtest',
        lastActionTimeStamp: Date.now(),
      },
    });

    await (asyncMethods.insertHistory as any).call(
      { userId: 'current-user' },
      createServerHistoryRecord({ TDFId: 'history-condition' })
    );

    const insertedHistory = await HistoriesAny.findOneAsync({
      userId: 'current-user',
      TDFId: 'history-condition',
    }) as any;
    expect(insertedHistory).to.exist;
  });

  it('does not expose raw all-history TDF reads as a public method', function() {
    expect(asyncMethods.getHistoryByTDFID).to.equal(undefined);
    expect(asyncMethods.getOutcomesForAdaptiveLearning).to.equal(undefined);
  });

  it('denies adaptive-learning outcomes for another user', async function() {
    await TdfsAny.insertAsync({
      _id: 'adaptive-root',
      ownerId: 'owner-user',
      content: {
        fileName: 'adaptive-root.json',
        tdfs: { tutor: { setspec: { lessonname: 'Adaptive Root', userselect: 'true' } } },
      },
      stimuli: [],
    });

    try {
      await (asyncMethods.getAdaptiveOutcomeRows as any).call({ userId: 'current-user' }, 'other-user', 'adaptive-root');
      expect.fail('Expected cross-user adaptive outcomes read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });
});

describe('course method authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
    await Roles.createRoleAsync('admin', { unlessExists: true });
    await Roles.createRoleAsync('teacher', { unlessExists: true });
  });

  function boundCourseRead(name: keyof typeof COURSE_READ_VERIFICATIONS, operation: string) {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed Meteor method bindings');
    const entries = observed.surfaces.filter(row => row.name === name);
    expect(entries).to.have.length(1);
    expect(entries[0]?.verification).to.equal(COURSE_READ_VERIFICATIONS[name]);
    expect(entries[0]?.policy).to.deep.equal({ kind: 'course-read', operation });
    return MeteorAny.server.method_handlers[name];
  }

  async function expectCourseDenial(call: () => Promise<unknown>, code: number, reason?: string) {
    let denied: unknown;
    try { await call(); } catch (error) { denied = error; }
    expect(denied).to.be.instanceOf(Meteor.Error);
    expect(denied).to.include({ error: code });
    if (reason !== undefined) expect(denied).to.include({ reason });
  }

  it('counts assigned practice for enrolled learners at the exact report cutoff', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed class performance handler');
    const binding = observed.surfaces.find(row => row.name === 'getClassPerformanceByTDF');
    expect(binding?.verification).to.equal(CLASS_PERFORMANCE_VERIFICATION);
    const [owner, learner, outsider] = await Promise.all(Array.from({ length: 3 }, () =>
      MeteorUsersAny.insertAsync({ username: Random.id() })));
    const course = await CoursesAny.insertAsync({ teacherUserId: owner, timezone: 'America/Chicago' });
    const section = await SectionsAny.insertAsync({ courseId: course });
    await SectionUserMapAny.insertAsync({ userId: learner, sectionId: section });
    const lesson = Random.id(), otherCourse = Random.id(), otherLesson = Random.id();
    const assignment = await AssignmentsAny.insertAsync({ courseId: course, assignmentType: 'lesson', TDFId: lesson });
    const run = (who: string, selected: string, cutoff: number | false = false) =>
      MeteorAny.server.method_handlers.getClassPerformanceByTDF.call({ userId: who }, course, selected, cutoff);
    for (const origin of [undefined, course, otherCourse]) {
      await HistoriesAny.insertAsync({ userId: learner, TDFId: lesson, outcome: 'correct', recordedServerTime: 1,
        ...(origin ? { courseAssignment: { courseId: origin } } : {}) });
    }
    await HistoriesAny.insertAsync({ userId: outsider, TDFId: lesson, outcome: 'correct', recordedServerTime: 1 });
    await HistoriesAny.insertAsync({ userId: learner, TDFId: otherLesson, outcome: 'correct', recordedServerTime: 1 });
    await expectCourseDenial(() => run(outsider, lesson), 403);
    await expectCourseDenial(() => run(owner, otherLesson), 403);
    const [met, late] = await run(owner, lesson);
    expect(met.map((row: any) => [row.userId, row.count])).to.deep.equal([[learner, 3]]);
    expect(late).to.deep.equal([]);
    await AssignmentsAny.updateAsync(assignment, { $set: { assignmentType: 'progressive', memberTdfIds: [lesson] }, $unset: { TDFId: 1 } });
    expect((await run(owner, lesson))[0][0].count).to.equal(3);

    const cutoff = Date.parse('2026-12-01T17:00:00-06:00');
    await AssignmentsAny.updateAsync(assignment, { $set: { dueAt: new Date(cutoff) } });
    for (const recordedServerTime of [cutoff - 1, cutoff, cutoff + 1]) {
      await HistoriesAny.insertAsync({ userId: learner, TDFId: lesson, outcome: 'correct', recordedServerTime });
    }
    const [before, after, timing] = await run(owner, lesson);
    expect(timing).to.deep.equal({ assignmentDueAt: cutoff, cutoffAt: cutoff, timezone: 'America/Chicago' });
    expect([before[0].count, after[0].count]).to.deep.equal([4, 2]);
    await MeteorUsersAny.updateAsync(learner, { $set: { dueDateExceptions: [{ assignmentId: assignment, courseId: course, date: cutoff + 1 }] } });
    const [withException, stillLate, refreshed] = await run(owner, lesson);
    expect([withException[0].count, stillLate[0].count]).to.deep.equal([5, 1]);
    expect(refreshed).to.deep.equal(timing);
    expect((await run(owner, lesson, cutoff - 1))[2]).to.deep.equal({ ...timing, cutoffAt: cutoff - 1 });
  });

  it('binds course deletion to its owner or an administrator', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed Meteor method bindings');
    const rows = observed.surfaces.filter(row => row.name === 'deleteCourse');
    expect(rows).to.have.length(1);
    expect(rows[0]?.verification).to.equal(COURSE_DELETE_VERIFICATION);
    expect(rows[0]?.policy).to.deep.equal({ kind: 'course-management', operation: 'manage-course' });
    const [owner, other, admin, learner] = await Promise.all(Array.from({ length: 4 }, () =>
      MeteorUsersAny.insertAsync({ username: Random.id() })));
    await Roles.addUsersToRolesAsync([owner, other], 'teacher');
    await Roles.addUsersToRolesAsync(admin, 'admin');
    const create = () => CoursesAny.insertAsync({ teacherUserId: owner, courseName: Random.id() });
    const [first, second, untouched] = await Promise.all([create(), create(), create()]);
    const remove = MeteorAny.server.method_handlers.deleteCourse;
    await expectCourseDenial(() => remove.call({}, first), 401);
    for (const userId of [learner, other]) await expectCourseDenial(() => remove.call({ userId }, first), 403);
    expect(await remove.call({ userId: owner }, first)).to.equal(true);
    expect(await remove.call({ userId: admin }, second)).to.equal(true);
    expect(await CoursesAny.find({ _id: { $in: [first, second, untouched] } }).countAsync()).to.equal(1);
    expect(await CoursesAny.findOneAsync(untouched)).to.exist;
  });

  it('requires an available progressive assignment before returning lesson content', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed Meteor method bindings');
    const rows = observed.surfaces.filter(row => row.name === 'getProgressiveAssignmentLaunch');
    expect(rows).to.have.length(1);
    expect(rows[0]?.verification).to.equal(COURSE_READ_VERIFICATIONS.getProgressiveAssignmentLaunch);
    expect(rows[0]?.policy).to.deep.equal({ kind: 'course-launch', operation: 'progressive-prefix' });
    const launch = MeteorAny.server.method_handlers.getProgressiveAssignmentLaunch;
    const userId = await MeteorUsersAny.insertAsync({ username: Random.id() });
    await expectCourseDenial(() => launch.call({}, Random.id(), Random.id()), 401);
    await expectCourseDenial(() => launch.call({ userId }, Random.id(), Random.id()), 403,
      'Progressive assignment is not available for this user');
  });

  it('returns a successful section join when the confirmation has no recipient', async function() {
    const learner = await MeteorUsersAny.insertAsync({ username: Random.id() });
    const teacher = await MeteorUsersAny.insertAsync({ username: Random.id() });
    const course = await CoursesAny.insertAsync({ teacherUserId: teacher, courseName: 'Enrollment test' });
    const section = await SectionsAny.insertAsync({ courseId: course, sectionName: 'A' });
    const join = MeteorAny.server.method_handlers.addUserToTeachersClass;
    await expectCourseDenial(() => join.call({}, teacher, section), 401);
    await expectCourseDenial(() => join.call({ userId: learner }, Random.id(), section), 403);
    expect(await SectionUserMapAny.find({ userId: learner }).countAsync()).to.equal(0);
    expect(await join.call({ userId: learner }, teacher, section)).to.equal(true);
    expect(await join.call({ userId: learner }, teacher, section)).to.equal(true);
    expect(await SectionUserMapAny.find({ userId: learner, sectionId: section }).countAsync()).to.equal(1);
  });

  it('limits new course owners to existing teachers and administrators', async function() {
    const users = await Promise.all(['admin', 'teacher', 'otherAdmin', 'learner'].map(() =>
      MeteorUsersAny.insertAsync({ username: Random.id() })));
    const [admin, teacher, otherAdmin, learner] = users;
    await Roles.addUsersToRolesAsync(admin, 'admin');
    await Roles.addUsersToRolesAsync(otherAdmin, 'admin');
    await Roles.addUsersToRolesAsync(teacher, 'teacher');
    const handlers = MeteorAny.server.method_handlers;
    const create = (userId: string, teacherUserId: string) => handlers.addCourse.call({ userId }, {
      courseName: Random.id(), timezone: 'America/Chicago', teacherUserId, sections: ['A'],
    });
    const ineligible = 'Course owner must be an existing teacher or administrator';
    for (const id of [learner, Random.id()]) await expectCourseDenial(() => create(admin, id), 400, ineligible);
    await expectCourseDenial(() => create(admin, ''), 400, 'A valid course owner ID is required');
    expect(await CoursesAny.find({}).countAsync()).to.equal(0);
    const own = await create(teacher, otherAdmin);
    expect((await CoursesAny.findOneAsync(own)).teacherUserId).to.equal(teacher);
    const courseId = await create(admin, teacher);
    const section = await SectionsAny.findOneAsync({ courseId });
    const transfer = (teacherUserId: string) => handlers.editCourse.call({ userId: admin }, {
      courseId, courseName: 'Synthetic course', teacherUserId, sections: [],
      existingSections: [{ sectionId: section._id, originalName: 'A', sectionName: 'A', remove: false }],
    });
    await Roles.removeUsersFromRolesAsync(teacher, 'teacher');
    await transfer(teacher);
    for (const id of [learner, Random.id()]) await expectCourseDenial(() => transfer(id), 400, ineligible);
    expect((await CoursesAny.findOneAsync(courseId)).teacherUserId).to.equal(teacher);
    await transfer(otherAdmin);
    expect((await CoursesAny.findOneAsync(courseId)).teacherUserId).to.equal(otherAdmin);
  });

  it('renames sections in place and deletes only explicitly selected sections', async function() {
    const teacher = await MeteorUsersAny.insertAsync({ username: Random.id() });
    const student = await MeteorUsersAny.insertAsync({ username: Random.id() });
    await Roles.addUsersToRolesAsync(teacher, 'teacher');
    const courseId = await CoursesAny.insertAsync({ teacherUserId: teacher, semester: 'SU_2022', courseName: 'Original', timezone: 'America/Chicago' });
    const sectionId = await SectionsAny.insertAsync({ courseId, sectionName: 'A' });
    const sibling = await SectionsAny.insertAsync({ courseId, sectionName: 'B' });
    const membership = await SectionUserMapAny.insertAsync({ userId: student, sectionId });
    const formerStudent = Random.id();
    const exiting = await SectionUserMapAny.insertAsync({ userId: formerStudent, sectionId: sibling });
    const assignment = await AssignmentsAny.insertAsync({ courseId, TDFId: Random.id() });
    await CourseLearnerSnapshotCache.insertAsync({ userId: student, assignedCourseIds: [courseId], publicCourseIds: [], version: COURSE_SNAPSHOT_VERSION } as any);
    await CourseLearnerSnapshotCache.insertAsync({ userId: formerStudent, assignedCourseIds: [courseId], publicCourseIds: [], version: COURSE_SNAPSHOT_VERSION } as any);
    const a = { sectionId, sectionName: 'Monday', originalName: 'A', remove: false };
    const b = { sectionId: sibling, sectionName: 'B', originalName: 'B', remove: false };
    const edit = (existingSections: unknown[], sections: string[] = [], userId = teacher) =>
      MeteorAny.server.method_handlers.editCourse.call({ userId }, { courseId, courseName: 'Updated', existingSections, sections });
    await expectCourseDenial(() => edit([a, b], [], student), 403);
    await expectCourseDenial(() => edit([a]), 409);
    await expectCourseDenial(() => edit([a, b], ['Monday']), 400);
    expect((await CoursesAny.findOneAsync(courseId)).courseName).to.equal('Original');
    expect((await SectionsAny.findOneAsync(sectionId)).sectionName).to.equal('A');
    await edit([a, b]);
    expect((await SectionsAny.findOneAsync(sectionId)).sectionName).to.equal('Monday');
    expect(await SectionUserMapAny.findOneAsync(membership)).to.include({ userId: student, sectionId });
    expect(await MeteorAny.server.method_handlers.addUserToTeachersClass.call({ userId: student }, teacher, sectionId)).to.equal(true);
    await expectCourseDenial(() => edit([a, { ...b, remove: true }]), 409);
    expect(await SectionUserMapAny.findOneAsync(exiting)).to.exist;
    await CourseLearnerSnapshotCache.updateAsync({ userId: formerStudent }, { $set: { invalidatedAt: null } } as any);
    await edit([{ ...a, originalName: 'Monday' }, { ...b, remove: true }], ['Tuesday']);
    expect(await SectionsAny.findOneAsync(sibling)).not.to.exist;
    expect(await SectionUserMapAny.findOneAsync(exiting)).not.to.exist;
    expect(await SectionsAny.findOneAsync({ courseId, sectionName: 'Tuesday' })).to.exist;
    expect(await SectionUserMapAny.findOneAsync(membership)).to.exist;
    expect(await AssignmentsAny.findOneAsync(assignment)).to.exist;
    expect((await CourseLearnerSnapshotCache.findOneAsync({ userId: formerStudent }))?.invalidatedAt).to.be.instanceOf(Date);
    expect((await CourseLearnerSnapshotCache.findOneAsync({ userId: student }))?.invalidatedAt).to.be.instanceOf(Date);
  });

  it('clears either course boundary and invalidates the learner snapshot', async function() {
    const teacher = await MeteorUsersAny.insertAsync({ username: Random.id() });
    const learner = await MeteorUsersAny.insertAsync({ username: Random.id() });
    await Roles.addUsersToRolesAsync(teacher, 'teacher');
    const beginDate = new Date('2035-01-01T00:00:00Z');
    const endDate = new Date('2035-02-01T00:00:00Z');
    const courseName = Random.id();
    const courseId = await CoursesAny.insertAsync({ courseName, teacherUserId: teacher, timezone: 'America/Chicago', beginDate, endDate });
    const sectionId = await SectionsAny.insertAsync({ courseId, sectionName: 'A' });
    await SectionUserMapAny.insertAsync({ sectionId, userId: learner });
    await CourseLearnerSnapshotCache.insertAsync({ userId: learner, assignedCourseIds: [courseId], publicCourseIds: [], version: COURSE_SNAPSHOT_VERSION } as any);
    const edit = (dates: { beginDate?: Date | null; endDate?: Date | null }) =>
      MeteorAny.server.method_handlers.editCourse.call({ userId: teacher }, {
        courseId, courseName, existingSections: [{ sectionId, originalName: 'A', sectionName: 'A', remove: false }], sections: [], ...dates,
      });

    await edit({ beginDate: null });
    expect(await CoursesAny.findOneAsync(courseId)).to.include({ beginDate: null });
    expect((await CoursesAny.findOneAsync(courseId)).endDate).to.deep.equal(endDate);
    expect((await CourseLearnerSnapshotCache.findOneAsync({ userId: learner }))?.invalidatedAt).to.be.instanceOf(Date);

    await edit({ beginDate, endDate: null });
    expect(await CoursesAny.findOneAsync(courseId)).to.include({ endDate: null });
    expect((await CoursesAny.findOneAsync(courseId)).beginDate).to.deep.equal(beginDate);
  });

  it('requires current course enrollment for each due-date exception edit', async function() {
    const teacher = await MeteorUsersAny.insertAsync({ username: Random.id() });
    const student = await MeteorUsersAny.insertAsync({ username: Random.id(), profile: { retained: true } });
    await Roles.addUsersToRolesAsync(teacher, 'teacher');
    const course = await CoursesAny.insertAsync({ teacherUserId: teacher });
    const section = await SectionsAny.insertAsync({ courseId: course });
    const lesson = Random.id();
    const assignment = await AssignmentsAny.insertAsync({ courseId: course, assignmentType: 'lesson', TDFId: lesson });
    const handlers = MeteorAny.server.method_handlers;
    const actor = { userId: teacher };
    const add = (date: number) => handlers.addUserDueDateException.call(actor, student, lesson, course, date, assignment);
    const remove = () => handlers.removeUserDueDateException.call(actor, student, lesson, course, assignment);
    await expectCourseDenial(() => add(1000), 403);
    await expectCourseDenial(remove, 403);
    const membership = await SectionUserMapAny.insertAsync({ sectionId: section, userId: student });
    await add(1000);
    await add(2000);
    const read = () => MeteorUsersAny.findOneAsync(student);
    const saved = (await read()).dueDateExceptions;
    expect(saved).to.have.length(1);
    expect(saved[0]).to.include({ courseId: course, assignmentId: assignment, date: 2000 });
    await SectionUserMapAny.removeAsync(membership);
    await expectCourseDenial(() => add(3000), 403);
    await expectCourseDenial(remove, 403);
    expect((await read()).dueDateExceptions).to.deep.equal(saved);
    await SectionUserMapAny.insertAsync({ sectionId: section, userId: student });
    await remove();
    expect((await read()).dueDateExceptions).to.deep.equal([]);
    expect((await read()).profile).to.deep.equal({ retained: true });
  });

  it('preserves assigned lessons after sharing ends and checks every new use', async function() {
    const teacher = await MeteorUsersAny.insertAsync({ username: Random.id() });
    const admin = await MeteorUsersAny.insertAsync({ username: Random.id() });
    await Roles.addUsersToRolesAsync(teacher, 'teacher');
    await Roles.addUsersToRolesAsync(admin, 'admin');
    const courseId = await CoursesAny.insertAsync({ teacherUserId: teacher, semester: 'SU_2022', timezone: 'America/Chicago' });
    const first = await TdfsAny.insertAsync({ ownerId: admin, accessors: [{ userId: teacher }] });
    const second = await TdfsAny.insertAsync({ ownerId: teacher });
    const save = MeteorAny.server.method_handlers.saveCourseAssignments;
    const editor = MeteorAny.server.method_handlers.getCourseAssignmentEditorSnapshot;
    const registry = registeredMeteorMethodSurfaces();
    if (registry.state !== 'observed') throw new Error('Expected installed Meteor methods');
    for (const name of ['saveCourseAssignments', 'getCourseAssignmentEditorSnapshot']) {
      expect(registry.surfaces.find(row => row.name === name)?.policy).to.deep.equal({ kind: 'course-management', operation: 'manage-course' });
    }
    const row = { assignmentType: 'lesson', TDFId: first, order: 0, required: false };
    const write = (assignments: unknown[], userId = teacher) => save.call({ userId }, { courseId, assignments });
    await expectCourseDenial(() => write([row], Random.id()), 403);
    await write([row]);
    const original = await AssignmentsAny.findOneAsync({ courseId, TDFId: first });
    await TdfsAny.updateAsync(first, { $set: { accessors: [] } });
    const snapshot = await editor.call({ userId: teacher }, courseId);
    expect(snapshot.assignableTdfs.map((tdf: any) => tdf.TDFId)).not.to.include(first);
    expect(snapshot.assignments.map((a: any) => a.assignmentId)).to.include(original._id);
    const kept = { ...row, assignmentId: original._id, required: true };
    await write([kept, { ...row, TDFId: second }]);
    expect((await AssignmentsAny.findOneAsync(original._id)).required).to.equal(true);
    const other = await AssignmentsAny.findOneAsync({ courseId, TDFId: second });
    await expectCourseDenial(() => write([{ ...kept, assignmentId: other._id }]), 404);
    await expectCourseDenial(() => write([{ ...kept, assignmentType: 'progressive', TDFId: undefined,
      title: 'Sequence', memberTdfIds: [first, second] }]), 404);
    await expectCourseDenial(() => write([row]), 404);
    expect(await AssignmentsAny.find({ courseId }).countAsync()).to.equal(2);
    await write([]);
    await expectCourseDenial(() => write([row]), 404);
    await write([row], admin);
    expect(await AssignmentsAny.find({ courseId, TDFId: first }).countAsync()).to.equal(1);
  });

  it('limits learner teacher discovery to public or enrolled sections', async function() {
    const directory = boundCourseRead('getAllTeachers', 'section-directory');
    const sections = boundCourseRead('getAllCourseSections', 'section-directory');
    await expectCourseDenial(() => directory.call({}), 401);
    await expectCourseDenial(() => sections.call({}), 401);
    const learner = { userId: await MeteorUsersAny.insertAsync({ username: Random.id() }) };
    const fixtures: Array<{ teacher: string; label: string; section: string | null }> = [];
    for (const kind of ['public', 'private', 'other', 'empty', 'past', 'former']) {
      const label = Random.id() + '@example.test';
      const teacher = await MeteorUsersAny.insertAsync({ username: Random.id(), email_canonical: label });
      if (kind !== 'former') await Roles.addUsersToRolesAsync(teacher, 'teacher');
      const course = await CoursesAny.insertAsync({ teacherUserId: teacher, courseName: kind,
        semester: kind === 'past' ? 'past' : 'SU_2022', visibility: ['private', 'other'].includes(kind) ? 'private' : 'public' });
      const section = kind === 'empty' ? null : await SectionsAny.insertAsync({ courseId: course, sectionName: kind });
      fixtures.push({ teacher, label, section });
    }
    const [visible, invited, other] = fixtures;
    await SectionUserMapAny.insertAsync({ userId: Random.id(), sectionId: other!.section });
    const option = (row: typeof fixtures[number]) => ({ _id: row.teacher, displayIdentifier: row.label });
    expect(await directory.call(learner)).to.deep.equal([option(visible!)]);
    expect((await sections.call(learner)).some((s: any) => s.sectionId === invited!.section)).to.equal(false);
    await SectionUserMapAny.insertAsync({ userId: learner.userId, sectionId: invited!.section });
    expect(await directory.call(learner)).to.have.deep.members([option(visible!), option(invited!)]);
    expect((await sections.call(learner)).some((s: any) => s.sectionId === invited!.section)).to.equal(true);
    const staff = await directory.call({ userId: visible!.teacher });
    expect(staff).to.deep.include(option(other!));
    for (const row of staff) expect(Object.keys(row).sort()).to.deep.equal(['_id', 'displayIdentifier']);
  });

  it('binds the learner course snapshot to the current account session', async function() {
    const read = boundCourseRead('getLearnerCoursesSnapshot', 'own-account-session');
    const userId = await MeteorUsersAny.insertAsync({ username: Random.id() });
    await expectCourseDenial(() => read.call({}), 401);
    try {
      const snapshot = await read.call({ userId });
      expect(snapshot.assignedCourses).to.be.an('array');
      expect(snapshot.publicCourses).to.be.an('array');
    } finally {
      await CourseLearnerSnapshotCache.removeAsync({ userId });
    }
  });

  it('binds instructor course reads to the instructor or an administrator', async function() {
    const teacher = await MeteorUsersAny.insertAsync({ username: Random.id() });
    const admin = await MeteorUsersAny.insertAsync({ username: Random.id() });
    await Roles.addUsersToRolesAsync(teacher, 'teacher');
    await Roles.addUsersToRolesAsync(admin, 'admin');
    const courseId = Random.id(), otherCourseId = Random.id(), lessonId = Random.id();
    const fileName = 'synthetic-course-lesson.json';
    for (const [id, instructor] of [[courseId, teacher], [otherCourseId, admin]]) {
      await CoursesAny.insertAsync({ _id: id, semester: 'SU_2022', teacherUserId: instructor, courseName: id });
      await AssignmentsAny.insertAsync({ courseId: id, assignmentType: 'lesson', TDFId: lessonId });
    }
    await TdfsAny.insertAsync({ _id: lessonId, content: { fileName } });
    for (const name of ['getAllCoursesForInstructor', 'getTdfAssignmentsByCourseIdMap'] as const) {
      const read = boundCourseRead(name, 'instructor-or-admin');
      await expectCourseDenial(() => read.call({}, teacher), 401);
      await expectCourseDenial(() => read.call({ userId: Random.id() }, teacher), 403);
      await expectCourseDenial(() => read.call({ userId: teacher }, admin), 403);
      const own = await read.call({ userId: teacher }, teacher);
      if (name === 'getAllCoursesForInstructor') expect(own.map((row: any) => row._id)).to.deep.equal([courseId]);
      if (name === 'getTdfAssignmentsByCourseIdMap') expect(Object.keys(own)).to.deep.equal([courseId]);
      expect(await read.call({ userId: admin }, teacher)).to.deep.equal(own);
    }
  });

  it('denies course creation by non-teachers', async function() {
    try {
      await (asyncMethods.addCourse as any).call({ userId: 'student-user' }, {
        courseName: 'Student Course',
        sections: ['A'],
      });
      expect.fail('Expected non-teacher course creation to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

  it('denies cross-instructor course reads', async function() {
    await Roles.addUsersToRolesAsync('teacher-a', 'teacher');
    await Roles.addUsersToRolesAsync('teacher-b', 'teacher');

    try {
      await (asyncMethods.getAllCoursesForInstructor as any).call({ userId: 'teacher-b' }, 'teacher-a');
      expect.fail('Expected cross-instructor course read to be denied');
    } catch (error: any) {
      expect(error.error).to.equal(403);
    }
  });

});

describe('content helper authorization', function() {
  beforeEach(async function() {
    await clearServerCompositionCollections();
  });

  it('omits retired owner lookups and returns only the selected lesson response mapping', async function() {
    for (const name of ['getTdfOwnersMap', 'getTdfsByOwnerId']) {
      expect(MeteorAny.server.method_handlers).not.to.have.own.property(name);
    }
    const owner = Random.id();
    const lesson = async (answer: string, responseKC: number) => TdfsAny.insertAsync({
      ownerId: owner, stimuli: [{ correctResponse: answer, responseKC }],
    });
    const selected = await lesson('Alpha', 3);
    await lesson('Beta', 99);
    const map = await MeteorAny.server.method_handlers.getResponseKCMapForTdf.call({ userId: owner }, selected);
    expect(map).to.deep.equal({ alpha: 3 });
  });

  it('returns stimulus files only to the lesson owner and explicit accessors', async function() {
    const name = 'getStimuliFileForTdf';
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed method bindings');
    const rows = observed.surfaces.filter(row => row.name === name);
    expect(rows).to.have.length(1);
    expect(rows[0]?.verification).to.equal(STIMULUS_FILE_VERIFICATION);
    expect(rows[0]?.policy).to.deep.equal({ kind: 'lesson-file', operation: 'owner-or-accessor' });
    const owner = Random.id(), shared = Random.id();
    const file = { setspec: { name: 'synthetic' } };
    const id = await TdfsAny.insertAsync({ ownerId: owner, accessors: [{ userId: shared }],
      rawStimuliFile: file, content: { tdfs: { tutor: { setspec: { stimulusfile: 'test.json', userselect: 'true' } } } } });
    const read = MeteorAny.server.method_handlers[name];
    for (const [context, expected] of [[{}, 401], [{ userId: Random.id() }, 403]] as const) {
      let denied;
      try { await read.call(context, id); } catch (err) { denied = err; }
      expect(denied).to.include({ error: expected });
    }
    for (const userId of [owner, shared]) {
      expect(await read.call({ userId }, id)).to.deep.equal({ fileName: 'test.json', stimFile: file });
    }
  });

  it('keeps the retired course lookup and internal course helpers out of Meteor', function() {
    const handlers = MeteorAny.server.method_handlers;
    for (const name of [
      'getAllCourses', 'getAllCourseAssignmentsForInstructor', 'getTdfNamesAssignedByInstructor',
      'editCourseAssignments', 'checkForUserException', 'getTdfsAssignedToStudent', 'resolveAssignedRootTdfIdsForUser', 'invalidateCourseSnapshotForUser',
      'invalidateCourseSnapshotsForCourse', 'invalidateCourseSnapshotsForAssignment',
      'getTdfIdsByOwnerId', 'getSourceSentences', 'checkForTDFData',
    ]) {
      expect(handlers).not.to.have.own.property(name);
    }
    expect(handlers.getLearnerCoursesSnapshot).to.be.a('function');
  });

  it('retires the five unused status methods and preserves the active help and speech methods', function() {
    const handlers = MeteorAny.server.method_handlers;
    for (const name of [
      'getCustomHelpPageStatus', 'getPasswordHashRuntimeInfo', 'getUserSpeechAPIKey',
      'getTdfSpeechAPIKey', 'getTdfTTSAPIKey',
    ]) {
      expect(handlers).not.to.have.own.property(name);
    }
    for (const name of ['getCustomHelpPage', 'hasUserPersonalKeys', 'isUserSpeechAPIKeySetup']) {
      expect(handlers[name]).to.be.a('function');
    }
  });

  it('does not expose retired mail, logging or content methods', function() {
    for (const name of ['sendEmail', 'sendErrorReportSummaries', 'serverLog', 'debugLog']) {
      expect(MeteorAny.server.method_handlers).not.to.have.own.property(name);
    }
    expect(asyncMethods).not.to.have.property('saveContentFile');
    expect(asyncMethods).not.to.have.property('tdfUpdateConfirmed');
  });
});


describe('Prolific composed account and completion methods', function() {
  beforeEach(async function() { await clearServerCompositionCollections(); });
  it('issues resume tokens for one immutable participation and denies ordinary provisioning of its account', async function() {
    const studyId = 'b'.repeat(24), participantId = 'a'.repeat(24), submissionId = 'c'.repeat(24);
    const url = 'https://app.prolific.com/submissions/complete?cc=ABC123';
    await TdfsAny.insertAsync({ _id: 'prolific-root', ownerId: 'researcher', tdfAvailability: 'available', content: { tdfs: { tutor: { setspec: { experimentTarget: studyId, prolificCompletionUrl: url }, unit: [{ deliverySettings: { lockoutminutes: 5 } }] } } } });
    await ProlificStudies.insertAsync({ studyId, rootTdfId: 'prolific-root', ownerId: 'researcher', reminderText: 'Synthetic' });
    const launch = { participantId, studyId, submissionId, experimentTarget: studyId };
    const first = await methods.startProlificParticipation.call({}, launch);
    const p = await ProlificParticipations.findOneAsync({ submissionId });
    const account = await MeteorUsersAny.findOneAsync({ _id: p.userId });
    expect(first.loginToken).to.be.a('string');
    expect(account.services.resume.loginTokens.length).to.equal(1);
    expect(account.profile).not.to.have.property('participantId');
    expect(account).not.to.have.property('aws');
    const second = await methods.startProlificParticipation.call({}, launch);
    expect(second.loginToken).not.to.equal(first.loginToken);
    expect(await ProlificParticipations.find({ submissionId }).countAsync()).to.equal(1);
    try {
      await methods.provisionExperimentUser.call({}, studyId, account.username);
      expect.fail('Ordinary entry must not mint a Prolific token');
    } catch (error: any) { expect(error.error).to.equal(403); }
    await ProlificParticipations.updateAsync({ _id: p._id }, { $set: { userId: `pending:${p._id}` } });
    try {
      await methods.provisionExperimentUser.call({}, studyId, account.username);
      expect.fail('An account awaiting participation binding must also reject ordinary entry');
    } catch (error: any) { expect(error.error).to.equal(403); }
    await ProlificParticipations.updateAsync({ _id: p._id }, { $set: { userId: p.userId } });
    await GlobalExperimentStatesAny.insertAsync({ userId: p.userId, TDFId: 'prolific-root', experimentState: { currentUnitNumber: 0, lastUnitCompleted: -1 } });
    const observation = registeredMeteorMethodSurfaces();
    expect(observation.state).to.equal('observed');
    if (observation.state !== 'observed') throw new Error('Waiting period binding is unavailable');
    const binding = observation.surfaces.find(row => row.name === 'setLockoutTimeStamp');
    expect(binding?.policy).to.deep.equal({ kind: 'study-wait', operation: 'start-or-resume' });
    expect(binding?.dataEgress).to.equal('saved-wait');
    const lockouts = await Promise.all(Array.from({ length: 4 }, () => methods.setLockoutTimeStamp.call({ userId: p.userId }, 0, 999, 0, 'prolific-root')));
    expect(new Set(lockouts.map((lockout: any) => lockout.lockoutTimeStamp)).size).to.equal(1);
    expect(lockouts[0].lockoutMinutes).to.equal(5);
    expect(lockouts[0].lockoutTimeStamp).to.be.greaterThan(0);
    expect((await methods.completeProlificParticipation.call({ userId: p.userId })).completionUrl).to.equal(undefined);
    await GlobalExperimentStatesAny.updateAsync({ userId: p.userId, TDFId: 'prolific-root' }, { $set: { experimentState: { currentUnitNumber: 1, lastUnitCompleted: 0 } } });
    const completed = await methods.completeProlificParticipation.call({ userId: p.userId });
    expect(completed.completionUrl).to.equal(url);
    expect(completed.completed).to.equal(true);
    expect((await methods.completeProlificParticipation.call({ userId: p.userId }, true)).completionUrl).to.equal(url);
  });
  it('keeps ordinary manual and password-required experiments separate from completion configuration', async function() {
    await TdfsAny.insertAsync({ _id: 'ordinary-root', ownerId: 'researcher', tdfAvailability: 'available', content: { tdfs: { tutor: { setspec: { experimentTarget: 'ordinary', prolificCompletionUrl: 'https://app.prolific.com/submissions/complete?cc=ABC123' }, unit: [{}] } } } });
    const ordinary = await methods.provisionExperimentUser.call({}, 'ordinary', 'PR-ORDINARY');
    expect(ordinary.loginToken).to.be.a('string');
    expect(await methods.completeProlificParticipation.call({ userId: ordinary.userId })).to.deep.equal({ prolific: false });
    await TdfsAny.updateAsync({ _id: 'ordinary-root' }, { $set: { 'content.tdfs.tutor.setspec.experimentPasswordRequired': true } });
    try {
      await methods.provisionExperimentUser.call({}, 'ordinary', 'ANOTHER-PARTICIPANT');
      expect.fail('Password-required experiments must retain credentialed login');
    } catch (error: any) { expect(error.error).to.equal('experiment-password-required'); }
  });
});

describe('dashboard preference', () => {
  it('persists only the signed-in user practice statistics boolean', async () => {
    const id = Random.id(), other = Random.id();
    const key = 'practiceTableStatisticsExpanded';
    const handlers = MeteorAny.server.method_handlers;
    const read = (userId: string, name = key) => handlers.getUserPreference.call({ userId }, name);
    const write = (userId: string, name: string, value: unknown) => handlers.setUserPreference.call({ userId }, name, value);
    const { rejects } = await import('node:assert/strict');
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Preference registry unavailable');
    for (const method of ['getUserPreference', 'setUserPreference']) {
      expect(observed.surfaces.find(row => row.name === method)?.policy).to.deep.equal({ kind: 'dashboard-preference', operation: 'self' });
    }
    try {
      await MeteorUsersAny.insertAsync({ _id: id, preferences: { existing: 17 } });
      await MeteorUsersAny.insertAsync({ _id: other, preferences: { [key]: true } });
      expect(await read(id)).to.equal(undefined);
      await rejects(read(''), { error: 'not-authorized' });
      await rejects(write('', key, true), { error: 'not-authorized' });
      await rejects(read(id, 'existing'), { error: 'invalid-preference' });
      await rejects(write(id, 'existing', false), { error: 'invalid-preference' });
      for (const value of [true, false]) {
        expect(await write(id, key, value)).to.equal(true);
        expect(await read(id)).to.equal(value);
      }
      await rejects(write(id, key, 'true'), { error: 'invalid-preference' });
      expect(await read(other)).to.equal(true);
      expect((await MeteorUsersAny.findOneAsync(id)).preferences).to.deep.equal({ existing: 17, [key]: false });
      await MeteorUsersAny.updateAsync(id, { $set: { ['preferences.' + key]: { invalid: true } } });
      await rejects(read(id), { error: 'invalid-preference' });
    } finally {
      await MeteorUsersAny.removeAsync({ _id: { $in: [id, other] } });
    }
  });
});

describe('personal audio settings', () => {
  it('validates the whole patch and preserves omitted personal audio choices', async () => {
    const id = Random.id();
    const handler = MeteorAny.server.method_handlers.saveAudioSettings;
    const save = (patch: unknown) => handler.call({ userId: id }, patch);
    const read = async () => (await MeteorUsersAny.findOneAsync(id)).audioSettings;
    const { rejects } = await import('node:assert/strict');
    const observation = registeredMeteorMethodSurfaces();
    if (observation.state !== 'observed') throw new Error('Audio method registry unavailable');
    expect(observation.surfaces.find(row => row.name === 'saveAudioSettings')?.policy).to.deep.equal({ kind: 'personal-audio', operation: 'self' });
    try {
      await MeteorUsersAny.insertAsync({ _id: id, audioPromptMode: 'feedback', audioInputMode: true });
      await rejects(handler.call({}, { audioInputSensitivity: 70 }), { error: 401 });
      await rejects(save({ audioInputSensitivity: 70, unknown: true }), { error: 'invalid-audio-settings' });
      expect(await read()).to.equal(undefined);
      await Promise.all([save({ audioInputSensitivity: 70 }), save({ audioPromptVoice: 'en-US-Standard-J' })]);
      const baseline = await read();
      expect(baseline).to.include({ audioInputMode: true, audioPromptMode: 'feedback', audioInputSensitivity: 70, audioPromptVoice: 'en-US-Standard-J' });
      for (const invalid of [{ audioPromptMode: 'custom' }, { audioInputMode: 1 }, { audioPromptVoice: 'unknown' },
        { audioPromptFeedbackVoice: '' }, { audioPromptQuestionVolume: -7 }, { audioPromptFeedbackVolume: 0.1 },
        { audioPromptQuestionSpeakingRate: 0 }, { audioPromptFeedbackSpeakingRate: 1.1 }, { audioInputSensitivity: '70' }]) {
        await rejects(save({ audioInputSensitivity: 30, ...invalid }), { error: 'invalid-audio-settings' });
      }
      expect(await read()).to.deep.equal(baseline);
      await save({ audioPromptQuestionVolume: -6, audioPromptFeedbackVolume: 6, audioPromptQuestionSpeakingRate: 0.25, audioPromptFeedbackSpeakingRate: 2,
        audioPromptFeedbackVoice: 'en-US-Standard-B', audioPromptMode: 'all', audioInputMode: false });
      expect(await read()).to.include({ audioPromptQuestionVolume: -6, audioPromptFeedbackVolume: 6, audioInputSensitivity: 70, audioPromptVoice: 'en-US-Standard-J' });
    } finally { await MeteorUsersAny.removeAsync(id); }
  });
});
