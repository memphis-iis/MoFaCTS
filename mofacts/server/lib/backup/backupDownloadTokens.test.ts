import { expect } from 'chai';
import { consumeBackupDownloadToken, issueBackupDownloadToken } from './backupDownloadTokens';

describe('backup download tokens', function() {
  it('issues one-use tokens for backup archive downloads', function() {
    const issued = issueBackupDownloadToken({
      backupJobId: 'backup-job',
      archiveFileName: 'mofacts-backup-20260607-010203-token.tar.gz',
      createdByUserId: 'admin-user',
      now: new Date('2026-06-07T00:00:00.000Z'),
    });

    const firstUse = consumeBackupDownloadToken(issued.token, new Date('2026-06-07T00:01:00.000Z'));
    const secondUse = consumeBackupDownloadToken(issued.token, new Date('2026-06-07T00:01:01.000Z'));

    expect(firstUse?.backupJobId).to.equal('backup-job');
    expect(firstUse?.archiveFileName).to.equal('mofacts-backup-20260607-010203-token.tar.gz');
    expect(secondUse).to.equal(null);
  });

  it('rejects expired tokens', function() {
    const issued = issueBackupDownloadToken({
      backupJobId: 'backup-job',
      archiveFileName: 'mofacts-backup-20260607-010203-expired.tar.gz',
      createdByUserId: 'admin-user',
      now: new Date('2026-06-07T00:00:00.000Z'),
    });

    const consumed = consumeBackupDownloadToken(issued.token, new Date('2026-06-07T00:06:00.000Z'));

    expect(consumed).to.equal(null);
  });
});
