import { HistoryCommitConflictError, type HistoryCommitRow, type HistoryCommitWriter } from './historyCommitStorage';

/** SPARC shares the history commit owner; its existing IDs still arbitrate retries. */
export async function insertSparcHistoryBatch(storage: HistoryCommitWriter, records: readonly HistoryCommitRow[]) {
  const userId = records[0]?.userId;
  if (!userId) throw new Error('SPARC assessment history requires an authenticated user');
  try {
    return await storage.insert(userId, records);
  } catch (error) {
    if (error instanceof HistoryCommitConflictError) {
      throw new Error('Conflicting SPARC assessment history. Reload before continuing.');
    }
    throw error;
  }
}
