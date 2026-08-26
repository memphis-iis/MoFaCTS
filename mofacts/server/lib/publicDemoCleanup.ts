import { removeUserOwnedData, type UserOwnedDataCollections } from './userDeletion';

type UnknownRecord = Record<string, unknown>;

type PublicDemoCleanupDeps = UserOwnedDataCollections & {
  usersCollection: {
    find(selector: UnknownRecord, options?: UnknownRecord): { fetchAsync(): Promise<any[]> };
    removeAsync(selector: UnknownRecord): Promise<unknown>;
    rawCollection(): { createIndex(keys: UnknownRecord, options?: UnknownRecord): Promise<unknown> };
  };
  syncUsernameCaches(userId: string, nextUsername: string, previousUsername?: string): void;
  writeAuditLog(action: string, actorUserId: string | null, targetUserId: string | null, details?: UnknownRecord): Promise<void>;
  serverConsole(...args: unknown[]): void;
};

export async function ensurePublicDemoCleanupIndex(deps: PublicDemoCleanupDeps): Promise<void> {
  await deps.usersCollection.rawCollection().createIndex(
    { 'profile.createdBy': 1, 'profile.demoExpiresAt': 1 },
    { name: 'public_demo_expiration' },
  );
}

export async function purgeExpiredPublicDemoUsers(
  deps: PublicDemoCleanupDeps,
  now = new Date(),
  batchSize = 100,
): Promise<number> {
  const startedAt = Date.now();
  const expiredUsers = await deps.usersCollection.find(
    {
      'profile.createdBy': 'publicDemo',
      'profile.demoExpiresAt': { $lte: now },
    },
    {
      fields: { _id: 1, username: 1 },
      sort: { 'profile.demoExpiresAt': 1 },
      limit: batchSize,
    },
  ).fetchAsync();

  let removed = 0;
  for (const user of expiredUsers) {
    const userId = typeof user?._id === 'string' ? user._id : '';
    if (!userId) continue;
    await removeUserOwnedData(deps, userId, { removeAuditLog: true });
    const removeResult = await deps.usersCollection.removeAsync({
      _id: userId,
      'profile.createdBy': 'publicDemo',
      'profile.demoExpiresAt': { $lte: now },
    });
    if (Number(removeResult) > 0) {
      deps.syncUsernameCaches(userId, '', String(user?.username || ''));
      removed += 1;
    }
  }

  if (removed > 0) {
    await deps.writeAuditLog('publicDemo.expiredPurged', null, null, {
      removed,
      examined: expiredUsers.length,
      durationMs: Math.max(0, Date.now() - startedAt),
      completedAt: new Date(),
    });
    deps.serverConsole('[PUBLIC-DEMO] purged expired temporary accounts', { removed });
  }
  return removed;
}
