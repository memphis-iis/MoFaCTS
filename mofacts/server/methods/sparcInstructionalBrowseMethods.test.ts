import { strict as assert } from 'node:assert';
import { createSparcInstructionalBrowseMethods } from './sparcInstructionalBrowseMethods';
import { figureBrowseFixture, figureBrowseRows } from '../lib/sparcFigureBrowseService.test';
import type { InstructionalComponentSummary } from '../lib/sparcInstructionalBrowseStorage';

describe('Unified instructional component browsing', () => {
  it('groups text and images together, pages by type then center distance, restores current images and rejects unsafe reads', async () => {
    const rows = figureBrowseRows(60).map((row, i) => ({ ...row, kind: i % 3 ? 'explanation' : 'image', version: i % 2 ? 'primitive-v1' : 'image-v1' }));
    const f = figureBrowseFixture(rows);
    const publicEntries = new Map(rows.map((row, i) => [row._id, { id: row._id, kind: i % 3 ? 'explanation' : 'image',
      ...(i % 3 ? { content: { text: 'Complete instructional explanation.' } } : { image: { libraryId: row._id, assetId: row._id, description: 'Saved instructional image.', revision: 0, createdAt: new Date(0).toISOString(), model: 'synthetic', reusable: true } }),
      target: 'kc', move: 'move', reusable: true, createdAt: new Date(0) } as InstructionalComponentSummary]));
    const methods = createSparcInstructionalBrowseMethods({ getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async id => id === 'admin' }),
      browse: f.deps, inspect: async ids => ids.map(id => publicEntries.get(id)!).filter(Boolean), page: async () => ({ entries: [], nextCursor: null }) });
    const overview = await methods.getSparcLibraryClusters.call({ userId: 'admin' });
    assert.equal(overview.total, 60); assert.equal(overview.clusters.length, 2);
    const params = { snapshotId: overview.snapshotId, clusterId: overview.clusters[0]!.id };
    const first = await methods.listSparcInstructionalComponents.call({ userId: 'admin' }, params);
    assert.equal(first.entries.length, 24); assert.ok(first.nextCursor);
    assert.ok(first.entries.some(entry => entry.kind === 'image')); assert.ok(first.entries.some(entry => entry.kind === 'explanation'));
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
      entry.image = { ...entry.image!, assetId: 'replacement', revision: 1 };
      const updated = await methods.getSparcLibraryClusters.call({ userId: 'admin' });
      assert.equal(updated.snapshotId, overview.snapshotId); assert.equal(updated.clusters.find(cluster => cluster.id === representative.id)!.representative.image!.assetId, 'replacement');
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
    f.invalidate(); await assert.rejects(methods.listSparcInstructionalComponents.call({ userId: 'admin' }, params), /library changed/);
  });
});
