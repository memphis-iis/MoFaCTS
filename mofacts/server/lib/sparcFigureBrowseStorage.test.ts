import { strict as assert } from 'node:assert';
import { createSparcFigureBrowseStore, SparcFigureBrowse, invalidateSparcFigureBrowse } from './sparcFigureBrowseStorage';
import { SparcFigureLibrary, withSparcFigureLibraryLock } from './sparcFigureLibraryStorage';
import { SPARC_FIGURE_CLUSTERING } from '../../common/lib/sparcFigureClustering';

// Supported isolated Meteor/Mongo environment only; never run against the localhost learner database.
describe('SPARC semantic browse Mongo snapshots', function() {
  const snapshotId = 'test-browse-snapshot'; const staleId = 'test-browse-stale';
  let priorCurrent: string | undefined;
  beforeEach(async function() { priorCurrent = (await SparcFigureBrowse.findOneAsync('state'))?.current; });
  afterEach(async function() {
    await SparcFigureLibrary.removeAsync({ _id: /^test-browse-source-/ });
    await SparcFigureBrowse.removeAsync({ snapshotId: { $in: [snapshotId, staleId] } });
    await SparcFigureBrowse.rawCollection().updateOne({ _id: 'state', current: snapshotId },
      priorCurrent ? { $set: { current: priorCurrent } } : { $unset: { current: '' } });
    await invalidateSparcFigureBrowse();
  });
  it('publishes complete membership atomically and preserves the current cache on discard', async function() {
    const store = createSparcFigureBrowseStore(SparcFigureLibrary, work => withSparcFigureLibraryLock(work, 'browse'));
    const entry = { _id: 'test-browse-source-a', version: 'synthetic-version', imageModel: 'synthetic-model', embeddingModel: 'synthetic-embedding',
      dimensions: 2, embedding: [1, 0], situation: JSON.stringify({ targetTexts: ['Concept'] }), ready: true, reusable: false, createdAt: new Date() };
    await SparcFigureLibrary.insertAsync(entry);
    const source = await store.sourcePage('test-browse-source-');
    assert.ok(source.some(row => row._id === entry._id));
    const state = await store.state();
    await store.addMembers([{ snapshotId, clusterId: 'cluster', assetId: entry._id, similarity: .9 },
      { snapshotId, clusterId: 'cluster', assetId: 'test-browse-source-b', similarity: .8 }]);
    const snapshot = { snapshotId, sourceRevision: state.revision, algorithm: SPARC_FIGURE_CLUSTERING.version, total: 2,
      clusters: [{ id: 'cluster', label: 'Teaching concepts', count: 2, representativeAssetId: entry._id }] };
    assert.equal(await store.publish(snapshot), true);
    assert.equal((await store.state()).current, snapshotId);
    const members = await store.members(snapshotId, 'cluster');
    assert.deepEqual(members.map(member => member.similarity), [.9, .8]);
    assert.equal((await store.members(snapshotId, 'cluster', { similarity: .9, assetId: entry._id })).length, 1);
    await store.discard(snapshotId);
    assert.deepEqual(await store.snapshot(snapshotId), snapshot);
    await invalidateSparcFigureBrowse();
    assert.equal(await store.publish({ ...snapshot, snapshotId: staleId }), false);
    await store.discard(staleId);
    assert.equal(await store.snapshot(staleId), undefined);
  });
});
