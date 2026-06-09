import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { readBackupConfig, validateBackupConfig } from './backupConfig';

describe('backup config', function() {
  it('uses the configured local backup path and exposes destination-neutral shape', function() {
    const config = readBackupConfig({
      openCore: {
        backups: {
          backend: 'local',
          localBackupPath: '/tmp/mofacts-backups',
          includeSettings: false,
          includeEnvironmentFile: false,
          includeKeyMaterial: false,
          includeLocalAssetFiles: true,
          maxRetainedBackups: 4,
          requirePreRestoreBackup: true,
        },
      },
    }, {});

    expect(config.destination).to.deep.equal({
      backend: 'local',
      path: path.resolve('/tmp/mofacts-backups'),
    });
    expect(config.includeSettings).to.equal(false);
    expect(config.includeLocalAssetFiles).to.equal(true);
    expect(config.maxRetainedBackups).to.equal(4);
  });

  it('excludes local asset files from in-app backups by default', function() {
    const config = readBackupConfig({
      openCore: {
        backups: {
          backend: 'local',
        },
      },
    }, {});

    expect(config.includeLocalAssetFiles).to.equal(false);
  });

  it('validates the writable local backup destination', async function() {
    const backupPath = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-backup-config-'));
    const checks = await validateBackupConfig({
      openCore: {
        backups: {
          enabled: true,
          backend: 'local',
          localBackupPath: backupPath,
        },
      },
    }, {});

    expect(checks).to.deep.include({
      name: 'backups.localDestination',
      status: 'pass',
      message: `${path.resolve(backupPath)} is readable and writable`,
    });
  });
});
