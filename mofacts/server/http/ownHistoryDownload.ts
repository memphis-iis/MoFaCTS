import { operationalHistorySelector } from '../../common/historyEnvelope';
import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { HTTP_FILE_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';
import { registerProtocolHttpMount } from '../securitySurfaces/registerHttpRoutes.ts';
import { Histories } from '../../common/Collections';
import { consumeOwnHistoryDownloadToken } from '../lib/ownHistoryDownloadTokens';
import { createOwnHistoryDownloadHandler } from '../lib/ownHistoryDownloadHandler';
import { writeExperimentExportFromHistoryIterable } from '../experiment_times';

const HISTORY_EXPORT_BATCH_SIZE = 500;

registerProtocolHttpMount(WebApp, 'connectHandlers', '/data-download/own-history', {
  surfaceId: 'middleware:own-history-download',
  policy: Object.freeze({ kind: 'single-use-capability', issuerAuthorization: 'bound-user-exists' }),
  dataEgress: Object.freeze({ kind: 'learner-history' }),
  verification: HTTP_FILE_VERIFICATIONS.history,
}, createOwnHistoryDownloadHandler({
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
