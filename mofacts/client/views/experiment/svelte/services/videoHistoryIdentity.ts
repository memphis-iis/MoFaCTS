/** Video events describe the playing media, independently of any checkpoint trial. */
export function buildVideoHistoryIdentity(params: {
  readonly videoUrl: string;
  readonly unitNumber: number;
  readonly unit: { unitname?: string; videosession?: { videosource?: string } } | null | undefined;
}) {
  const videoUrl = params.videoUrl.trim();
  if (!videoUrl) {
    throw new Error('[Video History] Playing video source is missing');
  }
  if (!Number.isInteger(params.unitNumber) || params.unitNumber < 0 || !params.unit?.videosession?.videosource) {
    throw new Error('[Video History] Active video unit is missing or invalid');
  }
  return {
    levelUnit: params.unitNumber,
    levelUnitName: params.unit.unitname?.trim() || '',
    levelUnitType: 'video' as const,
    displayedStimulus: videoUrl,
    problemName: videoUrl,
    stepName: videoUrl,
  };
}
