type RecordData = Record<string, any>;

export type ConditionAllocationBlock = {
  maximum: number;
  eligibleIds: string[];
  order: string[];
  cursor: number;
};

/** One shuffled permutation of the currently eligible canonical condition IDs. */
export function nextConditionAllocation(
  ids: string[], counts: number[], saved: ConditionAllocationBlock | undefined,
  random: () => number = Math.random,
) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id.trim())
    || new Set(ids).size !== ids.length || !Array.isArray(counts) || counts.length !== ids.length
    || counts.some(count => !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('Condition allocation requires distinct canonical IDs and matching nonnegative integer counts');
  }
  const maximum = Math.max(...counts);
  const belowMaximum = ids.filter((_, index) => counts[index]! < maximum);
  const eligibleIds = (belowMaximum.length ? belowMaximum : ids).slice().sort();
  if (saved && (!Array.isArray(saved.eligibleIds) || !Array.isArray(saved.order)
    || !Number.isSafeInteger(saved.maximum) || saved.maximum < 0
    || !Number.isInteger(saved.cursor) || saved.cursor < 0 || saved.cursor > saved.order.length
    || !saved.order.length || new Set(saved.order).size !== saved.order.length
    || saved.order.length !== saved.eligibleIds.length
    || saved.order.slice().sort().join('\0') !== saved.eligibleIds.slice().sort().join('\0'))) {
    throw new Error('Stored condition allocation block is invalid');
  }
  const rebuild = !saved || saved.maximum !== maximum
    || JSON.stringify(saved.eligibleIds) !== JSON.stringify(eligibleIds)
    || saved.cursor === saved.order.length;
  let block: ConditionAllocationBlock;
  if (rebuild) {
    const order = eligibleIds.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid allocation random value');
      const j = Math.floor(value * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    block = { maximum, eligibleIds, order, cursor: 0 };
  } else {
    block = { ...saved!, order: saved!.order.slice(), eligibleIds: saved!.eligibleIds.slice() };
  }
  const conditionTdfId = block.order[block.cursor]!;
  block.cursor += 1;
  return { conditionTdfId, block };
}

type RawCollection = {
  findOne: (selector: RecordData, options: RecordData) => Promise<RecordData | null>;
  updateOne: (selector: RecordData, modifier: RecordData, options: RecordData) => Promise<{ matchedCount: number }>;
  insertOne: (document: RecordData, options: RecordData) => Promise<unknown>;
};
export type ConditionStateWrite = {
  userId: string;
  rootTdfId: string;
  state: RecordData;
  replaceExistingState?: boolean;
  allocateCondition?: boolean;
};
export type ConditionAllocationDeps = {
  tdfs: RawCollection;
  states: RawCollection;
  transaction: <T>(work: (session: unknown) => Promise<T>) => Promise<T>;
  newId: () => string;
  random?: () => number;
};

/** Authentication/root access is enforced by the calling experiment-state method.
 * Mongo owns atomicity across the root's block/counts and the participant's state.
 * Other assignment modes are explicitly left to their existing runtime path.
 */
export function createConditionStateWriter(deps: ConditionAllocationDeps) {
  return async (write: ConditionStateWrite): Promise<RecordData | null> => deps.transaction(async session => {
    const options = { session };
    const root = await deps.tdfs.findOne({ _id: write.rootTdfId }, {
      ...options, projection: { ownerId: 1, tdfAvailability: 1, conditionCounts: 1, conditionAllocation: 1,
        'content.tdfs.tutor.setspec': 1 },
    });
    if (!root) throw new Error('Condition assignment root does not exist');
    const spec = root.content?.tdfs?.tutor?.setspec;
    if (spec?.loadbalancing !== 'not-max') {
      if (write.allocateCondition) throw new Error('Block allocation requires loadbalancing not-max');
      return null;
    }
    if (root.tdfAvailability === 'repair-required') throw new Error('Condition root requires identity repair');
    const ids: string[] = spec.conditionTdfIds;
    if (!Array.isArray(spec.condition) || !Array.isArray(ids) || spec.condition.length !== ids.length) {
      throw new Error('Condition assignment requires a complete canonical condition mapping');
    }
    const selector = { userId: write.userId, TDFId: write.rootTdfId };
    const previous = await deps.states.findOne(selector, options);
    const previousState = previous?.experimentState || {};
    const assigned = previousState.conditionTdfId;
    const requested = write.state.conditionTdfId;
    const ownerPreview = root.ownerId === write.userId;
    if (assigned && !ids.includes(assigned)) throw new Error('Saved condition no longer belongs to this root');
    if (requested && (!ids.includes(requested) || (!ownerPreview && requested !== assigned))) {
      throw new Error('Participant condition must be assigned by the server and cannot be changed');
    }
    let conditionTdfId = ownerPreview && requested ? requested : assigned;
    // A replay must return the saved state without replacing newer progress or consuming a slot.
    if (write.allocateCondition && assigned) return { ...previousState, id: previous!._id };
    if (write.allocateCondition && !conditionTdfId) {
      const next = nextConditionAllocation(ids, root.conditionCounts, root.conditionAllocation, deps.random);
      conditionTdfId = next.conditionTdfId;
      const child = await deps.tdfs.findOne({ _id: conditionTdfId }, { ...options, projection: { _id: 1, tdfAvailability: 1 } });
      if (!child || child.tdfAvailability === 'repair-required') throw new Error('Selected condition is unavailable');
      const modifier: RecordData = { $set: { conditionAllocation: next.block }, $inc: { tdfRevision: 1 } };
      if (spec.countcompletion === 'beginning' && !ownerPreview) {
        modifier.$inc[`conditionCounts.${ids.indexOf(conditionTdfId)}`] = 1;
      }
      // Write the shared root before inserting a new participant state: concurrent allocators
      // conflict here and the Mongo transaction retries against the committed cursor/counts.
      const result = await deps.tdfs.updateOne({ _id: write.rootTdfId }, modifier, options);
      if (result.matchedCount !== 1) throw new Error('Condition allocation root disappeared');
    }
    const state = { ...(write.replaceExistingState ? {} : previousState), ...write.state };
    if (conditionTdfId) {
      state.conditionTdfId = conditionTdfId;
      state.currentRootTdfId = write.rootTdfId;
      state.currentTdfId = conditionTdfId;
    }
    delete state.id;
    const id = previous?._id || deps.newId();
    if (previous) {
      const result = await deps.states.updateOne({ _id: id, ...selector }, { $set: { experimentState: state } }, options);
      if (result.matchedCount !== 1) throw new Error('Condition assignment state disappeared');
    } else {
      await deps.states.insertOne({ _id: id, ...selector, experimentState: state }, options);
    }
    return { ...state, id };
  });
}
