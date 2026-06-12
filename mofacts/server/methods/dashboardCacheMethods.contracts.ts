// Owner: Dashboard Platform Team
// Contracts for dashboard cache method payloads and computed aggregates.
import type { LearnerTdfConfig } from '../../common/lib/learnerTdfConfig';

export type DashboardOutcome = 'correct' | 'incorrect' | string;

export interface DashboardHistoryRecord {
  _id?: string;
  outcome?: DashboardOutcome;
  CFEndLatency?: number | null;
  CFFeedbackLatency?: number | null;
  itemId?: string | number | null;
  stimuliSetId?: string | number | null;
  stimulusKC?: string | number | null;
  clusterKC?: string | number | null;
  CFStimFileIndex?: string | number | null;
  problemName?: string | number | null;
  recordedServerTime?: string | Date | null;
  time?: number | string | Date | null;
  TDFId?: string;
  userId?: string;
  levelUnitType?: string;
  levelUnit?: number | string | null;
  sessionID?: string | null;
  CFNote?: string | null;
  h5p?: {
    eventType?: string;
    latencyMs?: number | null;
  } | null;
}

export interface DashboardTdfStats {
  displayName: string;
  totalTrials: number;
  correctTrials: number;
  incorrectTrials: number;
  totalTimeMs: number;
  totalTimeMinutes: number;
  itemsPracticedCount: number;
  itemsPracticedApplies?: boolean;
  totalSessions: number;
  overallAccuracy: number | null;
  accuracyApplies: boolean;
  accuracyWeightedCorrect?: number;
  accuracyWeightedTotal?: number;
  firstPracticeDate: Date | null;
  lastPracticeDate: Date | null;
  lastPracticeTimestamp: number;
  lastProcessedHistoryId: string | null;
  lastProcessedTimestamp: string | number | Date | null;
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

export interface EnsureDashboardCacheCurrentResult {
  success: true;
  action: 'current' | 'refreshed';
  tdfCount: number;
  reason?: 'missing' | 'version' | 'history-newer';
}

export interface PracticeDashboardProgressStats {
  attempts: number;
  accuracy: number | null;
  accuracyApplies: boolean;
  totalTimeMinutes: number;
  itemsPracticed: number | null;
  itemsPracticedApplies: boolean;
  totalPracticeItems: number | null;
  sessionDays: number;
  lastPracticed: Date | number | string | null;
  lastPracticedTimestamp: number;
}

export interface PracticeDashboardSnapshotLesson {
  TDFId: string;
  displayName: string;
  fileName?: string;
  tags: string[];
  availability: 'available';
  currentStimuliSetId: string | number | null;
  learnerConfig: LearnerTdfConfig | null;
  progress: PracticeDashboardProgressStats;
  completed: boolean;
  locked: boolean;
  hidden: boolean;
  isUsed: boolean;
  hasBeenAttempted: boolean;
  audioInputEnabled: boolean;
  enableAudioPromptAndFeedback: boolean;
  hasSpeechAPIKey: boolean;
  hasTTSAPIKey: boolean;
  hasConfigurableSettings: boolean;
  hasLearnerConfigurableSettings: boolean;
  isMultiTdf: boolean;
  isOwner: boolean;
  conditions: Array<{ fileName: string; tdfId: string | null; count: number }> | null;
}

export interface PracticeDashboardSnapshot {
  version: 1;
  userId: string;
  generatedAt: number;
  lessons: PracticeDashboardSnapshotLesson[];
}
