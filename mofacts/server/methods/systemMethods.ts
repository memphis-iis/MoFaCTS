import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import {
  requireAuthenticatedUser,
  requireUserMatchesOrHasRole,
  requireUserWithRoles,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};

type SystemMethodsDeps = {
  serverConsole: (...args: unknown[]) => void;
  ScheduledTurkMessages: {
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  usersCollection: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
  };
  ErrorReports: {
    insertAsync: (document: UnknownRecord) => Promise<unknown>;
  };
  DynamicSettings: {
    findOneAsync: (selector: UnknownRecord) => Promise<any>;
    insertAsync: (document: UnknownRecord) => Promise<unknown>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
  };
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  requireAdminUser: (
    userId: string | null | undefined,
    errMsg?: string,
    errorCode?: string | number
  ) => Promise<void>;
  buildDiskUsageStatus: (path?: string) => unknown;
  sendErrorReportSummaries: () => Promise<unknown>;
  sendEmail: (to: string, from: string, subject: string, text: string) => void;
  getCurrentUser: () => Promise<any>;
  getVerbosityLevel: () => number;
  setVerbosityLevel: (level: number) => void;
};

const MAX_ERROR_REPORT_TEXT_LENGTH = 20000;
const MAX_ERROR_REPORT_JSON_LENGTH = 250000;
const MAX_ERROR_REPORT_LOG_ROWS = 200;
const MAX_ERROR_REPORT_LOG_ROW_LENGTH = 2000;
const MAX_DEBUG_LOG_LENGTH = 2000;

function truncateText(value: unknown, maxLength: number) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function getJsonLength(value: unknown) {
  try {
    return JSON.stringify(value)?.length || 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function assertJsonSize(value: unknown, maxLength: number, label: string) {
  if (getJsonLength(value) > maxLength) {
    throw new Meteor.Error(400, `${label} is too large`);
  }
}

function sanitizeLogRows(logs: unknown) {
  if (!Array.isArray(logs)) {
    return [];
  }
  return logs.slice(-MAX_ERROR_REPORT_LOG_ROWS).map((entry) => {
    if (typeof entry === 'string') {
      return truncateText(entry, MAX_ERROR_REPORT_LOG_ROW_LENGTH);
    }
    try {
      return truncateText(JSON.stringify(entry), MAX_ERROR_REPORT_LOG_ROW_LENGTH);
    } catch {
      return truncateText(entry, MAX_ERROR_REPORT_LOG_ROW_LENGTH);
    }
  });
}

export function createSystemMethods(deps: SystemMethodsDeps) {
  return {
    removeTurkById: async function(this: MethodContext, turkId: string, experimentId: string) {
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: this.userId,
        subjectUserId: turkId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Can only modify your own lockouts',
        forbiddenCode: 403,
      });

      deps.serverConsole('removeTurkById', turkId, experimentId);
      await deps.ScheduledTurkMessages.removeAsync({ workerUserId: turkId, experiment: experimentId });
      const currentUser = await deps.getCurrentUser();
      const lockout = currentUser.lockouts;
      lockout[experimentId].lockoutMinutes = Number.MAX_SAFE_INTEGER;
      await deps.usersCollection.updateAsync({ _id: Meteor.userId() }, { $set: { lockouts: lockout } });
    },

    saveAudioSettings: async function(this: MethodContext, audioSettings: UnknownRecord) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in to save audio settings');
      }

      const DEFAULT_AUDIO_SETTINGS = {
        audioPromptMode: 'silent',
        audioPromptQuestionVolume: 0,
        audioPromptQuestionSpeakingRate: 1,
        audioPromptVoice: 'en-US-Standard-A',
        audioPromptFeedbackVolume: 0,
        audioPromptFeedbackSpeakingRate: 1,
        audioPromptFeedbackVoice: 'en-US-Standard-A',
        audioInputMode: false,
        audioInputSensitivity: 60,
      };

      const settingsToSave = { ...DEFAULT_AUDIO_SETTINGS, ...audioSettings };

      await deps.usersCollection.updateAsync(
        { _id: this.userId },
        { $set: { audioSettings: settingsToSave } }
      );

      return { success: true };
    },

    setLockoutTimeStamp: async function(
      this: MethodContext,
      lockoutTimeStamp: number,
      lockoutMinutes: number,
      currentUnitNumber: number,
      TDFId: string
    ) {
      deps.serverConsole('setLockoutTimeStamp', lockoutTimeStamp, lockoutMinutes, currentUnitNumber, TDFId);
      const currentUser = await deps.getCurrentUser();
      let lockouts = currentUser?.lockouts;
      if (!lockouts) lockouts = {};
      if (!lockouts[TDFId]) lockouts[TDFId] = {};
      const existing = lockouts[TDFId] || {};
      const existingTimeStamp = Number(existing.lockoutTimeStamp);
      const existingMinutes = Number(existing.lockoutMinutes);
      const existingUnitNumber = Number(existing.currentLockoutUnit);
      const hasExistingLockoutForUnit =
        Number.isFinite(existingTimeStamp) &&
        Number.isFinite(existingMinutes) &&
        existingUnitNumber === Number(currentUnitNumber);

      if (hasExistingLockoutForUnit) {
        return {
          lockoutTimeStamp: existingTimeStamp,
          lockoutMinutes: existingMinutes,
          currentLockoutUnit: existingUnitNumber,
        };
      }

      lockouts[TDFId].lockoutTimeStamp = lockoutTimeStamp;
      lockouts[TDFId].lockoutMinutes = lockoutMinutes;
      lockouts[TDFId].currentLockoutUnit = currentUnitNumber;
      const userId = this.userId || Meteor.userId();
      if (!userId) return;
      await deps.usersCollection.updateAsync({ _id: userId }, { $set: { lockouts } });
      return {
        lockoutTimeStamp,
        lockoutMinutes,
        currentLockoutUnit: currentUnitNumber,
      };
    },

    getServerStatus: async function(this: MethodContext) {
      await deps.requireAdminUser(this.userId, 'Admin access required');
      return deps.buildDiskUsageStatus('/');
    },

    sendErrorReportSummaries: async function(this: MethodContext) {
      await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
        userId: this.userId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Admin access required',
        forbiddenCode: 403,
      });
      return await deps.sendErrorReportSummaries();
    },

    sendEmail: async function(this: MethodContext, to: string, from: string, subject: string, text: string) {
      await requireUserWithRoles(deps.getMethodAuthorizationDeps(), {
        userId: this.userId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Admin access required',
        forbiddenCode: 403,
      });
      this.unblock?.();
      deps.sendEmail(to, from, subject, text);
    },

    sendUserErrorReport: async function(
      this: MethodContext,
      userID: string,
      description: string,
      curPage: string,
      sessionVars: UnknownRecord,
      userAgent: string,
      logs: unknown[],
      currentExperimentState: UnknownRecord
    ) {
      const actingUserId = requireAuthenticatedUser(this.userId, 'Must be logged in to submit error reports', 401);
      if (userID && userID !== actingUserId) {
        throw new Meteor.Error(403, 'Can only submit error reports for the current user');
      }
      assertJsonSize(sessionVars, MAX_ERROR_REPORT_JSON_LENGTH, 'Session snapshot');
      assertJsonSize(currentExperimentState, MAX_ERROR_REPORT_JSON_LENGTH, 'Experiment state snapshot');
      const errorReport = {
        user: actingUserId,
        description: truncateText(description, MAX_ERROR_REPORT_TEXT_LENGTH),
        page: truncateText(curPage, 1000),
        time: new Date(),
        sessionVars,
        userAgent: truncateText(userAgent, 2000),
        logs: sanitizeLogRows(logs),
        currentExperimentState,
        emailed: false,
      };
      return await deps.ErrorReports.insertAsync(errorReport);
    },

    logUserAgentAndLoginTime: async function(this: MethodContext, userID: string, userAgent: string) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (userID !== this.userId) {
        throw new Meteor.Error(403, 'Can only update your own login status');
      }
      const loginTime = new Date();
      return await deps.usersCollection.updateAsync({ _id: userID }, { $set: { status: { lastLogin: loginTime, userAgent } } });
    },

    serverLog: async function(this: MethodContext, data: unknown) {
      requireAuthenticatedUser(this.userId, 'Must be logged in to write server logs', 401);
      const currentUser = await deps.getCurrentUser();
      if (currentUser) {
        const logData = 'User:' + currentUser._id + ', log:' + truncateText(data, MAX_DEBUG_LOG_LENGTH);
        deps.serverConsole(logData);
      }
    },

    debugLog: async function(this: MethodContext, logtxt: unknown) {
      requireAuthenticatedUser(this.userId, 'Must be logged in to write debug logs', 401);
      let usr = await deps.getCurrentUser();
      if (!usr) {
        usr = '[No Current User]';
      } else {
        usr = usr.username ? usr.username : usr._id;
        usr = '[USER:' + usr + ']';
      }

      deps.serverConsole(usr + ' ' + truncateText(logtxt, MAX_DEBUG_LOG_LENGTH));
    },

    setVerbosity: async function(this: MethodContext, level: number | string) {
      await deps.requireAdminUser(this.userId, 'Only admins can change server verbosity level', 'not-authorized');
      const parsedLevel = parseInt(String(level), 10);
      deps.setVerbosityLevel(parsedLevel);
      deps.serverConsole('Verbose logging set to ' + deps.getVerbosityLevel());
    },

    getVerbosity: async function(this: MethodContext) {
      await deps.requireAdminUser(this.userId, 'Only admins can read server verbosity level', 'not-authorized');
      return deps.getVerbosityLevel();
    },

    ensureClientVerbositySetting: async function(this: MethodContext) {
      await deps.requireAdminUser(this.userId, 'Only admins can initialize client verbosity level', 'not-authorized');
      const existing = await deps.DynamicSettings.findOneAsync({ key: 'clientVerbosityLevel' });
      if (!existing) {
        await deps.DynamicSettings.insertAsync({
          key: 'clientVerbosityLevel',
          value: 0,
        });
        deps.serverConsole('Initialized clientVerbosityLevel setting to 0');
      }
      return existing ? existing.value : 0;
    },

    setClientVerbosity: async function(this: MethodContext, level: number | string) {
      await deps.requireAdminUser(this.userId, 'Only admins can change client verbosity level', 'not-authorized');

      const parsedLevel = parseInt(String(level), 10);
      if (parsedLevel < 0 || parsedLevel > 2) {
        throw new Meteor.Error('invalid-value', 'Verbosity level must be 0, 1, or 2');
      }

      await deps.DynamicSettings.updateAsync(
        { key: 'clientVerbosityLevel' },
        { $set: { value: parsedLevel } }
      );

      deps.serverConsole(`Client verbosity level changed to ${parsedLevel} by ${this.userId}`);
      return parsedLevel;
    },

    async getUserPreference(this: MethodContext, key: string) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in to get preferences');
      }

      check(key, String);

      const user = await deps.usersCollection.findOneAsync(
        { _id: this.userId },
        { fields: { preferences: 1 } }
      );

      return user?.preferences?.[key];
    },

    async setUserPreference(this: MethodContext, key: string, value: unknown) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in to set preferences');
      }

      check(key, String);
      check(value, Match.Any);

      const updateField = `preferences.${key}`;
      await deps.usersCollection.updateAsync(
        { _id: this.userId },
        { $set: { [updateField]: value } }
      );

      deps.serverConsole(2, `User ${this.userId} set preference ${key} to ${value}`);
      return true;
    },
  };
}
