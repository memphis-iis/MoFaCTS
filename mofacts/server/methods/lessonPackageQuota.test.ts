import { strict as assert } from 'node:assert';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { applyPackageUploadSideEffects } from '../lib/packageUploadSideEffects';
import { UPLOAD_READ_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';
import { Tdfs } from '../../common/Collections';

describe('lesson package daily allowance', function() {
  it('scopes upload filename and allowance reads to their signed-in owner', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed upload read methods');
    for (const verification of UPLOAD_READ_VERIFICATIONS) {
      const rows: typeof observed.surfaces = observed.surfaces.filter(row => row.name === verification.method);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.verification, verification);
      assert.deepEqual(rows[0]?.policy, { kind: 'upload-read', operation: 'self' });
    }
    const { DynamicAssets, UserUploadQuota } = globalThis as any;
    const { getUserAssetByName, getUploadQuotaStatus } = (Meteor as any).server.method_handlers;
    const owner = { userId: Random.id() }, other = { userId: Random.id() };
    const id = Random.id(), quotaId = Random.id(), name = id + '.zip';
    try {
      await DynamicAssets.collection.insertAsync({ _id: id, userId: owner.userId, name, fileName: name, meta: { private: true } });
      await UserUploadQuota.insertAsync({ _id: quotaId, userId: owner.userId, date: new Date().toISOString().slice(0, 10), uploadCount: 2 });
      await assert.rejects(getUserAssetByName.call({}, name), (e: any) => e.error === 401);
      await assert.rejects(getUploadQuotaStatus.call({}), (e: any) => e.error === 'not-authorized');
      assert.deepEqual(await getUserAssetByName.call(owner, name), { _id: id, name, fileName: name });
      assert.equal(await getUserAssetByName.call(other, name), null);
      assert.equal((await getUploadQuotaStatus.call(owner)).used, 2);
      assert.equal((await getUploadQuotaStatus.call(other)).used, 0);
    } finally {
      await UserUploadQuota.removeAsync(quotaId);
      await DynamicAssets.collection.removeAsync(id);
    }
  });

  it('admits authorized media at the package limit and still enforces its size and lesson checks', async function() {
    const { DynamicAssets, UserUploadQuota } = globalThis as any;
    const userId = Random.id();
    const tdfId = Random.id();
    const quotaId = Random.id();
    const date = new Date().toISOString().slice(0, 10);
    const start = (meta: Record<string, unknown>, size = 1024) =>
      DynamicAssets.onInitiateUpload.call({ userId }, { size, meta });
    const quota = () => (Meteor as any).server.method_handlers.getUploadQuotaStatus.call({ userId });
    const media = { uploadPurpose: 'content-media', tdfId, stimuliSetId: 17 };
    const archive = { uploadPurpose: 'package' };
    try {
      await Tdfs.insertAsync({ _id: tdfId, ownerId: userId, stimuliSetId: 17 } as any);
      await UserUploadQuota.insertAsync({ _id: quotaId, userId, date, uploadCount: 2 });
      assert.deepEqual(await Promise.all([start(archive), start(archive)]), [true, true]);
      const finish = () => applyPackageUploadSideEffects({
        context: { userId }, fileObj: { _id: Random.id(), path: '', size: 1024 },
        deps: { UserUploadQuota, AuditLog: { insertAsync: async () => {} }, serverConsole() {} } as any,
        state: { fileName: 'lesson.zip' } as any, emailToggle: false, isTeacherOrAdmin: false,
        results: ['one', 'two'].map(tdfId => ({ tdfId, result: true, errmsg: '', action: 'created' })),
      });
      await finish();
      assert.equal((await quota()).used, 3);
      await assert.rejects(() => start(archive), (e: any) => e.error === 'quota-exceeded');
      assert.equal(await start(media, 10 * 1024 * 1024), true);
      await assert.rejects(() => start(media, 10 * 1024 * 1024 + 1), (e: any) => e.error === 'file-too-large');
      await assert.rejects(() => start({ ...media, stimuliSetId: 18 }), (e: any) => e.error === 'invalid-upload-target');
      assert.equal((await quota()).remaining, 0);
      await finish();
      assert.equal((await quota()).used, 4);
      assert.equal((await quota()).remaining, 0);
    } finally {
      await UserUploadQuota.removeAsync(quotaId);
      await Tdfs.removeAsync(tdfId);
    }
  });
});
