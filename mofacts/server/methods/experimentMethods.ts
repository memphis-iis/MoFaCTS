import { studyOnlyAccount } from '../../common/participantPrivacy';
import { bindParticipantConnection, participantTokenBinding, participantConnectionRoot, encodeParticipantToken } from '../lib/participantSession';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check } from 'meteor/check';
import { randomBytes } from 'crypto';
import { EXPERIMENT_ENTRY_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import { PUBLIC_DEMO_RATE_LIMIT } from '../runtime/ddpRateLimits';
import type { MeteorMethodBinding } from '../securitySurfaces/registerMeteorMethods';
import {
  parsePublicDemoRequest,
  PUBLIC_DEMO_DEFINITIONS,
  publicDemoExpiresAt,
  type PublicDemoKind,
} from '../../common/publicDemoContract';

type UnknownRecord = Record<string, unknown>;

export function generatePublicDemoUsername(kind: PublicDemoKind): string {
  const kindCode = kind === 'student' ? 'S' : kind === 'teacher' ? 'T' : 'R';
  return `DEMO-${kindCode}-${randomBytes(12).toString('hex').toUpperCase()}`;
}
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id: string; onClose: (fn: () => void) => void; clientAddress?: string | null } | null;
};

type ExperimentMethodsDeps = {
  validateProlificBinding: (userId: string, target: string, rootId: string) => Promise<boolean>;
  isProlificAccount: (userId: string) => Promise<boolean>;
  serverConsole: (...args: unknown[]) => void;
  Tdfs: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  resolveExperimentTargetFamily: (experimentTarget: unknown, rootAccessSelector?: UnknownRecord) => Promise<{ root: any } | null>;
  GlobalExperimentStates: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  usersCollection: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
  };
  experimentUsernameRegex: RegExp;
  normalizeAccountUsername: (rawUsername: unknown) => string;
  escapeRegexLiteral: (value: string) => string;
  withSignUpLock: <T>(username: string, work: () => Promise<T>) => Promise<T>;
  createUserWithRetry: (
    username: string,
    password: string,
    profile?: UnknownRecord,
    options?: { includeEmail?: boolean; emailOriginal?: string; emailCanonical?: string }
  ) => Promise<string>;
  writeAuditLog: (
    action: string,
    actorUserId: string | null,
    targetUserId: string | null,
    details?: UnknownRecord
  ) => Promise<void>;
};

export async function issueExperimentLoginToken(userId: string, binding?: { target: string; rootId: string }) {
  const accountsAny = Accounts as any;
  if (
    typeof accountsAny._generateStampedLoginToken !== 'function' ||
    typeof accountsAny._insertLoginToken !== 'function'
  ) {
    throw new Meteor.Error('experiment-login-token-unavailable', 'Experiment login token support is unavailable');
  }

  const stampedToken = accountsAny._generateStampedLoginToken();
  if (!stampedToken?.token) {
    throw new Meteor.Error('experiment-login-token-missing', 'Experiment login token could not be created');
  }
  if (binding) stampedToken.token = encodeParticipantToken(binding, stampedToken.token);
  await accountsAny._insertLoginToken(userId, stampedToken);
  return stampedToken.token;
}

export function createExperimentMethodRegistration(deps: ExperimentMethodsDeps) {

  async function getTdfByExperimentTarget(experimentTarget: string) {
    const family = await deps.resolveExperimentTargetFamily(experimentTarget);
    return family?.root || null;
  }

  async function createPasswordlessExperimentUser(
    username: string,
    experimentTarget: string,
    profile: UnknownRecord,
  ): Promise<string> {
    const internalAccountPassword = randomBytes(24).toString('hex');
    return await deps.createUserWithRetry(
      username,
      internalAccountPassword,
      {
        experiment: true,
        experimentTarget,
        ...profile,
      },
      { includeEmail: false },
    );
  }

  async function hasCompletedExperimentTarget(userId: string, tdf: any) {
    const tdfId = tdf?._id;
    const unitCount = tdf?.content?.tdfs?.tutor?.unit?.length;
    if (!tdfId || !Number.isFinite(unitCount)) {
      return false;
    }
    const normalizedUnitCount = Number(unitCount);
    if (normalizedUnitCount <= 0) {
      return false;
    }

    const stateDoc = await deps.GlobalExperimentStates.findOneAsync(
      { userId, TDFId: tdfId },
      { sort: { "experimentState.lastActionTimeStamp": -1 } }
    );

    const experimentState = stateDoc?.experimentState || {};
    const lastUnitCompleted = Number(experimentState?.lastUnitCompleted);
    return Number.isFinite(lastUnitCompleted) && lastUnitCompleted >= (normalizedUnitCount - 1);
  }

  async function authorizePasswordlessTarget(experimentTarget: string, rawUserName: string) {
    check(experimentTarget, String);
    check(rawUserName, String);

    const normalizedTarget = experimentTarget.trim().toLowerCase();
    const normalizedUserName = deps.normalizeAccountUsername(rawUserName).toUpperCase();
    if (!normalizedTarget) {
      throw new Meteor.Error(400, 'Experiment target is required');
    }
    if (!deps.experimentUsernameRegex.test(normalizedUserName)) {
      throw new Meteor.Error(400, 'Experiment username must be 3-32 chars using A-Z, 0-9, ., _, or -');
    }

    const tdf = await getTdfByExperimentTarget(normalizedTarget);
    if (!tdf) {
      throw new Meteor.Error(404, 'Experiment target not found');
    }

    const requiresPassword = tdf?.content?.tdfs?.tutor?.setspec?.experimentPasswordRequired;
    if (requiresPassword === true || requiresPassword === 'true') {
      throw new Meteor.Error('experiment-password-required', 'This experiment requires instructor-provided credentials');
    }
    return { normalizedTarget, normalizedUserName, tdf };
  }

  const passwordless = Object.freeze({
    kind: 'experiment-entry', operation: 'passwordless', rateLimit: null, authorize: authorizePasswordlessTarget,
  } as const);
  async function provisionExperimentUser(this: MethodContext, experimentTarget: string, rawUserName: string) {
    const { normalizedTarget, normalizedUserName, tdf } = await passwordless.authorize(experimentTarget, rawUserName);
    return await deps.withSignUpLock(normalizedUserName, async () => {
      const usernameExactCI = new RegExp(`^${deps.escapeRegexLiteral(normalizedUserName)}$`, 'i');
      const existingUser = await deps.usersCollection.findOneAsync({ username: usernameExactCI });

      if (existingUser) {
        // The account marker also covers the brief reservation-to-account binding step.
        if (existingUser.profile?.createdBy === 'startProlificParticipation' || await deps.isProlificAccount(existingUser._id)) throw new Meteor.Error(403, 'Use the Prolific study link');
        const existingTarget = existingUser.profile?.experimentTarget?.trim().toLowerCase();
        const provisioned = existingUser.profile?.createdBy === 'provisionExperimentUser';
        const passwordless = existingUser.profile?.experiment !== false && !existingUser.roles?.length && !existingUser.services?.password && !existingUser.emails?.length
          && !Object.keys(existingUser.services || {}).some(key => key !== 'resume');
        const boundProgress = passwordless && await deps.GlobalExperimentStates.findOneAsync({
          userId: existingUser._id, TDFId: tdf._id,
        });
        if (existingTarget && existingTarget !== normalizedTarget && (provisioned || passwordless)) {
          throw new Meteor.Error('experiment-target-mismatch', 'This participation ID is already linked to a different experiment');
        }
        if (!(provisioned && existingTarget) && !boundProgress) {
          throw new Meteor.Error('duplicate-user', 'This participation ID is already in use');
        }

        const alreadyComplete = await hasCompletedExperimentTarget(existingUser._id, tdf);
        if (alreadyComplete) {
          return { userExists: true, userId: existingUser._id, status: 'already_complete' };
        }

        if (!existingTarget || !studyOnlyAccount(existingUser)) {
          const bound = await deps.usersCollection.updateAsync({
            _id: existingUser._id, 'profile.experimentTarget': existingTarget ? existingUser.profile.experimentTarget : { $in: [null, ''] },
          }, { $set: { 'profile.experiment': true, 'profile.experimentTarget': normalizedTarget } });
          if (!bound) throw new Meteor.Error('experiment-target-mismatch', 'Participant study binding changed');
        }

        const loginToken = await issueExperimentLoginToken(existingUser._id, { target: normalizedTarget, rootId: tdf._id });
        return { userExists: true, userId: existingUser._id, loginToken, status: 'resumed' };
      }

      let createdId: string;
      try {
        createdId = await createPasswordlessExperimentUser(
          normalizedUserName,
          normalizedTarget,
          {
            createdBy: 'provisionExperimentUser'
          },
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (/username already exists|duplicate key|E11000/i.test(message)) {
          throw new Meteor.Error('duplicate-user', 'This participation ID is already in use');
        }
        throw error;
      }

      const loginToken = await issueExperimentLoginToken(createdId, { target: normalizedTarget, rootId: tdf._id });
      return { userExists: false, userId: createdId, loginToken, status: 'created' };
    });
  }

  async function authorizeCredentialedEntry(context: MethodContext, target: string, username?: string, password?: { digest: string; algorithm: string }) {
    check(target, String);
    const root = await getTdfByExperimentTarget(target);
    const spec = root?.content?.tdfs?.tutor?.setspec;
    if (!root || ![true, 'true'].includes(spec?.experimentPasswordRequired)) {
      throw new Meteor.Error(403, 'Invalid experiment credentials');
    }
    const binding = { target: spec.experimentTarget, rootId: root._id };
    if (username === undefined && password === undefined && context.userId) {
      const account = await deps.usersCollection.findOneAsync({ _id: context.userId });
      if (participantConnectionRoot(context) || !account || studyOnlyAccount(account) || account.profile?.createdBy === 'publicDemo') throw new Meteor.Error(403, 'Invalid experiment credentials');
      return { userId: context.userId, binding };
    }
    check(username, String);
    check(password, { digest: String, algorithm: String });
    if (!username || !password || username.length > 320 || password.algorithm !== 'sha-256' || !/^[a-f0-9]{64}$/.test(password.digest)) throw new Meteor.Error(403, 'Invalid experiment credentials');
    const account = await deps.usersCollection.findOneAsync({ username: new RegExp('^' + deps.escapeRegexLiteral(username) + '$', 'i') });
    if (!account && !username.includes('@')) throw new Meteor.Error(403, 'Invalid experiment credentials');
    if (!studyOnlyAccount(account)) return { ordinaryLoginRequired: true } as const;
    if (account.profile.experimentTarget !== binding.target || account.profile.createdBy === 'startProlificParticipation'
      || !account.services?.password || (await (Accounts as any)._checkPasswordAsync(account, password)).error) {
      throw new Meteor.Error(403, 'Invalid experiment credentials');
    }
    return { userId: account._id, binding };
  }

  const credentialed = Object.freeze({
    kind: 'experiment-entry', operation: 'credentialed', rateLimit: null, authorize: authorizeCredentialedEntry,
  } as const);
  async function enterCredentialedExperiment(this: MethodContext, target: string, username?: string, password?: { digest: string; algorithm: string }) {
    const admission = await credentialed.authorize(this, target, username, password);
    if ('ordinaryLoginRequired' in admission) return { ordinaryLoginRequired: true };
    return { loginToken: await issueExperimentLoginToken(admission.userId, admission.binding) };
  }

  async function authorizeParticipantReconnect(context: MethodContext, token: string) {
    const binding = participantTokenBinding(token);
    if (!binding || !context.connection) throw new Meteor.Error(403, 'Invalid participant session');
    const accounts = Accounts as any;
    const result = await accounts._runLoginHandlers(context, { resume: token });
    if (!result?.userId || result.error || !result.stampedLoginToken) throw new Meteor.Error(403, 'Invalid participant session');
    const root = await getTdfByExperimentTarget(binding.target);
    if (!root || root._id !== binding.rootId) throw new Meteor.Error(403, 'Invalid participant session');
    const account = result.user || await deps.usersCollection.findOneAsync({ _id: result.userId }, { fields: { profile: 1 } });
    if (!account) throw new Meteor.Error(403, 'Invalid participant session');
    const credentialed = [true, 'true'].includes(root.content?.tdfs?.tutor?.setspec?.experimentPasswordRequired);
    if (studyOnlyAccount(account)) {
      if (account.profile.experimentTarget?.toLowerCase() !== binding.target.toLowerCase()) throw new Meteor.Error(403, 'Invalid participant session');
      if (account.profile.createdBy === 'startProlificParticipation') {
        if (credentialed || !await deps.validateProlificBinding(result.userId, binding.target, root._id)) throw new Meteor.Error(403, 'Invalid participant session');
      } else if (account.profile.createdBy === 'provisionExperimentUser' && credentialed) {
        throw new Meteor.Error(403, 'Invalid participant session');
      }
    } else if (!credentialed) {
      throw new Meteor.Error(403, 'Invalid participant session');
    }
    return { connection: context.connection, rootId: root._id, result, accounts };
  }

  const reconnect = Object.freeze({
    kind: 'experiment-entry', operation: 'scoped-reconnect', rateLimit: null, authorize: authorizeParticipantReconnect,
  } as const);
  async function reconnectExperimentParticipant(this: MethodContext, token: string) {
    const { connection, rootId, result, accounts } = await reconnect.authorize(this, token);
    bindParticipantConnection(connection, result.userId, token, rootId);
    return accounts._attemptLogin(this, 'reconnectExperimentParticipant', [], { ...result, type: 'experimentParticipant' });
  }

  async function authorizePublicDemo(context: MethodContext, params: unknown) {
    check(params, Object);
    const kind = parsePublicDemoRequest(params);
    if (!kind) {
      throw new Meteor.Error('invalid-public-demo-kind', 'Public demo kind must be student, teacher, or researcher');
    }
    if (context.userId) {
      throw new Meteor.Error('public-demo-account-active', 'Sign out before starting a public demonstration');
    }

    const definition = PUBLIC_DEMO_DEFINITIONS[kind as PublicDemoKind];
    const tdf = await getTdfByExperimentTarget(definition.experimentTarget);
    if (!tdf) {
      throw new Meteor.Error('public-demo-unavailable', 'The requested public demonstration is not configured');
    }
    const requiresPassword = tdf?.content?.tdfs?.tutor?.setspec?.experimentPasswordRequired;
    if (requiresPassword === true || requiresPassword === 'true') {
      throw new Meteor.Error('public-demo-password-invalid', 'Public demonstrations cannot require participant credentials');
    }
    return { kind, definition };
  }

  const demo = Object.freeze({
    kind: 'experiment-entry', operation: 'public-demo', rateLimit: PUBLIC_DEMO_RATE_LIMIT, authorize: authorizePublicDemo,
  } as const);
  async function startPublicDemo(this: MethodContext, params: unknown) {
    const { kind, definition } = await demo.authorize(this, params);
    const createdAt = new Date();
    const expiresAt = publicDemoExpiresAt(createdAt);
    const username = generatePublicDemoUsername(kind);
    let createdId: string;
    try {
      createdId = await createPasswordlessExperimentUser(username, definition.experimentTarget, {
        createdBy: 'publicDemo',
        publicDemoKind: kind,
        demoCreatedAt: createdAt,
        demoExpiresAt: expiresAt,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (/username already exists|duplicate key|E11000/i.test(message)) {
        throw new Meteor.Error('public-demo-id-collision', 'A public demo identity collision occurred; retry the launch');
      }
      throw error;
    }

    await deps.writeAuditLog('publicDemo.started', null, createdId, {
      kind,
      experimentTarget: definition.experimentTarget,
      expiresAt,
    });
    return {
      loginToken: await issueExperimentLoginToken(createdId),
      launchPath: definition.launchPath,
      expiresAt,
    };
  }

  const methods = {
    getTdfByExperimentTarget,
    enterCredentialedExperiment,
    reconnectExperimentParticipant,
    provisionExperimentUser,
    startPublicDemo,
  };
  type RegisteredName = keyof typeof EXPERIMENT_ENTRY_VERIFICATIONS;
  function bind(name: RegisteredName, policy: typeof passwordless | typeof credentialed | typeof reconnect | typeof demo,
    dataEgress: MeteorMethodBinding['dataEgress']): MeteorMethodBinding {
    return Object.freeze({ handler: methods[name], verification: EXPERIMENT_ENTRY_VERIFICATIONS[name], policy, dataEgress });
  }
  return { methods, methodBindings: Object.freeze([
    bind('provisionExperimentUser', passwordless, 'experiment-login-token'),
    bind('enterCredentialedExperiment', credentialed, 'experiment-login-token'),
    bind('reconnectExperimentParticipant', reconnect, 'participant-session'),
    bind('startPublicDemo', demo, 'public-demo-launch'),
  ]) };
}
