import type {
  LearnerAnalyticsActivityDay,
  LearnerAnalyticsPeriod,
  LearnerLessonAnalyticsSnapshot,
} from '../../../../common/learnerAnalytics.contracts';

export type HeadlineAnalyticsFactor =
  | 'estimatedLearning'
  | 'accuracy'
  | 'uniqueItems'
  | 'activeMinutes'
  | 'practiceDays';

export type ModelProgressSnapshot = {
  meanProbability: number;
  atTarget: number;
  belowTarget: number;
  targetProbability: number;
  itemProbabilities: number[];
};

export type ProbabilityHistogramBin = { start: number; end: number; count: number };
export type ActivityDay = LearnerAnalyticsActivityDay;
export type ActivityWeekSummary = {
  weekNumber: number;
  startDate: string;
  endDate: string;
  activeDays: number;
  attempts: number;
  activeMinutes: number;
};

export function buildProbabilityHistogram(
  probabilities: readonly number[],
  binCount = 10,
): ProbabilityHistogramBin[] {
  if (!Number.isInteger(binCount) || binCount <= 0) {
    throw new Error('Probability histogram requires a positive integer bin count.');
  }
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: index / binCount,
    end: (index + 1) / binCount,
    count: 0,
  }));
  for (const probability of probabilities) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error('Modeled probabilities must be between 0 and 1.');
    }
    const index = probability === 1 ? binCount - 1 : Math.floor(probability * binCount);
    const bin = bins[index];
    if (!bin) throw new Error(`Cannot resolve probability bin ${index}.`);
    bin.count += 1;
  }
  return bins;
}

export function buildActivitySummary(activity: readonly ActivityDay[]) {
  if (activity.length !== 28) {
    throw new Error('Learning analytics requires exactly 28 activity days.');
  }
  const totals = activity.reduce((result, day) => ({
    activeDays: result.activeDays + (day.attempts > 0 || day.activeMinutes > 0 ? 1 : 0),
    attempts: result.attempts + day.attempts,
    activeMinutes: result.activeMinutes + day.activeMinutes,
  }), { activeDays: 0, attempts: 0, activeMinutes: 0 });
  const weeks = Array.from({ length: 4 }, (_, index): ActivityWeekSummary => {
    const days = activity.slice(index * 7, index * 7 + 7);
    const first = days[0];
    const last = days[6];
    if (!first || !last) throw new Error(`Activity week ${index + 1} is incomplete.`);
    return {
      weekNumber: index + 1,
      startDate: first.date,
      endDate: last.date,
      activeDays: days.filter((day) => day.attempts > 0 || day.activeMinutes > 0).length,
      attempts: days.reduce((sum, day) => sum + day.attempts, 0),
      activeMinutes: days.reduce((sum, day) => sum + day.activeMinutes, 0),
    };
  });
  return { totals, weeks };
}

export function buildLearningAnalyticsViewModel(
  snapshot: LearnerLessonAnalyticsSnapshot,
  period: LearnerAnalyticsPeriod,
) {
  const metrics = snapshot.periods[period];
  const activity = buildActivitySummary(snapshot.latest28Days);
  const progress = snapshot.modelProgress
    ? {
        meanProbability: snapshot.modelProgress.meanProbability,
        atTarget: snapshot.modelProgress.reachedChallengeTargetCount,
        belowTarget: snapshot.modelProgress.belowChallengeTargetCount,
        targetProbability: snapshot.modelProgress.challengeTarget,
        itemProbabilities: snapshot.modelProgress.itemProbabilities,
      }
    : undefined;
  const headlineFactors: HeadlineAnalyticsFactor[] = [
    ...(progress ? ['estimatedLearning' as const] : []),
    ...(metrics.accuracy ? ['accuracy' as const] : []),
    'uniqueItems',
    'activeMinutes',
    'practiceDays',
  ];
  return {
    lesson: snapshot.lesson,
    metrics: { ...metrics, modelProgress: progress },
    accuracyRate: metrics.accuracy && metrics.accuracy.total > 0
      ? metrics.accuracy.correct / metrics.accuracy.total
      : undefined,
    activityTotals: activity.totals,
    activityWeeks: activity.weeks,
    headlineFactors,
  };
}
