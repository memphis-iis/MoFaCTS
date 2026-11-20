import type { ClientSession } from 'mongodb';
import { MongoInternals } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { Tdfs } from '../../common/Collections';

export async function withLessonSharingTransaction(
  work: (storage: ReturnType<typeof sharingStorage>) => Promise<void>
) {
  const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
  try {
    await session.withTransaction(() => work(sharingStorage(session)), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } finally {
    await session.endSession();
  }
}

function sharingStorage(session: ClientSession) {
  const lessons = Tdfs.rawCollection();
  const users = Meteor.users.rawCollection();
  return {
    findLesson: (id: string) => lessons.findOne({ _id: id }, { session }),
    findChild: (id: string) => lessons.findOne({ _id: id }, { projection: { ownerId: 1, accessors: 1 }, session }),
    setAccessors: (id: string, accessors: Array<{ userId: string; username: string }>) =>
      lessons.updateOne({ _id: id }, { $set: { accessors }, $inc: { tdfRevision: 1 } }, { session }),
    grant: (id: string, userIds: string[]) =>
      users.updateMany({ _id: { $in: userIds } }, { $addToSet: { accessedTDFs: id } }, { session }),
    revoke: (id: string, userIds: string[]) =>
      users.updateMany({ _id: { $in: userIds } }, { $pull: { accessedTDFs: id } }, { session }),
  };
}
