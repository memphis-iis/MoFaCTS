import { Histories, Tdfs, UserDashboardCache } from '../../common/Collections';
import { operationalHistorySelector } from '../../common/historyEnvelope';
import { computePracticeTimeMs } from '../../lib/practiceTime';
import { applyDashboardHistoryRecordToStats } from '../methods/dashboardCacheMethods';
import { DASHBOARD_CACHE_VERSION, DASHBOARD_LEVEL_UNIT_TYPES } from '../methods/dashboardCacheShared';
import { createDashboardHistoryRefresh, type DashboardHistoryRefreshIo } from './dashboardHistoryRefresh';
import { historyCommitStorage } from './historyCommitMongo';
import { createLessonFamilyResolver } from './tdfLessonFamilyResolver';

const HISTORY_PROJECTION = {
  _id: 1, historySequence: 1, outcome: 1, CFEndLatency: 1, CFFeedbackLatency: 1,
  stimuliSetId: 1, stimulusKC: 1, recordedServerTime: 1, time: 1, TDFId: 1, userId: 1,
  levelUnitType: 1, modelEvidenceSource: 1,
  'sparc.worksheet.kind': 1,
  'sparc.stateTransition.transitionId': 1,
  'sparc.stateTransition.event.eventId': 1,
  'sparc.stateTransition.event.type': 1,
};
const TDF_PROJECTION = { _id: 1, 'content.fileName': 1, 'content.tdfs.tutor.setspec.lessonname': 1 };
const ROOT_PROJECTION = { ...TDF_PROJECTION,
  'content.tdfs.tutor.setspec.condition': 1, 'content.tdfs.tutor.setspec.conditionTdfIds': 1 };

/** Bind every read and the aggregate/checkpoint write to one Mongo snapshot. */
export function refreshDashboardHistory(
  userId: string,
  options: { forceRebuild?: boolean } = {},
  reportProgress?: (mode: 'rebuild' | 'delta', rows: number) => void,
) {
  return createDashboardHistoryRefresh({
    version: DASHBOARD_CACHE_VERSION,
    applyHistoryRecord: (stats, row, name) => applyDashboardHistoryRecordToStats(stats, row, name, computePracticeTimeMs),
    ...(reportProgress ? { reportProgress } : {}),
    transaction: work => historyCommitStorage.withSnapshot(userId, async (source, session) => {
      const tdfs = {
        findOneAsync: (selector: Record<string, unknown>, findOptions: { fields?: Record<string, unknown> } = {}) =>
          Tdfs.rawCollection().findOne(selector, { ...(findOptions.fields ? { projection: findOptions.fields } : {}), session }),
        find: (selector: Record<string, unknown>, findOptions: { fields?: Record<string, unknown> } = {}) => ({
          fetchAsync: () => Tdfs.rawCollection().find(selector, { ...(findOptions.fields ? { projection: findOptions.fields } : {}), session }).toArray(),
        }),
      };
      const families = createLessonFamilyResolver({ tdfs });
      const io: DashboardHistoryRefreshIo = {
        readSource: async requestedUserId => {
          if (requestedUserId !== userId) throw new Error('Dashboard snapshot user does not match its history source');
          return source;
        },
        readCache: async () => await UserDashboardCache.rawCollection().findOne({ userId }, { session }) as any,
        readHistoryPage: async request => {
          const selector = {
            userId, levelUnitType: { $in: DASHBOARD_LEVEL_UNIT_TYPES }, ...operationalHistorySelector(),
            ...(request.mode === 'delta'
              ? { historySequence: { $gt: request.afterSequence, $lte: request.throughSequence } }
              : request.afterId === undefined ? {} : { _id: { $gt: request.afterId } }),
          };
          return await Histories.rawCollection().find(selector, { session, projection: HISTORY_PROJECTION,
            sort: request.mode === 'delta' ? { historySequence: 1 } : { _id: 1 }, limit: request.limit }).toArray() as any;
        },
        resolveTdfTargets: async (_requestedUserId, ids) => {
          const lessons = await tdfs.find({ _id: { $in: ids } }, { fields: TDF_PROJECTION }).fetchAsync();
          const roots = await families.findRootsForChildTdfs(lessons, ROOT_PROJECTION);
          const rootById = new Map(roots.map((root: any) => [root._id, root]));
          const childToRoot = families.buildChildToRootMap(roots, lessons);
          return new Map(lessons.map((lesson: any) => {
            const rootId = childToRoot.get(lesson._id) ?? lesson._id;
            const root = rootById.get(rootId) as any;
            return [lesson._id, { targetTdfId: rootId,
              displayName: root?.content?.tdfs?.tutor?.setspec?.lessonname
                || lesson.content?.tdfs?.tutor?.setspec?.lessonname || 'Unnamed' }];
          }));
        },
        writeCache: async (_requestedUserId, patch) => {
          await UserDashboardCache.rawCollection().updateOne({ userId }, {
            $set: patch, $setOnInsert: { createdAt: new Date() },
          }, { session, upsert: true });
        },
      };
      return await work(io);
    }),
  })(userId, options);
}
