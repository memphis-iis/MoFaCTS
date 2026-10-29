import { strict as assert } from 'node:assert';
import { assertUnchangedOwnedHistoryScope, resolveOwnedHistoryDownloadScope } from './ownedHistoryDownloadScope';
import { createOwnedHistoryDownloadToken, consumeOwnedHistoryDownloadToken } from './ownedHistoryDownloadTokens';

describe('owned history download scope and capabilities', () => {
  function fixture() {
    const rows: any[] = [
      { _id: 'root', ownerId: 'synthetic-owner', content: { fileName: 'root.json', tdfs: { tutor: { setspec: { lessonname: 'Synthetic lesson', condition: ['one.json', 'two.json'], conditionTdfIds: ['one', 'two'] } } } } },
      { _id: 'one', ownerId: 'synthetic-owner', content: { fileName: 'one.json', tdfs: { tutor: { setspec: {}, unit: [{ type: 'model' }] } } } },
      { _id: 'two', ownerId: 'synthetic-owner', content: { fileName: 'two.json', tdfs: { tutor: { setspec: {}, unit: [{ type: 'sparc' }] } } } },
    ];
    const reads: Array<{ selector: Record<string, any>; options?: Record<string, unknown> }> = [];
    const Tdfs = {
      find: (selector: Record<string, any>, options?: Record<string, unknown>) => {
        reads.push({ selector, ...(options ? { options } : {}) });
        return { fetchAsync: async () => rows.filter(row => row.ownerId === selector.ownerId && (!selector._id || selector._id.$in.includes(row._id))) };
      },
      findOneAsync: async (selector: Record<string, any>, options?: Record<string, unknown>) => {
        reads.push({ selector, ...(options ? { options } : {}) });
        return rows.find(row => row._id === selector._id) ?? null;
      },
    };
    return { rows, reads, deps: { Tdfs } };
  }

  it('limits all-owned reads to IDs and rejects manufactured identities', async () => {
    const f = fixture();
    const result = await resolveOwnedHistoryDownloadScope(f.deps, 'synthetic-owner', { kind: 'owned-lessons' });
    assert.deepEqual(result.tdfIds, ['root', 'one', 'two']);
    assert.deepEqual(f.reads, [{ selector: { ownerId: 'synthetic-owner' }, options: { fields: { _id: 1 } } }]);
    f.rows.push({ _id: undefined, ownerId: 'synthetic-owner' });
    await assert.rejects(resolveOwnedHistoryDownloadScope(f.deps, 'synthetic-owner', { kind: 'owned-lessons' }), /identity repair/);
  });

  it('requires current root and condition ownership and exact canonical filename/ID alignment', async () => {
    const f = fixture();
    const request = { kind: 'lesson', tdfId: 'root', includeConditions: true } as const;
    const scope = await resolveOwnedHistoryDownloadScope(f.deps, 'synthetic-owner', request);
    assert.deepEqual(scope, { tdfIds: ['root', 'one', 'two'], lessonName: 'Synthetic lesson' });
    assert.ok((f.reads[0]!.options!.fields as Record<string, unknown>)['content.tdfs.tutor.unit.type']);
    await assert.rejects(resolveOwnedHistoryDownloadScope(f.deps, 'synthetic-other', request), /Not authorized/);
    f.rows[1]!.ownerId = 'synthetic-other';
    await assert.rejects(resolveOwnedHistoryDownloadScope(f.deps, 'synthetic-owner', request), /identity repair/);
    f.rows[1]!.ownerId = 'synthetic-owner';
    f.rows[1]!.content.fileName = 'wrong.json';
    await assert.rejects(resolveOwnedHistoryDownloadScope(f.deps, 'synthetic-owner', request), /identity repair/);
  });

  it('preserves single-lesson scope and detects changed sets before an issued capability is used', async () => {
    const f = fixture();
    assert.deepEqual((await resolveOwnedHistoryDownloadScope(f.deps, 'synthetic-owner', { kind: 'lesson', tdfId: 'root', includeConditions: false })).tdfIds, ['root']);
    assert.deepEqual((await resolveOwnedHistoryDownloadScope(f.deps, 'synthetic-owner', { kind: 'lesson', tdfId: 'one', includeConditions: true })).tdfIds, ['one']);
    assert.doesNotThrow(() => assertUnchangedOwnedHistoryScope(['root', 'one'], ['one', 'root']));
    assert.throws(() => assertUnchangedOwnedHistoryScope(['root', 'one'], ['root']), /scope changed/);
    assert.throws(() => assertUnchangedOwnedHistoryScope(['root'], ['root', 'one']), /scope changed/);
  });

  it('issues scoped immutable expiring one-use capabilities', () => {
    const ids = ['root'];
    const request = { kind: 'lesson', tdfId: 'root', includeConditions: false } as const;
    const issued = createOwnedHistoryDownloadToken('synthetic-owner', request, ids, 'synthetic-data.tsv');
    ids.push('unissued');
    const token = decodeURIComponent(issued.url.split('/')[3]!);
    const record = consumeOwnedHistoryDownloadToken(token);
    assert.deepEqual(record?.tdfIds, ['root']);
    assert.equal(record?.actorId, 'synthetic-owner');
    assert.equal(record?.fileName, 'synthetic-data.tsv');
    assert.equal(consumeOwnedHistoryDownloadToken(token), null);
    assert.equal(consumeOwnedHistoryDownloadToken('invalid-synthetic-token'), null);
    assert.ok(issued.expiresAt > Date.now());
    const expired = createOwnedHistoryDownloadToken('synthetic-owner', request, ids, 'synthetic-expired.tsv');
    const now = Date.now;
    try {
      Date.now = () => expired.expiresAt;
      assert.equal(consumeOwnedHistoryDownloadToken(decodeURIComponent(expired.url.split('/')[3]!)), null);
    } finally { Date.now = now; }
  });
});
