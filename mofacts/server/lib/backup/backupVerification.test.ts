import { expect } from 'chai';
import { createTarGzArchive } from './tarArchive';
import { createBackupManifest, sha256Hex } from './backupManifest';
import { verifyBackupArchive } from './backupVerification';

describe('backup archive verification', function() {
  it('passes for an archive with a valid manifest and checksums', async function() {
    const databaseBody = Buffer.from('{"collections":[]}\n', 'utf8');
    const manifest = createBackupManifest({
      createdAt: new Date('2026-06-07T00:00:00.000Z'),
      createdByUserId: 'admin-user',
      mongoDatabaseName: 'MoFACT-meteor3',
      storageBackend: 'local',
      entries: [{ name: 'mongo/database.json', body: databaseBody }],
      includedComponents: [],
      excludedComponents: [],
      warnings: [],
    });
    const archive = await createTarGzArchive([
      { name: 'manifest.json', body: Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8') },
      { name: 'mongo/database.json', body: databaseBody },
    ]);

    const result = await verifyBackupArchive(archive);

    expect(result.ok).to.equal(true);
    expect(result.checks.map((check) => check.name)).to.include.members([
      'archive.read',
      'manifest.present',
      'checksum.mongo/database.json',
      'mongo.dump',
    ]);
  });

  it('fails when an included file checksum does not match the manifest', async function() {
    const databaseBody = Buffer.from('{"collections":[]}\n', 'utf8');
    const manifest = createBackupManifest({
      createdAt: new Date('2026-06-07T00:00:00.000Z'),
      createdByUserId: 'admin-user',
      mongoDatabaseName: 'MoFACT-meteor3',
      storageBackend: 'local',
      entries: [{ name: 'mongo/database.json', body: databaseBody }],
      includedComponents: [],
      excludedComponents: [],
      warnings: [],
    });
    manifest.checksums['mongo/database.json'] = sha256Hex(Buffer.from('different', 'utf8'));
    const archive = await createTarGzArchive([
      { name: 'manifest.json', body: Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8') },
      { name: 'mongo/database.json', body: databaseBody },
    ]);

    const result = await verifyBackupArchive(archive);

    expect(result.ok).to.equal(false);
    expect(result.checks).to.deep.include({
      name: 'checksum.mongo/database.json',
      status: 'fail',
      message: 'checksum mismatch',
    });
  });
});
