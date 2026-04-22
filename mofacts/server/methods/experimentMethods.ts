import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check } from 'meteor/check';
import { randomBytes } from 'crypto';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};

type ExperimentMethodsDeps = {
  serverConsole: (...args: unknown[]) => void;
  Tdfs: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
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

export function createExperimentMethods(deps: ExperimentMethodsDeps) {
  async function getTdfByExperimentTarget(experimentTarget: string) {
    experimentTarget = experimentTarget.toLowerCase();
    try {
      deps.serverConsole('getTdfByExperimentTarget:' + experimentTarget);
      const tdf = await deps.Tdfs.findOneAsync({"content.tdfs.tutor.setspec.experimentTarget": experimentTarget});
      return tdf;
    } catch (e: unknown) {
      deps.serverConsole('getTdfByExperimentTarget ERROR,', experimentTarget, ',', e);
      return null;
    }
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

  async function provisionExperimentUser(this: MethodContext, experimentTarget: string, rawUserName: string) {
    check(experimentTarget, String);
    check(rawUserName, String);

    const normalizedTarget = experimentTarget.trim().toLowerCase();
    const normalizedUserName = deps.normalizeAccountUsername(rawUserName).toUpperCase();
    deps.serverConsole('[EXPERIMENT-PROVISION] start', {
      experimentTarget: normalizedTarget,
      normalizedUsername: normalizedUserName
    });

    try {
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

      return await deps.withSignUpLock(normalizedUserName, async () => {
        const issuedPassword = randomBytes(24).toString('hex');
        const usernameExactCI = new RegExp(`^${deps.escapeRegexLiteral(normalizedUserName)}$`, 'i');
        const existingUser = await deps.usersCollection.findOneAsync({ username: usernameExactCI });

        if (existingUser) {
          const hasAnyExperimentHistory = !!(await deps.GlobalExperimentStates.findOneAsync({
            userId: existingUser._id
          }));
          let isExperimentUser =
            existingUser?.profile?.experiment === true ||
            existingUser?.profile?.experiment === 'true' ||
            existingUser?.profile?.createdBy === 'provisionExperimentUser' ||
            (typeof existingUser?.profile?.experimentTarget === 'string' && existingUser.profile.experimentTarget.trim() !== '') ||
            hasAnyExperimentHistory;
          let existingTarget = typeof existingUser?.profile?.experimentTarget === 'string'
            ? existingUser.profile.experimentTarget.trim().toLowerCase()
            : '';

          if (!isExperimentUser) {
            const hasExperimentHistoryForTarget = !!(await deps.GlobalExperimentStates.findOneAsync({
              userId: existingUser._id,
              TDFId: tdf?._id
            }));

            if ((existingTarget && existingTarget === normalizedTarget) || hasExperimentHistoryForTarget || hasAnyExperimentHistory) {
              isExperimentUser = true;
              const healPayload: Record<string, unknown> = {
                'profile.experiment': true,
                'profile.lastExperimentProvisionedAt': new Date()
              };
              if (!existingTarget) {
                existingTarget = normalizedTarget;
                healPayload['profile.experimentTarget'] = normalizedTarget;
              }
              await deps.usersCollection.updateAsync(
                { _id: existingUser._id },
                { $set: healPayload }
              );
              await deps.writeAuditLog('experiment.userProfileHealed', this.userId || null, existingUser._id, {
                username: normalizedUserName,
                experimentTarget: normalizedTarget
              });
            }
          }

          if (!isExperimentUser) {
            await deps.writeAuditLog('experiment.rejected_non_experiment_user', this.userId || null, existingUser._id, {
              username: normalizedUserName,
              experimentTarget: normalizedTarget
            });
            throw new Meteor.Error(
              'duplicate-user',
              'This participation ID is already in use'
            );
          }

          if (existingTarget && existingTarget !== normalizedTarget) {
            throw new Meteor.Error(
              'experiment-target-mismatch',
              'This participation ID is already linked to a different experiment'
            );
          }

          const alreadyComplete = await hasCompletedExperimentTarget(existingUser._id, tdf);
          if (alreadyComplete) {
            await deps.writeAuditLog('experiment.userAlreadyComplete', this.userId || null, existingUser._id, {
              username: normalizedUserName,
              experimentTarget: normalizedTarget
            });
            return { userExists: true, userId: existingUser._id, status: 'already_complete' };
          }

          Accounts.setPassword(existingUser._id, issuedPassword);
          const profileSetPayload: Record<string, unknown> = {
            'profile.lastExperimentProvisionedAt': new Date()
          };
          if (!existingTarget) {
            profileSetPayload['profile.experimentTarget'] = normalizedTarget;
          }
          await deps.usersCollection.updateAsync(
            { _id: existingUser._id },
            {
              $set: profileSetPayload
            }
          );

          await deps.writeAuditLog('experiment.userProvisioned', this.userId || null, existingUser._id, {
            username: normalizedUserName,
            experimentTarget: normalizedTarget,
            userExists: true
          });

          return { userExists: true, userId: existingUser._id, issuedPassword, status: 'resumed' };
        }

        let createdId: string;
        try {
          createdId = await deps.createUserWithRetry(
            normalizedUserName,
            issuedPassword,
            {
              experiment: true,
              experimentTarget: normalizedTarget,
              createdBy: 'provisionExperimentUser'
            },
            { includeEmail: false }
          );
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          if (/username already exists|duplicate key|E11000/i.test(message)) {
            throw new Meteor.Error('duplicate-user', 'This participation ID is already in use');
          }
          throw error;
        }

        await deps.writeAuditLog('experiment.userProvisioned', this.userId || null, createdId, {
          username: normalizedUserName,
          experimentTarget: normalizedTarget,
          userExists: false
        });

        return { userExists: false, userId: createdId, issuedPassword, status: 'created' };
      });
    } catch (error: unknown) {
      const meteorErr = error as { error?: unknown; reason?: unknown; message?: unknown };
      deps.serverConsole('[EXPERIMENT-PROVISION] failure', {
        experimentTarget: normalizedTarget,
        normalizedUsername: normalizedUserName,
        code: meteorErr?.error,
        reason: meteorErr?.reason,
        message: meteorErr?.message
      });
      throw error;
    }
  }

  return {
    getTdfByExperimentTarget,
    provisionExperimentUser,
  };
}
