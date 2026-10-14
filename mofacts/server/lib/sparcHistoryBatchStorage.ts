import { sameHistoryWrite } from './historyWriteIdentity';

type Row = Record<string, unknown> & { _id: string };
type Session = {
  withTransaction(action: () => Promise<void>, options: { readConcern: { level: 'snapshot' }; writeConcern: { w: 'majority' } }): Promise<unknown>;
  endSession(): Promise<void>;
};
type Collection<TSession> = {
  find(selector: { _id: { $in: string[] } }, options: { session: TSession }): { toArray(): Promise<Record<string, unknown>[]> };
  insertMany(rows: readonly Row[], options: { session: TSession }): Promise<unknown>;
};

/** The existing history IDs arbitrate retries; the Mongo transaction prevents partial assessments. */
export async function insertSparcHistoryBatch<TSession extends Session>(collection: Collection<TSession>, records: readonly Row[], startSession: () => TSession): Promise<readonly Row[]> {
  const session = startSession();
  try {
    let inserted: Row[] = [];
    await session.withTransaction(async () => {
      inserted = [];
      const existingRows = await collection.find({ _id: { $in: records.map(row => row._id) } }, { session }).toArray();
      const byId = new Map(existingRows.map(row => [row._id, row]));
      for (const row of records) {
        const existing = byId.get(row._id);
        if (existing) {
          if (!sameHistoryWrite(existing, row)) throw new Error('Conflicting SPARC assessment history. Reload before continuing.');
        } else {
          inserted.push(row);
        }
      }
      if (inserted.length) await collection.insertMany(inserted, { session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return inserted;
  } finally { await session.endSession(); }
}
