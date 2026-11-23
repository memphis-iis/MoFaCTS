import { strict as assert } from 'node:assert';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { applyPackageUploadSideEffects } from '../lib/packageUploadSideEffects';
import { Tdfs } from '../../common/Collections';

describe('lesson package daily allowance', function() {
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
      assert.equal(await start(archive), true);
      await applyPackageUploadSideEffects({
        context: { userId }, fileObj: { _id: Random.id(), path: '', size: 1024 },
        deps: { UserUploadQuota, AuditLog: { insertAsync: async () => {} }, serverConsole() {} } as any,
        state: { fileName: 'lesson.zip' } as any, emailToggle: false, isTeacherOrAdmin: false,
        results: ['one', 'two'].map(tdfId => ({ tdfId, result: true, errmsg: '', action: 'created' })),
      });
      await assert.rejects(() => start(archive), (e: any) => e.error === 'quota-exceeded');
      assert.equal(await start(media, 10 * 1024 * 1024), true);
      await assert.rejects(() => start(media, 10 * 1024 * 1024 + 1), (e: any) => e.error === 'file-too-large');
      await assert.rejects(() => start({ ...media, stimuliSetId: 18 }), (e: any) => e.error === 'invalid-upload-target');
      assert.equal((await quota()).remaining, 0);
      assert.equal((await quota()).used, 3);
    } finally {
      await UserUploadQuota.removeAsync(quotaId);
      await Tdfs.removeAsync(tdfId);
    }
  });
});
