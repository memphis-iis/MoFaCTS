import { createHash, randomBytes } from 'crypto';
import { normalizeSparcFigureEmbedding, SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { fitSparcFigureClusters, nearestFigureCenter, SPARC_FIGURE_CLUSTERING,
  type SparcBrowseOverview } from '../../common/lib/sparcFigureClustering';

export type BrowseSource = { _id: string; version: string; embeddingModel: string; dimensions: number; embedding: number[]; situation: string };
export type BrowseMember = { snapshotId: string; clusterId: string; assetId: string; similarity: number };
export type BrowseSnapshot = SparcBrowseOverview & { sourceRevision: number; algorithm: string };
export type BrowseLabelInput = { id: string; examples: Array<{ description: string; targetTexts: string[] }> };
export type SparcFigureBrowseStore = {
  state: () => Promise<{ revision: number; current?: string }>;
  snapshot: (id: string) => Promise<BrowseSnapshot | undefined>;
  sourcePage: (afterId: string) => Promise<BrowseSource[]>;
  addMembers: (members: BrowseMember[]) => Promise<void>;
  publish: (snapshot: BrowseSnapshot) => Promise<boolean>;
  discard: (snapshotId: string) => Promise<void>;
  members: (snapshotId: string, clusterId: string, cursor?: { similarity: number; assetId: string }) => Promise<BrowseMember[]>;
  withLock: <T>(work: () => Promise<T>) => Promise<T>;
};
export type SparcFigureBrowseDeps = {
  store: SparcFigureBrowseStore;
  descriptions: (assetIds: string[]) => Promise<Map<string, string>>;
  labels: (clusters: BrowseLabelInput[]) => Promise<Array<{ id: string; label: string }>>;
  progress: (stage: string, count: number) => void;
  yieldWork?: () => Promise<void>;
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const space = (row: BrowseSource) => JSON.stringify([row.version, row.embeddingModel, row.dimensions]);

export function parseSparcClusterLabels(value: unknown, expected: string[]) {
  const labels = (value as { labels?: unknown })?.labels;
  if (!Array.isArray(labels) || labels.length !== expected.length) throw new Error('Incomplete figure cluster labels');
  const seen = new Set<string>();
  return labels.map(row => {
    if (!row || typeof row !== 'object' || Object.keys(row).length !== 2 || !expected.includes(row.id)
      || seen.has(row.id) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 80
      || /[\r\n<>]/.test(row.label)) throw new Error('Invalid figure cluster label');
    seen.add(row.id);
    return { id: row.id as string, label: row.label.trim() as string };
  });
}

/** Streaming full-library assignment; only a bounded sample per compatible space is retained. */
export async function getSparcFigureBrowseOverview(deps: SparcFigureBrowseDeps): Promise<BrowseSnapshot> {
  const cached = async () => {
    const state = await deps.store.state();
    const snapshot = state.current ? await deps.store.snapshot(state.current) : undefined;
    return snapshot?.sourceRevision === state.revision && snapshot.algorithm === SPARC_FIGURE_CLUSTERING.version ? snapshot : undefined;
  };
  const prior = await cached();
  if (prior) return prior;
  return deps.store.withLock(async () => {
    const existing = await cached();
    if (existing) return existing;
    const revision = (await deps.store.state()).revision;
    const snapshotId = randomBytes(12).toString('hex');
    const yieldWork = deps.yieldWork ?? (() => new Promise<void>(resolve => setImmediate(resolve)));
    type Group = { sample: Array<{ priority: string; vector: number[] }>; fit?: Awaited<ReturnType<typeof fitSparcFigureClusters>> };
    const spaces = new Map<string, Group>();
    let count = 0;
    const scan = async (work: (rows: BrowseSource[]) => Promise<void>) => {
      let afterId = '';
      for (;;) {
        const rows = await deps.store.sourcePage(afterId);
        if (rows.some((row, i) => row._id <= (i ? rows[i - 1]!._id : afterId))) throw new Error('Invalid figure browsing source page');
        await work(rows);
        await yieldWork();
        if (rows.length < SPARC_FIGURE_LIBRARY_SETTINGS.batchSize) break;
        afterId = rows[rows.length - 1]!._id;
      }
    };
    try {
      await scan(async rows => {
        for (const row of rows) {
          const key = space(row); const group = spaces.get(key) ?? { sample: [] };
          spaces.set(key, group);
          const priority = digest(row._id);
          if (group.sample.length < SPARC_FIGURE_CLUSTERING.sampleSize || priority < group.sample[group.sample.length - 1]!.priority) {
            const vector = normalizeSparcFigureEmbedding(row.embedding);
            if (vector.length !== row.dimensions) throw new Error('Invalid stored figure embedding dimensions');
            group.sample.push({ priority, vector });
            group.sample.sort((a, b) => a.priority.localeCompare(b.priority));
            group.sample.length = Math.min(group.sample.length, SPARC_FIGURE_CLUSTERING.sampleSize);
          }
          count++;
        }
        deps.progress('sampling', count);
      });
      const groups = [...spaces.entries()].sort(([a], [b]) => a.localeCompare(b));
      for (const [, group] of groups) group.fit = await fitSparcFigureClusters(group.sample.map(row => row.vector), yieldWork);
      const clusters = new Map<string, { count: number; representatives: Array<{ row: BrowseSource; similarity: number }> }>();
      let assigned = 0;
      await scan(async rows => {
        const members: BrowseMember[] = [];
        for (const row of rows) {
          const group = spaces.get(space(row));
          if (!group?.fit) throw new Error('The figure library changed during clustering');
          const vector = normalizeSparcFigureEmbedding(row.embedding);
          if (vector.length !== row.dimensions) throw new Error('Invalid stored figure embedding dimensions');
          const match = nearestFigureCenter(vector, group.fit.centers);
          const clusterId = digest(`${space(row)}:${match.index}`).slice(0, 24);
          const cluster = clusters.get(clusterId) ?? { count: 0, representatives: [] };
          clusters.set(clusterId, cluster); cluster.count++;
          cluster.representatives.push({ row, similarity: match.similarity });
          cluster.representatives.sort((a, b) => b.similarity - a.similarity || a.row._id.localeCompare(b.row._id));
          cluster.representatives.length = Math.min(3, cluster.representatives.length);
          members.push({ snapshotId, clusterId, assetId: row._id, similarity: match.similarity });
        }
        if (members.length) await deps.store.addMembers(members);
        assigned += members.length; deps.progress('assigning', assigned);
      });
      if (assigned !== count) throw new Error('The figure library changed during clustering; reload the groups');
      if ((await deps.store.state()).revision !== revision) throw new Error('The figure library changed during clustering; reload the groups');
      const entries = [...clusters.entries()];
      const labels: Array<{ id: string; label: string }> = [];
      for (let offset = 0; offset < entries.length; offset += 4) {
        const batch = entries.slice(offset, offset + 4);
        const descriptions = await deps.descriptions(batch.flatMap(([, cluster]) => cluster.representatives.map(row => row.row._id)));
        const inputs = batch.map(([id, cluster]) => ({ id, examples: cluster.representatives.map(({ row }) => {
          const description = descriptions.get(row._id);
          if (!description) throw new Error('A representative figure is missing its saved description');
          const situation = JSON.parse(row.situation) as { targetTexts: string[] };
          if (!Array.isArray(situation.targetTexts) || situation.targetTexts.some(text => typeof text !== 'string')) throw new Error('Invalid saved figure target texts');
          return { description: description.slice(0, 2048), targetTexts: situation.targetTexts.map(text => text.slice(0, 2048)).slice(0, 20) };
        }) }));
        const generated = await deps.labels(inputs);
        labels.push(...parseSparcClusterLabels({ labels: generated }, inputs.map(input => input.id)));
        deps.progress('labeling', labels.length);
      }
      const snapshot: BrowseSnapshot = { snapshotId, sourceRevision: revision, algorithm: SPARC_FIGURE_CLUSTERING.version, total: count,
        clusters: entries.map(([id, cluster]) => ({ id, label: labels.find(label => label.id === id)!.label,
          count: cluster.count, representativeAssetId: cluster.representatives[0]!.row._id })).sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)) };
      if (!await deps.store.publish(snapshot)) throw new Error('The figure library changed while labeling; reload the groups');
      return snapshot;
    } catch (error) { await deps.store.discard(snapshotId); throw error; }
  });
}
