import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { isMemphisSamlAccountUser } from './memphisSaml';
import {
  requireUserWithRoles,
  type MethodAuthorizationDeps,
} from './methodAuthorization';

type UnknownRecord = Record<string, unknown>;

type AuthThrottleStateCollection = {
  findOneAsync(selector: UnknownRecord): Promise<UnknownRecord | null>;
  upsertAsync(selector: UnknownRecord, modifier: UnknownRecord): Promise<unknown>;
  updateAsync(selector: UnknownRecord, modifier: UnknownRecord): Promise<unknown>;
  removeAsync(selector: UnknownRecord): Promise<unknown>;
  rawCollection(): { createIndex(keys: UnknownRecord, options?: UnknownRecord): Promise<unknown> };
};

type AuthSupportDeps = {
  usersCollection: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
  };
  AuditLog: {
    insertAsync: (document: UnknownRecord) => Promise<unknown>;
  };
  AuthThrottleState: AuthThrottleStateCollection;
  serverConsole: (...args: unknown[]) => void;
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
};

const signUpLocks: Record<string, boolean> = {};
const MIN_PASSWORD_LENGTH = 8;
const VERIFY_EMAIL_RESEND_INTERVAL_MS = 5 * 60 * 1000;
const EXPERIMENT_USERNAME_REGEX = /^[A-Z0-9._-]{3,32}$/;

export function createAuthSupport(deps: AuthSupportDeps) {
  const userIdToUsernames: Record<string, string> = {};
  const usernameToUserIds: Record<string, string> = {};

  function normalizeAccountUsername(rawUsername: unknown) {
    if (typeof rawUsername !== 'string') {
      return '';
    }
    return rawUsername.trim();
  }

  function normalizeCanonicalEmail(rawEmail: unknown) {
    const trimmedEmail = typeof rawEmail === 'string' ? rawEmail.trim() : '';
    if (!trimmedEmail) {
      throw new Meteor.Error('invalid-email', 'Email address is required');
    }
    const canonicalEmail = trimmedEmail.toLowerCase();
    if (!isValidEmailAddress(canonicalEmail)) {
      throw new Meteor.Error('invalid-email', 'Enter a valid email address');
    }
    return {
      original: trimmedEmail,
      canonical: canonicalEmail,
    };
  }

  function getPasswordPolicyMessage() {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  }

  function isEmailVerificationRequired() {
    return !!(Meteor.settings as any)?.auth?.requireEmailVerification;
  }

  function isArgon2Enabled() {
    return !!(Meteor.settings as any)?.auth?.argon2Enabled;
  }

  function getPasswordHashRuntimeInfo() {
    return {
      package: 'meteor/accounts-password',
      algorithm: isArgon2Enabled() ? 'argon2id' : 'bcrypt',
      migrationStrategy: isArgon2Enabled()
        ? 'Meteor Accounts verifies legacy hashes and rehashes on successful password login/reset as supported by the runtime.'
        : 'Enable auth.argon2Enabled after validating memory/cpu budget to migrate new and refreshed password hashes forward.'
    };
  }

  function getDefaultMfaState() {
    return {
      enrolled: false,
      required: false,
      configuredMethods: [],
      state: 'not_configured'
    };
  }

  function buildAccountAuthState(user: any, primaryMethodHint = 'password') {
    const primaryMethod = user?.services?.google
      ? 'google'
      : user?.services?.microsoft
        ? 'microsoft'
        : isMemphisSamlAccountUser(user)
          ? 'memphisSaml'
        : primaryMethodHint;
    return {
      version: 1,
      primaryMethod,
      emailVerificationRequired: isEmailVerificationRequired() && isNormalAccountUser(user),
      emailVerified: isUserEmailVerified(user),
      mfa: getDefaultMfaState(),
      lastUpdatedAt: new Date()
    };
  }

  function buildSessionAuthState(loginMode: string, primaryFactor: string) {
    return {
      version: 1,
      authenticatedAt: new Date(),
      loginMode,
      primaryFactor,
      mfaRequired: false,
      mfaCompleted: false,
      mfaMethod: null,
      assuranceLevel: 'single-factor'
    };
  }

  async function syncUserAuthState(userId: string, primaryMethodHint = 'password') {
    const user = await deps.usersCollection.findOneAsync({ _id: userId });
    if (!user) {
      return;
    }
    await deps.usersCollection.updateAsync(
      { _id: userId },
      {
        $set: {
          authState: buildAccountAuthState(user, primaryMethodHint)
        }
      }
    );
  }

  function normalizeAuthIdentifier(rawValue: unknown) {
    const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!trimmed) {
      return '';
    }
    return isValidEmailAddress(trimmed) ? trimmed.toLowerCase() : trimmed;
  }

  function getAuthClientIp(source: { connection?: { clientAddress?: string | null } | null } | null | undefined) {
    const clientAddress = source?.connection?.clientAddress;
    return typeof clientAddress === 'string' && clientAddress.trim().length > 0
      ? clientAddress.trim()
      : 'unknown';
  }

  async function getAuthThrottleDoc(key: string) {
    return await deps.AuthThrottleState.findOneAsync({ key }) as {
      key?: string;
      timestamps?: number[];
      lockedUntil?: number;
    } | null;
  }

  async function pruneAuthTracker(key: string, windowMs: number) {
    const now = Date.now();
    const current = await getAuthThrottleDoc(key);
    const next = (current?.timestamps || []).filter((timestamp) => (now - timestamp) < windowMs);
    const hasLock = typeof current?.lockedUntil === 'number' && current.lockedUntil > 0;
    if (next.length > 0 || hasLock) {
      await deps.AuthThrottleState.upsertAsync(
        { key },
        {
          $set: {
            timestamps: next,
            updatedAt: new Date()
          }
        }
      );
    } else {
      await deps.AuthThrottleState.removeAsync({ key });
    }
    return next;
  }

  async function assertAuthThrottle(action: string, bucket: string, limit: number, windowMs: number) {
    const hits = await pruneAuthTracker(bucket, windowMs);
    if (hits.length >= limit) {
      throw new Meteor.Error('rate-limit', `Too many ${action} attempts. Please try again later.`);
    }
  }

  async function recordAuthThrottle(bucket: string) {
    const current = await getAuthThrottleDoc(bucket);
    const next = current?.timestamps || [];
    next.push(Date.now());
    await deps.AuthThrottleState.upsertAsync(
      { key: bucket },
      {
        $set: {
          timestamps: next,
          updatedAt: new Date()
        }
      }
    );
  }

  async function clearAuthThrottle(bucket: string) {
    const current = await getAuthThrottleDoc(bucket);
    if (typeof current?.lockedUntil === 'number' && current.lockedUntil > 0) {
      await deps.AuthThrottleState.updateAsync(
        { key: bucket },
        {
          $set: {
            timestamps: [],
            updatedAt: new Date()
          }
        }
      );
      return;
    }
    await deps.AuthThrottleState.removeAsync({ key: bucket });
  }

  async function assertSoftLock(lockKey: string) {
    const lockedUntil = Number((await getAuthThrottleDoc(lockKey))?.lockedUntil || 0);
    if (lockedUntil > Date.now()) {
      throw new Meteor.Error('rate-limit', 'Too many login attempts. Please wait before trying again.');
    }
    if (lockedUntil) {
      await deps.AuthThrottleState.removeAsync({ key: lockKey });
    }
  }

  async function recordSoftLockFailure(lockKey: string, failureBucketKey: string, threshold: number, windowMs: number, lockMs: number) {
    const failures = await pruneAuthTracker(failureBucketKey, windowMs);
    if (failures.length >= threshold) {
      await deps.AuthThrottleState.upsertAsync(
        { key: lockKey },
        {
          $set: {
            lockedUntil: Date.now() + lockMs,
            updatedAt: new Date()
          }
        }
      );
    }
  }

  async function applyMethodRateLimit(
    action: string,
    ip: string,
    identifier: string,
    config: {
      ipLimit: number;
      identifierLimit: number;
      windowMs: number;
    }
  ) {
    await assertAuthThrottle(action, `${action}:ip:${ip}`, config.ipLimit, config.windowMs);
    await recordAuthThrottle(`${action}:ip:${ip}`);
    if (identifier) {
      await assertAuthThrottle(action, `${action}:id:${identifier}`, config.identifierLimit, config.windowMs);
      await recordAuthThrottle(`${action}:id:${identifier}`);
    }
  }

  function extractLoginAttemptIdentifier(attempt: any) {
    const directArg = attempt?.methodArguments?.[0];
    if (typeof directArg === 'string') {
      return normalizeAuthIdentifier(directArg);
    }
    const userArg = directArg?.user;
    if (typeof userArg?.email === 'string') {
      return normalizeAuthIdentifier(userArg.email);
    }
    if (typeof userArg?.username === 'string') {
      return normalizeAuthIdentifier(userArg.username);
    }
    const user = attempt?.user;
    return normalizeAuthIdentifier(user?.email_canonical || user?.emails?.[0]?.address || user?.username || '');
  }

  function escapeRegexLiteral(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function exactCaseInsensitiveRegex(value: string) {
    return new RegExp(`^${escapeRegexLiteral(value)}$`, 'i');
  }

  async function findNormalAccountUserByCanonicalEmail(emailCanonical: string) {
    if (!emailCanonical) {
      return null;
    }

    const exactEmailRegex = exactCaseInsensitiveRegex(emailCanonical);
    return await deps.usersCollection.findOneAsync({
      $or: [
        { email_canonical: emailCanonical },
        { username: exactEmailRegex },
        { 'emails.address': exactEmailRegex }
      ]
    });
  }

  function isNormalAccountUser(user: any) {
    return !!user && user?.profile?.experiment !== true && user?.profile?.experiment !== 'true';
  }

  function isUserEmailVerified(user: any) {
    return !!user?.emails?.[0]?.verified;
  }

  function getUserDisplayIdentifier(user: any) {
    if (!user) {
      return '';
    }
    if (isNormalAccountUser(user)) {
      return String(user.email_canonical || user.emails?.[0]?.address || user.username || '').trim();
    }
    return String(user.username || user.emails?.[0]?.address || user.email_canonical || '').trim();
  }

  function syncUsernameCaches(userId: string, nextUsername: string, previousUsername = '') {
    if (previousUsername && usernameToUserIds[previousUsername] === userId) {
      delete usernameToUserIds[previousUsername];
    }
    if (nextUsername) {
      userIdToUsernames[userId] = nextUsername;
      usernameToUserIds[nextUsername] = userId;
    }
  }

  async function enforceCanonicalEmailIdentity(
    userId: string,
    rawEmail?: unknown,
    options: {
      actorUserId?: string | null;
      source?: string;
    } = {}
  ) {
    const user = await deps.usersCollection.findOneAsync({ _id: userId });
    if (!user || user?.profile?.experiment) {
      return;
    }

    const emailCandidates = [
      rawEmail,
      user.email_canonical,
      user.email_original,
      user.emails?.[0]?.address,
      user.email,
      user.username,
    ];
    const emailSource = emailCandidates.find((value) => typeof value === 'string' && String(value).trim().length > 0);
    if (!emailSource) {
      return;
    }

    const { original, canonical } = normalizeCanonicalEmail(emailSource);
    const previousUsername = typeof user.username === 'string' ? user.username : '';
    const previousCanonical = normalizeAuthIdentifier(
      user.email_canonical || user.emails?.[0]?.address || user.username || ''
    );
    await deps.usersCollection.updateAsync(
      { _id: userId },
      {
        $set: {
          username: canonical,
          email_original: original,
          email_canonical: canonical,
          'emails.0.address': canonical,
          'profile.username': canonical
        }
      }
    );
    syncUsernameCaches(userId, canonical, previousUsername);
    if (previousCanonical && previousCanonical !== canonical) {
      await writeAuditLog('auth.emailChanged', options.actorUserId || null, userId, {
        previousEmailCanonical: previousCanonical,
        nextEmailCanonical: canonical,
        source: options.source || 'canonical-identity-repair'
      });
    }
  }

  async function markVerificationEmailSent(userId: string) {
    await deps.usersCollection.updateAsync(
      { _id: userId },
      { $set: { verificationEmailLastSentAt: new Date() } }
    );
  }

  async function ensureVerificationEmailRecentlySent(user: any) {
    const lastSentAt = user?.verificationEmailLastSentAt instanceof Date
      ? user.verificationEmailLastSentAt.getTime()
      : (user?.verificationEmailLastSentAt ? new Date(user.verificationEmailLastSentAt).getTime() : 0);
    if (lastSentAt && (Date.now() - lastSentAt) < VERIFY_EMAIL_RESEND_INTERVAL_MS) {
      throw new Meteor.Error('verification-rate-limit', 'A verification email was sent recently. Please wait before requesting another.');
    }
  }

  async function sendVerificationEmailForUser(userId: string, actorUserId: string | null, source: string) {
    const user = await deps.usersCollection.findOneAsync({ _id: userId });
    if (!user || !isNormalAccountUser(user) || isUserEmailVerified(user)) {
      return false;
    }

    await ensureVerificationEmailRecentlySent(user);
    Accounts.sendVerificationEmail(userId);
    await markVerificationEmailSent(userId);
    await writeAuditLog('auth.verificationSent', actorUserId, userId, {
      emailCanonical: user.email_canonical || user.emails?.[0]?.address || user.username || '',
      source
    });
    return true;
  }

  function assertStrongPassword(password: string) {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new Meteor.Error('weak-password', getPasswordPolicyMessage());
    }
  }

  function defaultAwsProfile() {
    return {
      have_aws_id: false,
      have_aws_secret: false,
      aws_id: '',
      aws_secret_key: '',
      use_sandbox: Meteor.settings.mturkSandbox ?? true,
    };
  }

  async function waitForUserToPersist(createdId: string) {
    let user = null;
    let attempts = 0;
    const maxAttempts = 120;
    while (!user && attempts < maxAttempts) {
      user = await deps.usersCollection.findOneAsync({ _id: createdId });
      if (!user) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        attempts++;
      }
    }
    if (!user) {
      throw new Error('User creation race condition: user not found after createUser');
    }
  }

  function isValidEmailAddress(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function createUserWithRetry(
    username: string,
    password: string,
    profile: UnknownRecord = {},
    options: { includeEmail?: boolean; emailOriginal?: string; emailCanonical?: string } = {}
  ) {
    const accountsApi = Accounts as unknown as {
      createUser: (opts: { email: string; username: string; password: string; profile: UnknownRecord; [key: string]: unknown }) => string | Promise<string>;
    };
    let createdId = null;
    let retryAttempts = 0;
    const maxRetries = 3;
    const includeEmail = options.includeEmail !== false;
    const normalizedUsername = String(username || '').trim();

    while (!createdId && retryAttempts < maxRetries) {
      try {
        const createUserPayload: {
          email?: string;
          username: string;
          password: string;
          profile: UnknownRecord;
          aws: ReturnType<typeof defaultAwsProfile>;
          email_original?: string;
          email_canonical?: string;
        } = {
          username,
          password,
          profile,
          aws: defaultAwsProfile()
        };
        if (includeEmail && isValidEmailAddress(normalizedUsername)) {
          createUserPayload.email = normalizedUsername;
        }
        if (options.emailOriginal) {
          createUserPayload.email_original = options.emailOriginal;
        }
        if (options.emailCanonical) {
          createUserPayload.email_canonical = options.emailCanonical;
        }
        const createdResult = accountsApi.createUser(createUserPayload as any);
        createdId = await Promise.resolve(createdResult);

        if (!createdId || typeof createdId !== 'string') {
          throw new Error('User creation returned invalid id');
        }

        await waitForUserToPersist(createdId);
        return createdId;
      } catch (e: unknown) {
        const errorObj = e as { message?: string; reason?: string };
        const errorMessage = errorObj?.message || errorObj?.reason || '';
        if (/E11000 duplicate key error.*\b_id\b/.test(errorMessage)) {
          retryAttempts++;
          deps.serverConsole('Duplicate _id detected, retrying user creation (attempt ' + retryAttempts + '/' + maxRetries + ')');
          if (retryAttempts >= maxRetries) {
            throw new Error('Failed to create user after ' + maxRetries + ' attempts due to ID collisions');
          }
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 100)));
          continue;
        }
        if (/User creation race condition/i.test(errorMessage)) {
          const recoveredUser = await deps.usersCollection.findOneAsync({ username });
          if (recoveredUser?._id) {
            deps.serverConsole('Recovered user after persistence race by username lookup:', username, recoveredUser._id);
            return recoveredUser._id;
          }

          retryAttempts++;
          deps.serverConsole('User persistence race detected, retrying user creation flow (attempt ' + retryAttempts + '/' + maxRetries + ')');
          if (retryAttempts >= maxRetries) {
            throw new Meteor.Error('user-create-race', 'Failed to finalize user creation; please retry');
          }
          await new Promise((resolve) => setTimeout(resolve, 150 * retryAttempts));
          createdId = null;
          continue;
        }
        if (
          /invalid email|email.*valid|Email must be valid/i.test(errorMessage) &&
          !isValidEmailAddress(normalizedUsername)
        ) {
          throw new Meteor.Error('invalid-username-format', 'Participation ID format is invalid');
        }
        throw e;
      }
    }

    throw new Meteor.Error(500, 'Failed to create user');
  }

  async function withSignUpLock<T>(username: string, work: () => Promise<T>): Promise<T> {
    const lockWaitStartedAt = Date.now();
    const lockWaitTimeoutMs = 15000;
    while (signUpLocks[username]) {
      if (Date.now() - lockWaitStartedAt > lockWaitTimeoutMs) {
        throw new Meteor.Error('signup-lock-timeout', 'Signup is currently busy for this username; please retry');
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    signUpLocks[username] = true;
    try {
      return await work();
    } finally {
      delete signUpLocks[username];
    }
  }

  async function writeAuditLog(action: string, actorUserId: string | null, targetUserId: string | null, details: UnknownRecord = {}) {
    try {
      await deps.AuditLog.insertAsync({
        action,
        actorUserId: actorUserId || null,
        targetUserId: targetUserId || null,
        details,
        createdAt: new Date()
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      deps.serverConsole('Audit log write failed:', message);
    }
  }

  async function requireAdminUser(
    userId: string | null | undefined,
    errMsg = 'Admin access required',
    errorCode: string | number = 403
  ) {
    await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
      userId,
      roles: ['admin'],
      notLoggedInMessage: errMsg,
      notLoggedInCode: errorCode,
      forbiddenMessage: errMsg,
      forbiddenCode: errorCode,
    });
  }

  function assertRequiredMeteorSettings() {
    const settings = (Meteor.settings || {}) as UnknownRecord;
    const missing: string[] = [];

    const isNonEmptyString = (value: unknown) =>
      typeof value === 'string' && value.trim().length > 0;

    if (!isNonEmptyString(settings.owner)) {
      missing.push('owner');
    }
    if (!isNonEmptyString(settings.ROOT_URL)) {
      missing.push('ROOT_URL');
    }
    if (!isNonEmptyString(settings.encryptionKey)) {
      missing.push('encryptionKey');
    }

    const initRoles = settings.initRoles as UnknownRecord | undefined;
    const initAdmins = initRoles?.admins;
    if (!Array.isArray(initAdmins) || initAdmins.length < 1) {
      missing.push('initRoles.admins (must be a non-empty array)');
    }

    const emailEnabled = settings.enableEmail ?? settings.prod ?? false;
    if (emailEnabled && !isNonEmptyString(settings.MAIL_URL)) {
      missing.push('MAIL_URL (required when enableEmail/prod is true)');
    }

    const allowPublicSignup = (settings as any)?.auth?.allowPublicSignup;
    if (typeof allowPublicSignup !== 'boolean') {
      missing.push('auth.allowPublicSignup (must be boolean)');
    }
    const requireEmailVerification = (settings as any)?.auth?.requireEmailVerification;
    if (typeof requireEmailVerification !== 'boolean') {
      missing.push('auth.requireEmailVerification (must be boolean)');
    }
    const argon2Enabled = (settings as any)?.auth?.argon2Enabled;
    if (typeof argon2Enabled !== 'boolean') {
      missing.push('auth.argon2Enabled (must be boolean)');
    }

    if (missing.length > 0) {
      const configuredSource = process.env.METEOR_SETTINGS_WORKAROUND
        ? 'METEOR_SETTINGS_WORKAROUND=' + process.env.METEOR_SETTINGS_WORKAROUND
        : 'Meteor runtime settings';
      const msg = 'Missing/invalid required Meteor settings: ' + missing.join(', ') +
        '. Source: ' + configuredSource;
      deps.serverConsole(msg);
      throw new Error(msg);
    }
  }

  function requireAllowPublicSignupSetting() {
    const allowPublicSignup = (Meteor.settings as any)?.auth?.allowPublicSignup;
    if (typeof allowPublicSignup !== 'boolean') {
      throw new Meteor.Error('config-error', 'Missing required setting: auth.allowPublicSignup (boolean)');
    }
    return allowPublicSignup;
  }

  async function getUserIdforUsername(username: string) {
    const normalizedInput = typeof username === 'string' ? username.trim() : '';
    if (!normalizedInput) {
      return '';
    }
    const cacheKey = isValidEmailAddress(normalizedInput) ? normalizedInput.toLowerCase() : normalizedInput;
    let userId = usernameToUserIds[cacheKey];
    if (!userId) {
      const user = isValidEmailAddress(normalizedInput)
        ? await findNormalAccountUserByCanonicalEmail(normalizedInput.toLowerCase())
        : await deps.usersCollection.findOneAsync({username: normalizedInput});
      if (!user?._id) {
        return '';
      }
      userId = String(user._id);
      usernameToUserIds[cacheKey] = userId;
    }
    return userId;
  }

  return {
    minPasswordLength: MIN_PASSWORD_LENGTH,
    experimentUsernameRegex: EXPERIMENT_USERNAME_REGEX,
    normalizeAccountUsername,
    normalizeCanonicalEmail,
    getPasswordPolicyMessage,
    isEmailVerificationRequired,
    isArgon2Enabled,
    getPasswordHashRuntimeInfo,
    buildAccountAuthState,
    buildSessionAuthState,
    syncUserAuthState,
    normalizeAuthIdentifier,
    getAuthClientIp,
    assertAuthThrottle,
    recordAuthThrottle,
    clearAuthThrottle,
    assertSoftLock,
    recordSoftLockFailure,
    applyMethodRateLimit,
    extractLoginAttemptIdentifier,
    exactCaseInsensitiveRegex,
    findNormalAccountUserByCanonicalEmail,
    isNormalAccountUser,
    isUserEmailVerified,
    getUserDisplayIdentifier,
    syncUsernameCaches,
    enforceCanonicalEmailIdentity,
    sendVerificationEmailForUser,
    escapeRegexLiteral,
    assertStrongPassword,
    defaultAwsProfile,
    isValidEmailAddress,
    createUserWithRetry,
    withSignUpLock,
    writeAuditLog,
    requireAdminUser,
    assertRequiredMeteorSettings,
    requireAllowPublicSignupSetting,
    getUserIdforUsername,
  };
}
