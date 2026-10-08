import { MongoInternals } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { Tdfs, GlobalExperimentStates } from '../../common/Collections';
import { createConditionStateWriter } from './conditionAllocation';

// Use the same Mongo client as these Meteor collections; a separate connection
// cannot own their transaction sessions. The supported runtime requires a replica set.
export const writeConditionState = createConditionStateWriter({
  tdfs: Tdfs.rawCollection(),
  states: GlobalExperimentStates.rawCollection(),
  newId: () => Random.id(),
  transaction: async work => {
    const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
    try {
      let result: Awaited<ReturnType<typeof work>>;
      await session.withTransaction(async () => {
        result = await work(session);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return result!;
    } finally {
      await session.endSession();
    }
  },
});
