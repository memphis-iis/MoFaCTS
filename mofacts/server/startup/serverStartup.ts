import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Roles } from 'meteor/alanning:roles';
import { ServiceConfiguration } from 'meteor/service-configuration';
import { WebApp } from 'meteor/webapp';
import { curSemester } from '../../common/Definitions';
import { displayify } from '../../common/globalHelpers';
import type { NextFunction } from 'connect';
import type { IncomingMessage, ServerResponse } from 'http';
import _ from 'underscore';
import { themeRegistry } from '../lib/themeRegistry';
import {
  extractMemphisSamlEmail,
  isMemphisSamlAccountUser,
} from '../lib/memphisSaml';
import { createPerformanceIndexes } from '../migrations/add_performance_indexes';
import { backfillPackageAssetIds } from '../migrations/backfill_package_asset_ids';
import { cleanExperimentStateDupesAndAddUniqueIndex } from '../migrations/clean_experiment_state_dupes';
import { runStartupCleanupMigrations } from '../migrations/startup_cleanup_migrations';
import { sendScheduledTurkMessages } from '../turk_methods';
import { bootstrapPrivateRepoContentIfNeeded } from './bootstrapPrivateRepoContent';
import { startConfiguredSyncedCronJobs } from './syncedCronRuntime';

type UnknownRecord = Record<string, unknown>;
type Logger = (...args: unknown[]) => void;

type RunServerStartupDeps = {
  serverConsole: Logger;
  DynamicSettings: {
    findOneAsync: (selector: UnknownRecord) => Promise<any>;
    insertAsync: (document: UnknownRecord) => Promise<unknown>;
    removeAsync: (selector: UnknownRecord) => Promise<number>;
    upsertAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
  };
  usersCollection: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<number>;
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
  };
  ManualContentDrafts: {
    rawCollection: () => { createIndex: (keys: UnknownRecord, options?: UnknownRecord) => Promise<unknown> };
  };
  ScheduledTurkMessages: {
    rawCollection: () => { createIndex: (keys: UnknownRecord, options?: UnknownRecord) => Promise<unknown> };
  };
  AuthThrottleState: {
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
    rawCollection: () => { createIndex: (keys: UnknownRecord, options?: UnknownRecord) => Promise<unknown> };
  };
  Tdfs: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    find: (selector?: UnknownRecord) => { countAsync: () => Promise<number> };
  };
  Histories: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  AssetsAny: { getTextAsync: (path: string) => Promise<string> };
  updateActiveThemeDocument: (userId: string | null | undefined, mutator: (theme: any) => any) => Promise<unknown>;
  upsertStimFile: (filename: string, json: unknown, ownerId: string) => Promise<string | number | null | undefined>;
  upsertTDFFile: (filename: string, rec: any, ownerId: string) => Promise<{ stimuliSetId?: number | string | null } | unknown>;
  updateStimDisplayTypeMap: (stimuliSetIds: unknown[] | null) => Promise<unknown>;
  sendErrorReportSummaries: () => Promise<unknown>;
  sendEmail: (to: string, from: string, subject: string, text: string) => void;
  getDiskUsageInfo: (path?: string) => { free: number; total: number } | null;
  ownerEmail: string;
  isProd: boolean;
  thisServerUrl: string;
  enforceCanonicalEmailIdentity: (userId: string, rawEmail?: unknown, options?: UnknownRecord) => Promise<void>;
  syncUserAuthState: (userId: string, primaryMethodHint?: string) => Promise<void>;
  writeAuditLog: (action: string, actorUserId: string | null, targetUserId: string | null, details?: UnknownRecord) => Promise<void>;
  getAuthClientIp: (source: { connection?: { clientAddress?: string | null } | null } | null | undefined) => string;
  buildSessionAuthState: (loginMode: string, primaryFactor: string) => unknown;
  extractLoginAttemptIdentifier: (attempt: any) => string;
  assertSoftLock: (lockKey: string) => Promise<void>;
  assertAuthThrottle: (action: string, bucket: string, limit: number, windowMs: number) => Promise<void>;
  recordAuthThrottle: (bucket: string) => Promise<void>;
  recordSoftLockFailure: (lockKey: string, failureBucketKey: string, threshold: number, windowMs: number, lockMs: number) => Promise<void>;
  clearAuthThrottle: (bucket: string) => Promise<void>;
  normalizeCanonicalEmail: (rawEmail: unknown) => { original: string; canonical: string };
  isValidEmailAddress: (value: string) => boolean;
  buildAccountAuthState: (user: any, primaryMethodHint?: string) => unknown;
  syncUsernameCaches: (userId: string, nextUsername: string, previousUsername?: string) => void;
  isArgon2Enabled: () => boolean;
  getPasswordHashRuntimeInfo: () => unknown;
  setRuntimeCounters: (values: { nextStimuliSetId: number; nextEventId: number }) => void;
};

const WebAppAny = WebApp as unknown as {
  handlers: {
    use: (handler: (req: IncomingMessage, res: ServerResponse<IncomingMessage>, next: NextFunction) => void) => void;
  };
};

function registerSecurityHeaders() {
  WebAppAny.handlers.use((req: IncomingMessage, res: ServerResponse<IncomingMessage>, next: NextFunction) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(self)');
    if (req.url === '/stimSchema.json' || req.url === '/tdfSchema.json') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    next();
  });
}

function checkDriveSpace(deps: RunServerStartupDeps) {
  deps.serverConsole('checkDriveSpace');
  try {
    const info = deps.getDiskUsageInfo('/');
    if (!info) {
      deps.serverConsole('disk usage unavailable, skipping disk space check');
      return;
    }
    const percentFree = (info.free / info.total) * 100;
    deps.serverConsole('freeSpace: ' + info.free + ', totalSpace: ' + info.total + ', percentFree: ' + percentFree);
    if (percentFree < 10) {
      deps.serverConsole('Low disk space: ' + percentFree + '%');
      const subject = 'MoFaCTs Low Disk Space - ' + deps.thisServerUrl;
      const text = 'Low disk space: ' + percentFree + '%';
      deps.sendEmail(deps.ownerEmail, deps.ownerEmail, subject, text);
    }
  } catch (error: unknown) {
    deps.serverConsole(error);
  }
}

function getUserEmailRecipient(user: any) {
  const candidates = [
    user?.email_canonical,
    user?.emails?.[0]?.address,
    user?.email_original,
    user?.username,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && isEmailLike(candidate)) {
      return candidate.trim().toLowerCase();
    }
  }
  return null;
}

function isEmailLike(value: string) {
  return /.+@.+\..+/.test(value.trim());
}

async function getRestartEmailRecipients(deps: RunServerStartupDeps, roleSettings: { admins?: unknown[]; teachers?: unknown[] }) {
  const recipients = [
    deps.ownerEmail,
    ...(Array.isArray(roleSettings.teachers) ? roleSettings.teachers.map((value) => String(value)) : []),
    ...(Array.isArray(roleSettings.admins) ? roleSettings.admins.map((value) => String(value)) : []),
  ];

  const roleAssignment = (Meteor as any).roleAssignment;
  const roleAssignments = roleAssignment
    ? await roleAssignment.find({ 'inheritedRoles._id': { $in: ['admin', 'teacher'] } }).fetchAsync()
    : [];
  const roleUserIds = [...new Set(
    roleAssignments
      .map((assignment: any) => String(assignment?.user?._id || '').trim())
      .filter(Boolean)
  )];

  if (roleUserIds.length > 0) {
    const roleUsers = await deps.usersCollection.find(
      { _id: { $in: roleUserIds } },
      { fields: { username: 1, email_canonical: 1, email_original: 1, emails: 1 } }
    ).fetchAsync();
    for (const user of roleUsers) {
      const email = getUserEmailRecipient(user);
      if (email) {
        recipients.push(email);
      }
    }
  }

  return recipients
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => isEmailLike(value))
    .filter((value, index, array) => array.indexOf(value) === index);
}

function findUserByName(deps: RunServerStartupDeps, username: string) {
  if (!username || username.length < 1) {
    return null;
  }
  if (deps.isValidEmailAddress(username)) {
    const canonicalEmail = username.trim().toLowerCase();
    return Accounts.findUserByEmail(canonicalEmail) || Accounts.findUserByUsername(canonicalEmail);
  }
  const funcs = [Accounts.findUserByUsername, Accounts.findUserByEmail];
  for (const fn of funcs) {
    const user = fn(username);
    if (user) {
      return user;
    }
  }
  return null;
}

function getExistingAccountMethod(user: any): 'password' | 'google' | 'microsoft' | 'memphisSaml' | 'different-method' {
  if (user?.services?.password) return 'password';
  if (user?.services?.google) return 'google';
  if (user?.services?.microsoft) return 'microsoft';
  if (isMemphisSamlAccountUser(user)) return 'memphisSaml';
  return 'different-method';
}

function throwOAuthExistingAccountError(existingUser: any, attemptedProvider: string, emailCanonical: string, deps: RunServerStartupDeps) {
  const existingMethod = getExistingAccountMethod(existingUser);
  deps.serverConsole('[ACCOUNTS] OAuth sign-in blocked by existing account method', {
    attemptedProvider,
    emailCanonical,
    existingMethod,
    existingUserId: existingUser?._id || null,
  });
  if (existingMethod === 'password') {
    throw new Meteor.Error('oauth-account-exists-password', 'This email is already registered with a password. Sign in with your password or reset it.');
  }
  if (existingMethod === 'google') {
    throw new Meteor.Error('oauth-account-exists-google', 'This email is already registered with Google sign-in.');
  }
  if (existingMethod === 'microsoft') {
    throw new Meteor.Error('oauth-account-exists-microsoft', 'This email is already registered with Microsoft sign-in.');
  }
  if (existingMethod === 'memphisSaml') {
    throw new Meteor.Error('oauth-account-exists-memphis-saml', 'This email is already registered with University of Memphis sign-in.');
  }
  throw new Meteor.Error('oauth-account-exists-different-method', 'This email is already registered with a different sign-in method.');
}

function summarizeUserLookupForLog(user: any) {
  if (!user) {
    return null;
  }
  return {
    _id: user?._id || null,
    username: user?.username || null,
    emailCanonical: user?.email_canonical || null,
    emailOriginal: user?.email_original || null,
    emails: Array.isArray(user?.emails)
      ? user.emails.map((entry: any) => ({ address: entry?.address || null, verified: !!entry?.verified }))
      : [],
    services: user?.services ? Object.keys(user.services).sort() : [],
    existingMethod: getExistingAccountMethod(user),
  };
}

function isRealUserDocument(user: any): user is { _id: string } {
  return !!user && typeof user._id === 'string' && user._id.trim().length > 0;
}

function findExistingUserByCanonicalEmail(canonicalEmail: string) {
  const accountsUserByEmail = Accounts.findUserByEmail(canonicalEmail);
  const accountsUserByUsername = Accounts.findUserByUsername(canonicalEmail);
  const existingUserByEmail = isRealUserDocument(accountsUserByEmail) ? accountsUserByEmail : null;
  const existingUserByUsername = isRealUserDocument(accountsUserByUsername) ? accountsUserByUsername : null;
  return {
    accountsUserByEmail,
    accountsUserByUsername,
    existingUserByEmail,
    existingUserByUsername,
    existingUser: existingUserByEmail || existingUserByUsername,
  };
}

export async function runServerStartup(deps: RunServerStartupDeps) {
  registerSecurityHeaders();
  await themeRegistry.initialize();
  await runStartupCleanupMigrations({
    DynamicSettings: deps.DynamicSettings,
    usersCollection: deps.usersCollection,
    serverConsole: deps.serverConsole,
    updateActiveThemeDocument: deps.updateActiveThemeDocument,
  });

  try {
    await backfillPackageAssetIds();
  } catch (error: unknown) {
    deps.serverConsole('Warning: Package asset id backfill failed:', error instanceof Error ? error.message : String(error));
  }
  try {
    await createPerformanceIndexes();
  } catch (error: unknown) {
    deps.serverConsole('Warning: Performance index creation failed:', error instanceof Error ? error.message : String(error));
  }
  try {
    await cleanExperimentStateDupesAndAddUniqueIndex();
  } catch (error: unknown) {
    deps.serverConsole('Warning: Experiment state dedup migration failed:', error instanceof Error ? error.message : String(error));
  }

  const highestStimuliSetDoc = await deps.Tdfs.findOneAsync({}, { sort: { stimuliSetId: -1 }, limit: 1 });
  const latestHistory = await deps.Histories.findOneAsync({}, { limit: 1, sort: { eventId: -1 } });
  deps.setRuntimeCounters({
    nextEventId: (Number(latestHistory?.eventId) || 0) + 1,
    nextStimuliSetId: highestStimuliSetDoc?.stimuliSetId ? parseInt(String(highestStimuliSetDoc.stimuliSetId), 10) + 1 : 1,
  });

  const existingClientVerbosity = await deps.DynamicSettings.findOneAsync({ key: 'clientVerbosityLevel' });
  if (!existingClientVerbosity) {
    await deps.DynamicSettings.insertAsync({ key: 'clientVerbosityLevel', value: 0 });
    deps.serverConsole('Initialized clientVerbosityLevel to default: 0');
  }
  const removedTestLoginSettings = await deps.DynamicSettings.removeAsync({ key: 'testLoginsEnabled' });
  if (removedTestLoginSettings > 0) {
    deps.serverConsole('Removed deprecated testLoginsEnabled setting');
  }

  deps.serverConsole('Configuring Google OAuth service...');
  const google = (Meteor.settings as any)?.google;
  const serviceConfigurations = ServiceConfiguration.configurations as unknown as {
    upsertAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
  };
  await serviceConfigurations.upsertAsync({ service: 'google' }, { $set: { clientId: google?.clientId, secret: google?.secret } });
  deps.serverConsole('Google OAuth service configured');

  if ((Meteor.settings as any).microsoft) {
    deps.serverConsole('Configuring Microsoft OAuth service...');
    await serviceConfigurations.upsertAsync(
      { service: 'microsoft' },
      { $set: { clientId: (Meteor.settings as any).microsoft.clientId, secret: (Meteor.settings as any).microsoft.secret, tenant: 'common', refreshToken: true } }
    );
    deps.serverConsole('Microsoft OAuth service configured');
  } else {
    deps.serverConsole('WARNING: No Microsoft OAuth configuration found in settings');
  }

  Accounts.onLogin(async (loginInfo: {
    type?: string;
    user?: { _id?: string; emails?: Array<{ address?: string }>; email?: string; username?: string };
    methodName?: string;
    allowed?: boolean;
    connection?: { clientAddress?: string | null };
  }) => {
    deps.serverConsole('[ACCOUNTS.ONLOGIN] Login detected:', {
      type: loginInfo.type,
      userId: loginInfo.user?._id,
      methodName: loginInfo.methodName,
      allowed: loginInfo.allowed,
    });
    if (!loginInfo.user || !loginInfo.allowed) {
      return;
    }

    const userId = loginInfo.user._id;
    const userEmail = loginInfo.user.emails?.[0]?.address || loginInfo.user.email || loginInfo.user.username;
    const normalizedUserEmail = typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
    const isOAuthLogin = loginInfo.type === 'google' || loginInfo.type === 'microsoft' || loginInfo.type === 'memphisSaml';

    deps.serverConsole('[ACCOUNTS.ONLOGIN] Processing login for user:', userId, 'email:', userEmail);
    if (userId) {
      try {
        await deps.enforceCanonicalEmailIdentity(userId, userEmail, { actorUserId: userId, source: 'accounts.onLogin' });
        await deps.syncUserAuthState(userId, isOAuthLogin ? String(loginInfo.type || 'password') : 'password');
      } catch (error: unknown) {
        deps.serverConsole('[ACCOUNTS.ONLOGIN] Failed to enforce canonical email identity:', error);
      }
    }

    const initRoles = (Meteor.settings as any)?.initRoles;
    if (initRoles && normalizedUserEmail && userId) {
      const admins = (initRoles?.admins || []).map((value: unknown) => String(value).trim().toLowerCase()).filter(Boolean);
      const teachers = (initRoles?.teachers || []).map((value: unknown) => String(value).trim().toLowerCase()).filter(Boolean);
      if (admins.includes(normalizedUserEmail)) {
        deps.serverConsole('[ACCOUNTS.ONLOGIN] User', normalizedUserEmail, 'found in initRoles.admins - assigning admin role');
        try {
          await Roles.addUsersToRolesAsync(userId, 'admin');
          deps.serverConsole('[ACCOUNTS.ONLOGIN] Admin role assigned successfully to', normalizedUserEmail);
        } catch (error: unknown) {
          deps.serverConsole('[ACCOUNTS.ONLOGIN] ERROR assigning admin role:', error);
        }
      }
      if (teachers.includes(normalizedUserEmail)) {
        deps.serverConsole('[ACCOUNTS.ONLOGIN] User', normalizedUserEmail, 'found in initRoles.teachers - assigning teacher role');
        try {
          await Roles.addUsersToRolesAsync(userId, 'teacher');
          deps.serverConsole('[ACCOUNTS.ONLOGIN] Teacher role assigned successfully to', normalizedUserEmail);
        } catch (error: unknown) {
          deps.serverConsole('[ACCOUNTS.ONLOGIN] ERROR assigning teacher role:', error);
        }
      }
    }

    await deps.writeAuditLog('auth.loginSuccess', userId || null, userId || null, {
      loginType: loginInfo.type || 'password',
      ip: deps.getAuthClientIp(loginInfo),
      identifier: normalizedUserEmail,
    });

    if (isOAuthLogin && userId) {
      const loginMode = String(loginInfo.type || 'password');
      deps.serverConsole('[ACCOUNTS.ONLOGIN] Setting OAuth loginParams for user:', userId, 'mode:', loginMode);
      try {
        await deps.usersCollection.updateAsync(
          { _id: userId },
          {
            $set: {
              'loginParams.entryPoint': 'direct',
              'loginParams.loginMode': loginMode,
              'loginParams.lastLoginTime': new Date(),
              'loginParams.authSessionState': deps.buildSessionAuthState(loginMode, 'federated'),
            },
          }
        );
        deps.serverConsole('[ACCOUNTS.ONLOGIN] loginParams set successfully for user:', userId);
      } catch (error: unknown) {
        deps.serverConsole('[ACCOUNTS.ONLOGIN] ERROR setting loginParams:', error);
      }
    }
  });
  deps.serverConsole('Accounts.onLogin hook registered for OAuth handling and role assignment');

  Accounts.urls.verifyEmail = function(token: string) {
    const baseUrl = (Meteor.settings.ROOT_URL || Meteor.absoluteUrl()).replace(/\/$/, '');
    return `${baseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
  };
  Accounts.emailTemplates.siteName = Meteor.settings.public?.systemName || 'MoFaCTS';
  Accounts.emailTemplates.from = deps.ownerEmail;
  Accounts.emailTemplates.verifyEmail = {
    subject() {
      return `${Accounts.emailTemplates.siteName}: verify your email`;
    },
    text(_user: unknown, url: string) {
      return [
        'Verify your email address for MoFaCTS.',
        '',
        `Open this link to verify your email: ${url}`,
        '',
        'If you did not create this account, you can ignore this email.',
      ].join('\n');
    },
  };

  Accounts.validateLoginAttempt(async (attempt: {
    allowed?: boolean;
    type?: string;
    user?: { _id?: string };
    connection?: { clientAddress?: string | null };
    error?: { error?: string; reason?: string; message?: string };
  }) => {
    const identifier = deps.extractLoginAttemptIdentifier(attempt);
    const clientIp = deps.getAuthClientIp(attempt);
    if (attempt.type === 'password') {
      await deps.assertSoftLock(`login-lock:${identifier || clientIp}`);
      await deps.assertAuthThrottle('login', `login:ip:${clientIp}`, 20, 15 * 60 * 1000);
      if (identifier) {
        await deps.assertAuthThrottle('login', `login:id:${identifier}`, 10, 15 * 60 * 1000);
      }
    }
    if (!attempt.allowed) {
      if (attempt.type === 'password') {
        await deps.recordAuthThrottle(`login:ip:${clientIp}`);
        if (identifier) {
          const failureBucket = `login:id:${identifier}`;
          await deps.recordAuthThrottle(failureBucket);
          await deps.recordSoftLockFailure(`login-lock:${identifier}`, failureBucket, 8, 15 * 60 * 1000, 15 * 60 * 1000);
        }
      }
      Meteor.defer(() => {
        void deps.writeAuditLog('auth.loginFailure', attempt.user?._id || null, attempt.user?._id || null, {
          loginType: attempt.type || 'password',
          ip: clientIp,
          identifier,
          errorCode: attempt.error?.error || '',
          errorReason: attempt.error?.reason || attempt.error?.message || '',
        });
      });
      return false;
    }
    if (identifier) {
      await deps.clearAuthThrottle(`login:id:${identifier}`);
      await deps.AuthThrottleState.removeAsync({ key: `login-lock:${identifier}` });
    }
    return true;
  });

  const adminUser = findUserByName(deps, String((Meteor.settings as any)?.owner || ''));
  await Roles.createRoleAsync('admin', { unlessExists: true });
  await Roles.createRoleAsync('teacher', { unlessExists: true });

  const adminUserId = adminUser?._id || '';
  if (adminUserId) {
    await Roles.addUsersToRolesAsync(adminUserId, 'admin');
    deps.serverConsole('Admin User Found ID:', adminUserId, 'with obj:', _.pick(adminUser, '_id', 'username', 'email'));
  } else {
    deps.serverConsole('Admin user ID could not be found. adminUser=', displayify(adminUser || 'null'));
    deps.serverConsole('ADMIN USER is MISSING: a restart might be required');
    deps.serverConsole('Make sure you have valid Meteor settings (settings.json / METEOR_SETTINGS)');
    deps.serverConsole('***IMPORTANT*** There will be no owner for system TDF\'s');
  }

  const roleSettings = ((Meteor.settings as any)?.initRoles || {}) as { admins?: unknown[]; teachers?: unknown[] };
  const roleAdd = async (memberName: 'admins' | 'teachers', roleName: 'admin' | 'teacher') => {
    const requested = Array.isArray(roleSettings[memberName]) ? roleSettings[memberName] as unknown[] : [];
    deps.serverConsole('Role', roleName, '- found', requested.length);
    for (const username of requested) {
      const user = findUserByName(deps, String(username || ''));
      if (!user || !user._id) {
        deps.serverConsole('Warning: user', username, 'role', roleName, 'request, but user not found');
        continue;
      }
      await Roles.addUsersToRolesAsync(user._id, roleName);
      deps.serverConsole('Added user', username, 'to role', roleName);
    }
  };
  await roleAdd('admins', 'admin');
  await roleAdd('teachers', 'teacher');

  if (await deps.Tdfs.find().countAsync() === 0) {
    await bootstrapPrivateRepoContentIfNeeded({
      isProd: deps.isProd,
      adminUserId,
      curSemester,
      serverConsole: deps.serverConsole,
      AssetsAny: deps.AssetsAny,
      upsertStimFile: deps.upsertStimFile,
      upsertTDFFile: deps.upsertTDFFile,
      updateStimDisplayTypeMap: deps.updateStimDisplayTypeMap,
    });
  }

  Accounts.onCreateUser(function(options: { profile?: {} | undefined }, user: Meteor.User) {
    deps.serverConsole('[ACCOUNTS] onCreateUser called');
    deps.serverConsole('[ACCOUNTS] User services:', Object.keys(user.services || {}));

    const dispUsr = (currentUser: Meteor.User) => _.pick(currentUser, '_id', 'username', 'emails', 'profile');
    if (options.profile) {
      user.profile = _.extend(user.profile || {}, options.profile as Record<string, unknown>);
    }
    if (user.profile?.experiment) {
      deps.serverConsole('Experiment participant user created:', dispUsr(user));
      return user;
    }

    let email = '';
    let serviceName = 'password';
    let emailVerified = !!user.emails?.[0]?.verified;

    if (user.services?.google) {
      serviceName = 'google';
      email = (user.services.google.email || '').trim().toLowerCase();
      emailVerified = true;
    } else if (user.services?.microsoft) {
      serviceName = 'microsoft';
      const msEmail = user.services.microsoft.mail;
      const msUserPrincipalName = user.services.microsoft.userPrincipalName;
      const msOidcEmail = user.services.microsoft.email;
      email = (msOidcEmail || msEmail || msUserPrincipalName || '').trim().toLowerCase();
      emailVerified = true;
      deps.serverConsole('[ACCOUNTS] Microsoft user data:', {
        email: msOidcEmail,
        mail: msEmail,
        userPrincipalName: msUserPrincipalName,
        extractedEmail: email,
      });
    } else if (user.services?.memphisSaml) {
      serviceName = 'memphisSaml';
      email = extractMemphisSamlEmail(user.services.memphisSaml);
      emailVerified = true;
      deps.serverConsole('[ACCOUNTS] Memphis SAML user data:', {
        email: user.services.memphisSaml.email,
        mail: user.services.memphisSaml.mail,
        eduPersonPrincipalName: user.services.memphisSaml.eduPersonPrincipalName,
        nameID: user.services.memphisSaml.nameID,
        extractedEmail: email,
      });
    } else if (user.services?.password) {
      const userRecord = user as unknown as UnknownRecord;
      const passwordEmailSource = user.emails?.[0]?.address || userRecord.email_canonical || userRecord.email_original || user.username || '';
      email = String(passwordEmailSource).trim().toLowerCase();
    }

    if (!email) {
      deps.serverConsole('[ACCOUNTS] WARNING: No email found for account creation branch:', serviceName);
      deps.serverConsole('[ACCOUNTS] User object:', JSON.stringify(user, null, 2));
      if (serviceName === 'password') {
        throw new Meteor.Error('password-email-missing', 'No email found for password account creation');
      }
      throw new Meteor.Error('oauth-email-missing', 'No email found for your OAuth account');
    }

    const normalizedEmail = deps.normalizeCanonicalEmail(email);
    if (serviceName !== 'password') {
      const {
        accountsUserByEmail,
        accountsUserByUsername,
        existingUserByEmail,
        existingUserByUsername,
        existingUser,
      } = findExistingUserByCanonicalEmail(normalizedEmail.canonical);
      deps.serverConsole('[ACCOUNTS] OAuth existing-account lookup', {
        attemptedProvider: serviceName,
        normalizedEmailCanonical: normalizedEmail.canonical,
        accountsUserByEmail: summarizeUserLookupForLog(accountsUserByEmail),
        accountsUserByUsername: summarizeUserLookupForLog(accountsUserByUsername),
        existingUserByEmail: summarizeUserLookupForLog(existingUserByEmail),
        existingUserByUsername: summarizeUserLookupForLog(existingUserByUsername),
      });
      if (existingUser && !(existingUser as any)?.services?.[serviceName]) {
        throwOAuthExistingAccountError(existingUser, serviceName, normalizedEmail.canonical, deps);
      }
    }

    user.username = normalizedEmail.canonical;
    const userRecord = user as unknown as UnknownRecord;
    userRecord.email_original = normalizedEmail.original;
    userRecord.email_canonical = normalizedEmail.canonical;
    user.emails = [{ address: normalizedEmail.canonical, verified: emailVerified }];
    user.profile = user.profile || {};
    user.profile.username = normalizedEmail.canonical;
    userRecord.authState = deps.buildAccountAuthState(user, serviceName?.toLowerCase() || 'password');
    deps.serverConsole(`[ACCOUNTS] Creating new ${serviceName} user:`, dispUsr(user));

    const normalizedUsername = user.username || '';
    if (normalizedUsername) {
      deps.syncUsernameCaches(user._id, normalizedUsername);
    }
    return user;
  });

  (Accounts as any).config({
    loginExpirationInDays: 90,
    argon2Enabled: deps.isArgon2Enabled(),
  });
  deps.serverConsole('Password hash runtime info:', deps.getPasswordHashRuntimeInfo());

  await deps.ScheduledTurkMessages.rawCollection().createIndex({ sent: 1, scheduled: 1 });
  await deps.AuthThrottleState.rawCollection().createIndex({ key: 1 }, { unique: true });
  await deps.AuthThrottleState.rawCollection().createIndex({ updatedAt: 1 });
  await deps.ManualContentDrafts.rawCollection().createIndex({ ownerId: 1, updatedAt: -1 });

  await startConfiguredSyncedCronJobs({
    Meteor,
    isProd: deps.isProd,
    serverConsole: deps.serverConsole,
    sendScheduledTurkMessages,
    sendErrorReportSummaries: deps.sendErrorReportSummaries,
    checkDriveSpace: async () => checkDriveSpace(deps),
  });

  const allEmails = await getRestartEmailRecipients(deps, roleSettings);
  deps.serverConsole('restart notification recipient count:', allEmails.length);
  for (const emailaddr of allEmails) {
    let server = Meteor.absoluteUrl().split('//')[1] || Meteor.absoluteUrl();
    server = server.substring(0, server.length - 1);
    deps.sendEmail(emailaddr, deps.ownerEmail, `MoFaCTs Deployed on ${server}`, `The server has restarted.\nServer: ${server}`);
  }
}
