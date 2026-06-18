import type {
  DashboardStatsByTdf,
  DashboardSummaryStats,
  DashboardTdfStats,
  DashboardUsageSummary,
} from './dashboardCacheMethods.contracts';

export const DASHBOARD_LEVEL_UNIT_TYPES = ['model', 'schedule', 'autotutor', 'sparc'];
export const DASHBOARD_CACHE_VERSION = 5;
export const PRACTICE_DASHBOARD_SNAPSHOT_VERSION = 1;

export function normalizeOptionalString(value: unknown): string | null {
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

export function timestampValue(value: unknown): number {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value as string | number | Date).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function resolveDashboardTdfFileName(tdf: any) {
  return normalizeOptionalString(tdf?.content?.fileName)
    || normalizeOptionalString(tdf?.tdfFileName)
    || undefined;
}

export function buildDashboardStatsProjection(stats: DashboardTdfStats | undefined, totalPracticeItems: number | null) {
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

function roundOneDecimal(value: number): number {
  return Number(value.toFixed(1));
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
