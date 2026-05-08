import type {
  ComputePracticeTimeMs,
  DashboardHistoryRecord,
  DashboardStatsByTdf,
  DashboardSummaryStats,
  DashboardTdfStats,
  DashboardUsageSummary
} from './dashboardCacheMethods.contracts';
import {
  buildLearnerTdfConfig,
  buildLearnerTdfSourceMetadata,
  normalizeLearnerTdfOverrides,
  type LearnerTdfConfig,
  type LearnerTdfOverrides
} from '../../common/lib/learnerTdfConfig';

type DashboardCacheDeps = {
  Meteor: any;
  Roles: any;
  Histories: any;
  Tdfs: any;
  UserDashboardCache: any;
  usersCollection: any;
  serverConsole: (...args: any[]) => void;
  computePracticeTimeMs: ComputePracticeTimeMs;
  canViewDashboardTdf: (userId: unknown, tdf: any) => boolean;
};

function roundOneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

export function computeCacheStats(
  history: DashboardHistoryRecord[],
  displayName: string | null | undefined,
  computePracticeTimeMs: ComputePracticeTimeMs
): DashboardTdfStats {
  const stats: DashboardTdfStats = {
    displayName: displayName || 'Unnamed',
    totalTrials: history.length,
    correctTrials: 0,
    incorrectTrials: 0,
    totalTimeMs: 0,
    totalTimeMinutes: 0,
    itemsPracticedCount: 0,
    totalSessions: 0,
    recentOutcomes: [],
    overallAccuracy: 0,
    last10Accuracy: 0,
    firstPracticeDate: null,
    lastPracticeDate: null,
    lastProcessedHistoryId: null,
    lastProcessedTimestamp: null
  };

  const uniqueItems = new Set<string>();
  const sessions = new Set<string>();

  for (const record of history) {
    if (record.outcome === 'correct') stats.correctTrials++;
    else if (record.outcome === 'incorrect') stats.incorrectTrials++;

    stats.totalTimeMs += computePracticeTimeMs(record.CFEndLatency, record.CFFeedbackLatency);

    const itemId = record.itemId || record.CFStimFileIndex || record.problemName;
    if (itemId !== undefined && itemId !== null) {
      uniqueItems.add(String(itemId));
    }

    if (record.recordedServerTime) {
      const date = new Date(record.recordedServerTime);
      sessions.add(date.toDateString());

      if (!stats.firstPracticeDate || date < stats.firstPracticeDate) {
        stats.firstPracticeDate = date;
      }
      if (!stats.lastPracticeDate || date > stats.lastPracticeDate) {
        stats.lastPracticeDate = date;
      }
    }

    stats.lastProcessedHistoryId = record._id ?? null;
    stats.lastProcessedTimestamp = record.recordedServerTime ?? null;
  }

  const recentTrials = history.slice(-10);
  stats.recentOutcomes = recentTrials.map((trial) => trial.outcome ?? '');

  stats.itemsPracticedCount = uniqueItems.size;
  stats.totalSessions = sessions.size;
  stats.totalTimeMinutes = Number((stats.totalTimeMs / 60000).toFixed(1));

  const totalAnswered = stats.correctTrials + stats.incorrectTrials;
  stats.overallAccuracy = totalAnswered > 0
    ? Number(((stats.correctTrials / totalAnswered) * 100).toFixed(1))
    : 0;

  const recentCorrect = stats.recentOutcomes.filter((outcome: string) => outcome === 'correct').length;
  stats.last10Accuracy = stats.recentOutcomes.length > 0
    ? Number(((recentCorrect / stats.recentOutcomes.length) * 100).toFixed(1))
    : 0;

  return stats;
}

export function computeSummaryStats(tdfStats: DashboardStatsByTdf | null | undefined): DashboardSummaryStats {
  const safeStats: DashboardStatsByTdf = tdfStats || {};
  let totalTrials = 0;
  let totalCorrect = 0;
  let totalIncorrect = 0;
  let totalTime = 0;
  let lastActivity: Date | null = null;

  for (const statsAny of Object.values(safeStats) as DashboardTdfStats[]) {
    totalTrials += statsAny.totalTrials;
    totalCorrect += statsAny.correctTrials;
    totalIncorrect += statsAny.incorrectTrials;
    totalTime += statsAny.totalTimeMs;

    if (statsAny.lastPracticeDate) {
      const date = new Date(statsAny.lastPracticeDate);
      if (!lastActivity || date > lastActivity) {
        lastActivity = date;
      }
    }
  }

  const totalAnswered = totalCorrect + totalIncorrect;

  return {
    totalTdfsAttempted: Object.keys(safeStats).length,
    totalTrialsAllTime: totalTrials,
    totalTimeAllTime: totalTime,
    overallAccuracyAllTime: totalAnswered > 0
      ? Number(((totalCorrect / totalAnswered) * 100).toFixed(1))
      : 0,
    lastActivityDate: lastActivity
  };
}

export function computeUsageSummary(tdfStats: DashboardStatsByTdf | null | undefined): DashboardUsageSummary {
  const safeStats: DashboardStatsByTdf = tdfStats || {};
  const practicedStats = (Object.values(safeStats) as DashboardTdfStats[])
    .filter((statsAny) => Number(statsAny?.totalTrials || 0) > 0);

  let totalTrials = 0;
  let totalCorrect = 0;
  let totalIncorrect = 0;
  let totalTimeMs = 0;
  let totalSessionDays = 0;
  let totalItemsPracticed = 0;
  let lastActivityDate: Date | null = null;

  for (const statsAny of practicedStats) {
    totalTrials += Number(statsAny.totalTrials || 0);
    totalCorrect += Number(statsAny.correctTrials || 0);
    totalIncorrect += Number(statsAny.incorrectTrials || 0);
    totalTimeMs += Number(statsAny.totalTimeMs || 0);
    totalSessionDays += Number(statsAny.totalSessions || 0);
    totalItemsPracticed += Number(statsAny.itemsPracticedCount || 0);

    if (statsAny.lastPracticeDate) {
      const date = new Date(statsAny.lastPracticeDate);
      if (!Number.isNaN(date.getTime()) && (!lastActivityDate || date > lastActivityDate)) {
        lastActivityDate = date;
      }
    }
  }

  const practicedSystemCount = practicedStats.length;
  const totalAnswered = totalCorrect + totalIncorrect;

  return {
    totalTrials,
    weightedAccuracy: totalAnswered > 0
      ? roundOneDecimal((totalCorrect / totalAnswered) * 100)
      : 0,
    totalTimeMinutes: roundOneDecimal(totalTimeMs / 60000),
    averageSessionDays: practicedSystemCount > 0
      ? roundOneDecimal(totalSessionDays / practicedSystemCount)
      : 0,
    averageItemsPracticed: practicedSystemCount > 0
      ? roundOneDecimal(totalItemsPracticed / practicedSystemCount)
      : 0,
    lastActivityDate,
    practicedSystemCount
  };
}

export function createDashboardCacheMethods({
  Meteor,
  Roles,
  Histories,
  Tdfs,
  UserDashboardCache,
  usersCollection,
  serverConsole,
  computePracticeTimeMs,
  canViewDashboardTdf
}: DashboardCacheDeps) {
  async function getConfigurableTdfForUser(userId: string, tdfId: string) {
    const normalizedTdfId = typeof tdfId === 'string' ? tdfId.trim() : '';
    if (!normalizedTdfId) {
      throw new Meteor.Error('invalid-args', 'TDF ID is required');
    }

    const tdf = await Tdfs.findOneAsync(
      { _id: normalizedTdfId },
      {
        fields: {
          _id: 1,
          ownerId: 1,
          accessors: 1,
          updatedAt: 1,
          lastUpdated: 1,
          content: 1
        }
      }
    );

    if (!tdf) {
      throw new Meteor.Error('not-found', 'TDF not found');
    }
    if (!canViewDashboardTdf(userId, tdf)) {
      throw new Meteor.Error('not-authorized', 'Not authorized to configure this TDF');
    }

    return tdf;
  }

  function hasConfigurablePatchValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.some(hasConfigurablePatchValue);
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some(hasConfigurablePatchValue);
    }
    return true;
  }

  function getTdfConfigSource(tdf: any) {
    return {
      ...(tdf?.content || {}),
      updatedAt: tdf?.updatedAt,
      lastUpdated: tdf?.lastUpdated
    };
  }

  async function writeLearnerTdfConfig(userId: string, tdfId: string, config: LearnerTdfConfig | null) {
    const cache = await UserDashboardCache.findOneAsync({ userId });
    const learnerTdfConfigs = {
      ...(cache?.learnerTdfConfigs || {})
    };

    if (config && config.overrides && Object.keys(config.overrides).length > 0) {
      learnerTdfConfigs[tdfId] = config;
    } else {
      delete learnerTdfConfigs[tdfId];
    }

    await UserDashboardCache.upsertAsync(
      { userId },
      {
        $set: {
          userId,
          learnerTdfConfigs,
          lastUpdated: new Date(),
          version: cache?.version || 1
        },
        $setOnInsert: {
          createdAt: new Date(),
          tdfStats: {},
          summary: computeSummaryStats({}),
          usageSummary: computeUsageSummary({})
        }
      }
    );
  }

  const methods = {
    saveLearnerTdfConfig: async function(this: any, tdfId: string, configPatch: LearnerTdfOverrides) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }
      if (!hasConfigurablePatchValue(configPatch)) {
        throw new Meteor.Error('invalid-args', 'Select at least one setting to save');
      }

      const tdf = await getConfigurableTdfForUser(this.userId, tdfId);
      const tdfSource = getTdfConfigSource(tdf);
      const config = buildLearnerTdfConfig(tdfSource, tdf._id, configPatch);

      await writeLearnerTdfConfig(this.userId, tdf._id, config);

      return {
        success: true,
        config
      };
    },

    resetLearnerTdfConfig: async function(this: any, tdfId: string, scope: string | null = null) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }

      const tdf = await getConfigurableTdfForUser(this.userId, tdfId);
      const cache = await UserDashboardCache.findOneAsync({ userId: this.userId });
      const existingConfig = cache?.learnerTdfConfigs?.[tdf._id] as LearnerTdfConfig | undefined;
      if (!existingConfig?.overrides) {
        return { success: true, config: null };
      }

      if (scope !== null && scope !== 'setspec' && scope !== 'unit') {
        throw new Meteor.Error('invalid-args', 'Scope must be setspec or unit');
      }

      const nextOverrides: LearnerTdfOverrides = {
        ...(existingConfig.overrides || {})
      };
      if (scope === 'setspec') {
        delete nextOverrides.setspec;
      } else if (scope === 'unit') {
        delete nextOverrides.unit;
      } else {
        delete nextOverrides.setspec;
        delete nextOverrides.unit;
      }

      const normalizedOverrides = normalizeLearnerTdfOverrides(getTdfConfigSource(tdf), nextOverrides);
      const nextConfig: LearnerTdfConfig | null = Object.keys(normalizedOverrides).length > 0
        ? {
            source: buildLearnerTdfSourceMetadata(getTdfConfigSource(tdf), tdf._id),
            overrides: normalizedOverrides
          }
        : null;

      await writeLearnerTdfConfig(this.userId, tdf._id, nextConfig);

      return {
        success: true,
        config: nextConfig
      };
    },

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
        levelUnitType: 'model'
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
              version: 1
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

      const rootTdfs = await Tdfs.find({
        'content.tdfs.tutor.setspec.condition': { $exists: true }
      }, {
        fields: {
          _id: 1,
          'content.tdfs.tutor.setspec.lessonname': 1,
          'content.tdfs.tutor.setspec.condition': 1
        }
      }).fetchAsync();

      const attemptedTdfIdsByFileName = new Map<string, string>();
      for (const tdf of attemptedTdfs as any[]) {
        const fileName = tdf.content?.fileName;
        if (fileName) {
          attemptedTdfIdsByFileName.set(fileName, tdf._id);
        }
      }

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
      }

      const allHistory: DashboardHistoryRecord[] = await Histories.find({
        userId: targetUserId,
        TDFId: { $in: attemptedTdfIds },
        levelUnitType: 'model'
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
            version: 1
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        }
      );

      serverConsole(`Cache initialized for user ${targetUserId}: ${Object.keys(tdfStats).length} TDFs`);
      return { success: true, tdfCount: Object.keys(tdfStats).length };
    },

    updateDashboardCacheForTdf: async function(this: any, TDFId: string) {
      serverConsole(`[Cache] updateDashboardCacheForTdf called with TDFId: ${TDFId}`);

      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }

      const userId = this.userId;
      serverConsole(`[Cache] User: ${userId}`);

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
          levelUnitType: 'model'
        }, {
          sort: { recordedServerTime: 1 }
        }).fetchAsync();

        serverConsole(`[Cache] Retrieved ${allHistory.length} history records from ${childTdfIds.length} child TDFs`);
      } else {
        allHistory = await Histories.find({
          userId,
          TDFId,
          levelUnitType: 'model'
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
        version: 1
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
            version: cache.version || 1
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        }
      );

      serverConsole(`[Cache] Recomputed stats stored for ${rootTdf ? 'root' : 'regular'} TDF ${targetTdfId}`);
      return { success: true, action: 'updated', newRecords: allHistory.length };
    },

    refreshDashboardCache: async function(this: any) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized');
      }

      await UserDashboardCache.removeAsync({ userId: this.userId });
      return await methods.initializeDashboardCache.call(this);
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

      for (const targetUserId of normalizedUserIds) {
        try {
          const result = await methods.initializeDashboardCache.call(this, targetUserId);
          refreshed.push({ userId: targetUserId, tdfCount: result.tdfCount });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          failed.push({ userId: targetUserId, error: message });
        }
      }

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
