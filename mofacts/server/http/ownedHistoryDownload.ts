import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { HTTP_FILE_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';
import { registerProtocolHttpMount } from '../securitySurfaces/registerHttpRoutes.ts';
import { Histories, Tdfs } from '../../common/Collections';
import { createOwnedHistoryDownloadHandler } from '../lib/ownedHistoryDownloadHandler';
import { consumeOwnedHistoryDownloadToken } from '../lib/ownedHistoryDownloadTokens';
import { assertUnchangedOwnedHistoryScope, resolveOwnedHistoryDownloadScope } from '../lib/ownedHistoryDownloadScope';
import { sortedOwnedHistoryRecords } from '../lib/sortedHistoryExport';
import type { HistoryExportCollection } from '../lib/sortedHistoryExport';
import { writeHistoryExport } from '../lib/historyExport';
import { ProlificParticipations } from '../lib/prolificCollections';
import { serverConsole } from '../serverComposition';

registerProtocolHttpMount(WebApp, 'connectHandlers', '/data-download/owned-history', {
  surfaceId: 'middleware:owned-history-download',
  policy: Object.freeze({ kind: 'single-use-capability', issuerAuthorization: 'current-lesson-owner' }),
  dataEgress: Object.freeze({ kind: 'learner-history' }),
  verification: HTTP_FILE_VERIFICATIONS.ownedHistory,
}, createOwnedHistoryDownloadHandler({
  consumeToken: consumeOwnedHistoryDownloadToken,
  reauthorize: async record => {
    if (!await Meteor.users.findOneAsync({ _id: record.actorId }, { fields: { _id: 1 } })) throw new Meteor.Error(404, 'User not found');
    const current = await resolveOwnedHistoryDownloadScope({ Tdfs }, record.actorId, record.request);
    assertUnchangedOwnedHistoryScope(record.tdfIds, current.tdfIds);
  },
  openHistory: (record, signal) => sortedOwnedHistoryRecords(Histories.rawCollection() as unknown as HistoryExportCollection, record.tdfIds, { signal }),
  writeHistory: async (histories, write) => {
    let skipped = 0;
    await writeHistoryExport(histories, write, () => { skipped += 1; }, async userIds =>
      ProlificParticipations.find({ userId: { $in: userIds } }, { fields: { userId: 1, participantId: 1, studyId: 1, submissionId: 1 } }).fetchAsync());
    if (skipped) serverConsole('Owned history export skipped malformed records', { count: skipped });
  },
}));
