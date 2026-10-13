import { strict as assert } from 'node:assert';
import { createSparcFigureVersionStore, SparcFigureVersions, ensureSparcFigureVersionIndexes } from './sparcFigureVersionStorage';
import { SparcFigureLibrary } from './sparcFigureLibraryStorage';

// Requires the supported isolated Meteor/Mongo environment, including a replica set.
describe('SPARC immutable human replacement Mongo contracts', function() {
  afterEach(async function() {
    await SparcFigureVersions.removeAsync({ libraryId: /^test-human-/ });
    await SparcFigureLibrary.removeAsync({ _id: /^test-human-/ });
  });
  it('atomically admits a version and current pointer, rejects concurrent stale editors, and never rewinds a completed retry', async function() {
    await ensureSparcFigureVersionIndexes();
    const store = createSparcFigureVersionStore();
    const entry = { _id: 'test-human-original', version: 'synthetic', imageModel: 'synthetic', embeddingModel: 'synthetic',
      dimensions: 2, embedding: [1, 0], situation: 'Synthetic', ready: true, reusable: false, createdAt: new Date() };
    await SparcFigureLibrary.insertAsync(entry);
    const request = { libraryId: entry._id, expectedAssetId: entry._id, userId: 'synthetic-admin', assetId: 'test-human-a', identity: 'synthetic-a' };
    const results = await Promise.allSettled([store.publish(request), store.publish({ ...request, assetId: 'test-human-b', identity: 'synthetic-b' })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const first = (await SparcFigureLibrary.findOneAsync(entry._id))!;
    assert.equal(first.revision, 1); assert.equal(first.reusable, false);
    assert.equal(await SparcFigureVersions.find({ libraryId: entry._id }).countAsync(), 2);
    const admitted = (await store.find(first.currentAssetId!))!;
    assert.equal(admitted.previousAssetId, entry._id);
    const second = await store.publish({ ...request, expectedAssetId: first.currentAssetId!, assetId: 'test-human-c', identity: 'synthetic-c' });
    assert.equal(second.revision, 2);
    const retry = await store.publish({ ...request, assetId: admitted._id, identity: admitted.replacementIdentity! });
    assert.equal(retry.currentAssetId, second.currentAssetId);
    assert.deepEqual((await store.history(entry._id, 2)).map(row => row.revision), [1, 0]);
    await assert.rejects(store.publish({ ...request, assetId: 'test-human-stale', identity: 'synthetic-stale' }), /changed/);
    assert.equal(await store.find('test-human-stale'), undefined);
    assert.deepEqual(await SparcFigureLibrary.findOneAsync(entry._id), { ...entry, currentAssetId: second.currentAssetId, revision: 2 });
  });
});
