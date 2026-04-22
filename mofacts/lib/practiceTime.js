function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function computePracticeTimeMs(endLatency, feedbackLatency) {
  return toFiniteNumber(endLatency) + toFiniteNumber(feedbackLatency);
}
