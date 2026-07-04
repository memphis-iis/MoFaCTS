export type HomePracticeCacheResult = {
  tdfCount?: unknown;
};

export type HomePracticeMeteor = {
  callAsync(methodName: string): Promise<HomePracticeCacheResult | null | undefined>;
};

export type HomePracticeSession = {
  set(key: string, value: boolean): void;
};

export async function hydrateHomePracticeStateFromDashboardCache(
  meteor: HomePracticeMeteor,
  session: HomePracticeSession
): Promise<void> {
  const result = await meteor.callAsync('ensureDashboardCacheCurrent');
  const practicedSystemCount = Number(result?.tdfCount || 0);
  session.set('homeHasPracticeRecords', practicedSystemCount > 0);
}
