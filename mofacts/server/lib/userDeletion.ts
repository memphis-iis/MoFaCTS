type Selector = Record<string, unknown>;
type RemovableCollection = { removeAsync(selector: Selector): Promise<unknown> };

export type UserOwnedDataCollections = {
  Histories: RemovableCollection;
  GlobalExperimentStates: RemovableCollection;
  SectionUserMap: RemovableCollection;
  UserTimesLog: RemovableCollection;
  UserMetrics: RemovableCollection;
  PasswordResetTokens: RemovableCollection;
  UserDashboardCache: RemovableCollection;
  UserUploadQuota: RemovableCollection;
  AuditLog?: RemovableCollection;
};

export async function removeUserOwnedData(
  collections: UserOwnedDataCollections,
  userId: string,
  options: { removeAuditLog?: boolean } = {},
): Promise<void> {
  await Promise.all([
    collections.Histories.removeAsync({ userId }),
    collections.GlobalExperimentStates.removeAsync({ userId }),
    collections.SectionUserMap.removeAsync({ userId }),
    collections.UserTimesLog.removeAsync({ userId }),
    collections.UserMetrics.removeAsync({ _id: userId }),
    collections.PasswordResetTokens.removeAsync({ userId }),
    collections.UserDashboardCache.removeAsync({ userId }),
    collections.UserUploadQuota.removeAsync({ userId }),
    ...(options.removeAuditLog && collections.AuditLog
      ? [
          collections.AuditLog.removeAsync({
            $or: [{ actorUserId: userId }, { targetUserId: userId }],
          }),
        ]
      : []),
  ]);
}
