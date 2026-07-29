import { strict as assert } from 'node:assert';

import { backfillConditionTdfIds } from './backfill_condition_tdf_ids';

describe('backfillConditionTdfIds', function() {
  it('backfills unique same-package references and leaves ambiguous roots unchanged', async function() {
    const roots = [{
      _id: 'root-package',
      ownerId: 'owner-1',
      packageAssetId: 'package-1',
      content: { tdfs: { tutor: { setspec: { condition: ['child.json'] }, unit: [] } } },
    }, {
      _id: 'root-ambiguous',
      ownerId: 'owner-1',
      content: { tdfs: { tutor: { setspec: { condition: ['duplicate.json'] } } } },
    }];
    const candidates = [{
      _id: 'child-package',
      ownerId: 'owner-1',
      packageAssetId: 'package-1',
      content: { fileName: 'child.json' },
    }, {
      _id: 'duplicate-a',
      ownerId: 'owner-1',
      content: { fileName: 'duplicate.json' },
    }, {
      _id: 'duplicate-b',
      ownerId: 'owner-1',
      content: { fileName: 'duplicate.json' },
    }];
    const updates: any[] = [];
    let rootRead = false;
    let migrationState: any = null;

    const result = await backfillConditionTdfIds({
      Tdfs: {
        find(selector: any) {
          return {
            async fetchAsync() {
              if (selector?.['content.tdfs.tutor.setspec.condition.0']) {
                if (rootRead) return [];
                rootRead = true;
                return roots;
              }
              return candidates;
            },
          };
        },
        async updateAsync(selector: any, modifier: any) {
          updates.push({ selector, modifier });
          return 1;
        },
      },
      TdfMutationJobs: {
        async insertAsync() { return 'migration-job'; },
      },
      DynamicSettings: {
        async findOneAsync() {
          return migrationState;
        },
        async upsertAsync(_selector: any, modifier: any) {
          migrationState = { value: modifier.$set.value };
        },
      },
      serverConsole() {},
    });

    assert.equal(result.updated, 1);
    assert.equal(result.unresolved, 1);
    assert.ok(result.completedAt);
    assert.deepEqual(updates[0]?.modifier.$set['content.tdfs.tutor.setspec.conditionTdfIds'], ['child-package']);
    assert.deepEqual(updates[0]?.modifier.$unset, { 'content.tdfs.tutor.unit': '' });
    assert.equal(updates[1]?.modifier.$set.tdfIdentityState.status, 'repair-required');
    assert.equal(updates[1]?.modifier.$set.tdfIdentityState.migrationVersion, 2);
    assert.match(updates[1]?.modifier.$set.tdfIdentityState.reason, /unique canonical/);

    const updateCount = updates.length;
    const secondResult = await backfillConditionTdfIds({
      Tdfs: {
        find() { throw new Error('completed migration must not rescan roots'); },
        async updateAsync() { throw new Error('completed migration must not rewrite roots'); },
      },
      TdfMutationJobs: {
        async insertAsync() { throw new Error('completed migration must not add journals'); },
      },
      DynamicSettings: {
        async findOneAsync() { return migrationState; },
        async upsertAsync() { throw new Error('completed migration must not rewrite state'); },
      },
      serverConsole() {},
    });
    assert.deepEqual(secondResult, result);
    assert.equal(updates.length, updateCount);
  });
});
