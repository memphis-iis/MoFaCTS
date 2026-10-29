import type {
  ComputePracticeTimeMs,
  DashboardHistoryRecord,
  DashboardTdfStats,
} from './dashboardCacheMethods.contracts';
import { createStimulusKey, isBlankIdentityValue, isOperationalHistoryRecord, isModelPracticeHistoryRecord } from '../../common/historyEnvelope';
import { curSemester } from '../../common/Definitions';
import type { DashboardHistoryRefreshResult } from '../lib/dashboardHistoryRefresh';
import {
  computeSummaryStats,
  computeUsageSummary,
} from './dashboardCacheShared';
import { createDashboardLearnerConfigMethods } from './dashboardLearnerConfigMethods';
import { createDashboardPracticeSnapshotMethods } from './dashboardPracticeSnapshotMethods';
import {
  createLessonFamilyResolver,
  getLessonFamilySetspec,
  LESSON_FAMILY_RESET_FIELDS,
} from '../lib/tdfLessonFamilyResolver';

const DASHBOARD_ADMIN_REFRESH_CONCURRENCY = 4;
const DASHBOARD_ADMIN_REFRESH_PROGRESS_INTERVAL = 10;

type DashboardCacheDeps = {
  Meteor: any;
  Roles: any;
  refreshDashboardHistory: (userId: string, options?: { forceRebuild?: boolean }) => Promise<DashboardHistoryRefreshResult>;
  removeLessonHistory: (userId: string, tdfIds: string[]) => Promise<unknown>;
  GlobalExperimentStates?: any;
  Tdfs: any;
  Courses?: any;
  Assignments?: any;
  Sections?: any;
  SectionUserMap?: any;
  UserDashboardCache: any;
  usersCollection: any;
  DynamicSettings: any;
  decryptData?: (value: string) => string;
  serverConsole: (...args: any[]) => void;
  canViewDashboardTdf: (userId: unknown, tdf: any) => boolean;
  getAccessibleTdf: (userId: string, tdfId: string, options: any) => Promise<any>;
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

function historyRecordSessionDateKey(record: DashboardHistoryRecord): string | null {
  const timestamp = historyRecordTimestamp(record);
  return timestamp > 0 ? new Date(timestamp).toDateString() : null;
}

function isAutoTutorRecord(record: DashboardHistoryRecord): boolean {
  return record.levelUnitType === 'autotutor';
}

function shouldCountDashboardHistoryRecord(record: DashboardHistoryRecord): boolean {
  if (!isOperationalHistoryRecord(record)) return false;
  const transition = record.sparc?.stateTransition;
  // Non-dialogue SPARC trial records retain their existing trial semantics.
  if (record.levelUnitType !== 'sparc' || !transition) return true;
  const event = transition.event;
  return event?.type === 'response-submitted' && typeof event.eventId === 'string'
    && (transition.transitionId === `${event.eventId}:assessment`
      || transition.transitionId === `${event.eventId}:dialogue-turn`);

}

function resolveDashboardModelStimulusKey(record: DashboardHistoryRecord): string | null {
  if (!isModelPracticeHistoryRecord(record)) {
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
    practicedItemKeys: [],
    totalSessions: 0,
    sessionDateKeys: [],
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
  stats.practicedItemKeys = Array.from(uniqueItems);
  stats.totalSessions = sessions.size;
  stats.sessionDateKeys = Array.from(sessions);
  stats.totalTimeMinutes = Number((stats.totalTimeMs / 60000).toFixed(1));

  const answeredTrials = stats.correctTrials + stats.incorrectTrials;
  stats.accuracyApplies = answeredTrials > 0;
  stats.overallAccuracy = stats.accuracyApplies
    ? Number(((stats.correctTrials / answeredTrials) * 100).toFixed(1))
    : null;

  return stats;
}

function createEmptyDashboardTdfStats(displayName: string | null | undefined): DashboardTdfStats {
  return computeCacheStats([], displayName, () => 0);
}

export function applyDashboardHistoryRecordToStats(
  currentStats: DashboardTdfStats | null | undefined,
  historyRecord: DashboardHistoryRecord,
  displayName: string | null | undefined,
  computePracticeTimeMs: ComputePracticeTimeMs
): DashboardTdfStats {
  const stats = currentStats
    ? {
        ...currentStats,
        displayName: displayName || currentStats.displayName || 'Unnamed',
        practicedItemKeys: [...(currentStats.practicedItemKeys || [])],
        sessionDateKeys: [...(currentStats.sessionDateKeys || [])],
      }
    : createEmptyDashboardTdfStats(displayName);
  const practicedItemKeys = stats.practicedItemKeys ?? [];
  const sessionDateKeys = stats.sessionDateKeys ?? [];
  stats.practicedItemKeys = practicedItemKeys;
  stats.sessionDateKeys = sessionDateKeys;

  if (!shouldCountDashboardHistoryRecord(historyRecord)) {
    return stats;
  }

  stats.totalTrials += 1;
  if (!isAutoTutorRecord(historyRecord)) {
    if (historyRecord.outcome === 'correct') {
      stats.correctTrials += 1;
    } else if (historyRecord.outcome === 'incorrect') {
      stats.incorrectTrials += 1;
    }
  }

  stats.totalTimeMs += getHistoryPracticeTimeMs(historyRecord, computePracticeTimeMs);
  stats.totalTimeMinutes = Number((stats.totalTimeMs / 60000).toFixed(1));

  const stimulusKey = resolveDashboardModelStimulusKey(historyRecord);
  if (stimulusKey !== null) {
    stats.itemsPracticedApplies = true;
    if (!practicedItemKeys.includes(stimulusKey)) {
      practicedItemKeys.push(stimulusKey);
    }
  }
  stats.itemsPracticedCount = practicedItemKeys.length;

  const timestamp = historyRecordTimestamp(historyRecord);
  const sessionDateKey = historyRecordSessionDateKey(historyRecord);
  if (sessionDateKey && !sessionDateKeys.includes(sessionDateKey)) {
    sessionDateKeys.push(sessionDateKey);
  }
  stats.totalSessions = sessionDateKeys.length;

  if (timestamp > 0) {
    const date = new Date(timestamp);
    if (!stats.firstPracticeDate || date < new Date(stats.firstPracticeDate)) {
      stats.firstPracticeDate = date;
    }
    if (timestamp > stats.lastPracticeTimestamp) {
      stats.lastPracticeDate = date;
      stats.lastPracticeTimestamp = timestamp;
    }
  }

  stats.lastProcessedHistoryId = historyRecord._id ?? null;
  stats.lastProcessedTimestamp = historyRecord.recordedServerTime ?? historyRecord.time ?? null;

  const answeredTrials = stats.correctTrials + stats.incorrectTrials;
  stats.accuracyApplies = answeredTrials > 0;
  stats.overallAccuracy = stats.accuracyApplies
    ? Number(((stats.correctTrials / answeredTrials) * 100).toFixed(1))
    : null;

  return stats;
}

export { computeSummaryStats, computeUsageSummary } from './dashboardCacheShared';

export function createDashboardCacheMethods({
  getAccessibleTdf,
  Meteor,
  Roles,
  refreshDashboardHistory,
  removeLessonHistory,
  GlobalExperimentStates,
  Tdfs,
  Courses,
  Assignments,
  Sections,
  SectionUserMap,
  UserDashboardCache,
  usersCollection,
  DynamicSettings,
  decryptData,
  serverConsole,
  canViewDashboardTdf,
  redisBoundary
}: DashboardCacheDeps) {
  const lessonFamilies = createLessonFamilyResolver({ tdfs: Tdfs });

  function addNonEmptyString(target: Set<string>, value: unknown) {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (trimmed) {
      target.add(trimmed);
    }
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

    const family = await lessonFamilies.resolveLessonFamilyForTdf(tdfId, LESSON_FAMILY_RESET_FIELDS);
    if (!family) {
      throw new Meteor.Error('not-found', 'TDF not found');
    }

    const tdfIds = new Set<string>();
    const tdfKeys = new Set<string>();
    const cacheTdfIds = new Set<string>();

    for (const root of family.roots) {
      addTdfDocumentToResetScope(root, { cache: true });

      const setspec = getLessonFamilySetspec(root);
      const canonicalConditionIds = Array.isArray(setspec.conditionTdfIds)
        ? setspec.conditionTdfIds.filter((conditionTdfId) => typeof conditionTdfId === 'string' && conditionTdfId.trim())
        : [];
      if (canonicalConditionIds.length > 0) {
        for (const conditionTdfId of canonicalConditionIds) {
          addNonEmptyString(tdfIds, conditionTdfId);
          addNonEmptyString(tdfKeys, conditionTdfId);
        }
      } else if (Array.isArray(setspec.condition)) {
        for (const conditionRef of setspec.condition) {
          addNonEmptyString(tdfKeys, conditionRef);
        }
      }
    }

    for (const child of family.children) {
      addTdfDocumentToResetScope(child, { cache: false });
    }

    return {
      tdfIds: Array.from(tdfIds),
      tdfKeys: Array.from(tdfKeys),
      cacheTdfIds: Array.from(cacheTdfIds)
    };
  }

  function normalizeOptionalId(value: unknown): string | null {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || null;
  }

  async function assertNoAssignedCourseReset(userId: string, scope: { tdfIds: string[] }) {
    if (scope.tdfIds.length === 0) {
      return;
    }
    if (!Assignments?.find || !Courses?.find || !Sections?.find || !SectionUserMap?.find) {
      throw new Meteor.Error(
        'server-misconfigured',
        'Course assignment collections are required before resetting lesson progress.'
      );
    }
    const assignmentRows = await Assignments.find(
      { $or: [{ TDFId: { $in: scope.tdfIds } }, { memberTdfIds: { $in: scope.tdfIds } }] },
      { fields: { _id: 1, courseId: 1, TDFId: 1, memberTdfIds: 1 } }
    ).fetchAsync();
    const assignedCourseIds = [...new Set(
      assignmentRows
        .map((row: any) => normalizeOptionalId(row?.courseId))
        .filter((courseId: string | null): courseId is string => typeof courseId === 'string')
    )];
    if (assignedCourseIds.length === 0) {
      return;
    }

    const activeCourses = await Courses.find(
      { _id: { $in: assignedCourseIds }, semester: curSemester },
      { fields: { _id: 1 } }
    ).fetchAsync();
    const activeCourseIds = activeCourses
      .map((course: any) => normalizeOptionalId(course?._id))
      .filter((courseId: string | null): courseId is string => typeof courseId === 'string');
    if (activeCourseIds.length === 0) {
      return;
    }

    const sectionRows = await Sections.find(
      { courseId: { $in: activeCourseIds } },
      { fields: { _id: 1 } }
    ).fetchAsync();
    const sectionIds = sectionRows
      .map((section: any) => normalizeOptionalId(section?._id))
      .filter((sectionId: string | null): sectionId is string => typeof sectionId === 'string');
    if (sectionIds.length === 0) {
      return;
    }

    const enrollmentRows = await SectionUserMap.find(
      { userId, sectionId: { $in: sectionIds } },
      { fields: { _id: 1 } }
    ).fetchAsync();
    if (enrollmentRows.length > 0) {
      throw new Meteor.Error(
        'course-reset-blocked',
        'Cannot reset lesson progress for a TDF assigned through a course; course-scoped shared model reset is not implemented.'
      );
    }
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
    canViewDashboardTdf,
    ...(decryptData ? { decryptData } : {})
  });
  const learnerConfigMethods = createDashboardLearnerConfigMethods({
    getAccessibleTdf,
    Meteor,
    UserDashboardCache,
  });

  const methods = {
    async getPracticeDashboardSnapshot(this: any) {
      await methods.ensureDashboardCacheCurrent.call(this);
      return practiceSnapshotMethods.getPracticeDashboardSnapshot.call(this);
    },
    ...learnerConfigMethods,

    initializeDashboardCache: async function(this: any, userId: string | null = null) {
      const targetUserId = userId || this.userId;
      if (!targetUserId) throw new Meteor.Error('not-authorized', 'Must be logged in');
      if (targetUserId !== this.userId && !(await Roles.userIsInRoleAsync(this.userId, ['admin']))) {
        throw new Meteor.Error('not-authorized', 'Cannot initialize cache for other users');
      }
      if (!(await usersCollection.findOneAsync({ _id: targetUserId }, { fields: { _id: 1 } }))) {
        throw new Meteor.Error('not-found', 'Cannot initialize cache for missing user');
      }
      return await redisBoundary.withLock(`dashboard-cache:ensure:${targetUserId}`, 120000,
        async () => await refreshDashboardHistory(targetUserId, { forceRebuild: true }));
    },

    ensureDashboardCacheCurrent: async function(this: any) {
      if (!this.userId) throw new Meteor.Error('not-authorized', 'Must be logged in');
      return await redisBoundary.withLock(`dashboard-cache:ensure:${this.userId}`, 120000,
        async () => await refreshDashboardHistory(this.userId));
    },

    refreshDashboardCache: async function(this: any) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized');
      }

      await UserDashboardCache.removeAsync({ userId: this.userId });
      return await methods.initializeDashboardCache.call(this);
    },

    resetOwnLessonProgress: async function(this: any, tdfId: string) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
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
      await assertNoAssignedCourseReset(this.userId, scope);

      const historyRemoved = await removeLessonHistory(this.userId, scope.tdfKeys);
      const experimentStateRemoved = await GlobalExperimentStates.removeAsync({
        userId: this.userId,
        $or: [
          { TDFId: { $in: scope.tdfKeys } },
          { 'experimentState.currentRootTdfId': { $in: scope.tdfKeys } },
          { 'experimentState.currentTdfId': { $in: scope.tdfKeys } },
          { 'experimentState.conditionTdfId': { $in: scope.tdfKeys } }
        ]
      });
      const repaired = await refreshDashboardHistory(this.userId, { forceRebuild: true });
      const cacheChanged = repaired.action === 'refreshed';

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
            },
            // Administrative pruning explicitly requests source reconstruction
            // on the next dashboard entry; it cannot certify a processed prefix.
            $unset: {
              lastHistorySequence: '',
              historyRepairRevision: '',
              historyTdfTargets: '',
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
