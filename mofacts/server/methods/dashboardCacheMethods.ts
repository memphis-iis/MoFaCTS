import type {
  ComputePracticeTimeMs,
  DashboardHistoryRecord,
  PracticeDashboardSnapshotLesson,
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
import { createStimulusKey, isBlankIdentityValue } from '../../common/historyEnvelope';

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
  serverConsole: (...args: any[]) => void;
  computePracticeTimeMs: ComputePracticeTimeMs;
  canViewDashboardTdf: (userId: unknown, tdf: any) => boolean;
  redisBoundary: {
    enabled: boolean;
    withLock: <T>(key: string, ttlMs: number, work: () => Promise<T>) => Promise<T>;
  };
};

const DASHBOARD_LEVEL_UNIT_TYPES = ['model', 'schedule', 'autotutor'];
const DASHBOARD_CACHE_VERSION = 4;
const PRACTICE_DASHBOARD_SNAPSHOT_VERSION = 1;

function roundOneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

function historyRecordTimestamp(record: DashboardHistoryRecord): number {
  const rawTimestamp = record.recordedServerTime ?? record.time;
  if (!rawTimestamp) {
    return 0;
  }
  const timestamp = new Date(rawTimestamp).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function timestampValue(value: unknown): number {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value as string | number | Date).getTime();
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

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
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

export function computeSummaryStats(tdfStats: DashboardStatsByTdf | null | undefined): DashboardSummaryStats {
  const safeStats: DashboardStatsByTdf = tdfStats || {};
  let totalTrials = 0;
  let totalCorrect = 0;
  let totalIncorrect = 0;
  let totalTime = 0;
  let lastActivity: Date | null = null;

  for (const statsAny of Object.values(safeStats) as DashboardTdfStats[]) {
    totalTrials += statsAny.totalTrials;
    totalCorrect += Number(statsAny.accuracyWeightedCorrect ?? statsAny.correctTrials);
    totalIncorrect += Number(
      statsAny.accuracyWeightedTotal !== undefined
        ? statsAny.accuracyWeightedTotal - Number(statsAny.accuracyWeightedCorrect || 0)
        : statsAny.incorrectTrials
    );
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
    totalCorrect += Number(statsAny.accuracyWeightedCorrect ?? statsAny.correctTrials ?? 0);
    totalIncorrect += Number(
      statsAny.accuracyWeightedTotal !== undefined
        ? statsAny.accuracyWeightedTotal - Number(statsAny.accuracyWeightedCorrect || 0)
        : statsAny.incorrectTrials || 0
    );
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

function resolveDashboardTdfFileName(tdf: any) {
  return normalizeOptionalString(tdf?.content?.fileName)
    || normalizeOptionalString(tdf?.tdfFileName)
    || undefined;
}

function buildDashboardStatsProjection(stats: DashboardTdfStats | undefined, totalPracticeItems: number | null) {
  if (!stats || Number(stats.totalTrials || 0) <= 0) {
    return {
      isUsed: false,
      hasBeenAttempted: Boolean(stats),
      progress: {
        attempts: 0,
        accuracy: null,
        accuracyApplies: false,
        totalTimeMinutes: 0,
        itemsPracticed: null,
        itemsPracticedApplies: false,
        totalPracticeItems,
        sessionDays: 0,
        lastPracticed: null,
        lastPracticedTimestamp: 0
      }
    };
  }

  const lastPracticeTimestamp = Number(stats.lastPracticeTimestamp) || timestampValue(stats.lastPracticeDate);
  const itemsPracticedApplies = stats.itemsPracticedApplies !== false;
  const itemsPracticed = itemsPracticedApplies ? Number(stats.itemsPracticedCount || 0) : null;
  const accuracyApplies = stats.accuracyApplies !== false && stats.overallAccuracy !== null && stats.overallAccuracy !== undefined;
  return {
    isUsed: true,
    hasBeenAttempted: true,
    progress: {
      attempts: stats.totalTrials,
      accuracy: accuracyApplies ? stats.overallAccuracy : null,
      accuracyApplies,
      totalTimeMinutes: stats.totalTimeMinutes,
      itemsPracticed,
      itemsPracticedApplies,
      totalPracticeItems,
      sessionDays: stats.totalSessions,
      lastPracticed: stats.lastPracticeDate,
      lastPracticedTimestamp: Number.isFinite(lastPracticeTimestamp) ? lastPracticeTimestamp : 0
    }
  };
}

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
  serverConsole,
  computePracticeTimeMs,
  canViewDashboardTdf,
  redisBoundary
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

  async function resolveAssignedRootTdfIdsForUser(userId: string) {
    if (!Assignments || !Sections || !SectionUserMap) {
      throw new Error('Practice dashboard snapshot requires Assignments, Sections, and SectionUserMap dependencies');
    }
    const enrollmentRows = await SectionUserMap.find(
      { userId },
      { fields: { sectionId: 1 } }
    ).fetchAsync();
    const sectionIds = enrollmentRows
      .map((row: any) => normalizeOptionalString(row?.sectionId))
      .filter((id: string | null): id is string => !!id);
    if (sectionIds.length === 0) return [];

    const sections = await Sections.find(
      { _id: { $in: sectionIds } },
      { fields: { courseId: 1 } }
    ).fetchAsync();
    const courseIds = sections
      .map((section: any) => normalizeOptionalString(section?.courseId))
      .filter((id: string | null): id is string => !!id);
    if (courseIds.length === 0) return [];

    const assignmentRows = await Assignments.find(
      { courseId: { $in: [...new Set(courseIds)] } },
      { fields: { TDFId: 1 } }
    ).fetchAsync();
    return assignmentRows
      .map((row: any) => normalizeOptionalString(row?.TDFId))
      .filter((id: string | null): id is string => !!id);
  }

  async function getDashboardVisibleTdfs(userId: string) {
    const [assignedRootIds, user] = await Promise.all([
      resolveAssignedRootTdfIdsForUser(userId),
      usersCollection.findOneAsync(
        { _id: userId },
        { fields: { accessedTDFs: 1, speechAPIKey: 1, textToSpeechAPIKey: 1 } }
      )
    ]);

    const explicitDashboardIds = [
      ...new Set([
        ...assignedRootIds,
        ...(Array.isArray(user?.accessedTDFs) ? user.accessedTDFs : [])
          .map((id: unknown) => normalizeOptionalString(id))
          .filter((id: string | null): id is string => !!id)
      ])
    ];
    const visibilityTerms: any[] = [
      { ownerId: userId },
      { 'accessors.userId': userId },
      { 'content.tdfs.tutor.setspec.userselect': 'true' },
    ];
    if (explicitDashboardIds.length > 0) {
      visibilityTerms.push({ _id: { $in: explicitDashboardIds } });
    }

    const projection = {
      _id: 1,
      stimuliSetId: 1,
      ownerId: 1,
      accessors: 1,
      conditionCounts: 1,
      tdfFileName: 1,
      'content.fileName': 1,
      'content.isMultiTdf': 1,
      'content.tdfs.tutor.setspec.lessonname': 1,
      'content.tdfs.tutor.setspec.tags': 1,
      'content.tdfs.tutor.setspec.condition': 1,
      'content.tdfs.tutor.setspec.conditionTdfIds': 1,
      'content.tdfs.tutor.setspec.audioInputEnabled': 1,
      'content.tdfs.tutor.setspec.enableAudioPromptAndFeedback': 1
    };

    const accessibleRoots = await Tdfs.find(
      { $or: visibilityTerms },
      {
        fields: {
          _id: 1,
          'content.fileName': 1,
          'content.tdfs.tutor.setspec.condition': 1,
          'content.tdfs.tutor.setspec.conditionTdfIds': 1
        }
      }
    ).fetchAsync();

    const conditionFileNames = new Set<string>();
    const conditionTdfIds = new Set<string>();
    for (const root of accessibleRoots) {
      const setspec = root?.content?.tdfs?.tutor?.setspec || {};
      const conditions = Array.isArray(setspec.condition) ? setspec.condition : [];
      const resolvedIds = Array.isArray(setspec.conditionTdfIds) ? setspec.conditionTdfIds : [];
      for (const condition of conditions) {
        const normalized = normalizeOptionalString(condition);
        if (normalized) conditionFileNames.add(normalized);
      }
      for (const conditionTdfId of resolvedIds) {
        const normalized = normalizeOptionalString(conditionTdfId);
        if (normalized) conditionTdfIds.add(normalized);
      }
    }

    if (conditionFileNames.size > 0) {
      visibilityTerms.push({ 'content.fileName': { $in: Array.from(conditionFileNames) } });
    }
    if (conditionTdfIds.size > 0) {
      visibilityTerms.push({ _id: { $in: Array.from(conditionTdfIds) } });
    }

    const tdfs = await Tdfs.find({ $or: visibilityTerms }, { fields: projection }).fetchAsync();
    return {
      tdfs,
      hasSpeechAPIKey: Boolean(user?.speechAPIKey && String(user.speechAPIKey).trim()),
      hasTTSAPIKey: Boolean(user?.textToSpeechAPIKey && String(user.textToSpeechAPIKey).trim())
    };
  }

  function buildPracticeDashboardLesson(
    userId: string,
    tdf: any,
    stats: DashboardTdfStats | undefined,
    learnerConfig: LearnerTdfConfig | null,
    hasSpeechAPIKey: boolean,
    hasTTSAPIKey: boolean
  ): PracticeDashboardSnapshotLesson | null {
    const TDFId = normalizeOptionalString(tdf?._id);
    const tdfObject = tdf?.content;
    const setspec = tdfObject?.tdfs?.tutor?.setspec;
    if (!TDFId || !setspec) return null;

    const fileName = resolveDashboardTdfFileName(tdf);
    const displayName = normalizeOptionalString(setspec.lessonname) || fileName || TDFId;
    const totalPracticeItems = null;
    const statsProjection = buildDashboardStatsProjection(stats, totalPracticeItems);
    const conditions = tdf.ownerId === userId && Array.isArray(setspec.condition) && setspec.condition.length > 0
      ? (setspec.condition as string[]).map((conditionFileName: string, index: number) => ({
          fileName: conditionFileName,
          tdfId: Array.isArray(setspec.conditionTdfIds) && typeof setspec.conditionTdfIds[index] === 'string'
            ? setspec.conditionTdfIds[index]
            : null,
          count: Array.isArray(tdf.conditionCounts) && typeof tdf.conditionCounts[index] === 'number'
            ? tdf.conditionCounts[index]
            : 0
        }))
      : null;

    return {
      TDFId,
      displayName,
      fileName: fileName || '',
      tags: Array.isArray(setspec.tags) ? setspec.tags : [],
      availability: 'available',
      currentStimuliSetId: tdf.stimuliSetId ?? null,
      learnerConfig,
      completed: false,
      locked: false,
      hidden: false,
      audioInputEnabled: String(setspec.audioInputEnabled || '').toLowerCase() === 'true',
      enableAudioPromptAndFeedback: String(setspec.enableAudioPromptAndFeedback || '').toLowerCase() === 'true',
      hasSpeechAPIKey,
      hasTTSAPIKey,
      hasConfigurableSettings: true,
      isMultiTdf: Boolean(tdfObject.isMultiTdf),
      isOwner: tdf.ownerId === userId,
      conditions,
      ...statsProjection
    };
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
          version: DASHBOARD_CACHE_VERSION
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

  function addNonEmptyString(target: Set<string>, value: unknown) {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (trimmed) {
      target.add(trimmed);
    }
  }

  async function collectLessonFamilyResetScope(tdfId: string) {
    const target = await Tdfs.findOneAsync(
      { _id: tdfId },
      {
        fields: {
          _id: 1,
          'content.fileName': 1,
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
    addNonEmptyString(tdfIds, target._id);
    addNonEmptyString(tdfKeys, target._id);
    addNonEmptyString(tdfKeys, target.content?.fileName);
    addNonEmptyString(cacheTdfIds, target._id);

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
        'content.tdfs.tutor.setspec.condition': 1,
        'content.tdfs.tutor.setspec.conditionTdfIds': 1
      }
    }).fetchAsync();

    const roots = [target, ...parentRoots];
    const childRefs = new Set<string>();
    for (const root of roots) {
      addNonEmptyString(tdfIds, root._id);
      addNonEmptyString(tdfKeys, root._id);
      addNonEmptyString(tdfKeys, root.content?.fileName);
      addNonEmptyString(cacheTdfIds, root._id);

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
          'content.fileName': 1
        }
      }).fetchAsync();

      for (const child of children) {
        addNonEmptyString(tdfIds, child._id);
        addNonEmptyString(tdfKeys, child._id);
        addNonEmptyString(tdfKeys, child.content?.fileName);
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

  const methods = {
    getPracticeDashboardSnapshot: async function(this: any) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }

      const userId = this.userId;
      const [{ tdfs, hasSpeechAPIKey, hasTTSAPIKey }, cache] = await Promise.all([
        getDashboardVisibleTdfs(userId),
        UserDashboardCache.findOneAsync({ userId })
      ]);

      const conditionChildFileNames = new Set<string>();
      const conditionChildIds = new Set<string>();
      for (const tdf of tdfs) {
        const setspec = tdf?.content?.tdfs?.tutor?.setspec || {};
        const conditions = Array.isArray(setspec.condition) ? setspec.condition : [];
        const conditionTdfIds = Array.isArray(setspec.conditionTdfIds) ? setspec.conditionTdfIds : [];
        for (const condition of conditions) {
          const normalized = normalizeOptionalString(condition);
          if (normalized) conditionChildFileNames.add(normalized);
        }
        for (const conditionTdfId of conditionTdfIds) {
          const normalized = normalizeOptionalString(conditionTdfId);
          if (normalized) conditionChildIds.add(normalized);
        }
      }

      const lessons: PracticeDashboardSnapshotLesson[] = [];
      for (const tdf of tdfs) {
        const TDFId = normalizeOptionalString(tdf?._id);
        const fileName = resolveDashboardTdfFileName(tdf);
        if (!TDFId) continue;
        if (conditionChildIds.has(TDFId) || (fileName && conditionChildFileNames.has(fileName))) {
          continue;
        }
        const lesson = buildPracticeDashboardLesson(
          userId,
          tdf,
          cache?.tdfStats?.[TDFId],
          cache?.learnerTdfConfigs?.[TDFId] || null,
          hasSpeechAPIKey,
          hasTTSAPIKey
        );
        if (lesson && !lesson.hidden) {
          lessons.push(lesson);
        }
      }

      return {
        version: PRACTICE_DASHBOARD_SNAPSHOT_VERSION,
        userId,
        generatedAt: Date.now(),
        lessons
      };
    },

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
        delete nextOverrides.deliverySettings;
      } else if (scope === 'unit') {
        delete nextOverrides.unit;
      } else {
        delete nextOverrides.setspec;
        delete nextOverrides.deliverySettings;
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
