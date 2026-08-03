export type AnalyticsPeriod = '7d' | '30d' | 'all';

export type AnalyticsMetricKey =
  | 'attempts'
  | 'accuracy'
  | 'uniqueItems'
  | 'practiceDays'
  | 'activeMinutes'
  | 'recency'
  | 'meanProbability'
  | 'atTarget'
  | 'belowTarget';

export type LessonMeasurementContract = 'retrieval-model' | 'retrieval' | 'autotutor';

export interface AccuracySnapshot {
  correct: number;
  total: number;
}

export interface ModelProgressSnapshot {
  meanProbability: number;
  atTarget: number;
  belowTarget: number;
  targetProbability: number;
}

export interface PeriodAnalyticsSnapshot {
  attempts: number;
  accuracy?: AccuracySnapshot;
  uniqueItems: number;
  practiceDays: number;
  activeMinutes: number;
  modelProgress?: ModelProgressSnapshot;
  updatedAtByMetric: Partial<Record<AnalyticsMetricKey, string>>;
}

export interface ActivityDay {
  date: string;
  attempts: number;
  activeMinutes: number;
}

export interface MockLessonAnalytics {
  id: string;
  title: string;
  measurementContract: LessonMeasurementContract;
  lastPracticedDate: string;
  activityUpdatedAt: string;
  periods: Record<AnalyticsPeriod, PeriodAnalyticsSnapshot>;
  activity: ActivityDay[];
}

export interface ActivityWeekSummary {
  weekNumber: number;
  startDate: string;
  endDate: string;
  activeDays: number;
  attempts: number;
  activeMinutes: number;
}

export interface LearningAnalyticsMockViewModel {
  lesson: MockLessonAnalytics;
  period: AnalyticsPeriod;
  metrics: PeriodAnalyticsSnapshot;
  accuracyRate: number | undefined;
  daysSinceLastPractice: number;
  activityTotals: {
    activeDays: number;
    attempts: number;
    activeMinutes: number;
  };
  activityWeeks: ActivityWeekSummary[];
}

export const DEMO_SNAPSHOT_AT = '2026-07-31T12:00:00-05:00';
export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriod = '30d';

const COMMON_UPDATED_AT = '2026-07-30T16:20:00-05:00';
const MODEL_UPDATED_AT = '2026-07-30T16:21:00-05:00';

function metricFreshness(options: { accuracy: boolean; modelProgress: boolean }): Partial<Record<AnalyticsMetricKey, string>> {
  const freshness: Partial<Record<AnalyticsMetricKey, string>> = {
    attempts: COMMON_UPDATED_AT,
    uniqueItems: COMMON_UPDATED_AT,
    practiceDays: COMMON_UPDATED_AT,
    activeMinutes: COMMON_UPDATED_AT,
    recency: COMMON_UPDATED_AT,
  };
  if (options.accuracy) {
    freshness.accuracy = COMMON_UPDATED_AT;
  }
  if (options.modelProgress) {
    freshness.meanProbability = MODEL_UPDATED_AT;
    freshness.atTarget = MODEL_UPDATED_AT;
    freshness.belowTarget = MODEL_UPDATED_AT;
  }
  return freshness;
}

function buildActivity(activeDays: Record<number, { attempts: number; activeMinutes: number }>): ActivityDay[] {
  const startDate = Date.UTC(2026, 6, 3);
  return Array.from({ length: 28 }, (_, index) => {
    const activity = activeDays[index] || { attempts: 0, activeMinutes: 0 };
    return {
      date: new Date(startDate + index * 86_400_000).toISOString().slice(0, 10),
      attempts: activity.attempts,
      activeMinutes: activity.activeMinutes,
    };
  });
}

const MOCK_LESSONS: readonly MockLessonAnalytics[] = [
  {
    id: 'spanish-food-and-dining',
    title: 'Spanish Vocabulary: Food and Dining',
    measurementContract: 'retrieval-model',
    lastPracticedDate: '2026-07-30',
    activityUpdatedAt: COMMON_UPDATED_AT,
    periods: {
      '7d': {
        attempts: 47,
        accuracy: { correct: 41, total: 47 },
        uniqueItems: 18,
        practiceDays: 3,
        activeMinutes: 19,
        modelProgress: { meanProbability: 0.82, atTarget: 12, belowTarget: 6, targetProbability: 0.80 },
        updatedAtByMetric: metricFreshness({ accuracy: true, modelProgress: true }),
      },
      '30d': {
        attempts: 186,
        accuracy: { correct: 156, total: 186 },
        uniqueItems: 42,
        practiceDays: 8,
        activeMinutes: 74,
        modelProgress: { meanProbability: 0.79, atTarget: 31, belowTarget: 11, targetProbability: 0.80 },
        updatedAtByMetric: metricFreshness({ accuracy: true, modelProgress: true }),
      },
      all: {
        attempts: 642,
        accuracy: { correct: 526, total: 642 },
        uniqueItems: 90,
        practiceDays: 34,
        activeMinutes: 257,
        modelProgress: { meanProbability: 0.79, atTarget: 67, belowTarget: 23, targetProbability: 0.80 },
        updatedAtByMetric: metricFreshness({ accuracy: true, modelProgress: true }),
      },
    },
    activity: buildActivity({
      1: { attempts: 30, activeMinutes: 12 },
      5: { attempts: 26, activeMinutes: 10 },
      9: { attempts: 34, activeMinutes: 13 },
      13: { attempts: 22, activeMinutes: 9 },
      18: { attempts: 27, activeMinutes: 11 },
      22: { attempts: 13, activeMinutes: 6 },
      25: { attempts: 16, activeMinutes: 6 },
      27: { attempts: 18, activeMinutes: 7 },
    }),
  },
  {
    id: 'biology-cell-structure',
    title: 'Biology: Cell Structure Review',
    measurementContract: 'retrieval',
    lastPracticedDate: '2026-07-27',
    activityUpdatedAt: '2026-07-27T18:05:00-05:00',
    periods: {
      '7d': {
        attempts: 18,
        accuracy: { correct: 13, total: 18 },
        uniqueItems: 10,
        practiceDays: 2,
        activeMinutes: 9,
        updatedAtByMetric: metricFreshness({ accuracy: true, modelProgress: false }),
      },
      '30d': {
        attempts: 94,
        accuracy: { correct: 70, total: 94 },
        uniqueItems: 28,
        practiceDays: 6,
        activeMinutes: 43,
        updatedAtByMetric: metricFreshness({ accuracy: true, modelProgress: false }),
      },
      all: {
        attempts: 321,
        accuracy: { correct: 246, total: 321 },
        uniqueItems: 54,
        practiceDays: 18,
        activeMinutes: 146,
        updatedAtByMetric: metricFreshness({ accuracy: true, modelProgress: false }),
      },
    },
    activity: buildActivity({
      3: { attempts: 16, activeMinutes: 8 },
      8: { attempts: 19, activeMinutes: 9 },
      15: { attempts: 21, activeMinutes: 9 },
      19: { attempts: 20, activeMinutes: 8 },
      21: { attempts: 8, activeMinutes: 4 },
      24: { attempts: 10, activeMinutes: 5 },
    }),
  },
  {
    id: 'autotutor-forces-and-motion',
    title: 'AutoTutor: Forces and Motion',
    measurementContract: 'autotutor',
    lastPracticedDate: '2026-07-29',
    activityUpdatedAt: '2026-07-29T15:40:00-05:00',
    periods: {
      '7d': {
        attempts: 11,
        uniqueItems: 5,
        practiceDays: 2,
        activeMinutes: 17,
        updatedAtByMetric: metricFreshness({ accuracy: false, modelProgress: false }),
      },
      '30d': {
        attempts: 38,
        uniqueItems: 12,
        practiceDays: 4,
        activeMinutes: 58,
        updatedAtByMetric: metricFreshness({ accuracy: false, modelProgress: false }),
      },
      all: {
        attempts: 116,
        uniqueItems: 24,
        practiceDays: 12,
        activeMinutes: 173,
        updatedAtByMetric: metricFreshness({ accuracy: false, modelProgress: false }),
      },
    },
    activity: buildActivity({
      6: { attempts: 12, activeMinutes: 18 },
      16: { attempts: 15, activeMinutes: 23 },
      23: { attempts: 5, activeMinutes: 8 },
      26: { attempts: 6, activeMinutes: 9 },
    }),
  },
] as const;

export function getMockLessons(): readonly MockLessonAnalytics[] {
  return MOCK_LESSONS;
}

export function getDefaultMockLessonId(): string {
  const lesson = [...MOCK_LESSONS]
    .sort((left, right) => right.lastPracticedDate.localeCompare(left.lastPracticedDate))[0];
  if (!lesson) {
    throw new Error('Learning analytics mock requires at least one lesson.');
  }
  return lesson.id;
}

export function buildLearningAnalyticsMockViewModel(
  lessonId: string,
  period: AnalyticsPeriod,
): LearningAnalyticsMockViewModel {
  const lesson = MOCK_LESSONS.find((candidate) => candidate.id === lessonId);
  if (!lesson) {
    throw new Error(`Unknown learning analytics mock lesson: ${lessonId}`);
  }
  const metrics = lesson.periods[period];
  if (!metrics) {
    throw new Error(`Missing ${period} learning analytics mock period for ${lessonId}`);
  }

  const activityTotals = lesson.activity.reduce((totals, day) => ({
    activeDays: totals.activeDays + (day.attempts > 0 || day.activeMinutes > 0 ? 1 : 0),
    attempts: totals.attempts + day.attempts,
    activeMinutes: totals.activeMinutes + day.activeMinutes,
  }), { activeDays: 0, attempts: 0, activeMinutes: 0 });

  const activityWeeks = Array.from({ length: 4 }, (_, index): ActivityWeekSummary => {
    const days = lesson.activity.slice(index * 7, index * 7 + 7);
    if (days.length !== 7 || !days[0] || !days[6]) {
      throw new Error(`Learning analytics activity week ${index + 1} is incomplete for ${lessonId}.`);
    }
    return {
      weekNumber: index + 1,
      startDate: days[0].date,
      endDate: days[6].date,
      activeDays: days.filter((day) => day.attempts > 0 || day.activeMinutes > 0).length,
      attempts: days.reduce((total, day) => total + day.attempts, 0),
      activeMinutes: days.reduce((total, day) => total + day.activeMinutes, 0),
    };
  });

  const snapshotDate = Date.parse(`${DEMO_SNAPSHOT_AT.slice(0, 10)}T00:00:00Z`);
  const lastPracticeDate = Date.parse(`${lesson.lastPracticedDate}T00:00:00Z`);
  const daysSinceLastPractice = Math.round((snapshotDate - lastPracticeDate) / 86_400_000);

  return {
    lesson,
    period,
    metrics,
    accuracyRate: metrics.accuracy
      ? metrics.accuracy.correct / metrics.accuracy.total
      : undefined,
    daysSinceLastPractice,
    activityTotals,
    activityWeeks,
  };
}
