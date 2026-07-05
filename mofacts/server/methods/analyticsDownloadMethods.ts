import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import {
  requireAuthenticatedUser,
  requireUserMatchesOrHasRole,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';
import { createOwnHistoryDownloadToken } from '../lib/ownHistoryDownloadTokens';

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
  createExperimentExport: (keys: unknown[], userId: string) => Promise<string>;
  createExperimentExportByTdfIds: (tdfIds: string[], userId: string) => Promise<string>;
  createExperimentExportFromHistories: (histories: any[]) => Promise<string>;
  getTdfNamesByOwnerId: (ownerId: string) => Promise<string[] | null>;
  assertUserOwnsTdfs: (userId: string, keys: unknown[]) => Promise<unknown>;
  canDownloadOwnedTdfData: (userId: string, tdf: any) => boolean;
  resolveConditionTdfIds: (setspec?: { condition?: string[] }) => Promise<Array<string | null>>;
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

      const ownedTdfs = await deps.getTdfNamesByOwnerId(targetUserId);
      if (!ownedTdfs) {
        throw new Meteor.Error(500, 'Failed to resolve owned TDFs for download');
      }
      const uniqueTdfs = ownedTdfs.filter((value: string, index: number, allValues: string[]) => allValues.indexOf(value) === index);

      if (uniqueTdfs.length === 0) {
        throw new Meteor.Error(404, 'No owned TDFs found for current user');
      }
      await deps.assertUserOwnsTdfs(targetUserId, uniqueTdfs);

      const user = await deps.usersCollection.findOneAsync({ _id: targetUserId }, { fields: { username: 1, emails: 1 } });
      if (!user) {
        throw new Meteor.Error(404, 'User not found');
      }
      const userName = sanitizeFileNameSegment(user.username || user.emails?.[0]?.address || targetUserId, targetUserId);
      const fileName = `mofacts_${userName}_all_tdf_data.tsv`;

      const tsvContent = await deps.createExperimentExport(uniqueTdfs, targetUserId);
      return { fileName, contentType: 'text/tab-separated-values', content: tsvContent };
    },

    downloadOwnHistoryAcrossTdfs: async function(this: MethodContext) {
      const actingUserId = requireAuthenticatedUser(this.userId, 'Must be logged in', 401);

      const history = await deps.Histories.findOneAsync({ userId: actingUserId }, { fields: { _id: 1 } });
      if (!history) {
        throw new Meteor.Error(404, 'No history found for current user');
      }

      const user = await deps.usersCollection.findOneAsync({ _id: actingUserId }, { fields: { username: 1, emails: 1 } });
      if (!user) {
        throw new Meteor.Error(404, 'User not found');
      }

      const userName = sanitizeFileNameSegment(user.username || user.emails?.[0]?.address || actingUserId, actingUserId);
      const fileName = `mofacts_${userName}_own_history_all_tdfs.tsv`;
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

    downloadDataByFile: async function(this: MethodContext, fileName: string) {
      check(fileName, String);

      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        throw new Meteor.Error(400, 'Invalid file name');
      }

      const downloadFileName = fileName.split('.json')[0] + '-data.tsv';
      const tdf = await deps.Tdfs.findOneAsync({ 'content.fileName': fileName });
      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }
      if (!deps.canDownloadOwnedTdfData(this.userId, tdf)) {
        throw new Meteor.Error(403, 'Not authorized to download data for this TDF');
      }
      const exportTdfIds = new Set<string>([String(tdf._id)]);
      const setspec = tdf.content?.tdfs?.tutor?.setspec;
      if (Array.isArray(setspec?.condition) && setspec.condition.length > 0) {
        const conditionIds = await deps.resolveConditionTdfIds(setspec);
        if (conditionIds.length > 0) {
          const ownedConditionDocs = await deps.Tdfs.find(
            { _id: { $in: conditionIds }, ownerId: this.userId },
            { fields: { _id: 1 } }
          ).fetchAsync();
          for (const ownedCondition of ownedConditionDocs) {
            exportTdfIds.add(String(ownedCondition._id));
          }
        }
      }

      const tsvContent = await deps.createExperimentExportByTdfIds(Array.from(exportTdfIds), this.userId);

      return { fileName: downloadFileName, contentType: 'text/tab-separated-values', content: tsvContent };
    },

    downloadDataById: async function(this: MethodContext, tdfId: string) {
      check(tdfId, String);

      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }

      const tdf = await deps.Tdfs.findOneAsync({ _id: tdfId });
      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }
      if (!deps.canDownloadOwnedTdfData(this.userId, tdf)) {
        throw new Meteor.Error(403, 'Not authorized to download data for this TDF');
      }

      const lessonName = tdf.content?.tdfs?.tutor?.setspec?.lessonname || `tdf-${tdfId}`;
      const fileName = `${sanitizeFileNameSegment(lessonName, `tdf-${tdfId}`)}-data.tsv`;

      const tsvContent = await deps.createExperimentExportByTdfIds([tdfId], this.userId);
      return { fileName, contentType: 'text/tab-separated-values', content: tsvContent };
    },
  };
}
