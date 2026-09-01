import { expect } from 'chai';
import sinon from 'sinon';
import { purgeExpiredPublicDemoUsers } from './publicDemoCleanup';

function removable() {
  return { removeAsync: sinon.stub().resolves(1) };
}

describe('publicDemoCleanup', function() {
  it('removes all user-owned records, the temporary user, and only an aggregate audit event', async function() {
    const collections = {
      Histories: removable(), GlobalExperimentStates: removable(), SectionUserMap: removable(),
      UserTimesLog: removable(), UserMetrics: removable(), PasswordResetTokens: removable(),
      UserDashboardCache: removable(), UserUploadQuota: removable(),
      AuditLog: removable(),
    };
    const writeAuditLog = sinon.stub().resolves();
    const removeUser = sinon.stub().resolves(1);
    const deps = {
      ...collections,
      usersCollection: {
        find: () => ({ fetchAsync: async () => [{ _id: 'demo-user', username: 'DEMO-S-ABC' }] }),
        removeAsync: removeUser,
        rawCollection: () => ({ createIndex: async () => undefined }),
      },
      syncUsernameCaches: sinon.stub(),
      writeAuditLog,
      serverConsole: sinon.stub(),
    };

    expect(await purgeExpiredPublicDemoUsers(deps, new Date('2026-08-26T12:00:00Z'))).to.equal(1);
    expect(collections.Histories.removeAsync.calledWith({ userId: 'demo-user' })).to.equal(true);
    expect(collections.UserMetrics.removeAsync.calledWith({ _id: 'demo-user' })).to.equal(true);
    expect(collections.AuditLog.removeAsync.calledOnce).to.equal(true);
    expect(removeUser.calledWithMatch({ _id: 'demo-user', 'profile.createdBy': 'publicDemo' })).to.equal(true);
    expect(writeAuditLog.calledOnce).to.equal(true);
    const [, actorId, targetId, details] = writeAuditLog.firstCall.args;
    expect(actorId).to.equal(null);
    expect(targetId).to.equal(null);
    expect(details).to.include({ removed: 1, examined: 1 });
    expect(JSON.stringify(details)).not.to.contain('demo-user');
  });

  it('is idempotent when no expired users remain', async function() {
    const deps: any = {
      Histories: removable(), GlobalExperimentStates: removable(), SectionUserMap: removable(),
      UserTimesLog: removable(), UserMetrics: removable(), PasswordResetTokens: removable(),
      UserDashboardCache: removable(), UserUploadQuota: removable(),
      AuditLog: removable(),
      usersCollection: {
        find: () => ({ fetchAsync: async () => [] }),
        removeAsync: sinon.stub(),
        rawCollection: () => ({ createIndex: async () => undefined }),
      },
      syncUsernameCaches: sinon.stub(), writeAuditLog: sinon.stub(), serverConsole: sinon.stub(),
    };
    expect(await purgeExpiredPublicDemoUsers(deps)).to.equal(0);
    expect(deps.writeAuditLog.called).to.equal(false);
  });
});
