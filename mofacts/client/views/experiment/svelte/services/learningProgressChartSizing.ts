export function resolveLearningProgressChartRowCount(rowCount: unknown): number {
  const parsed = Number(rowCount);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
}

export function buildLearningProgressChartStyle(rowCount: unknown): string {
  return `--progress-row-count: ${resolveLearningProgressChartRowCount(rowCount)}`;
}

export function buildCompactLearningProgressChartHeightExpression(): string {
  return 'calc(var(--progress-row-count) * var(--progress-bar-height) + (var(--progress-row-count) - 1) * var(--progress-bar-gap))';
}

