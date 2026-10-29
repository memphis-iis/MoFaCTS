import { operationalHistorySelector } from '../../common/historyEnvelope';
import { boundedExternalSort } from './boundedExternalSort';
import type { BoundedExternalSortOptions } from './boundedExternalSort';
import { compareHistoryExportRecords } from './historyExportOrder';
import { HISTORY_EXPORT_SOURCE_PROJECTION } from './historyExport';

type HistoryRecord = Record<string, unknown>;
type HistoryCursor = AsyncIterable<HistoryRecord> & { close: () => Promise<void> };
export type HistoryExportCollection = {
  find: (selector: Record<string, unknown>, options: { projection: Record<string, 0 | 1>; batchSize: number }) => HistoryCursor;
};

// Bound the query document even when an instructor owns many lessons.
const LESSON_IDS_PER_QUERY = 500;

/** Batched projected reads with the established student/time and per-TDF tie order. */
export async function* sortedOwnedHistoryRecords(
  histories: HistoryExportCollection,
  tdfIds: readonly string[],
  options: BoundedExternalSortOptions = {},
): AsyncGenerator<HistoryRecord> {
  const lessonRank = new Map(tdfIds.map((id, index) => [id, index]));
  const compare = (a: HistoryRecord, b: HistoryRecord): number => {
    const result = compareHistoryExportRecords(a, b);
    if (result && !Number.isNaN(result)) return result;
    // The original stable array sort concatenated each lesson's rows in scope order.
    return lessonRank.get(String(a.TDFId))! - lessonRank.get(String(b.TDFId))!;
  };
  async function* source(): AsyncGenerator<HistoryRecord> {
    for (let offset = 0; offset < tdfIds.length; offset += LESSON_IDS_PER_QUERY) {
      options.signal?.throwIfAborted();
      const lessonIds = tdfIds.slice(offset, offset + LESSON_IDS_PER_QUERY);
      const cursor = histories.find({ TDFId: { $in: lessonIds }, ...operationalHistorySelector() }, { projection: HISTORY_EXPORT_SOURCE_PROJECTION, batchSize: 500 });
      const closeOnAbort = () => { void cursor.close().catch(() => undefined); };
      options.signal?.addEventListener('abort', closeOnAbort, { once: true });
      try {
        for await (const row of cursor) {
          options.signal?.throwIfAborted();
          if (typeof row.TDFId !== 'string' || !lessonRank.has(row.TDFId)) throw new Error('History export source is outside the authorized lesson scope');
          yield row;
        }
      } finally {
        options.signal?.removeEventListener('abort', closeOnAbort);
        await cursor.close();
      }
    }
  }
  yield* boundedExternalSort(source(), compare, options);
}
