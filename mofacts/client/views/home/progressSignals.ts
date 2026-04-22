type DashboardCacheLike = {
  tdfStats?: Record<string, unknown>;
} | null | undefined;

type ProgressSignalPayload = {
  attemptedTdfIds?: string[];
  meaningfulProgressTdfIds?: string[];
} | null | undefined;

export function shouldUseProgressSignalFallback(cache: DashboardCacheLike, meaningfulProgressCount: number): boolean {
  return !cache?.tdfStats || meaningfulProgressCount === 0;
}

export function applyFallbackProgressSignals(
  attemptedTdfIds: Set<string>,
  meaningfulProgressTdfIds: Set<string>,
  payload: ProgressSignalPayload
): void {
  for (const tdfId of payload?.attemptedTdfIds || []) {
    if (tdfId) {
      attemptedTdfIds.add(tdfId);
    }
  }
  for (const tdfId of payload?.meaningfulProgressTdfIds || []) {
    if (tdfId) {
      meaningfulProgressTdfIds.add(tdfId);
    }
  }
}
