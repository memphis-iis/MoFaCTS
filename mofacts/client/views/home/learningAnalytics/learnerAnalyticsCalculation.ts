import type {
  LearnerAnalyticsHistoryRow,
  LearnerLessonAnalyticsSnapshot,
  LearnerLessonAnalyticsSource,
} from '../../../../common/learnerAnalytics.contracts';
import {
  assertValidAnalyticsTimeZone,
  buildLearnerAnalyticsAggregates,
} from './learnerAnalyticsAggregation';
import {
  buildLearnerUnitModelSnapshots,
  consolidateLearnerModelProgress,
} from './learnerModelProgress';

export function buildLearnerLessonAnalyticsSnapshot(params: {
  source: LearnerLessonAnalyticsSource;
  historyRows: LearnerAnalyticsHistoryRow[];
  timeZone: string;
}): LearnerLessonAnalyticsSnapshot {
  const timeZone = assertValidAnalyticsTimeZone(params.timeZone);
  const calculatedAtMs = Date.parse(params.source.calculatedAt);
  if (!Number.isFinite(calculatedAtMs)) {
    throw new Error('Learning analytics source has an invalid calculation timestamp.');
  }
  const aggregate = buildLearnerAnalyticsAggregates({
    rows: params.historyRows,
    nowMs: calculatedAtMs,
    timeZone,
  });
  const modelResult = params.source.modelInput
    ? consolidateLearnerModelProgress(buildLearnerUnitModelSnapshots({
        ...params.source.modelInput,
        historyRows: params.historyRows,
        nowMs: calculatedAtMs,
      }))
    : { reason: 'not-supported' as const };
  const accuracy = Object.values(aggregate.periods).some((period) => period.accuracy !== undefined);

  return {
    version: 1,
    lesson: params.source.lesson,
    calculatedAt: params.source.calculatedAt,
    timeZone,
    lastPracticedAt: aggregate.lastPracticedAt,
    periods: aggregate.periods,
    latest28Days: aggregate.latest28Days,
    ...(modelResult.progress ? { modelProgress: modelResult.progress } : {}),
    availability: {
      accuracy,
      modelProgress: Boolean(modelResult.progress),
      ...(modelResult.reason ? { modelProgressReason: modelResult.reason } : {}),
    },
  };
}
