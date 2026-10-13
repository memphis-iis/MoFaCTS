import { strict as assert } from 'node:assert';
import { getSparcFigureBrowseOverview, parseSparcClusterLabels, type BrowseMember, type BrowseSnapshot,
  type BrowseSource, type SparcFigureBrowseStore } from './sparcFigureBrowseService';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';

export function figureBrowseFixture(input: BrowseSource[]) {
  const rows = [...input]; const members: BrowseMember[] = []; const snapshots = new Map<string, BrowseSnapshot>();
  let revision = 0; let current: string | undefined; let tail = Promise.resolve(); let labels = 0;
  const store: SparcFigureBrowseStore = {
    async state() { return { revision, ...(current ? { current } : {}) }; },
    async snapshot(id) { return snapshots.get(id); },
    async sourcePage(afterId) { return rows.filter(row => row._id > afterId).sort((a, b) => a._id.localeCompare(b._id)).slice(0, 100); },
    async addMembers(batch) { members.push(...batch); },
    async publish(snapshot) {
      if (snapshot.sourceRevision !== revision) return false;
      snapshots.set(snapshot.snapshotId, snapshot); current = snapshot.snapshotId; return true;
    },
    async discard(id) { if (id !== current) { snapshots.delete(id); for (let i = members.length - 1; i >= 0; i--) if (members[i]!.snapshotId === id) members.splice(i, 1); } },
    async members(snapshotId, clusterId, cursor) {
      return members.filter(member => member.snapshotId === snapshotId && member.clusterId === clusterId
        && (!cursor || member.similarity < cursor.similarity || (member.similarity === cursor.similarity && member.assetId > cursor.assetId)))
        .sort((a, b) => b.similarity - a.similarity || a.assetId.localeCompare(b.assetId)).slice(0, SPARC_FIGURE_LIBRARY_SETTINGS.inspectionPageSize + 1);
    },
    async withLock(work) {
      const previous = tail; let release!: () => void;
      tail = new Promise(resolve => { release = resolve; }); await previous;
      try { return await work(); } finally { release(); }
    },
  };
  const deps = { store, descriptions: async (ids: string[]) => new Map(ids.map(id => [id, `Teaching figure ${id}`])),
    labels: async (batch: Array<{ id: string; examples: unknown[] }>) => { labels++; return batch.map((row, index) => ({ id: row.id, label: `Broad teaching topic ${index + 1}` })); },
    progress: () => {}, yieldWork: async () => {} };
  return { store, deps, rows, members, snapshots, labels: () => labels, invalidate: () => { revision++; } };
}
export function figureBrowseRows(n: number): BrowseSource[] {
  return Array.from({ length: n }, (_, i) => ({ _id: String(i).padStart(20, '0'), version: 'v1', embeddingModel: 'synthetic-embedding',
    dimensions: 2, embedding: i % 2 ? [.005 * (i % 7), 1] : [1, .005 * (i % 7)], situation: JSON.stringify({ targetTexts: ['Generalized conceptual understanding.'] }) }));
}
describe('SPARC cached semantic figure browsing', () => {
  it('streams all records, caches labels, isolates embedding spaces and orders paged members by their center', async () => {
    const f = figureBrowseFixture(figureBrowseRows(130));
    f.rows.push({ ...figureBrowseRows(1)[0]!, _id: 'different-space', embeddingModel: 'other-embedding', dimensions: 3, embedding: [1, 0, 0] });
    const snapshot = await getSparcFigureBrowseOverview(f.deps);
    assert.equal(snapshot.total, 131); assert.equal(snapshot.clusters.length, 3);
    assert.equal(f.members.length, 131);
    assert.equal(snapshot.clusters.reduce((sum, cluster) => sum + cluster.count, 0), 131);
    assert.deepEqual(await getSparcFigureBrowseOverview(f.deps), snapshot); assert.equal(f.labels(), 1);
    const cluster = snapshot.clusters.find(group => group.count > 24)!;
    const first = await f.store.members(snapshot.snapshotId, cluster.id);
    assert.equal(first.length, 25);
    assert.ok(first.every((member, i) => !i || first[i - 1]!.similarity >= member.similarity));
    const last = first[23]!;
    const next = await f.store.members(snapshot.snapshotId, cluster.id, { similarity: last.similarity, assetId: last.assetId });
    assert.ok(next.every(member => !first.slice(0, 24).some(prior => prior.assetId === member.assetId)));
    f.invalidate(); const updated = await getSparcFigureBrowseOverview(f.deps);
    assert.notEqual(updated.snapshotId, snapshot.snapshotId); assert.equal(f.labels(), 2);
  });
  it('serializes simultaneous builds and discards incomplete labels and obsolete source revisions', async () => {
    const f = figureBrowseFixture(figureBrowseRows(6));
    const [a, b] = await Promise.all([getSparcFigureBrowseOverview(f.deps), getSparcFigureBrowseOverview(f.deps)]);
    assert.equal(a.snapshotId, b.snapshotId); assert.equal(f.labels(), 1);
    const malformed = figureBrowseFixture(figureBrowseRows(2));
    await assert.rejects(getSparcFigureBrowseOverview({ ...malformed.deps, labels: async () => [] }), /Incomplete/);
    assert.equal(malformed.members.length, 0); assert.equal(malformed.snapshots.size, 0);
    const changing = figureBrowseFixture(figureBrowseRows(2));
    await assert.rejects(getSparcFigureBrowseOverview({ ...changing.deps, labels: async batch => { changing.invalidate(); return batch.map(row => ({ id: row.id, label: 'Teaching concepts' })); } }), /changed while labeling/);
    assert.equal(changing.members.length, 0);
  });
  it('supports an empty collection without provider calls and rejects missing or duplicate labels', async () => {
    const f = figureBrowseFixture([]);
    const snapshot = await getSparcFigureBrowseOverview(f.deps);
    assert.equal(snapshot.total, 0); assert.equal(f.labels(), 0);
    assert.throws(() => parseSparcClusterLabels({ labels: [{ id: 'a', label: 'Concept' }, { id: 'a', label: 'Other' }] }, ['a', 'b']), /Invalid/);
    assert.throws(() => parseSparcClusterLabels({ labels: [{ id: 'a', label: '<script>' }] }, ['a']), /Invalid/);
  });
});
