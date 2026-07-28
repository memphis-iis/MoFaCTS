import { strict as assert } from 'node:assert';

import { backfillConditionTdfIds } from './backfill_condition_tdf_ids';

describe('backfillConditionTdfIds', function() {
  it('backfills unique same-package references and leaves ambiguous roots unchanged', async function() {
    const roots = [{
      _id: 'root-package',
      ownerId: 'owner-1',
      packageAssetId: 'package-1',
      content: { tdfs: { tutor: { setspec: { condition: ['child.json'] } } } },
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
    assert.equal(result.ambiguousOrMissing, 1);
    assert.deepEqual(updates[0]?.modifier.$set['content.tdfs.tutor.setspec.conditionTdfIds'], ['child-package']);
    assert.deepEqual(result.affectedRootIds, ['root-package']);
  });
});
