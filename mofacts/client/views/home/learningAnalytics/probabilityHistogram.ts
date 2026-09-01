import {
  LEARNER_ANALYTICS_HISTOGRAM_BIN_COUNT,
  type LearnerAnalyticsHistogramBin,
} from '../../../../common/learnerAnalytics.contracts';

export function buildProbabilityHistogram(
  probabilities: readonly number[],
  binCount = LEARNER_ANALYTICS_HISTOGRAM_BIN_COUNT,
): LearnerAnalyticsHistogramBin[] {
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
