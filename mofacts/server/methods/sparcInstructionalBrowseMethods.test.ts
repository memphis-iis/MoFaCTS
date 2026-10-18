import { strict as assert } from 'node:assert';
import { createSparcInstructionalBrowseMethods } from './sparcInstructionalBrowseMethods';
import { figureBrowseFixture, figureBrowseRows } from '../lib/sparcFigureBrowseService.test';
import type { InstructionalComponentSummary } from '../lib/sparcInstructionalBrowseStorage';
import { SPARC_FIGURE_BROWSE_VERSION } from '../lib/sparcFigureBrowseService';
import { SPARC_VIDEO_EMBEDDING_VERSION } from '../../../learning-components/runtime/sparcVideo';

describe('Unified instructional component browsing', () => {
  it('returns saved videos in subgroups and accepts their continuation cursors', async () => {
    const rows = figureBrowseRows(2).map(row => ({ ...row, kind: 'video', embeddingVersion: SPARC_VIDEO_EMBEDDING_VERSION, embedding: [1, 0] }));
    const f = figureBrowseFixture(rows);
    const entries = rows.map(row => ({ id: row._id, kind: 'video', content: { text: 'Species diverge.' },
      target: 'Species diverge.', move: 'catalog-video', createdAt: new Date(0) }));
    const methods = createSparcInstructionalBrowseMethods({ getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => true }),
      browse: f.deps, inspect: async ids => entries.filter(entry => ids.includes(entry.id)) });
    const overview = await methods.getSparcLibraryClusters.call({ userId: 'admin' });
    const params = { snapshotId: overview.snapshotId, clusterId: overview.clusters[0]!.subclusters[0]!.id };
    const first = await methods.listSparcInstructionalComponents.call({ userId: 'admin' }, params);
    assert.deepEqual(first.entries.map(entry => entry.id), rows.map(row => row._id));
    const next = await methods.listSparcInstructionalComponents.call({ userId: 'admin' }, { ...params, cursor: `video,1,${rows[0]!._id}` });
    assert.deepEqual(next.entries.map(entry => entry.id), [rows[1]!._id]);
    assert.equal(JSON.stringify(first).includes('embedding'), false);
  });
  it('groups text and images together, pages by type then center distance, restores current images and rejects unsafe reads', async () => {
    const rows = figureBrowseRows(60).map((row, i) => ({ ...row, kind: i % 3 ? 'explanation' : 'image', version: i % 2 ? 'primitive-v1' : 'image-v1', embedding: i % 2 ? [0, 1] : [1, 0] }));
    const f = figureBrowseFixture(rows);
    const publicEntries = new Map(rows.map((row, i) => [row._id, { id: row._id, kind: i % 3 ? 'explanation' : 'image',
      ...(i % 3 ? { content: { text: 'Complete instructional explanation.' } } : { image: { assetId: row._id, description: 'Saved instructional image.', createdAt: new Date(0).toISOString(), model: 'synthetic' } }),
      target: 'kc', move: 'move', createdAt: new Date(0) } as InstructionalComponentSummary]));
    const methods = createSparcInstructionalBrowseMethods({ getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async id => id === 'admin' }),
      browse: f.deps, inspect: async ids => ids.map(id => publicEntries.get(id)!).filter(Boolean) });
    const overview = await methods.getSparcLibraryClusters.call({ userId: 'admin' });
    assert.equal(overview.total, 60); assert.equal(overview.clusters.length, 2);
    assert.ok(overview.clusters.every(topic => topic.subclusters.every(leaf => leaf.representative)));
    await assert.rejects(methods.listSparcInstructionalComponents.call({ userId: 'admin' }, { snapshotId: overview.snapshotId }), /Invalid instructional group/);
    await assert.rejects(methods.listSparcInstructionalComponents.call({ userId: 'admin' }), /snapshot/);
    await assert.rejects(methods.listSparcInstructionalComponents.call({ userId: 'admin' }, { snapshotId: overview.snapshotId, clusterId: overview.clusters[0]!.id }), /subgroup not found/);
    const params = { snapshotId: overview.snapshotId, clusterId: overview.clusters[0]!.subclusters[0]!.id };
    const first = await methods.listSparcInstructionalComponents.call({ userId: 'admin' }, params);
    assert.equal(first.entries.length, 24); assert.ok(first.nextCursor);
    assert.ok(first.entries.some(entry => entry.kind === 'image')); assert.ok(first.entries.some(entry => entry.kind === 'explanation'));
    assert.ok(first.entries.every(entry => entry.clusterId === params.clusterId));
    assert.equal(JSON.stringify(first).includes('embedding'), false);
    const next = await methods.listSparcInstructionalComponents.call({ userId: 'admin' }, { ...params, cursor: first.nextCursor! });
    assert.equal(next.entries.length, 6); assert.equal(next.nextCursor, null);
    assert.ok(next.entries.every(entry => !first.entries.some(prior => prior.id === entry.id)));
    const combined = [...first.entries, ...next.entries];
    assert.deepEqual(combined.map(entry => entry.kind), [...combined].sort((a, b) => a.kind.localeCompare(b.kind)).map(entry => entry.kind));
    assert.ok(next.entries.every(entry => entry.kind === 'image'), 'Later types must remain after earlier types across page boundaries');
    const representative = overview.clusters.find(cluster => cluster.representative.kind === 'image');
    assert.ok(representative, 'Fixture must exercise a real image representative');
    if (representative) {
      const entry = publicEntries.get(representative.representative.id)!;
      entry.image = { ...entry.image!, description: 'Corrected figure description.' };
      const updated = await methods.getSparcLibraryClusters.call({ userId: 'admin' });
      assert.equal(updated.snapshotId, overview.snapshotId); assert.equal(updated.clusters.find(cluster => cluster.id === representative.id)!.representative.image!.description, 'Corrected figure description.');
    }
    for (const userId of [null, 'student']) {
      await assert.rejects(methods.getSparcLibraryClusters.call({ userId }), /Must be logged in|Permission denied/);
      await assert.rejects(methods.listSparcInstructionalComponents.call({ userId }, params), /Must be logged in|Permission denied/);
    }
    await assert.rejects(methods.listSparcInstructionalComponents.call({ userId: 'admin' }, { ...params, cursor: '$invalid' }), /cursor/);
    for (const cursor of [`0.9,${rows[0]!._id}`, `unknown,0.9,${rows[0]!._id}`, `image,NaN,${rows[0]!._id}`]) {
      await assert.rejects(methods.listSparcInstructionalComponents.call({ userId: 'admin' }, { ...params, cursor }), /cursor/);
    }
    await assert.rejects(methods.listSparcInstructionalComponents.call({ userId: 'admin' }, { ...params, clusterId: 'f'.repeat(24) }), /not found/);
    await assert.rejects(methods.listSparcInstructionalComponents.call({ userId: 'admin' }, { ...params, after: 'unused' } as any), /Invalid instructional library request/);
    f.invalidate(); await assert.rejects(methods.listSparcInstructionalComponents.call({ userId: 'admin' }, params), /library changed/);
  });
  it('hydrates larger hierarchies in bounded inspection batches and rejects flat snapshots', async () => {
    const rows = figureBrowseRows(27), f = figureBrowseFixture(rows);
    const entries = rows.map(row => ({ id: row._id, kind: 'explanation', content: { text: 'Instructional explanation.' },
      target: 'kc', move: 'move', createdAt: new Date(0) } as InstructionalComponentSummary));
    const groups = entries.map((entry, i) => ({ id: i.toString(16).padStart(24, '0'), label: `Subtopic ${i}`, count: 1, representativeAssetId: entry.id }));
    const snapshot = { snapshotId: 'a'.repeat(24), sourceRevision: 0, algorithm: SPARC_FIGURE_BROWSE_VERSION, total: 27,
      clusters: [0, 1, 2].map(i => ({ ...groups[i * 9]!, id: (i + 100).toString(16).padStart(24, '0'), count: 9, subclusters: groups.slice(i * 9, i * 9 + 9) })) };
    await f.store.publish(snapshot);
    const batchSizes: number[] = [];
    const methods = createSparcInstructionalBrowseMethods({ getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => true }),
      browse: f.deps, inspect: async ids => { assert.ok(ids.length <= 24); batchSizes.push(ids.length); return ids.map(id => entries.find(entry => entry.id === id)!); } });
    const result = await methods.getSparcLibraryClusters.call({ userId: 'admin' });
    assert.deepEqual(batchSizes, [24, 3]);
    assert.equal(result.clusters.flatMap(topic => topic.subclusters).length, 27);
    assert.equal(f.labels(), 0);
    f.snapshots.set(snapshot.snapshotId, { ...snapshot, algorithm: 'spherical-kmeans-silhouette-v3' });
    await assert.rejects(methods.listSparcInstructionalComponents.call({ userId: 'admin' }, { snapshotId: snapshot.snapshotId, clusterId: groups[0]!.id }), /library changed/);
  });
});
