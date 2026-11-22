import { LESSON_PROVIDER_KEY_FIELDS } from '../../common/lessonProviderKeys';
import { MongoInternals } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { Tdfs } from '../../common/Collections';
import { createTdfOwnershipTransfer } from './tdfOwnershipTransfer';

const transferredFieldsToClear = {
  ...Object.fromEntries(LESSON_PROVIDER_KEY_FIELDS.map(field => [`content.tdfs.tutor.setspec.${field}`, '' as const])),
  packageFile: '' as const,
  packageAssetId: '' as const,
};

export const transferTdfOwnership = createTdfOwnershipTransfer({
  transaction: async work => {
    const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
    const tdfs = Tdfs.rawCollection();
    try {
      let result: Awaited<ReturnType<typeof work>>;
      await session.withTransaction(async () => {
        result = await work({
          tdfs: {
            find: (selector, options) => ({ fetchAsync: () => tdfs.find(selector, { projection: options?.fields, session }).toArray() }),
            findOneAsync: (selector, options) => tdfs.findOne(selector, { projection: options?.fields, session }),
          },
          userExists: async userId => Boolean(await Meteor.users.rawCollection().findOne({ _id: userId }, { projection: { _id: 1 }, session })),
          updateOwners: async (ids, currentOwnerId, newOwnerId) => {
            const updated = await tdfs.updateMany({ _id: { $in: ids }, ownerId: currentOwnerId }, {
              $set: { ownerId: newOwnerId }, $inc: { tdfRevision: 1 },
              ...(currentOwnerId === newOwnerId ? {} : { $unset: transferredFieldsToClear }),
            }, { session });
            return updated.matchedCount;
          },
        });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return result!;
    } finally {
      await session.endSession();
    }
  },
});
