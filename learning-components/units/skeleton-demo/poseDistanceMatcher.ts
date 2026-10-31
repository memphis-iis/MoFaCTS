// Corresponding labeled MediaPipe Pose WORLD landmarks only. No image coordinates.
export interface WorldPoint { readonly x: number; readonly y: number; readonly z: number; readonly visibility?: number }
export const POSE_JOINTS = [11, 12, 13, 14, 15, 16] as const;
// Root: left shoulder. Shoulder span joins the two arm chains into one tree.
export const POSE_TREE = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]] as const;
const EPSILON = 1e-8;
export const CALIBRATION_FRAMES = 45;
export type PoseSample = readonly WorldPoint[];
export interface PoseScore { readonly residual: number; readonly scale: number }
const length = (a: WorldPoint, b: WorldPoint): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function validPose(points: PoseSample): boolean {
  return POSE_JOINTS.every(id => {
    const p = points[id];
    return p && [p.x, p.y, p.z].every(Number.isFinite)
      && Number.isFinite(p.visibility) && p.visibility! >= 0.5;
  }) && POSE_TREE.every(([a, b]) => {
    const distance = length(points[a]!, points[b]!);
    return Number.isFinite(distance) && distance > EPSILON;
  });
}

export function segmentLengths(points: PoseSample): number[] | null {
  return validPose(points) ? POSE_TREE.map(([a, b]) => length(points[a]!, points[b]!)) : null;
}

export function distanceVector(points: PoseSample): number[] | null {
  if (!validPose(points)) return null;
  const distances: number[] = [];
  POSE_JOINTS.forEach((a, index) => {
    POSE_JOINTS.slice(index + 1).forEach(b => distances.push(length(points[a]!, points[b]!)));
  });
  return distances;
}

export function scoreDistances(observed: readonly number[], target: readonly number[], fitScale = true): PoseScore | null {
  if (!observed.length || observed.length !== target.length
    || ![...observed, ...target].every(value => Number.isFinite(value) && value >= 0)) return null;
  const normObserved = observed.reduce((sum, d) => sum + d * d, 0);
  const normTarget = target.reduce((sum, d) => sum + d * d, 0);
  if (![normObserved, normTarget].every(Number.isFinite) || normObserved <= EPSILON || normTarget <= EPSILON) return null;
  const scale = fitScale ? observed.reduce((sum, d, i) => sum + d * target[i]!, 0) / normObserved : 1;
  const residual = observed.reduce((sum, d, i) => sum + (scale * d - target[i]!) ** 2, 0) / normTarget;
  return Number.isFinite(residual) && Number.isFinite(scale) ? { residual, scale } : null;
}

// Fixed target/baseline ratios preserve framewise inferred segment-length noise.
// They do NOT force each current segment to the exact target length.
export function correctPose(points: PoseSample, baseline: readonly number[], target: readonly number[]): WorldPoint[] | null {
  if (!validPose(points) || baseline.length !== POSE_TREE.length || target.length !== POSE_TREE.length
    || ![...baseline, ...target].every(value => Number.isFinite(value) && value > EPSILON)) return null;
  const corrected: WorldPoint[] = [];
  corrected[11] = { ...points[11]! };
  POSE_TREE.forEach(([a, b], i) => {
    const parent = corrected[a]!;
    const start = points[a]!;
    const end = points[b]!;
    const ratio = target[i]! / baseline[i]!;
    corrected[b] = { x: parent.x + (end.x - start.x) * ratio,
      y: parent.y + (end.y - start.y) * ratio, z: parent.z + (end.z - start.z) * ratio,
      visibility: end.visibility! };
  });
  return validPose(corrected) ? corrected : null;
}

export function createPoseCalibration() {
  let samples: number[][] = [];
  let lastTimestamp = -Infinity;
  return {
    reset() { samples = []; lastTimestamp = -Infinity; },
    add(points: PoseSample, timestamp: number): boolean {
      if (!Number.isFinite(timestamp) || timestamp <= lastTimestamp || samples.length >= CALIBRATION_FRAMES) return false;
      const lengths = segmentLengths(points);
      if (!lengths) return false;
      lastTimestamp = timestamp;
      samples.push(lengths);
      return true;
    },
    get count() { return samples.length; },
    baseline(): number[] | null {
      if (samples.length < CALIBRATION_FRAMES) return null;
      return POSE_TREE.map((_, i) => samples.map(frame => frame[i]!).sort((a, b) => a - b)[Math.floor(samples.length / 2)]!);
    },
  };
}
