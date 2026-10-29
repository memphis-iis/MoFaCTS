import { operationalHistorySelector } from '../../common/historyEnvelope';
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import {
  requireAuthenticatedUser,
  requireUserMatchesOrHasRole,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';
import { createOwnHistoryDownloadToken } from '../lib/ownHistoryDownloadTokens';
import { resolveOwnedHistoryDownloadScope } from '../lib/ownedHistoryDownloadScope';
import { createOwnedHistoryDownloadToken } from '../lib/ownedHistoryDownloadTokens';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
};

type AnalyticsDownloadDeps = {
  Histories: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  usersCollection: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
};

function sanitizeFileNameSegment(value: unknown, defaultValue: string) {
  const rawValue = typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : defaultValue;
  return rawValue.replace(/[/\\?%*:|"<>\s]/g, '_');
}

export function createAnalyticsDownloadMethods(deps: AnalyticsDownloadDeps) {
  return {
    downloadDataByTeacher: async function(this: MethodContext, targetUserId: string) {
      check(targetUserId, String);

      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: this.userId,
        subjectUserId: targetUserId,
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Permission denied',
        forbiddenCode: 403,
      });

      const request = { kind: 'owned-lessons' } as const;
      const { tdfIds } = await resolveOwnedHistoryDownloadScope(deps, targetUserId, request);

      const user = await deps.usersCollection.findOneAsync({ _id: targetUserId }, { fields: { username: 1, emails: 1 } });
      if (!user) {
        throw new Meteor.Error(404, 'User not found');
      }
      const userName = sanitizeFileNameSegment(user.username || user.emails?.[0]?.address || targetUserId, targetUserId);
      const fileName = `learning-data_${userName}_all-lessons.tsv`;

      return { fileName, contentType: 'text/tab-separated-values', downloadUrl: createOwnedHistoryDownloadToken(targetUserId, request, tdfIds, fileName).url };
    },

    downloadOwnHistoryAcrossTdfs: async function(this: MethodContext) {
      const actingUserId = requireAuthenticatedUser(this.userId, 'Must be logged in', 401);

      const history = await deps.Histories.findOneAsync({ userId: actingUserId, ...operationalHistorySelector() }, { fields: { _id: 1 } });
      if (!history) {
        throw new Meteor.Error(404, 'No history found for current user');
      }

      const user = await deps.usersCollection.findOneAsync({ _id: actingUserId }, { fields: { username: 1, emails: 1 } });
      if (!user) {
        throw new Meteor.Error(404, 'User not found');
      }

      const userName = sanitizeFileNameSegment(user.username || user.emails?.[0]?.address || actingUserId, actingUserId);
      const fileName = `learning-data_${userName}_own-history_all-lessons.tsv`;
      return {
        fileName,
        contentType: 'text/tab-separated-values',
        downloadUrl: createOwnHistoryDownloadToken(actingUserId, fileName).url,
      };
    },

    downloadDataByClass: async function(this: MethodContext, classId: string) {
      check(classId, String);

      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      throw new Meteor.Error(403, 'Class-based data download is not allowed in this flow');
    },

    downloadDataById: async function(this: MethodContext, tdfId: string, includeConditions: boolean = false) {
      check(tdfId, String);
      check(includeConditions, Boolean);

      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }

      const request = { kind: 'lesson', tdfId, includeConditions } as const;
      const { tdfIds, lessonName } = await resolveOwnedHistoryDownloadScope(deps, this.userId, request);
      const fileName = `${sanitizeFileNameSegment(lessonName, `tdf-${tdfId}`)}-data.tsv`;
      return { fileName, contentType: 'text/tab-separated-values', downloadUrl: createOwnedHistoryDownloadToken(this.userId, request, tdfIds, fileName).url };
    },
  };
}
