import { sameHistoryWrite } from './historyWriteIdentity';

export type HistorySourceCheckpoint = { sequence: number; repairRevision: number };
export type HistoryCommitState = HistorySourceCheckpoint & { _id: string };
export type HistoryCommitRow = Record<string, unknown> & { _id: string; userId: string };
export type CommittedHistoryRow = HistoryCommitRow & { historySequence: number };

export type HistoryCommitSession = {
  withTransaction(
    action: () => Promise<void>,
    options: { readConcern: { level: 'snapshot' }; writeConcern: { w: 'majority' } },
  ): Promise<unknown>;
  endSession(): Promise<void>;
};

type SessionOptions<TSession> = { session: TSession };
type HistoryCollection<TSession> = {
  find(selector: { _id: { $in: string[] } }, options: SessionOptions<TSession>): {
    toArray(): Promise<Record<string, unknown>[]>;
  };
  insertMany(rows: readonly CommittedHistoryRow[], options: SessionOptions<TSession>): Promise<unknown>;
};
type StateCollection<TSession> = {
  findOne(selector: { _id: string }, options?: { session?: TSession }): Promise<Record<string, unknown> | null>;
  updateOne(
    selector: { _id: string },
    modifier: { $inc: Partial<HistorySourceCheckpoint>; $setOnInsert: Partial<HistorySourceCheckpoint> },
    options: SessionOptions<TSession> & { upsert: true },
  ): Promise<unknown>;
};

export class HistoryCommitConflictError extends Error {
  constructor() {
    super('Conflicting history write. Reload before continuing.');
    this.name = 'HistoryCommitConflictError';
  }
}

export type HistoryCommitWriter = {
  insert(userId: string, rows: readonly HistoryCommitRow[]): Promise<readonly CommittedHistoryRow[]>;
};

function requireUserId(userId: string): void {
  if (typeof userId !== 'string' || !userId || userId !== userId.trim()) {
    throw new Error('History commits require a canonical user ID');
  }
}

function checkedIncrement(value: number, increment: number): number {
  const next = value + increment;
  if (!Number.isSafeInteger(next) || next < 0) throw new Error('History commit checkpoint exceeds its safe integer range');
  return next;
}

/**
 * History rows and their source checkpoint commit together. Updating the same
 * per-user source document serializes sequence allocation across transactions;
 * a reserved sequence is never exposed before its corresponding rows commit.
 */
export function createHistoryCommitStorage<TSession extends HistoryCommitSession>(deps: {
  histories: HistoryCollection<TSession>;
  states: StateCollection<TSession>;
  startSession: () => TSession;
  prepareInsert?: (userId: string, rows: readonly HistoryCommitRow[]) => Promise<void>;
  acceptInsert?: (userId: string, rows: readonly CommittedHistoryRow[], session: TSession) => Promise<void>;
}) {
  async function readSource(userId: string, session?: TSession): Promise<HistorySourceCheckpoint> {
    requireUserId(userId);
    const row = await deps.states.findOne({ _id: userId }, session ? { session } : undefined);
    // No state is the explicit genesis checkpoint for pre-sequence histories.
    // Old history remains unchanged and belongs to snapshot initialization.
    if (!row) return { sequence: 0, repairRevision: 0 };
    if (row._id !== userId || !Number.isSafeInteger(row.sequence) || Number(row.sequence) < 0
      || !Number.isSafeInteger(row.repairRevision) || Number(row.repairRevision) < 0) {
      throw new Error('Invalid committed history source checkpoint');
    }
    return { sequence: Number(row.sequence), repairRevision: Number(row.repairRevision) };
  }

  async function transaction<T>(work: (session: TSession) => Promise<T>): Promise<T> {
    let duplicateKeyRestarts = 0;
    while (true) {
      const session = deps.startSession();
      try {
        let result!: T;
        let completed = false;
        await session.withTransaction(async () => {
          completed = false;
          result = await work(session);
          completed = true;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        if (!completed) throw new Error('History transaction completed without executing its work');
        return result;
      } catch (error) {
        // A concurrent first-source upsert or stable row ID may win its unique
        // key race. One fresh snapshot resolves that committed identity through
        // the same checks; persistent duplicates and all other errors propagate.
        if ((error as { code?: number } | null)?.code !== 11000 || duplicateKeyRestarts > 0) throw error;
        duplicateKeyRestarts += 1;
      } finally {
        await session.endSession();
      }
    }
  }

  async function insert(userId: string, rows: readonly HistoryCommitRow[]): Promise<readonly CommittedHistoryRow[]> {
    requireUserId(userId);
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.userId !== userId || typeof row._id !== 'string' || !row._id || ids.has(row._id)) {
        throw new Error('History commits require unique row IDs and one authenticated user');
      }
      ids.add(row._id);
    }
    if (!rows.length) return [];
    await deps.prepareInsert?.(userId, rows);
    return await transaction(async (session) => {
      const saved = await deps.histories.find({ _id: { $in: [...ids] } }, { session }).toArray();
      const savedById = new Map(saved.map((row) => [row._id, row]));
      const pending: HistoryCommitRow[] = [];
      for (const row of rows) {
        const previous = savedById.get(row._id);
        if (previous) {
          if (!sameHistoryWrite(previous, row)) throw new HistoryCommitConflictError();
        } else {
          pending.push(row);
        }
      }
      if (!pending.length) return [];
      const source = await readSource(userId, session);
      const sequence = checkedIncrement(source.sequence, pending.length);
      await deps.states.updateOne({ _id: userId }, {
        $inc: { sequence: pending.length }, $setOnInsert: { repairRevision: 0 },
      }, { session, upsert: true });
      const committed = pending.map((row, index) => ({
        ...row, historySequence: sequence - pending.length + index + 1,
      }));
      await deps.acceptInsert?.(userId, committed, session);
      await deps.histories.insertMany(committed, { session });
      return committed;
    });
  }

  async function mutate<T>(userId: string, work: (session: TSession) => Promise<T>): Promise<{
    result: T;
    source: HistorySourceCheckpoint;
  }> {
    requireUserId(userId);
    return await transaction(async (session) => {
      const source = await readSource(userId, session);
      const repairRevision = checkedIncrement(source.repairRevision, 1);
      await deps.states.updateOne({ _id: userId }, {
        $inc: { repairRevision: 1 }, $setOnInsert: { sequence: 0 },
      }, { session, upsert: true });
      // Work may be retried by MongoDB and must use this session for all writes.
      const result = await work(session);
      return { result, source: { sequence: source.sequence, repairRevision } };
    });
  }

  async function withSnapshot<T>(userId: string, work: (source: HistorySourceCheckpoint, session: TSession) => Promise<T>): Promise<T> {
    requireUserId(userId);
    return await transaction(async (session) => await work(await readSource(userId, session), session));
  }

  return { readSource, insert, mutate, withSnapshot };
}
