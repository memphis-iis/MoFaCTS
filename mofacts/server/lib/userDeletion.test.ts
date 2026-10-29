import { expect } from 'chai';
import sinon from 'sinon';
import { removeUserOwnedData } from './userDeletion';

describe('user-owned data removal', function() {
  it('removes durable history source metadata with the account data, using its canonical document ID', async function() {
    const removable = () => ({ removeAsync: sinon.stub().resolves(1) });
    const collections = {
      Histories: removable(), GlobalExperimentStates: removable(), SectionUserMap: removable(),
      UserTimesLog: removable(), UserMetrics: removable(), PasswordResetTokens: removable(),
      UserDashboardCache: removable(), HistoryCommitState: removable(), UserUploadQuota: removable(),
    };

    await removeUserOwnedData(collections, 'removed-user');

    expect(collections.Histories.removeAsync.calledOnceWithExactly({ userId: 'removed-user' })).to.equal(true);
    expect(collections.UserDashboardCache.removeAsync.calledOnceWithExactly({ userId: 'removed-user' })).to.equal(true);
    expect(collections.HistoryCommitState.removeAsync.calledOnceWithExactly({ _id: 'removed-user' })).to.equal(true);
  });
});
