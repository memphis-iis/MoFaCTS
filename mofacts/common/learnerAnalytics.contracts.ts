export type LearnerAnalyticsPeriod = '7d' | '30d' | 'all';

export type LearnerAnalyticsMeasurementContract =
  | 'retrieval-model'
  | 'retrieval'
  | 'autotutor'
  | 'mixed';

export type LearnerAnalyticsLaunchDescriptor = {
  rootTdfId: string;
  lessonName: string;
  currentStimuliSetId: string | number | null;
  isMultiTdf: boolean;
};

export type LearnerAnalyticsLessonSummary = {
  rootTdfId: string;
  title: string;
  measurementContract: LearnerAnalyticsMeasurementContract;
  lastPracticedAt: string | null;
  launch: LearnerAnalyticsLaunchDescriptor;
};

export type LearnerAnalyticsOverview = {
  version: 1;
  defaultLessonId: string | null;
  lessons: LearnerAnalyticsLessonSummary[];
};

export type LearnerAnalyticsPeriodSnapshot = {
  attempts: number;
  accuracy?: { correct: number; total: number };
  uniqueItems: number;
  practiceDays: number;
  activeMinutes: number;
};

export type LearnerAnalyticsActivityDay = {
  date: string;
  attempts: number;
  activeMinutes: number;
};

export type LearnerAnalyticsHistogramBin = {
  start: number;
  end: number;
  count: number;
};

// Forty equal bins across [0, 1] gives a width of 2.5 percentage points.
export const LEARNER_ANALYTICS_HISTOGRAM_BIN_COUNT = 40;

export type LearnerAnalyticsModelProgress = {
  meanProbability: number;
  challengeTarget: number;
  reachedChallengeTargetCount: number;
  belowChallengeTargetCount: number;
  histogramBins: LearnerAnalyticsHistogramBin[];
  modeledItemCount: number;
};

export type LearnerAnalyticsHistoryRow = {
  _id: string;
  TDFId?: string | null;
  levelUnit?: number | string | null;
  levelUnitType?: string | null;
  modelEvidenceSource?: string | null;
  outcome?: string | null;
  recordedServerTime?: number | string | null;
  time?: number | string | null;
  problemStartTime?: number | string | null;
  CFEndLatency?: number | string | null;
  CFFeedbackLatency?: number | string | null;
  responseDuration?: number | string | null;
  practiceDurationMs?: number | string | null;
  stimuliSetId?: string | number | null;
  stimulusKC?: string | number | null;
  clusterKC?: string | number | null;
  KCCluster?: string | number | null;
  KCId?: string | number | null;
  KCDefault?: string | number | null;
  CFCorrectAnswer?: string | number | null;
  responseKey?: string | number | null;
  responseValue?: unknown;
  eventType?: string | null;
  CFItemRemoved?: unknown;
  sparc?: unknown;
};

export type LearnerAnalyticsCrowdStat = {
  stimuliSetId: string | number;
  stimulusKC: string | number;
  correctCount: number;
  incorrectCount: number;
  totalCount: number;
};

export type LearnerAnalyticsModelInput = {
  tdfDoc: Record<string, unknown>;
  flatStimuli: unknown[];
  learnerConfig?: Record<string, unknown> | null;
  responseKCMap: Record<string, unknown>;
  crowdStats: LearnerAnalyticsCrowdStat[];
};

export type LearnerAnalyticsHistoryPage = {
  version: 1;
  rows: LearnerAnalyticsHistoryRow[];
  nextCursor: string | null;
};

export type LearnerLessonAnalyticsSource = {
  version: 1;
  lesson: LearnerAnalyticsLessonSummary;
  calculatedAt: string;
  historyRowCount: number;
  historyPage: LearnerAnalyticsHistoryPage;
  modelInput?: LearnerAnalyticsModelInput;
};

export type LearnerAnalyticsAvailability = {
  accuracy: boolean;
  modelProgress: boolean;
  modelProgressReason?: 'not-supported' | 'multiple-challenge-targets' | 'not-ready';
};

export type LearnerLessonAnalyticsSnapshot = {
  version: 1;
  lesson: LearnerAnalyticsLessonSummary;
  calculatedAt: string;
  timeZone: string;
  lastPracticedAt: string | null;
  periods: Record<LearnerAnalyticsPeriod, LearnerAnalyticsPeriodSnapshot>;
  latest28Days: LearnerAnalyticsActivityDay[];
  modelProgress?: LearnerAnalyticsModelProgress;
  availability: LearnerAnalyticsAvailability;
};

export type GetLearnerLessonAnalyticsSourceRequest = {
  rootTdfId: string;
};

export type GetLearnerLessonAnalyticsHistoryPageRequest = {
  rootTdfId: string;
  cursor: string;
};
