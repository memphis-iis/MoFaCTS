import { strict as assert } from 'node:assert';
import { CONTENT_MAINTENANCE_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';

describe('Delete Selected media', () => {
  const assets = () => (globalThis as any).DynamicAssets;
  const remove = (owner: string, ids: string[]) =>
    (Meteor as any).server.method_handlers.removeMultipleAssets.call({ userId: owner }, ids);
  const owner = Random.id();
  let ids: string[] = [];

  async function add(userId = owner) {
    const id = Random.id();
    ids.push(id);
    await assets().collection.insertAsync({ _id: id, userId, name: 'synthetic.png', versions: {} });
    return id;
  }

  afterEach(async () => {
    await assets().collection.removeAsync({ _id: { $in: ids } });
    ids = [];
  });

  it('binds the installed media-removal and lesson-visibility handlers', () => {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw Error(observed.reason);
    for (const verification of CONTENT_MAINTENANCE_VERIFICATIONS) {
      const row: typeof observed.surfaces[number] | undefined = observed.surfaces.find(entry => entry.name === verification.method);
      assert.equal(row?.verification, verification);
      assert.deepEqual(row?.policy, { kind: 'content-maintenance',
        operation: verification.method === 'setTdfUserSelect' ? 'lesson-owner' : 'asset-owner-or-admin' });
    }
  });

  it('preserves every remaining file when the confirmed selection is stale', async () => {
    const first = await add();
    const second = await add();
    assert.deepEqual(await remove(owner, [first, Random.id(), second]), { deleted: 0, selectionChanged: true });
    assert.equal(await assets().collection.find({ _id: { $in: [first, second] } }).countAsync(), 2);
  });

  it('checks permissions for the entire selection before deleting anything', async () => {
    const first = await add();
    const other = await add(Random.id());
    await assert.rejects(() => remove(owner, [first, other]), (error: any) => error.error === 403);
    assert.equal(await assets().collection.find({ _id: { $in: [first, other] } }).countAsync(), 2);
  });

  it('counts each confirmed removal once and preserves unselected files', async () => {
    const first = await add();
    const second = await add();
    const unselected = await add();
    assert.deepEqual(await remove(owner, [first, second, first]), { deleted: 2 });
    assert.equal(await assets().collection.find({ _id: { $in: [first, second] } }).countAsync(), 0);
    assert.ok(await assets().collection.findOneAsync(unselected));
  });

  it('checks single-file identity before lookup and preserves a file whose owner changes', async () => {
    const id = await add();
    const other = Random.id();
    const store = assets();
    const single = (userId: string | null, assetId: string) =>
      (Meteor as any).server.method_handlers.removeAssetById.call({ userId }, assetId);
    await assert.rejects(() => single(null, Random.id()), (error: any) => error.error === 401);
    await assert.rejects(() => single(other, id), (error: any) => error.error === 403);
    const original = store.removeAsync.bind(store);
    const stub = sinon.stub(store, 'removeAsync').callsFake(async (selector: any) => {
      await store.collection.updateAsync(id, { $set: { userId: other } });
      return original(selector);
    });
    try {
      await assert.rejects(() => single(owner, id), (error: any) => error.error === 409);
      assert.equal((await store.collection.findOneAsync(id)).userId, other);
    } finally {
      stub.restore();
    }
    await single(other, id);
    assert.equal(await store.collection.findOneAsync(id), undefined);
  });

  for (const outcome of ['changed', 'failed']) {
    it('stops on a mid-delete ' + outcome + ' result and retains the confirmed count', async () => {
      const selection = [await add(), await add(), await add()];
      const store = assets();
      const original = store.removeAsync.bind(store);
      const removals: string[] = [];
      const stub = sinon.stub(store, 'removeAsync').callsFake(async (selector: any) => {
        assert.equal(selector.userId, owner);
        removals.push(selector._id);
        if (removals.length === 1) return original(selector);
        if (outcome === 'changed') return 0;
        throw new Error('Synthetic storage interruption');
      });
      try {
        const result = await remove(owner, selection);
        assert.deepEqual(result, outcome === 'changed'
          ? { deleted: 1, selectionChanged: true } : { deleted: 1, storageFailed: true });
        assert.equal(removals.length, 2);
        assert.equal(await store.collection.find({ _id: { $in: selection } }).countAsync(), 2);
      } finally {
        stub.restore();
      }
    });
  }

  it('reports zero if a record disappears between the library count and deletion', async () => {
    const library = { _debug() {}, find: () => ({
      countDocuments: async () => 1, forEachAsync: async () => {},
    }), collection: { removeAsync: async () => 0 } };
    assert.equal(await assets().removeAsync.call(library, { _id: Random.id() }), 0);
  });
});
