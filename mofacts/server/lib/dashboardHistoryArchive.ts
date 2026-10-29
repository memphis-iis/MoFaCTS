type Document = Record<string, unknown>;

export type DashboardHistoryArchiveProgress = {
  status: 'running' | 'complete' | 'failed';
  usersProcessed: number;
  archivedRows: number;
  elapsedMs: number;
};

export type DashboardHistoryArchiveDeps<TSession> = {
  histories: {
    find(selector: Document, options: {
      projection: Record<string, 0 | 1>;
      sort?: Record<string, 1>;
      limit: number;
    }): { toArray(): Promise<Document[]> };
    updateMany(selector: Document, modifier: Document, options: { session: TSession }): Promise<{ modifiedCount: number }>;
  };
  mutate<T>(userId: string, work: (session: TSession) => Promise<T>): Promise<{ result: T }>;
  reportProgress?(progress: DashboardHistoryArchiveProgress): void;
};

const ARCHIVE_BATCH_SIZE = 1000;

function isCanonicalId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

/** Archives bounded history batches and invalidates their learner's dashboard atomically. */
export async function archiveDashboardHistory<TSession>(
  tdfId: string,
  deps: DashboardHistoryArchiveDeps<TSession>,
): Promise<number> {
  if (!isCanonicalId(tdfId)) throw new Error('History archival requires a canonical TDF ID');
  const startedAt = Date.now();
  const archivedAt = new Date();
  const selector = { TDFId: tdfId, tdfDeletedAt: { $exists: false } };
  let usersProcessed = 0;
  let archivedRows = 0;
  const report = (status: DashboardHistoryArchiveProgress['status']) => deps.reportProgress?.({
    status, usersProcessed, archivedRows, elapsedMs: Math.max(0, Date.now() - startedAt),
  });
  report('running');
  try {
    while (true) {
      // The TDFId/userId index selects the next owner without collecting every
      // owner or record. Archived rows disappear from subsequent work queries.
      const nextUsers = await deps.histories.find(selector, {
        projection: { _id: 0, userId: 1 }, sort: { userId: 1 }, limit: 1,
      }).toArray();
      if (!nextUsers.length) break;
      const userId = nextUsers[0]?.userId;
      if (!isCanonicalId(userId)) throw new Error('History archival found a noncanonical learner identity');
      const userSelector = { ...selector, userId };
      while (true) {
        const rows = await deps.histories.find(userSelector, {
          projection: { _id: 1 }, sort: { _id: 1 }, limit: ARCHIVE_BATCH_SIZE,
        }).toArray();
        if (!rows.length) break;
        const ids = rows.map(row => {
          if (row._id === undefined || row._id === null) throw new Error('History archival found a missing record identity');
          return row._id;
        });
        const { result: modifiedCount } = await deps.mutate(userId, async session => {
          const result = await deps.histories.updateMany(
            { ...userSelector, _id: { $in: ids } },
            { $set: { tdfDeletedAt: archivedAt } },
            { session },
          );
          if (!Number.isSafeInteger(result.modifiedCount) || result.modifiedCount < 0 || result.modifiedCount > ids.length) {
            throw new Error('History archival returned an invalid write acknowledgment');
          }
          return result.modifiedCount;
        });
        archivedRows += modifiedCount;
        report('running');
      }
      usersProcessed += 1;
    }
    report('complete');
    return archivedRows;
  } catch (error) {
    report('failed');
    throw error;
  }
}
