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

export type LearnerAnalyticsModelProgress = {
  meanProbability: number;
  challengeTarget: number;
  reachedChallengeTargetCount: number;
  belowChallengeTargetCount: number;
  histogramBins: LearnerAnalyticsHistogramBin[];
  itemProbabilities: number[];
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

export type RefreshLearnerLessonAnalyticsRequest = {
  rootTdfId: string;
  timeZone: string;
};
