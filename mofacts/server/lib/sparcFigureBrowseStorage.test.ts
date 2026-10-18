import { SPARC_INSTRUCTIONAL_NEED_VERSION } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { strict as assert } from 'node:assert';
import { createSparcFigureBrowseStore, SparcFigureBrowse, invalidateSparcFigureBrowse } from './sparcFigureBrowseStorage';
import { SparcFigureLibrary, withSparcFigureLibraryLock } from './sparcFigureLibraryStorage';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { SPARC_FIGURE_BROWSE_VERSION } from './sparcFigureBrowseService';

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
    const store = createSparcFigureBrowseStore(SparcInstructionalLibrary, work => withSparcFigureLibraryLock(work, 'browse'));
    const entry = { _id: 'test-browse-source-a', kind: 'image' as const, embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION, version: 'synthetic-version', imageModel: 'synthetic-model', embeddingModel: 'synthetic-embedding',
      dimensions: 2, embedding: [1, 0], situation: JSON.stringify({ target: { texts: ['Concept'] }, assistance: 1, evidence: [] }), ready: true, reusable: false, createdAt: new Date() };
    await SparcFigureLibrary.insertAsync(entry);
    await SparcFigureLibrary.insertAsync({ ...entry, _id: 'test-browse-source-b' });
    const source = await store.sourcePage('test-browse-source-');
    assert.ok(source.some(row => row._id === entry._id));
    const state = await store.state();
    await store.addMembers([{ snapshotId, clusterId: 'cluster', assetId: entry._id, similarity: .9 },
      { snapshotId, clusterId: 'cluster', assetId: 'test-browse-source-b', similarity: .8 }]);
    const snapshot = { snapshotId, sourceRevision: state.revision, algorithm: SPARC_FIGURE_BROWSE_VERSION, total: 2,
      clusters: [{ id: 'topic', label: 'Teaching concepts', count: 2, representativeAssetId: entry._id,
        subclusters: [{ id: 'cluster', label: 'Specific concept', count: 2, representativeAssetId: entry._id }] }] };
    assert.equal(await store.publish(snapshot), true);
    assert.equal((await store.state()).current, snapshotId);
    const members = await store.members(snapshotId, 'cluster');
    assert.deepEqual(members.map(member => member.similarity), [.9, .8]);
    assert.deepEqual(await store.memberships(snapshotId, [entry._id]), [{ assetId: entry._id, clusterId: 'cluster' }]);
    assert.deepEqual(await store.memberships(staleId, [entry._id]), []);
    await assert.rejects(store.memberships(snapshotId, Array(25).fill(entry._id)), /exceeds 24/);
    assert.equal((await store.members(snapshotId, 'cluster', { kind: 'image', similarity: .9, assetId: entry._id })).length, 1);
    await store.discard(snapshotId);
    assert.deepEqual(await store.snapshot(snapshotId), snapshot);
    await invalidateSparcFigureBrowse();
    assert.equal(await store.publish({ ...snapshot, snapshotId: staleId }), false);
    await store.discard(staleId);
    assert.equal(await store.snapshot(staleId), undefined);
  });
});
