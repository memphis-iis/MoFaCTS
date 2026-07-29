import { strict as assert } from 'node:assert';

import { reconcileInterruptedTdfMutationJobs } from './tdfMutationRecovery';

function recoveryDeps(job: any, tdf: any) {
  const updates: any[] = [];
  const removedAssets: string[] = [];
  const restoredAssets: any[] = [];
  return {
    updates,
    removedAssets,
    restoredAssets,
    deps: {
      TdfMutationJobs: {
        find: () => ({ fetchAsync: async () => [job] }),
        async updateAsync(_selector: any, modifier: any) {
          updates.push(modifier);
          return 1;
        },
      },
      Tdfs: {
        async findOneAsync() { return tdf; },
        async updateAsync(selector: any, modifier: any) {
          updates.push({ selector, modifier });
          return 1;
        },
        async removeAsync() { return 1; },
      },
      DynamicAssets: {
        async removeAsync(selector: any) {
          if (selector._id) removedAssets.push(String(selector._id));
        },
        collection: {
          async updateAsync(selector: any, modifier: any) {
            restoredAssets.push({ selector, modifier });
            return 1;
          },
        },
      },
      serverConsole() {},
    },
  };
}

describe('TDF mutation recovery', function() {
  it('leaves an update untouched when the planned write never advanced its revision', async function() {
    const job = {
      _id: 'job-untouched',
      kind: 'package-upload',
      status: 'committing',
      operations: [{
        action: 'update',
        tdfId: 'tdf-a',
        targetRevision: 4,
        beforeImage: { content: { fileName: 'old.json' } },
      }],
    };
    const state = recoveryDeps(job, { _id: 'tdf-a', tdfRevision: 4 });

    const result = await reconcileInterruptedTdfMutationJobs(state.deps);

    assert.deepEqual(result, { scanned: 1, recovered: 1 });
    assert.equal(state.updates.some((entry) => entry.selector?._id === 'tdf-a'), false);
    assert.equal(state.updates.at(-1)?.$set?.status, 'rolled-back');
  });

  it('restores every package-owned TDF field and staged media after an applied write', async function() {
    const beforeImage = {
      tdfFileName: 'old.json',
      content: { fileName: 'old.json' },
      ownerId: 'owner-a',
      stimuliSetId: 7,
      rawStimuliFile: { old: true },
      stimuli: [{ old: true }],
      packageFile: 'old.zip',
      packageAssetId: 'old-asset',
      conditionCounts: [3],
      tdfAvailability: 'repair-required',
      tdfIdentityState: { status: 'repair-required' },
    };
    const job = {
      _id: 'job-applied',
      kind: 'package-upload',
      status: 'recovery-required',
      operations: [{ action: 'update', tdfId: 'tdf-a', targetRevision: 4, beforeImage }],
      mediaMutations: [{
        newAssetId: 'new-media',
        previousAssets: [{ _id: 'old-media', name: 'photo.png', fileName: 'photo.png', meta: { stimuliSetId: 7 } }],
      }],
    };
    const state = recoveryDeps(job, { _id: 'tdf-a', tdfRevision: 5 });

    const result = await reconcileInterruptedTdfMutationJobs(state.deps);

    assert.deepEqual(result, { scanned: 1, recovered: 1 });
    assert.deepEqual(state.removedAssets, ['new-media']);
    assert.deepEqual(state.restoredAssets[0], {
      selector: { _id: 'old-media' },
      modifier: { $set: { name: 'photo.png', fileName: 'photo.png', meta: { stimuliSetId: 7 } } },
    });
    const tdfRestore = state.updates.find((entry) => entry.selector?._id === 'tdf-a');
    assert.deepEqual(tdfRestore.selector, { _id: 'tdf-a', tdfRevision: 5 });
    assert.deepEqual(tdfRestore.modifier.$set, { tdfRevision: 4, ...beforeImage });
  });
});
