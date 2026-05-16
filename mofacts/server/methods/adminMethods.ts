import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check } from 'meteor/check';
import { Roles } from 'meteor/alanning:roles';

type UnknownRecord = Record<string, unknown>;
type Logger = (...args: unknown[]) => void;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};
type CsvParser = {
  parse: (csv: string) => { data: unknown[] };
};
type CountAndFetchCursor = {
  countAsync: () => Promise<number>;
  fetchAsync: () => Promise<any[]>;
};
type FetchCursor = {
  fetchAsync: () => Promise<any[]>;
};

type AdminMethodsDeps = {
  serverConsole: Logger;
  csvParser?: CsvParser | undefined;
  usersCollection: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => FetchCursor;
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => CountAndFetchCursor;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  DynamicAssets: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => CountAndFetchCursor;
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  Courses: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { countAsync: () => Promise<number> };
  };
  DynamicSettings: {
    findOneAsync: (selector: UnknownRecord) => Promise<any>;
  };
  Histories: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  GlobalExperimentStates: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  SectionUserMap: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  UserTimesLog: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  UserMetrics: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  PasswordResetTokens: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  UserDashboardCache: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  UserUploadQuota: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  requireAdminUser: (
    userId: string | null | undefined,
    errMsg?: string,
    errorCode?: string | number
  ) => Promise<void>;
  normalizeCanonicalEmail: (rawEmail: unknown) => { original: string; canonical: string };
  assertStrongPassword: (password: string) => void;
  withSignUpLock: <T>(username: string, work: () => Promise<T>) => Promise<T>;
  findNormalAccountUserByCanonicalEmail: (emailCanonical: string) => Promise<any>;
  createUserWithRetry: (
    username: string,
    password: string,
    profile?: UnknownRecord,
    options?: { includeEmail?: boolean; emailOriginal?: string; emailCanonical?: string }
  ) => Promise<string>;
  enforceCanonicalEmailIdentity: (
    userId: string,
    rawEmail?: unknown,
    options?: { actorUserId?: string | null; source?: string }
  ) => Promise<void>;
  writeAuditLog: (
    action: string,
    actorUserId: string | null,
    targetUserId: string | null,
    details?: UnknownRecord
  ) => Promise<void>;
  syncUserAuthState: (userId: string, primaryMethodHint?: string) => Promise<void>;
  isEmailVerificationRequired: () => boolean;
  sendVerificationEmailForUser: (userId: string, actorUserId: string | null, source: string) => Promise<boolean>;
  getUserDisplayIdentifier: (user: any) => string;
  syncUsernameCaches: (userId: string, nextUsername: string, previousUsername?: string) => void;
  deleteTdfRuntimeData: (tdfId: string) => Promise<void>;
  clearStimDisplayTypeMap: () => void;
};

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function addEmailCandidate(emailSet: Map<string, string>, candidate: unknown) {
  const email = trimString(candidate);
  if (!email.includes('@')) {
    return;
  }
  const canonical = email.toLowerCase();
  if (!emailSet.has(canonical)) {
    emailSet.set(canonical, email);
  }
}

function getUserAdminEmailCandidates(user: any) {
  const candidates: unknown[] = [
    user?.email_canonical,
    user?.email_original,
    user?.username,
    user?.email,
  ];

  if (Array.isArray(user?.emails)) {
    for (const emailEntry of user.emails) {
      candidates.push(emailEntry?.address);
    }
  }

  return candidates;
}

async function getUserDeletionBlockingReasons(deps: AdminMethodsDeps, targetUserId: string) {
  const reasons: string[] = [];

  const ownedTdfCount = await deps.Tdfs.find({ ownerId: targetUserId }, { fields: { _id: 1 } }).countAsync();
  if (ownedTdfCount > 0) {
    reasons.push(`owns ${ownedTdfCount} lesson${ownedTdfCount === 1 ? '' : 's'}`);
  }

  const uploadedAssetCount = await deps.DynamicAssets.find({ userId: targetUserId }, { fields: { _id: 1 } }).countAsync();
  if (uploadedAssetCount > 0) {
    reasons.push(`has ${uploadedAssetCount} uploaded asset${uploadedAssetCount === 1 ? '' : 's'}`);
  }

  const teacherCourseCount = await deps.Courses.find({ teacherUserId: targetUserId }, { fields: { _id: 1 } }).countAsync();
  if (teacherCourseCount > 0) {
    reasons.push(`teaches ${teacherCourseCount} course${teacherCourseCount === 1 ? '' : 's'}`);
  }

  const themeLibrarySetting = await deps.DynamicSettings.findOneAsync({ key: 'themeLibrary' });
  const themeLibrary = Array.isArray(themeLibrarySetting?.value) ? themeLibrarySetting.value : [];
  const authoredThemeCount = themeLibrary.filter((theme: any) => String(theme?.metadata?.author || '').trim() === targetUserId).length;
  if (authoredThemeCount > 0) {
    reasons.push(`authored ${authoredThemeCount} custom theme${authoredThemeCount === 1 ? '' : 's'}`);
  }

  return reasons;
}

async function removeUserAdminScopedData(deps: AdminMethodsDeps, targetUserId: string) {
  await Promise.all([
    deps.Histories.removeAsync({ userId: targetUserId }),
    deps.GlobalExperimentStates.removeAsync({ userId: targetUserId }),
    deps.SectionUserMap.removeAsync({ userId: targetUserId }),
    deps.UserTimesLog.removeAsync({ userId: targetUserId }),
    deps.UserMetrics.removeAsync({ _id: targetUserId }),
    deps.PasswordResetTokens.removeAsync({ userId: targetUserId }),
    deps.UserDashboardCache.removeAsync({ userId: targetUserId }),
    deps.UserUploadQuota.removeAsync({ userId: targetUserId }),
  ]);
}

async function upsertManagedUser(
  deps: AdminMethodsDeps,
  params: {
    actingUserId: string | null | undefined;
    rawUserName: string;
    password: string;
    existingUserSource: string;
    createdUserSource: string;
    verificationSource: string;
    bulkSource?: string;
  }
) {
  const normalizedEmail = deps.normalizeCanonicalEmail(params.rawUserName);
  deps.assertStrongPassword(params.password);

  return await deps.withSignUpLock(normalizedEmail.canonical, async () => {
    const existingUser = await deps.findNormalAccountUserByCanonicalEmail(normalizedEmail.canonical);

    if (existingUser) {
      Accounts.setPassword(existingUser._id, params.password);
      await deps.enforceCanonicalEmailIdentity(existingUser._id, normalizedEmail.original, {
        actorUserId: params.actingUserId || null,
        source: params.existingUserSource,
      });
      await deps.writeAuditLog('admin.userPasswordReset', params.actingUserId || null, existingUser._id, {
        username: normalizedEmail.canonical,
        ...(params.bulkSource ? { source: params.bulkSource } : {}),
      });
      return { userExists: true, userId: existingUser._id, passwordUpdated: true };
    }

    const createdId = await deps.createUserWithRetry(
      normalizedEmail.canonical,
      params.password,
      { experiment: false, createdBy: params.actingUserId, username: normalizedEmail.canonical },
      {
        emailOriginal: normalizedEmail.original,
        emailCanonical: normalizedEmail.canonical,
      }
    );
    await deps.enforceCanonicalEmailIdentity(createdId, normalizedEmail.original, {
      actorUserId: params.actingUserId || null,
      source: params.createdUserSource,
    });
    await deps.syncUserAuthState(createdId, 'password');
    await deps.writeAuditLog('admin.userCreated', params.actingUserId || null, createdId, {
      username: normalizedEmail.canonical,
      ...(params.bulkSource ? { source: params.bulkSource } : {}),
    });
    if (deps.isEmailVerificationRequired()) {
      await deps.sendVerificationEmailForUser(createdId, params.actingUserId || null, params.verificationSource);
    }

    return { userExists: false, userId: createdId, passwordUpdated: false };
  });
}

export function createAdminMethods(deps: AdminMethodsDeps) {
  return {
    userAdminNewsEmailRecipients: async function(this: MethodContext) {
      await deps.requireAdminUser(this.userId, 'Only admins can compose news emails');

      const users = await deps.usersCollection.find(
        {
          $or: [
            { email_canonical: { $regex: '@' } },
            { email_original: { $regex: '@' } },
            { 'emails.address': { $regex: '@' } },
            { username: { $regex: '@' } },
            { email: { $regex: '@' } },
          ],
        },
        {
          fields: {
            username: 1,
            email: 1,
            email_canonical: 1,
            email_original: 1,
            emails: 1,
          },
          sort: { email_canonical: 1, username: 1 },
        }
      ).fetchAsync();

      const emailSet = new Map<string, string>();
      for (const user of users) {
        for (const candidate of getUserAdminEmailCandidates(user)) {
          addEmailCandidate(emailSet, candidate);
        }
      }

      const emails = Array.from(emailSet.values()).sort((a, b) => a.localeCompare(b));
      await deps.writeAuditLog('admin.newsEmailComposeRequested', this.userId || null, null, {
        recipientCount: emails.length,
      });

      return {
        emails,
        count: emails.length,
      };
    },

    adminCreateOrUpdateUser: async function(this: MethodContext, rawUserName: string, newUserPassword: string) {
      check(rawUserName, String);
      check(newUserPassword, String);
      await deps.requireAdminUser(this.userId, 'Only admins can create or update users');

      return await upsertManagedUser(deps, {
        actingUserId: this.userId,
        rawUserName,
        password: newUserPassword,
        existingUserSource: 'adminCreateOrUpdateUser.existingUser',
        createdUserSource: 'adminCreateOrUpdateUser.createdUser',
        verificationSource: 'adminCreateOrUpdateUser',
      });
    },

    userAdminRoleChange: async function(this: MethodContext, targetUserId: string, roleAction: string, roleName: string) {
      deps.serverConsole('userAdminRoleChange', targetUserId, roleAction, roleName);
      await deps.requireAdminUser(this.userId, 'You are not authorized to do that', 'not-authorized');

      const normalizedTargetUserId = trimString(targetUserId);
      const normalizedRoleAction = trimString(roleAction).toLowerCase();
      const normalizedRoleName = trimString(roleName);

      if (!normalizedTargetUserId) {
        throw new Meteor.Error('invalid-args', 'Invalid: blank user ID not allowed');
      }
      if (!['add', 'remove'].includes(normalizedRoleAction)) {
        throw new Meteor.Error('invalid-args', 'Invalid: unknown requested action');
      }
      if (!['admin', 'teacher'].includes(normalizedRoleName)) {
        throw new Meteor.Error('invalid-args', 'Invalid: unknown requested role');
      }

      const targetUser = await deps.usersCollection.findOneAsync({ _id: normalizedTargetUserId });
      if (!targetUser) {
        throw new Meteor.Error('not-found', 'Invalid: could not find that user');
      }

      const targetUsername = targetUser?.username;

      if (normalizedRoleAction === 'add') {
        await Roles.addUsersToRolesAsync(normalizedTargetUserId, normalizedRoleName);
      } else {
        await Roles.removeUsersFromRolesAsync(normalizedTargetUserId, normalizedRoleName);
      }

      deps.serverConsole('Role change complete:', normalizedRoleAction, normalizedRoleName, 'for', targetUsername);

      return {
        RESULT: 'SUCCESS',
        targetUserId: normalizedTargetUserId,
        targetUsername,
        roleAction: normalizedRoleAction,
        roleName: normalizedRoleName,
      };
    },

    userAdminDeleteUser: async function(this: MethodContext, targetUserId: string) {
      await deps.requireAdminUser(this.userId, 'Only admins can delete users');

      const normalizedTargetUserId = trimString(targetUserId);
      if (!normalizedTargetUserId) {
        throw new Meteor.Error('invalid-args', 'Invalid: blank user ID not allowed');
      }
      if (normalizedTargetUserId === this.userId) {
        throw new Meteor.Error('delete-user-blocked', 'You cannot delete your own account from User Admin.');
      }

      const targetUser = await deps.usersCollection.findOneAsync({ _id: normalizedTargetUserId });
      if (!targetUser) {
        throw new Meteor.Error('not-found', 'Invalid: could not find that user');
      }

      const blockingReasons = await getUserDeletionBlockingReasons(deps, normalizedTargetUserId);
      if (blockingReasons.length > 0) {
        throw new Meteor.Error(
          'delete-user-blocked',
          `This user cannot be deleted yet because the account ${blockingReasons.join(', ')}.`
        );
      }

      await removeUserAdminScopedData(deps, normalizedTargetUserId);
      await Roles.setUserRolesAsync(normalizedTargetUserId, []);
      await deps.usersCollection.removeAsync({ _id: normalizedTargetUserId });
      deps.syncUsernameCaches(normalizedTargetUserId, '', String(targetUser?.username || ''));
      await deps.writeAuditLog('admin.userDeleted', this.userId || null, normalizedTargetUserId, {
        deletedIdentifier: deps.getUserDisplayIdentifier(targetUser),
      });

      return {
        RESULT: 'SUCCESS',
        targetUserId: normalizedTargetUserId,
        deletedIdentifier: deps.getUserDisplayIdentifier(targetUser),
      };
    },

    deleteAllFiles: async function(this: MethodContext) {
      await deps.requireAdminUser(this.userId, 'Admin access required to delete all files');

      try {
        deps.serverConsole('delete all uploaded files');

        const tdfs = await deps.Tdfs.find({}).fetchAsync();
        deps.serverConsole('TDFs to remove: ' + tdfs.length);
        let tdfsRemoved = 0;

        for (const tdf of tdfs) {
          const tdfId = String(tdf?._id || '');
          if (!tdfId) {
            continue;
          }
          try {
            await deps.deleteTdfRuntimeData(tdfId);
            await deps.Tdfs.removeAsync({ _id: tdfId });
            tdfsRemoved++;
            deps.serverConsole('removed TDF ' + tdfId);
          } catch (tdfError: unknown) {
            deps.serverConsole('Error removing TDF ' + tdfId + ':', tdfError);
          }
        }

        const files = await deps.DynamicAssets.find({}).fetchAsync();
        deps.serverConsole('Asset files to remove: ' + files.length);
        let filesRemoved = 0;

        for (const file of files) {
          const fileId = String(file?._id || '');
          if (!fileId) {
            continue;
          }
          try {
            deps.serverConsole('removing file ' + fileId);
            await deps.DynamicAssets.removeAsync({ _id: fileId });
            filesRemoved++;
          } catch (fileError: unknown) {
            deps.serverConsole('Error removing file ' + fileId + ':', fileError);
          }
        }

        deps.clearStimDisplayTypeMap();
        deps.serverConsole('removed ' + tdfsRemoved + ' TDFs and ' + filesRemoved + ' asset files');
        return filesRemoved + tdfsRemoved;
      } catch (error: unknown) {
        deps.serverConsole('Error in deleteAllFiles:', error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Meteor.Error('delete-failed', 'Failed to delete files: ' + message);
      }
    },

    insertNewUsers: async function(this: MethodContext, filename: string, filecontents: string) {
      await deps.requireAdminUser(this.userId, 'Only admins can bulk import users');
      deps.serverConsole('insertNewUsers: ' + filename);

      if (!deps.csvParser || typeof deps.csvParser.parse !== 'function') {
        throw new Meteor.Error('csv-parser-missing', 'Papa parser is not available on server');
      }

      const allErrors: Array<{ username: string; error: string }> = [];
      let rows = deps.csvParser.parse(filecontents).data;
      deps.serverConsole('insertNewUsers parsed row count:', Array.isArray(rows) ? rows.length : 0);
      rows = rows.slice(1);

      for (const row of rows) {
        if (!Array.isArray(row)) {
          continue;
        }

        const username = typeof row[0] === 'string' ? row[0] : '';
        const password = typeof row[1] === 'string' ? row[1] : '';

        try {
          await upsertManagedUser(deps, {
            actingUserId: this.userId,
            rawUserName: username,
            password,
            existingUserSource: 'insertNewUsers.existingUser',
            createdUserSource: 'insertNewUsers.createdUser',
            verificationSource: 'insertNewUsers',
            bulkSource: 'insertNewUsers',
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          deps.serverConsole('Error creating user ' + username + ':', error);
          allErrors.push({ username, error: message });
        }
      }

      deps.serverConsole('allErrors: ' + JSON.stringify(allErrors));
      await deps.writeAuditLog('admin.bulkImportUsers', this.userId || null, null, {
        fileName: filename,
        rowCount: rows.length,
        errorCount: allErrors.length,
      });
      return allErrors;
    },
  };
}
