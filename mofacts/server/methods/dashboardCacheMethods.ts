import type {
  ComputePracticeTimeMs,
  DashboardHistoryRecord,
  DashboardTdfStats,
} from './dashboardCacheMethods.contracts';
import { createStimulusKey, isBlankIdentityValue } from '../../common/historyEnvelope';
import {
  DASHBOARD_CACHE_VERSION,
  DASHBOARD_LEVEL_UNIT_TYPES,
  computeSummaryStats,
  computeUsageSummary,
  timestampValue,
} from './dashboardCacheShared';
import { createDashboardLearnerConfigMethods } from './dashboardLearnerConfigMethods';
import { createDashboardPracticeSnapshotMethods } from './dashboardPracticeSnapshotMethods';

const DASHBOARD_ADMIN_REFRESH_CONCURRENCY = 4;
const DASHBOARD_ADMIN_REFRESH_PROGRESS_INTERVAL = 10;

type DashboardCacheDeps = {
  Meteor: any;
  Roles: any;
  Histories: any;
  GlobalExperimentStates?: any;
  Tdfs: any;
  Assignments?: any;
  Sections?: any;
  SectionUserMap?: any;
  UserDashboardCache: any;
  usersCollection: any;
  DynamicSettings: any;
  serverConsole: (...args: any[]) => void;
  computePracticeTimeMs: ComputePracticeTimeMs;
  canViewDashboardTdf: (userId: unknown, tdf: any) => boolean;
  redisBoundary: {
    enabled: boolean;
    withLock: <T>(key: string, ttlMs: number, work: () => Promise<T>) => Promise<T>;
  };
};

function historyRecordTimestamp(record: DashboardHistoryRecord): number {
  const rawTimestamp = record.recordedServerTime ?? record.time;
  if (!rawTimestamp) {
    return 0;
  }
  const timestamp = new Date(rawTimestamp).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getH5PEventType(record: DashboardHistoryRecord): string {
  return typeof record.h5p?.eventType === 'string' ? record.h5p.eventType : '';
}

function isH5PSummaryRecord(record: DashboardHistoryRecord): boolean {
  return getH5PEventType(record) === 'summary';
}

function isH5PPartRecord(record: DashboardHistoryRecord): boolean {
  return getH5PEventType(record) === 'part';
}

function isAutoTutorRecord(record: DashboardHistoryRecord): boolean {
  return record.levelUnitType === 'autotutor';
}

function shouldCountDashboardHistoryRecord(record: DashboardHistoryRecord): boolean {
  if (isH5PSummaryRecord(record)) {
    return false;
  }
  return true;
}

function resolveDashboardModelStimulusKey(record: DashboardHistoryRecord): string | null {
  if (record.levelUnitType !== 'model' || isH5PPartRecord(record)) {
    return null;
  }
  if (isBlankIdentityValue(record.stimuliSetId) || isBlankIdentityValue(record.stimulusKC)) {
    return null;
  }
  return createStimulusKey({
    stimuliSetId: record.stimuliSetId as string | number,
    stimulusKC: record.stimulusKC as string | number,
  });
}

function getHistoryPracticeTimeMs(
  record: DashboardHistoryRecord,
  computePracticeTimeMs: ComputePracticeTimeMs
): number {
  if (isH5PPartRecord(record) && typeof record.h5p?.latencyMs === 'number' && Number.isFinite(record.h5p.latencyMs)) {
    return Math.max(0, record.h5p.latencyMs);
  }
  return computePracticeTimeMs(record.CFEndLatency, record.CFFeedbackLatency);
}

export function computeCacheStats(
  history: DashboardHistoryRecord[],
  displayName: string | null | undefined,
  computePracticeTimeMs: ComputePracticeTimeMs
): DashboardTdfStats {
  const countableHistory = history.filter(shouldCountDashboardHistoryRecord);
  const stats: DashboardTdfStats = {
    displayName: displayName || 'Unnamed',
    totalTrials: countableHistory.length,
    correctTrials: 0,
    incorrectTrials: 0,
    totalTimeMs: 0,
    totalTimeMinutes: 0,
    itemsPracticedCount: 0,
    itemsPracticedApplies: false,
    totalSessions: 0,
    overallAccuracy: null,
    accuracyApplies: false,
    firstPracticeDate: null,
    lastPracticeDate: null,
    lastPracticeTimestamp: 0,
    lastProcessedHistoryId: null,
    lastProcessedTimestamp: null
  };

  const uniqueItems = new Set<string>();
  const sessions = new Set<string>();
  for (const record of countableHistory) {
    if (isAutoTutorRecord(record)) {
      // AutoTutor no longer has a dashboard accuracy percentage. Graduation is
      // expectation/misconception based, so keep trial/time counts but exclude
      // AutoTutor rows from accuracy aggregation.
    } else if (record.outcome === 'correct') {
      stats.correctTrials++;
    } else if (record.outcome === 'incorrect') {
      stats.incorrectTrials++;
    }

    stats.totalTimeMs += getHistoryPracticeTimeMs(record, computePracticeTimeMs);

    const stimulusKey = resolveDashboardModelStimulusKey(record);
    if (stimulusKey !== null) {
      stats.itemsPracticedApplies = true;
      uniqueItems.add(stimulusKey);
    }

    const timestamp = historyRecordTimestamp(record);
    if (timestamp > 0) {
      const date = new Date(timestamp);
      sessions.add(date.toDateString());

      if (!stats.firstPracticeDate || date < stats.firstPracticeDate) {
        stats.firstPracticeDate = date;
      }
      if (timestamp > stats.lastPracticeTimestamp) {
        stats.lastPracticeDate = date;
        stats.lastPracticeTimestamp = timestamp;
      }
    }

    stats.lastProcessedHistoryId = record._id ?? null;
    stats.lastProcessedTimestamp = record.recordedServerTime ?? record.time ?? null;
  }

  stats.itemsPracticedCount = uniqueItems.size;
  stats.totalSessions = sessions.size;
  stats.totalTimeMinutes = Number((stats.totalTimeMs / 60000).toFixed(1));

  const answeredTrials = stats.correctTrials + stats.incorrectTrials;
  stats.accuracyApplies = answeredTrials > 0;
  stats.overallAccuracy = stats.accuracyApplies
    ? Number(((stats.correctTrials / answeredTrials) * 100).toFixed(1))
    : null;

  return stats;
}

export { computeSummaryStats, computeUsageSummary } from './dashboardCacheShared';

export function createDashboardCacheMethods({
  Meteor,
  Roles,
  Histories,
  GlobalExperimentStates,
  Tdfs,
  Assignments,
  Sections,
  SectionUserMap,
  UserDashboardCache,
  usersCollection,
  DynamicSettings,
  serverConsole,
  computePracticeTimeMs,
  canViewDashboardTdf,
  redisBoundary
}: DashboardCacheDeps) {
  function addNonEmptyString(target: Set<string>, value: unknown) {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (trimmed) {
      target.add(trimmed);
    }
  }

  function uniqueNonEmptyStrings(values: unknown[]) {
    return [...new Set(values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0))];
  }

  async function findRootTdfsForAttemptedTdfs(attemptedTdfs: any[]) {
    const attemptedTdfIds = uniqueNonEmptyStrings(attemptedTdfs.map((tdf) => tdf?._id));
    const attemptedFileNames = uniqueNonEmptyStrings(attemptedTdfs.map((tdf) => tdf?.content?.fileName));
    const childRefCandidates = [...new Set([...attemptedTdfIds, ...attemptedFileNames])];

    if (childRefCandidates.length === 0) {
      return [];
    }

    return await Tdfs.find({
      $or: [
        { 'content.tdfs.tutor.setspec.condition': { $in: childRefCandidates } },
        { 'content.tdfs.tutor.setspec.conditionTdfIds': { $in: attemptedTdfIds } }
      ]
    }, {
      fields: {
        _id: 1,
        'content.tdfs.tutor.setspec.lessonname': 1,
        'content.tdfs.tutor.setspec.condition': 1,
        'content.tdfs.tutor.setspec.conditionTdfIds': 1
      }
    }).fetchAsync();
  }

  async function mapWithBoundedConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>,
    onProgress?: (completed: number, total: number) => void
  ) {
    let nextIndex = 0;
    let completed = 0;
    const workerCount = Math.min(Math.max(concurrency, 1), items.length);
    const runners = Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const item = items[currentIndex];
        if (item === undefined) {
          continue;
        }
        await worker(item, currentIndex);
        completed += 1;
        if (
          onProgress &&
          (completed === items.length || completed % DASHBOARD_ADMIN_REFRESH_PROGRESS_INTERVAL === 0)
        ) {
          onProgress(completed, items.length);
        }
      }
    });
    await Promise.all(runners);
  }

  async function collectLessonFamilyResetScope(tdfId: string) {
    function addTdfDocumentToResetScope(doc: any, params: { cache: boolean }) {
      addNonEmptyString(tdfIds, doc?._id);
      addNonEmptyString(tdfKeys, doc?._id);
      addNonEmptyString(tdfKeys, doc?.content?.fileName);
      addNonEmptyString(tdfKeys, doc?.content?.tdfs?.tutor?.setspec?.stimulusfile);
      if (params.cache) {
        addNonEmptyString(cacheTdfIds, doc?._id);
      }
    }

    const target = await Tdfs.findOneAsync(
      { _id: tdfId },
      {
        fields: {
          _id: 1,
          'content.fileName': 1,
          'content.tdfs.tutor.setspec.stimulusfile': 1,
          'content.tdfs.tutor.setspec.condition': 1,
          'content.tdfs.tutor.setspec.conditionTdfIds': 1
        }
      }
    );
    if (!target) {
      throw new Meteor.Error('not-found', 'TDF not found');
    }

    const tdfIds = new Set<string>();
    const tdfKeys = new Set<string>();
    const cacheTdfIds = new Set<string>();
    addTdfDocumentToResetScope(target, { cache: true });

    const targetFileName = String(target.content?.fileName || '').trim();
    const parentRoots = await Tdfs.find({
      $or: [
        { 'content.tdfs.tutor.setspec.condition': tdfId },
        ...(targetFileName ? [{ 'content.tdfs.tutor.setspec.condition': targetFileName }] : []),
        { 'content.tdfs.tutor.setspec.conditionTdfIds': tdfId }
      ]
    }, {
      fields: {
        _id: 1,
        'content.fileName': 1,
        'content.tdfs.tutor.setspec.stimulusfile': 1,
        'content.tdfs.tutor.setspec.condition': 1,
        'content.tdfs.tutor.setspec.conditionTdfIds': 1
      }
    }).fetchAsync();

    const roots = [target, ...parentRoots];
    const childRefs = new Set<string>();
    for (const root of roots) {
      addTdfDocumentToResetScope(root, { cache: true });

      const setspec = root.content?.tdfs?.tutor?.setspec || {};
      if (Array.isArray(setspec.condition)) {
        for (const conditionRef of setspec.condition) {
          addNonEmptyString(childRefs, conditionRef);
          addNonEmptyString(tdfKeys, conditionRef);
        }
      }
      if (Array.isArray(setspec.conditionTdfIds)) {
        for (const conditionTdfId of setspec.conditionTdfIds) {
          addNonEmptyString(childRefs, conditionTdfId);
          addNonEmptyString(tdfIds, conditionTdfId);
          addNonEmptyString(tdfKeys, conditionTdfId);
        }
      }
    }

    if (childRefs.size > 0) {
      const children = await Tdfs.find({
        $or: [
          { _id: { $in: Array.from(childRefs) } },
          { 'content.fileName': { $in: Array.from(childRefs) } }
        ]
      }, {
        fields: {
          _id: 1,
          'content.fileName': 1,
          'content.tdfs.tutor.setspec.stimulusfile': 1
        }
      }).fetchAsync();

      for (const child of children) {
        addTdfDocumentToResetScope(child, { cache: false });
      }
    }

    return {
      tdfIds: Array.from(tdfIds),
      tdfKeys: Array.from(tdfKeys),
      cacheTdfIds: Array.from(cacheTdfIds)
    };
  }

  async function removeLessonProgressFromCache(userId: string, cacheTdfIds: string[]) {
    const cache = await UserDashboardCache.findOneAsync({ userId });
    if (!cache?.tdfStats) {
      return false;
    }

    const nextTdfStats = { ...(cache.tdfStats || {}) };
    let changed = false;
    for (const cacheTdfId of cacheTdfIds) {
      if (Object.prototype.hasOwnProperty.call(nextTdfStats, cacheTdfId)) {
        delete nextTdfStats[cacheTdfId];
        changed = true;
      }
    }

    if (!changed) {
      return false;
    }

    await UserDashboardCache.updateAsync(
      { _id: cache._id },
      {
        $set: {
          tdfStats: nextTdfStats,
          summary: computeSummaryStats(nextTdfStats),
          usageSummary: computeUsageSummary(nextTdfStats),
          lastUpdated: new Date()
        }
      }
    );
    return true;
  }

  const practiceSnapshotMethods = createDashboardPracticeSnapshotMethods({
    Meteor,
    Tdfs,
    Assignments,
    Sections,
    SectionUserMap,
    UserDashboardCache,
    usersCollection,
    DynamicSettings,
    canViewDashboardTdf
  });
  const learnerConfigMethods = createDashboardLearnerConfigMethods({
    Meteor,
    Tdfs,
    UserDashboardCache,
    canViewDashboardTdf
  });

  const methods = {
    ...practiceSnapshotMethods,
    ...learnerConfigMethods,

    initializeDashboardCache: async function(this: any, userId: string | null = null) {
      const targetUserId = userId || this.userId;
      if (!targetUserId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }

      if (targetUserId !== this.userId) {
        const isAdmin = await Roles.userIsInRoleAsync(this.userId, ['admin']);
        if (!isAdmin) {
          throw new Meteor.Error('not-authorized', 'Cannot initialize cache for other users');
        }
      }

      return await redisBoundary.withLock(
        `dashboard-cache:initialize:${targetUserId}`,
        120000,
        async () => {
      serverConsole(`Initializing dashboard cache for user ${targetUserId}`);

      const targetUser = await usersCollection.findOneAsync(
        { _id: targetUserId },
        { fields: { _id: 1 } }
      );
      if (!targetUser) {
        throw new Meteor.Error('not-found', 'Cannot initialize cache for missing user');
      }

      const attemptedTdfIds = await Histories.rawCollection().distinct('TDFId', {
        userId: targetUserId,
        levelUnitType: { $in: DASHBOARD_LEVEL_UNIT_TYPES }
      });

      if (attemptedTdfIds.length === 0) {
        await UserDashboardCache.upsertAsync(
          { userId: targetUserId },
          {
            $set: {
              userId: targetUserId,
              tdfStats: {},
              summary: {
                totalTdfsAttempted: 0,
                totalTrialsAllTime: 0,
                totalTimeAllTime: 0,
                overallAccuracyAllTime: 0,
                lastActivityDate: null
              },
              usageSummary: computeUsageSummary({}),
              lastUpdated: new Date(),
              version: DASHBOARD_CACHE_VERSION
            },
            $setOnInsert: {
              createdAt: new Date()
            }
          }
        );
        return { success: true, tdfCount: 0 };
      }

      const attemptedTdfs = await Tdfs.find({
        _id: { $in: attemptedTdfIds }
      }, {
        fields: {
          _id: 1,
          'content.fileName': 1,
          'content.tdfs.tutor.setspec.lessonname': 1
        }
      }).fetchAsync();

      const attemptedTdfIdsByFileName = new Map<string, string>();
      for (const tdf of attemptedTdfs as any[]) {
        const fileName = tdf.content?.fileName;
        if (fileName) {
          attemptedTdfIdsByFileName.set(fileName, tdf._id);
        }
      }

      const rootTdfs = await findRootTdfsForAttemptedTdfs(attemptedTdfs as any[]);

      const childToRootMap = new Map<string, string>();
      const rootTdfMap: Map<any, any> = new Map();
      for (const rootTdf of rootTdfs as any[]) {
        rootTdfMap.set(rootTdf._id, rootTdf);
        const conditions: string[] = rootTdf.content?.tdfs?.tutor?.setspec?.condition || [];
        for (const childRef of conditions) {
          if (!childRef) {
            continue;
          }
          childToRootMap.set(childRef, rootTdf._id);
          const childTdfId = attemptedTdfIdsByFileName.get(childRef);
          if (childTdfId) {
            childToRootMap.set(childTdfId, rootTdf._id);
          }
        }
        const conditionTdfIds: string[] = rootTdf.content?.tdfs?.tutor?.setspec?.conditionTdfIds || [];
        for (const conditionTdfId of conditionTdfIds) {
          if (!conditionTdfId) {
            continue;
          }
          childToRootMap.set(conditionTdfId, rootTdf._id);
        }
      }

      const allHistory: DashboardHistoryRecord[] = await Histories.find({
        userId: targetUserId,
        TDFId: { $in: attemptedTdfIds },
        levelUnitType: { $in: DASHBOARD_LEVEL_UNIT_TYPES }
      }, {
        sort: { recordedServerTime: 1 }
      }).fetchAsync();

      const historyByTargetTdf: Map<string, DashboardHistoryRecord[]> = new Map();
      const tdfMap: Map<any, any> = new Map((attemptedTdfs as any[]).map((t: any) => [t._id, t]));

      for (const record of allHistory) {
        const tdf = tdfMap.get(record.TDFId);
        if (!tdf) continue;

        const fileName = tdf.content?.fileName as string | undefined;
        const rootTdfId =
          (fileName ? childToRootMap.get(fileName) : undefined) ||
          (record.TDFId ? childToRootMap.get(record.TDFId) : undefined);
        const targetTdfId = rootTdfId || record.TDFId;
        if (!targetTdfId) continue;

        if (!historyByTargetTdf.has(targetTdfId)) {
          historyByTargetTdf.set(targetTdfId, []);
        }
        const targetHistory = historyByTargetTdf.get(targetTdfId);
        if (targetHistory) {
          targetHistory.push(record);
        }
      }

      const tdfStats: Record<string, any> = {};
      for (const [targetTdfId, history] of historyByTargetTdf.entries()) {
        const rootTdf = rootTdfMap.get(targetTdfId);
        const displayName = rootTdf?.content?.tdfs?.tutor?.setspec?.lessonname ||
          tdfMap.get(targetTdfId)?.content?.tdfs?.tutor?.setspec?.lessonname ||
          'Unnamed';

        tdfStats[targetTdfId] = computeCacheStats(history, displayName, computePracticeTimeMs);
      }

      const summary = computeSummaryStats(tdfStats);
      const usageSummary = computeUsageSummary(tdfStats);

      await UserDashboardCache.upsertAsync(
        { userId: targetUserId },
        {
          $set: {
            userId: targetUserId,
            tdfStats,
            summary,
            usageSummary,
            lastUpdated: new Date(),
            version: DASHBOARD_CACHE_VERSION
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        }
      );

      serverConsole(`Cache initialized for user ${targetUserId}: ${Object.keys(tdfStats).length} TDFs`);
      return { success: true, tdfCount: Object.keys(tdfStats).length };
        }
      );
    },

    ensureDashboardCacheCurrent: async function(this: any) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }

      const userId = this.userId;
      return await redisBoundary.withLock(
        `dashboard-cache:ensure:${userId}`,
        120000,
        async () => {
          const cache = await UserDashboardCache.findOneAsync({ userId });
          const cacheTdfCount = Object.keys(cache?.tdfStats || {}).length;
          if (!cache) {
            const result = await methods.initializeDashboardCache.call(this);
            return {
              success: true,
              action: 'refreshed',
              reason: 'missing',
              tdfCount: result.tdfCount
            };
          }

          const latestHistory = await Histories.findOneAsync(
            {
              userId,
              levelUnitType: { $in: DASHBOARD_LEVEL_UNIT_TYPES }
            },
            {
              fields: { recordedServerTime: 1, time: 1 },
              sort: { recordedServerTime: -1, time: -1 }
            }
          );
          const latestHistoryTimestamp = latestHistory ? historyRecordTimestamp(latestHistory) : 0;
          const cacheUpdatedTimestamp = timestampValue(cache.lastUpdated);

          if (latestHistoryTimestamp > cacheUpdatedTimestamp) {
            const result = await methods.initializeDashboardCache.call(this);
            return {
              success: true,
              action: 'refreshed',
              reason: 'history-newer',
              tdfCount: result.tdfCount
            };
          }

          if (cache.version !== DASHBOARD_CACHE_VERSION) {
            const result = await methods.initializeDashboardCache.call(this);
            return {
              success: true,
              action: 'refreshed',
              reason: 'version',
              tdfCount: result.tdfCount
            };
          }

          return {
            success: true,
            action: 'current',
            tdfCount: cacheTdfCount
          };
        }
      );
    },

    updateDashboardCacheForTdf: async function(this: any, TDFId: string) {
      serverConsole(`[Cache] updateDashboardCacheForTdf called with TDFId: ${TDFId}`);

      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }

      const userId = this.userId;
      serverConsole(`[Cache] User: ${userId}`);
      return await redisBoundary.withLock(
        `dashboard-cache:update:${userId}:${TDFId}`,
        120000,
        async () => {

      const tdf = await Tdfs.findOneAsync(
        { _id: TDFId },
        { fields: {
          'content.fileName': 1,
          'content.tdfs.tutor.setspec.lessonname': 1
        } }
      );

      if (!tdf) {
        serverConsole(`[Cache] TDF ${TDFId} not found`);
        return { success: false, error: 'TDF not found' };
      }

      const fileName = tdf.content?.fileName;
      const childKeyCandidates = [fileName, TDFId].filter(Boolean);

      const rootTdf = childKeyCandidates.length ? await Tdfs.findOneAsync({
        'content.tdfs.tutor.setspec.condition': { $in: childKeyCandidates }
      }, {
        fields: {
          _id: 1,
          'content.tdfs.tutor.setspec.lessonname': 1,
          'content.tdfs.tutor.setspec.condition': 1
        }
      }) : null;

      let targetTdfId = TDFId;
      let displayName = tdf.content?.tdfs?.tutor?.setspec?.lessonname || 'Unnamed';
      let allHistory: any[] = [];

      if (rootTdf) {
        serverConsole(`[Cache] Child TDF detected, aggregating under root: ${rootTdf._id}`);
        targetTdfId = rootTdf._id;
        displayName = rootTdf.content?.tdfs?.tutor?.setspec?.lessonname || displayName;

        const childRefs: string[] = rootTdf.content?.tdfs?.tutor?.setspec?.condition || [];
        const normalizedChildRefs = [...new Set(childRefs.filter(Boolean))];

        const childTdfs = normalizedChildRefs.length ? await Tdfs.find({
          $or: [
            { 'content.fileName': { $in: normalizedChildRefs } },
            { _id: { $in: normalizedChildRefs } }
          ]
        }, {
          fields: { _id: 1 }
        }).fetchAsync() : [];

        const childTdfIds = childTdfs.map((t: any) => t._id);
        if (!childTdfIds.includes(TDFId)) {
          childTdfIds.push(TDFId);
        }

        allHistory = await Histories.find({
          userId,
          TDFId: { $in: childTdfIds },
          levelUnitType: { $in: DASHBOARD_LEVEL_UNIT_TYPES }
        }, {
          sort: { recordedServerTime: 1 }
        }).fetchAsync();

        serverConsole(`[Cache] Retrieved ${allHistory.length} history records from ${childTdfIds.length} child TDFs`);
      } else {
        allHistory = await Histories.find({
          userId,
          TDFId,
          levelUnitType: { $in: DASHBOARD_LEVEL_UNIT_TYPES }
        }, {
          sort: { recordedServerTime: 1 }
        }).fetchAsync();

        serverConsole(`[Cache] Retrieved ${allHistory.length} history records for regular TDF`);
      }

      if (allHistory.length === 0) {
        serverConsole('[Cache] No history records, skipping update');
        return { success: true, action: 'no_history' };
      }

      const stats = computeCacheStats(allHistory, displayName, computePracticeTimeMs);

      const cache = await UserDashboardCache.findOneAsync({ userId }) || {
        userId,
        tdfStats: {},
        version: DASHBOARD_CACHE_VERSION
      };

      const updatedTdfStats = {
        ...(cache.tdfStats || {}),
        [targetTdfId]: stats
      };

      const summary = computeSummaryStats(updatedTdfStats);
      const usageSummary = computeUsageSummary(updatedTdfStats);

      await UserDashboardCache.upsertAsync(
        { userId },
        {
          $set: {
            userId,
            tdfStats: updatedTdfStats,
            summary,
            usageSummary,
            lastUpdated: new Date(),
            version: DASHBOARD_CACHE_VERSION
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        }
      );

      serverConsole(`[Cache] Recomputed stats stored for ${rootTdf ? 'root' : 'regular'} TDF ${targetTdfId}`);
      return { success: true, action: 'updated', newRecords: allHistory.length };
        }
      );
    },

    refreshDashboardCache: async function(this: any) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized');
      }

      await UserDashboardCache.removeAsync({ userId: this.userId });
      return await methods.initializeDashboardCache.call(this);
    },

    resetAdminLessonProgress: async function(this: any, tdfId: string) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }

      const isAdmin = await Roles.userIsInRoleAsync(this.userId, ['admin']);
      if (!isAdmin) {
        throw new Meteor.Error('not-authorized', 'Admin only');
      }
      if (!GlobalExperimentStates) {
        throw new Meteor.Error('server-misconfigured', 'Experiment state collection is unavailable');
      }

      const normalizedTdfId = typeof tdfId === 'string' ? tdfId.trim() : '';
      if (!normalizedTdfId) {
        throw new Meteor.Error('invalid-args', 'TDF ID is required');
      }

      const scope = await collectLessonFamilyResetScope(normalizedTdfId);
      if (scope.tdfKeys.length === 0) {
        throw new Meteor.Error('invalid-state', 'No lesson progress scope could be resolved');
      }

      const historyRemoved = await Histories.removeAsync({
        userId: this.userId,
        TDFId: { $in: scope.tdfKeys }
      });
      const experimentStateRemoved = await GlobalExperimentStates.removeAsync({
        userId: this.userId,
        $or: [
          { TDFId: { $in: scope.tdfKeys } },
          { 'experimentState.currentRootTdfId': { $in: scope.tdfKeys } },
          { 'experimentState.currentTdfId': { $in: scope.tdfKeys } },
          { 'experimentState.conditionTdfId': { $in: scope.tdfKeys } }
        ]
      });
      const cacheChanged = await removeLessonProgressFromCache(this.userId, scope.cacheTdfIds);

      return {
        success: true,
        tdfIds: scope.tdfIds,
        cacheTdfIds: scope.cacheTdfIds,
        historyRemoved,
        experimentStateRemoved,
        cacheChanged
      };
    },

    refreshUserAdminUsageCaches: async function(this: any, userIds: unknown) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }

      const isAdmin = await Roles.userIsInRoleAsync(this.userId, ['admin']);
      if (!isAdmin) {
        throw new Meteor.Error('not-authorized', 'Admin only');
      }

      if (!Array.isArray(userIds)) {
        throw new Meteor.Error('invalid-args', 'Expected an array of user IDs');
      }

      const normalizedUserIds = [...new Set(userIds
        .map((userId) => typeof userId === 'string' ? userId.trim() : '')
        .filter((userId) => userId.length > 0))];

      if (normalizedUserIds.length === 0) {
        throw new Meteor.Error('invalid-args', 'No valid user IDs were provided');
      }

      if (normalizedUserIds.length > 100) {
        throw new Meteor.Error('invalid-args', 'Refresh is limited to 100 users at a time');
      }

      const refreshed: Array<{ userId: string; tdfCount: number }> = [];
      const failed: Array<{ userId: string; error: string }> = [];

      serverConsole(`[Cache] Refreshing ${normalizedUserIds.length} user dashboard caches with concurrency ${DASHBOARD_ADMIN_REFRESH_CONCURRENCY}`);
      await mapWithBoundedConcurrency(normalizedUserIds, DASHBOARD_ADMIN_REFRESH_CONCURRENCY, async (targetUserId) => {
        try {
          const result = await methods.initializeDashboardCache.call(this, targetUserId);
          refreshed.push({ userId: targetUserId, tdfCount: result.tdfCount });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          failed.push({ userId: targetUserId, error: message });
        }
      }, (completed, total) => {
        serverConsole(`[Cache] Refreshed ${completed}/${total} user dashboard caches`);
      });

      return {
        success: failed.length === 0,
        refreshed,
        failed
      };
    },

    removeTdfFromCache: async function(this: any, tdfId: string) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized');
      }

      const isAdmin = await Roles.userIsInRoleAsync(this.userId, ['admin']);
      if (!isAdmin) {
        throw new Meteor.Error('not-authorized', 'Admin only');
      }

      const caches = await UserDashboardCache.find(
        { [`tdfStats.${tdfId}`]: { $exists: true } },
        { fields: { tdfStats: 1 } }
      ).fetchAsync();

      let modified = 0;

      for (const cache of caches) {
        delete cache.tdfStats[tdfId];
        const summary = computeSummaryStats(cache.tdfStats || {});
        const usageSummary = computeUsageSummary(cache.tdfStats || {});
        await UserDashboardCache.updateAsync(
          { _id: cache._id },
          {
            $set: {
              tdfStats: cache.tdfStats,
              summary,
              usageSummary,
              lastUpdated: new Date()
            }
          }
        );
        modified++;
      }

      return { success: true, modified };
    }
  };

  return methods;
}
