/**
 * MoFaCTS Migration — Clean experiment state duplicates and add unique index.
 *
 * Previously, `cleanExperimentStateDupes` ran on every `getExperimentState` read.
 * This migration runs the cleanup once and enforces uniqueness going forward.
 *
 * Date: 2026-04-06
 */

import { GlobalExperimentStates } from '../../common/Collections';

const GlobalExperimentStatesAny = GlobalExperimentStates as any;

const serverConsole = (...args: any[]) => {
  console.log(new Date().toString(), ...args);
};

/**
 * For each (userId, TDFId) pair with multiple documents, keep the newest
 * (by lastActionTimeStamp then _id) and merge its state from older docs.
 * Then delete the older docs. Finally, create a unique index.
 */
export async function cleanExperimentStateDupesAndAddUniqueIndex() {
  // Skip if the unique index already exists (migration already ran)
  const existingIndexes = await GlobalExperimentStates.rawCollection().indexes();
  if (existingIndexes.some((idx: { name?: string }) => idx.name === 'unique_user_tdf')) {
    serverConsole('Experiment state unique index already exists, skipping dedup migration');
    return { success: true, duplicatesRemoved: 0, groupsProcessed: 0, skipped: true };
  }

  serverConsole('========================================');
  serverConsole('Starting Experiment State Dupe Cleanup');
  serverConsole('========================================');

  try {
    // Find all (userId, TDFId) groups with duplicates
    const dupeGroups: Array<{ _id: { userId: string; TDFId: string }; count: number; docIds: string[] }> =
      await GlobalExperimentStates.rawCollection().aggregate([
        { $group: {
          _id: { userId: '$userId', TDFId: '$TDFId' },
          count: { $sum: 1 },
          docIds: { $push: '$_id' }
        }},
        { $match: { count: { $gt: 1 } } }
      ]).toArray() as any;

    serverConsole('Found', dupeGroups.length, 'duplicate groups');

    let totalRemoved = 0;
    for (const group of dupeGroups) {
      const { userId, TDFId } = group._id;
      // Fetch all docs for this group
      const docs = await GlobalExperimentStatesAny.find(
        { userId, TDFId }
      ).fetchAsync() as Array<{
        _id: string;
        experimentState?: Record<string, unknown>;
      }>;

      // Sort: newest last (by lastActionTimeStamp, then _id)
      docs.sort((a, b) => {
        const tsA = Number((a.experimentState as any)?.lastActionTimeStamp) || 0;
        const tsB = Number((b.experimentState as any)?.lastActionTimeStamp) || 0;
        if (tsA !== tsB) return tsA - tsB;
        return String(a._id).localeCompare(String(b._id));
      });

      // Merge all states into the newest doc
      const newestDoc = docs[docs.length - 1];
      if (!newestDoc) continue;

      let mergedState: Record<string, unknown> = {};
      for (const doc of docs) {
        mergedState = Object.assign(mergedState, doc.experimentState || {});
      }

      // Update newest doc with merged state
      await GlobalExperimentStatesAny.updateAsync(
        { _id: newestDoc._id },
        { $set: { experimentState: mergedState } }
      );

      // Remove older docs
      const idsToRemove = docs.slice(0, -1).map((d) => d._id);
      if (idsToRemove.length > 0) {
        await GlobalExperimentStatesAny.removeAsync({ _id: { $in: idsToRemove } });
        totalRemoved += idsToRemove.length;
      }
    }

    serverConsole('Removed', totalRemoved, 'duplicate experiment state docs');

    // Drop the old non-unique index if it exists, then create unique one
    try {
      await GlobalExperimentStates.rawCollection().dropIndex('perf_user_tdf');
      serverConsole('Dropped old perf_user_tdf index');
    } catch (_e: unknown) {
      // Index may not exist — that's fine
    }

    await GlobalExperimentStates.rawCollection().createIndex(
      { userId: 1, TDFId: 1 },
      { name: 'unique_user_tdf', unique: true, background: true }
    );
    serverConsole('Created unique index: GlobalExperimentStates.unique_user_tdf');

    serverConsole('========================================');
    serverConsole('Experiment State Dupe Cleanup Complete');
    serverConsole('========================================');

    return { success: true, duplicatesRemoved: totalRemoved, groupsProcessed: dupeGroups.length };
  } catch (error) {
    serverConsole('Error in cleanExperimentStateDupesAndAddUniqueIndex:', error);
    throw error;
  }
}
