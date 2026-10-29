import type {
  DashboardHistoryRecord,
  DashboardStatsByTdf,
  DashboardSummaryStats,
  DashboardTdfStats,
  DashboardUsageSummary,
} from '../methods/dashboardCacheMethods.contracts';
import { computeSummaryStats, computeUsageSummary } from '../methods/dashboardCacheShared';

export const DASHBOARD_HISTORY_REFRESH_BATCH_SIZE = 1000;
const PROGRESS_INTERVAL = 10000;

export type DashboardHistorySource = { sequence: number; repairRevision: number };
export type DashboardRefreshHistoryRow = DashboardHistoryRecord & { _id: string; historySequence?: number };
export type DashboardRefreshCache = {
  version?: number;
  tdfStats?: DashboardStatsByTdf;
  lastHistorySequence?: number;
  historyRepairRevision?: number;
  historyTdfTargets?: Record<string, string | null>;
};
export type DashboardHistoryPageRequest = {
  userId: string;
  mode: 'rebuild' | 'delta';
  afterId?: string;
  afterSequence: number;
  throughSequence: number;
  limit: number;
};
export type DashboardRefreshCachePatch = {
  userId: string;
  version: number;
  tdfStats: DashboardStatsByTdf;
  summary: DashboardSummaryStats;
  usageSummary: DashboardUsageSummary;
  lastUpdated: Date;
  lastHistorySequence: number;
  historyRepairRevision: number;
  /** Derived dependencies of these aggregates, not a second canonical lesson-family map. */
  historyTdfTargets: Record<string, string | null>;
};
export type DashboardHistoryRefreshIo = {
  readSource(userId: string): Promise<DashboardHistorySource>;
  readCache(userId: string): Promise<DashboardRefreshCache | null>;
  readHistoryPage(request: DashboardHistoryPageRequest): Promise<DashboardRefreshHistoryRow[]>;
  /** Omitted source IDs represent deleted/unavailable TDFs, never another lesson. */
  resolveTdfTargets(userId: string, sourceTdfIds: string[]): Promise<Map<string, { targetTdfId: string; displayName: string }>>;
  /** One $set update; preserve settings and use $setOnInsert for createdAt. */
  writeCache(userId: string, patch: DashboardRefreshCachePatch): Promise<void>;
};
export type DashboardHistoryRefreshReason = 'missing' | 'version' | 'missing-cursor' | 'repair' | 'invalid-stats' | 'history-newer' | 'requested';
export type DashboardHistoryRefreshResult = {
  success: true;
  action: 'current' | 'refreshed';
  tdfCount: number;
  reason?: DashboardHistoryRefreshReason;
};
type DashboardHistoryRefreshDeps = {
  version: number;
  /** The owner binds every IO operation to the same Mongo snapshot session. */
  transaction<T>(work: (io: DashboardHistoryRefreshIo) => Promise<T>): Promise<T>;
  applyHistoryRecord(current: DashboardTdfStats | undefined, row: DashboardHistoryRecord, displayName: string): DashboardTdfStats;
  now?: () => number;
  reportProgress?: (mode: 'rebuild' | 'delta', processedRows: number) => void;
};

function validPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function completeDistinctSet(value: unknown, count: unknown): boolean {
  return Array.isArray(value) && validPosition(count) && value.length === count
    && value.every(key => typeof key === 'string' && key.length > 0) && new Set(value).size === value.length;
}

function completeStats(value: unknown): value is DashboardStatsByTdf {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(stats => {
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return false;
    const row = stats as DashboardTdfStats;
    return validPosition(row.totalTrials) && validPosition(row.correctTrials) && validPosition(row.incorrectTrials)
      && row.correctTrials + row.incorrectTrials <= row.totalTrials
      && Number.isFinite(row.totalTimeMs)
      && Number.isFinite(row.totalTimeMinutes)
      && Number.isFinite(row.lastPracticeTimestamp) && row.lastPracticeTimestamp >= 0
      && completeDistinctSet(row.practicedItemKeys, row.itemsPracticedCount)
      && completeDistinctSet(row.sessionDateKeys, row.totalSessions)
      && row.accuracyWeightedCorrect === undefined && row.accuracyWeightedTotal === undefined;
  });
}

function completeTargets(value: unknown, stats: DashboardStatsByTdf | undefined): value is Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const targets = new Set(Object.values(value));
  return Object.entries(value).every(([sourceId, targetId]) => sourceId.length > 0
    && (targetId === null || (typeof targetId === 'string' && targetId.length > 0 && Object.prototype.hasOwnProperty.call(stats ?? {}, targetId))))
    && Object.keys(stats ?? {}).every(targetId => targets.has(targetId));
}

/** Source position and stats commit together; retries start again from the snapshot cache. */
export function createDashboardHistoryRefresh(deps: DashboardHistoryRefreshDeps) {
  return async function refresh(userId: string, options: { forceRebuild?: boolean } = {}): Promise<DashboardHistoryRefreshResult> {
    return await deps.transaction(async io => {
      const source = await io.readSource(userId);
      if (!validPosition(source?.sequence) || !validPosition(source?.repairRevision)) {
        throw new Error('Dashboard history source position is invalid');
      }
      const cache = await io.readCache(userId);
      if (validPosition(cache?.lastHistorySequence) && cache.lastHistorySequence > source.sequence) {
        throw new Error('Dashboard cache history position exceeds its source');
      }
      let rebuildReason: DashboardHistoryRefreshReason | undefined;
      if (!cache) rebuildReason = 'missing';
      else if (cache.version !== deps.version) rebuildReason = 'version';
      else if (!validPosition(cache.lastHistorySequence) || !validPosition(cache.historyRepairRevision)) rebuildReason = 'missing-cursor';
      else if (cache.historyRepairRevision !== source.repairRevision) rebuildReason = 'repair';
      else if (!completeStats(cache.tdfStats) || !completeTargets(cache.historyTdfTargets, cache.tdfStats)) rebuildReason = 'invalid-stats';
      else if (options.forceRebuild) rebuildReason = 'requested';
      let mode: 'rebuild' | 'delta' = rebuildReason ? 'rebuild' : 'delta';
      const previousSequence = mode === 'rebuild' ? 0 : cache!.lastHistorySequence!;
      if (mode === 'delta' && previousSequence === source.sequence) {
        return { success: true, action: 'current', tdfCount: Object.keys(cache!.tdfStats!).length };
      }

      let stats: DashboardStatsByTdf = mode === 'rebuild' ? {} : { ...cache!.tdfStats! };
      let historyTdfTargets: Record<string, string | null> = mode === 'rebuild' ? {} : { ...cache!.historyTdfTargets! };
      let afterId: string | undefined;
      let afterSequence = previousSequence;
      let processedRows = 0;
      for (;;) {
        const rows = await io.readHistoryPage({ userId, mode, ...(afterId === undefined ? {} : { afterId }),
          afterSequence, throughSequence: source.sequence, limit: DASHBOARD_HISTORY_REFRESH_BATCH_SIZE });
        if (rows.length > DASHBOARD_HISTORY_REFRESH_BATCH_SIZE) throw new Error('Dashboard history page exceeds its batch limit');
        if (!rows.length) break;
        for (const row of rows) {
          if (typeof row._id !== 'string' || !row._id) throw new Error('Dashboard history row requires its identity');
          if (mode === 'rebuild' && afterId !== undefined && row._id <= afterId) throw new Error('Dashboard history rebuild page is not ordered by identity');
          if (row.historySequence !== undefined && (!validPosition(row.historySequence) || row.historySequence === 0 || row.historySequence > source.sequence)) {
            throw new Error('Dashboard history row exceeds or contradicts its source position');
          }
          if (mode === 'delta') {
            if (!validPosition(row.historySequence) || row.historySequence <= afterSequence) throw new Error('Dashboard history delta is not ordered after its saved position');
            afterSequence = row.historySequence;
          }
          afterId = row._id;
        }
        const sourceTdfIds = [...new Set(rows.map(row => row.TDFId).filter((id): id is string => typeof id === 'string' && id.length > 0))];
        const targets = sourceTdfIds.length ? await io.resolveTdfTargets(userId, sourceTdfIds) : new Map();
        for (const sourceId of sourceTdfIds) {
          const target = targets.get(sourceId);
          if (target && (typeof target.targetTdfId !== 'string' || !target.targetTdfId || typeof target.displayName !== 'string')) {
            throw new Error('Dashboard history target is invalid');
          }
        }
        const changedTarget = sourceTdfIds.some(sourceId => Object.prototype.hasOwnProperty.call(historyTdfTargets, sourceId)
          && historyTdfTargets[sourceId] !== (targets.get(sourceId)?.targetTdfId ?? null));
        if (changedTarget) {
          if (mode === 'rebuild') throw new Error('Dashboard history targets changed within their snapshot');
          // A source previously contributed to a different aggregate. Re-read the
          // same snapshot once so old totals are neither retained nor guessed.
          mode = 'rebuild';
          rebuildReason = 'repair';
          stats = {};
          historyTdfTargets = {};
          afterId = undefined;
          afterSequence = 0;
          processedRows = 0;
          continue;
        }
        for (const sourceId of sourceTdfIds) historyTdfTargets[sourceId] = targets.get(sourceId)?.targetTdfId ?? null;
        for (const row of rows) {
          const target = row.TDFId ? targets.get(row.TDFId) : undefined;
          if (!target) continue;
          stats[target.targetTdfId] = deps.applyHistoryRecord(stats[target.targetTdfId], row, target.displayName);
        }
        processedRows += rows.length;
        if (processedRows % PROGRESS_INTERVAL === 0) deps.reportProgress?.(mode, processedRows);
        if (rows.length < DASHBOARD_HISTORY_REFRESH_BATCH_SIZE) break;
      }
      await io.writeCache(userId, { userId, version: deps.version, tdfStats: stats,
        summary: computeSummaryStats(stats), usageSummary: computeUsageSummary(stats), lastUpdated: new Date((deps.now ?? Date.now)()),
        lastHistorySequence: source.sequence, historyRepairRevision: source.repairRevision, historyTdfTargets });
      return { success: true, action: 'refreshed', reason: rebuildReason ?? 'history-newer', tdfCount: Object.keys(stats).length };
    });
  };
}
