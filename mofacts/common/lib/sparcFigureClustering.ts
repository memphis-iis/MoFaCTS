import { normalizeSparcFigureEmbedding } from './sparcFigureLibrary';

export const SPARC_FIGURE_CLUSTERING = Object.freeze({
  version: 'spherical-kmeans-silhouette-v1', sampleSize: 128, maxClusters: 12,
  iterations: 16, restarts: 2, minimumSilhouette: 0.2, scoreTolerance: 0.02,
});
export type SparcBrowseCluster = Readonly<{ id: string; label: string; count: number; representativeAssetId: string }>;
export type SparcBrowseOverview = Readonly<{ snapshotId: string; clusters: SparcBrowseCluster[]; total: number }>;
export type SparcClusterFit = Readonly<{
  centers: number[][]; selectedK: number; scores: Array<{ k: number; silhouette: number | null; loss: number }>;
}>;

export function figureSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) throw new Error('Figure clustering requires one compatible embedding space');
  let value = 0;
  for (let i = 0; i < left.length; i++) value += left[i]! * right[i]!;
  return Math.max(-1, Math.min(1, value));
}
export function nearestFigureCenter(vector: readonly number[], centers: readonly number[][]) {
  if (!centers.length) throw new Error('Figure clustering requires a center');
  let index = 0; let similarity = -Infinity;
  for (let i = 0; i < centers.length; i++) {
    const score = figureSimilarity(vector, centers[i]!);
    if (score > similarity) { index = i; similarity = score; }
  }
  return { index, similarity };
}
function mean(vectors: readonly number[][]): number[] {
  const sum = new Array<number>(vectors[0]!.length).fill(0);
  for (const vector of vectors) for (let i = 0; i < sum.length; i++) sum[i]! += vector[i]!;
  return normalizeSparcFigureEmbedding(sum);
}
async function fit(vectors: number[][], k: number, first: number, yieldWork: () => Promise<void>) {
  let centers = [vectors[first]!];
  while (centers.length < k) {
    let farthest = -1; let distance = 1e-10;
    for (let i = 0; i < vectors.length; i++) {
      const value = 1 - nearestFigureCenter(vectors[i]!, centers).similarity;
      if (value > distance) { distance = value; farthest = i; }
    }
    if (farthest < 0) return undefined; // Fewer distinct directions than the candidate k.
    centers.push(vectors[farthest]!);
  }
  let assignments: number[] = [];
  for (let iteration = 0; iteration < SPARC_FIGURE_CLUSTERING.iterations; iteration++) {
    const next = vectors.map(vector => nearestFigureCenter(vector, centers).index);
    const groups = centers.map((_, i) => vectors.filter((__, j) => next[j] === i));
    if (groups.some(group => !group.length)) return undefined;
    centers = groups.map(mean);
    const stable = assignments.length && next.every((value, i) => value === assignments[i]);
    assignments = next;
    await yieldWork();
    if (stable) break;
  }
  assignments = vectors.map(vector => nearestFigureCenter(vector, centers).index);
  if (centers.some((_, i) => assignments.filter(value => value === i).length < 2)) return undefined;
  const loss = vectors.reduce((sum, vector, i) => sum + 1 - figureSimilarity(vector, centers[assignments[i]!]!), 0);
  return { centers, assignments, loss };
}
function silhouette(distances: number[][], assignments: number[], k: number): number {
  let total = 0;
  for (let i = 0; i < assignments.length; i++) {
    const sums = new Array<number>(k).fill(0); const counts = new Array<number>(k).fill(0);
    for (let j = 0; j < assignments.length; j++) {
      if (i === j) continue;
      const group = assignments[j]!;
      sums[group]! += distances[i]![j]!; counts[group]!++;
    }
    const own = assignments[i]!;
    if (!counts[own]) continue;
    const a = sums[own]! / counts[own]!;
    const b = Math.min(...counts.map((count, group) => group !== own && count ? sums[group]! / count : Infinity));
    if (Math.max(a, b) > 0 && Number.isFinite(b)) total += (b - a) / Math.max(a, b);
  }
  return total / assignments.length;
}

/** Bounded deterministic model selection. Cluster count is never a user input. */
export async function fitSparcFigureClusters(input: readonly number[][], yieldWork: () => Promise<void>): Promise<SparcClusterFit> {
  if (!input.length || input.length > SPARC_FIGURE_CLUSTERING.sampleSize) throw new Error('Invalid figure clustering sample size');
  const vectors = input.map(normalizeSparcFigureEmbedding);
  if (vectors.some(vector => vector.length !== vectors[0]!.length)) throw new Error('Incompatible figure embedding dimensions');
  const center = mean(vectors);
  const scores: SparcClusterFit['scores'] = [{ k: 1, silhouette: null,
    loss: vectors.reduce((sum, vector) => sum + 1 - figureSimilarity(vector, center), 0) }];
  const distances = vectors.map(left => vectors.map(right => Math.max(0, 1 - figureSimilarity(left, right))));
  const candidates: Array<{ k: number; score: number; centers: number[][] }> = [];
  const maximum = Math.min(SPARC_FIGURE_CLUSTERING.maxClusters, Math.floor(vectors.length / 3));
  for (let k = 2; k <= maximum; k++) {
    let best: Awaited<ReturnType<typeof fit>>;
    for (let restart = 0; restart < SPARC_FIGURE_CLUSTERING.restarts; restart++) {
      const result = await fit(vectors, k, Math.floor(restart * vectors.length / SPARC_FIGURE_CLUSTERING.restarts), yieldWork);
      if (result && (!best || result.loss < best.loss)) best = result;
    }
    if (!best) continue;
    const score = silhouette(distances, best.assignments, k);
    scores.push({ k, silhouette: score, loss: best.loss });
    candidates.push({ k, score, centers: best.centers });
  }
  const bestScore = Math.max(...candidates.map(candidate => candidate.score));
  const chosen = bestScore >= SPARC_FIGURE_CLUSTERING.minimumSilhouette
    ? candidates.find(candidate => candidate.score >= bestScore - SPARC_FIGURE_CLUSTERING.scoreTolerance) : undefined;
  return { centers: chosen?.centers ?? [center], selectedK: chosen?.k ?? 1, scores };
}
