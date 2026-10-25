// Browser-local gesture interpretation. No rendering, persistence, or Meteor dependencies.
export interface HandPoint { readonly x: number; readonly y: number; readonly z: number }
export interface HandRotationFrame {
  readonly hands: readonly (readonly HandPoint[])[];
  readonly handWorldLandmarks: readonly (readonly HandPoint[])[];
  readonly handedness: readonly string[];
  readonly timestamp: number;
  readonly width: number;
  readonly height: number;
}
export type HandRotationState = 'waiting' | 'controlling' | 'ignored';
type Vec = readonly [number, number, number];
export interface HandRotationResult {
  readonly state: HandRotationState;
  readonly rotation: { readonly axis: Vec; readonly angle: number } | null;
}
const radians = Math.PI / 180;
export const HAND_ROTATION_LIMITS = Object.freeze({
  maxGapMs: 250, maxAngularSpeed: 720 * radians, maxTranslationSpeed: 6,
  maxScaleSpeed: 4.5, maxShapeChange: 0.12,
  minTriangleArea: 0.08, identityDistance: 3,
  minHandednessConfidence: 0.7,
});
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec) => Math.hypot(...a);
const unit = (a: Vec) => scale(a, 1 / length(a));
const finite = (p: HandPoint | undefined): p is HandPoint => Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
interface Sample {
  center: Vec; palmSize: number; normal: Vec; vectors: Vec[]; edges: number[];
  timestamp: number;
}

function sample(frame: HandRotationFrame, index: number, mirrored: boolean): Sample | null {
  const image = frame.hands[index];
  const world = frame.handWorldLandmarks[index];
  if (!image || !world || ![0, 4, 5, 8, 12, 17].every(i => finite(image[i]) && finite(world[i]))) return null;
  if (![0, 4, 5, 8, 12, 17].every(i => image[i]!.x >= 0 && image[i]!.x <= 1 && image[i]!.y >= 0 && image[i]!.y <= 1)) return null;
  const screen = (i: number): Vec => [image[i]!.x * frame.width / frame.height, image[i]!.y, 0];
  const palmSize = length(sub(screen(5), screen(17)));
  if (palmSize < 0.01) return null;
  const center = scale(add(add(screen(0), screen(5)), screen(17)), 1 / 3);
  // Camera coordinates: up is +Y and toward the viewer is +Z. Reflect X only
  // for a mirrored preview; computing the cross product afterwards preserves sign.
  const tips: Vec[] = [4, 8, 12].map(i => [world[i]!.x * (mirrored ? -1 : 1), -world[i]!.y, -world[i]!.z]);
  const centroid = scale(tips.reduce(add, [0, 0, 0]), 1 / 3);
  const vectors = tips.map(p => sub(p, centroid));
  const sides = [sub(tips[1]!, tips[0]!), sub(tips[2]!, tips[1]!), sub(tips[0]!, tips[2]!)];
  const edges = sides.map(length);
  const perimeter = edges.reduce((a, b) => a + b, 0);
  const normal = cross(sides[0]!, scale(sides[2]!, -1));
  if (perimeter < 0.015 || length(normal) / Math.max(...edges) ** 2 < HAND_ROTATION_LIMITS.minTriangleArea) return null;
  return { center, palmSize, normal: unit(normal), vectors, edges: edges.map(e => e / perimeter),
    timestamp: frame.timestamp };
}

function compare(previous: Sample, current: Sample) {
  const dt = (current.timestamp - previous.timestamp) / 1000;
  // The triangle normal is an unoriented axis. Choose its continuous orientation.
  if (dot(previous.normal, current.normal) < 0) current.normal = scale(current.normal, -1);
  const axis = cross(previous.normal, current.normal);
  const cosine = Math.max(-1, Math.min(1, dot(previous.normal, current.normal)));
  // Shortest rotation transporting the previous plane into the current plane.
  const transport = (v: Vec): Vec => add(add(v, cross(axis, v)), scale(cross(axis, cross(axis, v)), 1 / (1 + cosine)));
  let sineSum = 0;
  let cosineSum = 0;
  previous.vectors.forEach((v, i) => {
    const aligned = transport(v);
    sineSum += dot(current.normal, cross(aligned, current.vectors[i]!));
    cosineSum += dot(aligned, current.vectors[i]!);
  });
  const angle = Math.atan2(sineSum, cosineSum);
  const velocity = angle / dt;
  const translation = length(sub(current.center, previous.center)) / ((current.palmSize + previous.palmSize) / 2) / dt;
  const scaleSpeed = Math.abs(Math.log(current.palmSize / previous.palmSize)) / dt;
  const shapeChange = Math.max(...current.edges.map((e, i) => Math.abs(e - previous.edges[i]!)));
  const tiltSpeed = Math.acos(cosine) / dt;
  const limits = HAND_ROTATION_LIMITS;
  const ignored = Math.abs(velocity) > limits.maxAngularSpeed || tiltSpeed > limits.maxAngularSpeed
    || translation > limits.maxTranslationSpeed || scaleSpeed > limits.maxScaleSpeed
    || shapeChange > limits.maxShapeChange;
  return { angle, ignored };
}

export function createHandRotationController() {
  let state: HandRotationState = 'waiting';
  let selected: string | null = null;
  let previous: Sample | null = null;
  let lastTimestamp: number | null = null;
  let lastMirrored: boolean | null = null;
  const result = (rotation: HandRotationResult['rotation'] = null): HandRotationResult => ({ state, rotation });
  function reset(): void {
    state = 'waiting'; selected = null; previous = null; lastTimestamp = null; lastMirrored = null;
  }
  function update(frame: HandRotationFrame, mirrored: boolean): HandRotationResult {
    if (!Number.isFinite(frame.timestamp) || !(frame.width > 0) || !(frame.height > 0)
      || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)
      || frame.hands.length !== frame.handWorldLandmarks.length || frame.hands.length !== frame.handedness.length) {
      reset(); return result();
    }
    if ((lastTimestamp !== null && (frame.timestamp <= lastTimestamp || frame.timestamp - lastTimestamp > HAND_ROTATION_LIMITS.maxGapMs))
      || (lastMirrored !== null && lastMirrored !== mirrored)) {
      previous = null; selected = null; state = 'waiting';
    }
    lastTimestamp = frame.timestamp; lastMirrored = mirrored;
    const next = new Map<string, Sample>();
    frame.handedness.forEach((label, i) => {
      if ((label !== 'Left' && label !== 'Right') || frame.handedness.filter(h => h === label).length !== 1) return;
      const current = sample(frame, i, mirrored);
      if (current) next.set(label, current);
    });
    if (selected !== null && !next.has(selected)) {
      selected = null; previous = null;
    }
    if (selected === null) selected = next.keys().next().value ?? null;
    const current = selected === null ? null : next.get(selected)!;
    const prior = previous;
    // Always advance the reference, including on fast/ignored movement. The next
    // below-cutoff increment applies immediately and cannot replay skipped motion.
    previous = current;
    if (!current || !prior) {
      state = 'waiting'; return result();
    }
    if (length(sub(current.center, prior.center)) / prior.palmSize > HAND_ROTATION_LIMITS.identityDistance) {
      state = 'ignored'; return result();
    }
    const motion = compare(prior, current);
    state = motion.ignored ? 'ignored' : 'controlling';
    return result(motion.ignored ? null : { axis: current.normal, angle: motion.angle });
  }
  return { update, reset };
}
