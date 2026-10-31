import { operationalHistorySelector } from '../../common/historyEnvelope';
import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { Histories } from '../../common/Collections';
import { consumeOwnHistoryDownloadToken } from '../lib/ownHistoryDownloadTokens';
import { createOwnHistoryDownloadHandler } from '../lib/ownHistoryDownloadHandler';
import { writeExperimentExportFromHistoryIterable } from '../experiment_times';

const HISTORY_EXPORT_BATCH_SIZE = 500;

WebApp.connectHandlers.use('/data-download/own-history', createOwnHistoryDownloadHandler({
  consumeToken: consumeOwnHistoryDownloadToken,
  userExists: async userId => Boolean(await Meteor.users.findOneAsync(
    { _id: userId }, { fields: { _id: 1 } },
  )),
  hasHistory: async userId => Boolean(await Histories.findOneAsync(
    { userId, ...operationalHistorySelector() }, { fields: { _id: 1 } },
  )),
  openHistory: record => Histories.rawCollection()
    .find(
      { userId: record.userId, ...operationalHistorySelector() },
      { sort: { recordedServerTime: 1, time: 1, eventId: 1 } },
    )
    .batchSize(HISTORY_EXPORT_BATCH_SIZE),
  writeHistory: writeExperimentExportFromHistoryIterable,
}));
