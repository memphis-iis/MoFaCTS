// Owner: Dashboard Platform Team
// Contracts for dashboard cache method payloads and computed aggregates.

export type DashboardOutcome = 'correct' | 'incorrect' | string;

export interface DashboardHistoryRecord {
  _id?: string;
  outcome?: DashboardOutcome;
  CFEndLatency?: number | null;
  CFFeedbackLatency?: number | null;
  itemId?: string | number | null;
  CFStimFileIndex?: string | number | null;
  problemName?: string | number | null;
  recordedServerTime?: string | Date | null;
  TDFId?: string;
  userId?: string;
  levelUnitType?: string;
}

export interface DashboardTdfStats {
  displayName: string;
  totalTrials: number;
  correctTrials: number;
  incorrectTrials: number;
  totalTimeMs: number;
  totalTimeMinutes: number;
  itemsPracticedCount: number;
  totalSessions: number;
  recentOutcomes: DashboardOutcome[];
  overallAccuracy: number;
  last10Accuracy: number;
  firstPracticeDate: Date | null;
  lastPracticeDate: Date | null;
  lastProcessedHistoryId: string | null;
  lastProcessedTimestamp: string | Date | null;
}

export type DashboardStatsByTdf = Record<string, DashboardTdfStats>;

export interface DashboardSummaryStats {
  totalTdfsAttempted: number;
  totalTrialsAllTime: number;
  totalTimeAllTime: number;
  overallAccuracyAllTime: number;
  lastActivityDate: Date | null;
}

export interface DashboardUsageSummary {
  totalTrials: number;
  weightedAccuracy: number;
  totalTimeMinutes: number;
  averageSessionDays: number;
  averageItemsPracticed: number;
  lastActivityDate: Date | null;
  practicedSystemCount: number;
}

export type ComputePracticeTimeMs = (
  endLatency: number | null | undefined,
  feedbackLatency: number | null | undefined
) => number;

export interface InitializeDashboardCacheResult {
  success: true;
  tdfCount: number;
}

export interface UpdateDashboardCacheResult {
  success: boolean;
  action?: 'updated' | 'no_history';
  error?: string;
  newRecords?: number;
}
