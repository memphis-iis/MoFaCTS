type DeliverySettingsLike = {
  displayPerformance?: unknown;
  displayTimeoutBar?: unknown;
  displayTimeoutCountdown?: unknown;
};

type PerformanceDataLike = {
  totalTimeDisplay?: unknown;
  percentCorrect?: unknown;
  cardsSeen?: unknown;
  totalCards?: unknown;
  currentTrial?: unknown;
};

export type CardPerformanceData = {
  totalTimeDisplay: string;
  percentCorrect: string;
  cardsSeen: number | null;
  totalCards: number | null;
  currentTrial: number;
};

export type CardPerformanceSlotProps = {
  showPerformanceStats: unknown;
  showTimeoutBar: unknown;
  showTimeoutCountdown: unknown;
  totalTimeDisplay: unknown;
  percentCorrect: unknown;
  cardsSeen: unknown;
  totalCards: unknown;
  currentTrial: unknown;
  timeoutMode: unknown;
  timeoutProgress: number;
  remainingTime: number;
};

export function buildCardPerformanceData(rawPerformance: Record<string, unknown> = {}): CardPerformanceData {
  const performance = rawPerformance || {};
  const numCorrect = Number(performance.numCorrect);
  const numIncorrect = Number(performance.numIncorrect);
  const divisor = Number.isFinite(numCorrect) && Number.isFinite(numIncorrect)
    ? numCorrect + numIncorrect
    : 0;

  const percentCorrect = typeof performance.percentCorrect === 'string' && performance.percentCorrect
    ? performance.percentCorrect
    : divisor > 0
      ? `${((numCorrect / divisor) * 100).toFixed(2)}%`
      : 'N/A';

  const totalTimeDisplay = performance.totalTimeDisplay != null && performance.totalTimeDisplay !== ''
    ? String(performance.totalTimeDisplay)
    : Number.isFinite(Number(performance.totalTime))
      ? (Number(performance.totalTime) / (1000 * 60)).toFixed(1)
      : '0.0';

  const cardsSeen = Number.isFinite(Number(performance.stimsSeen))
    ? Number(performance.stimsSeen)
    : null;
  const totalCards = Number.isFinite(Number(performance.totalStimCount))
    ? Number(performance.totalStimCount)
    : null;
  const currentTrial = Number.isFinite(Number(performance.count))
    ? Number(performance.count)
    : 0;

  return {
    totalTimeDisplay,
    percentCorrect,
    cardsSeen,
    totalCards,
    currentTrial,
  };
}

export function buildCardPerformanceDisplaySnapshot({
  deliverySettings,
  performanceData,
  timeoutMode,
  timeoutProgress,
  remainingTime,
}: {
  deliverySettings: DeliverySettingsLike;
  performanceData: PerformanceDataLike;
  timeoutMode: unknown;
  timeoutProgress: number;
  remainingTime: number;
}) {
  const showTimeoutBar = deliverySettings.displayTimeoutBar;
  const showTimeoutCountdown = deliverySettings.displayTimeoutCountdown;
  const showPerformanceStats = deliverySettings.displayPerformance;
  const performanceSlotProps: CardPerformanceSlotProps = {
    showPerformanceStats,
    showTimeoutBar,
    showTimeoutCountdown,
    totalTimeDisplay: performanceData.totalTimeDisplay,
    percentCorrect: performanceData.percentCorrect,
    cardsSeen: performanceData.cardsSeen,
    totalCards: performanceData.totalCards,
    currentTrial: performanceData.currentTrial,
    timeoutMode,
    timeoutProgress,
    remainingTime,
  };

  return {
    showTimeoutBar,
    showTimeoutCountdown,
    showPerformanceStats,
    performanceSlotProps,
    performanceStatsProps: {
      ...performanceSlotProps,
      showPerformanceStats: true,
      showTimeoutBar: false,
      showTimeoutCountdown: false,
    },
    trialTimerProps: {
      ...performanceSlotProps,
      showPerformanceStats: false,
    },
    showTrialTimerArea: Boolean(showTimeoutBar || showTimeoutCountdown),
  };
}
