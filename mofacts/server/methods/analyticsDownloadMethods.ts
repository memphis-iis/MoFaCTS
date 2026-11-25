import { studyOnlyAccount } from '../../common/participantPrivacy';
import { participantProgressLessonIds, requireAccountProgressSession } from '../lib/participantProgressScope';
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
import { HISTORY_DOWNLOAD_METHOD_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import type { MeteorMethodBinding } from '../securitySurfaces/registerMeteorMethods';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
  connection?: { id?: string } | null;
};

type AnalyticsDownloadDeps = {
  GlobalExperimentStates: { findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any> };
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

export function createAnalyticsDownloadRegistration(deps: AnalyticsDownloadDeps) {
  const ownedLessons = Object.freeze({
    kind: 'history-download', operation: 'owned-lessons',
    async authorize(context: MethodContext, targetUserId: string) {
      requireAccountProgressSession(context);
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: context.userId,
        subjectUserId: targetUserId,
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Permission denied',
        forbiddenCode: 403,
      });
    },
  } as const);
  const ownHistory = Object.freeze({
    kind: 'history-download', operation: 'own-history',
    authorize(context: MethodContext) {
      const userId = requireAuthenticatedUser(context.userId, 'Must be logged in', 401);
      requireAccountProgressSession(context);
      return userId;
    },
  } as const);
  const disabledClass = Object.freeze({
    kind: 'history-download', operation: 'disabled-class',
    authorize(context: MethodContext): never {
      if (!context.userId) throw new Meteor.Error(401, 'Must be logged in');
      throw new Meteor.Error(403, 'Class-based data download is not allowed in this flow');
    },
  } as const);
  const ownedLesson = Object.freeze({
    kind: 'history-download', operation: 'owned-lesson',
    async authorize(context: MethodContext, request: { kind: 'lesson'; tdfId: string; includeConditions: boolean }) {
      if (!context.userId) throw new Meteor.Error(401, 'Must be logged in');
      const studyLessonIds = await participantProgressLessonIds(context, deps.Tdfs);
      if (studyLessonIds && !studyLessonIds.includes(request.tdfId)) {
        throw new Meteor.Error(403, 'Progress is unavailable outside the current study');
      }
      const { tdfIds, lessonName } = await resolveOwnedHistoryDownloadScope(deps, context.userId, request);
      if (studyLessonIds && tdfIds.some(id => !studyLessonIds.includes(id))) {
        throw new Meteor.Error(403, 'Progress is unavailable outside the current study');
      }
      return { tdfIds, lessonName, userId: context.userId };
    },
  } as const);
  const methods = {
    downloadDataByTeacher: async function(this: MethodContext, targetUserId: string) {
      check(targetUserId, String);
      await ownedLessons.authorize(this, targetUserId);
      const request = { kind: 'owned-lessons' } as const;
      const { tdfIds } = await resolveOwnedHistoryDownloadScope(deps, targetUserId, request);

      const user = await deps.usersCollection.findOneAsync({ _id: targetUserId }, { fields: { username: 1, emails: 1, 'profile.experiment': 1, 'profile.createdBy': 1 } });
      if (!user) {
        throw new Meteor.Error(404, 'User not found');
      }
      const userName = studyOnlyAccount(user) ? 'participant'
        : sanitizeFileNameSegment(user.username || user.emails?.[0]?.address || targetUserId, targetUserId);
      const fileName = `learning-data_${userName}_all-lessons.tsv`;

      return { fileName, contentType: 'text/tab-separated-values', downloadUrl: createOwnedHistoryDownloadToken(targetUserId, request, tdfIds, fileName).url };
    },

    downloadOwnHistoryAcrossTdfs: async function(this: MethodContext) {
      const actingUserId = ownHistory.authorize(this);

      const history = await deps.Histories.findOneAsync({ userId: actingUserId, ...operationalHistorySelector() }, { fields: { _id: 1 } });
      if (!history) {
        throw new Meteor.Error(404, 'No history found for current user');
      }

      const user = await deps.usersCollection.findOneAsync({ _id: actingUserId }, { fields: { username: 1, emails: 1, 'profile.experiment': 1, 'profile.createdBy': 1 } });
      if (!user) {
        throw new Meteor.Error(404, 'User not found');
      }

      const hasStudyHistory = studyOnlyAccount(user) ||
        await deps.GlobalExperimentStates.findOneAsync({ userId: actingUserId, 'experimentState.experimentTarget': { $type: 'string', $ne: '' } }, { fields: { _id: 1 } });
      const label = hasStudyHistory ? 'participant'
        : sanitizeFileNameSegment(user.username || user.emails?.[0]?.address || actingUserId, actingUserId);
      const fileName = `learning-data_${label}_own-history_all-lessons.tsv`;
      return {
        fileName,
        contentType: 'text/tab-separated-values',
        downloadUrl: createOwnHistoryDownloadToken(actingUserId, fileName).url,
      };
    },

    downloadDataByClass: async function(this: MethodContext, classId: string) {
      check(classId, String);

      return disabledClass.authorize(this);
    },

    downloadDataById: async function(this: MethodContext, tdfId: string, includeConditions: boolean = false) {
      check(tdfId, String);
      check(includeConditions, Boolean);

      const request = { kind: 'lesson', tdfId, includeConditions } as const;
      const { tdfIds, lessonName, userId } = await ownedLesson.authorize(this, request);
      const fileName = `${sanitizeFileNameSegment(lessonName, `tdf-${tdfId}`)}-data.tsv`;
      return { fileName, contentType: 'text/tab-separated-values', downloadUrl: createOwnedHistoryDownloadToken(userId, request, tdfIds, fileName).url };
    },
  };
  function bind(name: keyof typeof methods, policy: typeof ownedLessons | typeof ownHistory | typeof disabledClass | typeof ownedLesson): MeteorMethodBinding {
    return Object.freeze({ handler: methods[name], verification: HISTORY_DOWNLOAD_METHOD_VERIFICATIONS[name], policy,
      dataEgress: policy.operation === 'disabled-class' ? 'none' : 'history-download-capability' });
  }
  return { methods, methodBindings: Object.freeze([
    bind('downloadDataByTeacher', ownedLessons),
    bind('downloadOwnHistoryAcrossTdfs', ownHistory),
    bind('downloadDataByClass', disabledClass),
    bind('downloadDataById', ownedLesson),
  ]) };
}
