import { Mongo, MongoInternals } from 'meteor/mongo';
import { Histories } from '../../common/Collections';
import { collectionMongoName } from '../../common/collectionOwnership';
import { createHistoryCommitStorage } from './historyCommitStorage';
import { getSparcContentUseStorage } from './sparcContentUseMongo';

// Source metadata is independent of the disposable dashboard cache.
export const HistoryCommitState = new Mongo.Collection(collectionMongoName('HistoryCommitState'));

export const historyCommitStorage = createHistoryCommitStorage({
  histories: Histories.rawCollection() as any,
  states: HistoryCommitState.rawCollection() as any,
  startSession: () => MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession(),
  prepareInsert: (userId, rows) => getSparcContentUseStorage().preparePresentations(userId, rows),
  acceptInsert: (userId, rows, session) => getSparcContentUseStorage().acceptPresentations(userId, rows, session),
});
