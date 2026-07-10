import { expect } from 'chai';
import {
  backupSnapshotIsEmpty,
  getBackupLoadPresentation,
  normalizeBackupSnapshot,
  type BackupSnapshot,
} from './adminBackupsState';

describe('Admin Backups load state', function() {
  it('classifies a successful zero-job snapshot as empty', function() {
    const snapshot = normalizeBackupSnapshot({ enabled: true }, []);

    expect(backupSnapshotIsEmpty(snapshot)).to.equal(true);
    expect(snapshot.config).to.deep.equal({ enabled: true });
  });

  it('keeps a successful populated snapshot ready', function() {
    const snapshot = normalizeBackupSnapshot(
      { enabled: true },
      [{ _id: 'job-1', status: 'complete' }],
    );

    expect(backupSnapshotIsEmpty(snapshot)).to.equal(false);
    expect(snapshot.jobs).to.have.length(1);
  });

  it('rejects invalid config and history results explicitly', function() {
    expect(() => normalizeBackupSnapshot(null, [])).to.throw('configuration');
    expect(() => normalizeBackupSnapshot({}, null)).to.throw('history');
    expect(() => normalizeBackupSnapshot({}, [null])).to.throw('history');
  });

  it('maps every load and refresh state to one explicit presentation', function() {
    const value: BackupSnapshot = {
      config: { enabled: true },
      jobs: [{ _id: 'job-1' }],
    };
    expect(getBackupLoadPresentation({ status: 'loading', requestId: 1 })).to.include({
      busy: true,
      showLoading: true,
      showRows: false,
    });
    expect(getBackupLoadPresentation({ status: 'empty', value: { ...value, jobs: [] } })).to.include({
      busy: false,
      showEmpty: true,
      showRows: false,
    });
    expect(getBackupLoadPresentation({ status: 'ready', value })).to.include({
      busy: false,
      showRows: true,
      showRefreshing: false,
    });
    expect(getBackupLoadPresentation({ status: 'refreshing', value, requestId: 2 })).to.include({
      busy: true,
      showRows: true,
      showRefreshing: true,
    });
    expect(getBackupLoadPresentation({
      status: 'refresh-error',
      value,
      message: 'Refresh failed',
      retryable: true,
    })).to.include({
      busy: false,
      showRows: true,
      showRefreshError: true,
      message: 'Refresh failed',
    });
    expect(getBackupLoadPresentation({
      status: 'error',
      message: 'Initial load failed',
      retryable: true,
    })).to.include({
      busy: false,
      showError: true,
      showRows: false,
      message: 'Initial load failed',
    });
  });
});
