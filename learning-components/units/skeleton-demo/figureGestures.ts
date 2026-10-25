import type { FigureId, FigureVector as Vec } from './figureGeometry';
export interface HandPoint { readonly x: number; readonly y: number; readonly z: number }
export interface FigureGestureFrame {
  readonly hands: readonly (readonly HandPoint[])[];
  readonly handWorldLandmarks: readonly (readonly HandPoint[])[];
  readonly handedness: readonly string[];
  readonly timestamp: number;
  readonly width: number;
  readonly height: number;
}
export interface GestureRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
export interface FigureGestureContext {
  readonly preview: GestureRect;
  readonly palette: GestureRect;
  readonly targets: readonly { readonly id: FigureId; readonly bounds: GestureRect }[];
  readonly activeFigure: FigureId | null;
}
type Mode = 'inactive' | 'palette' | 'rotation' | 'scaling';
export interface FigureGestureResult {
  readonly mode: Mode;
  readonly state: 'waiting' | 'controlling' | 'ignored';
  readonly selection: FigureId | null;
  readonly rotation: { readonly axis: Vec; readonly angle: number } | null;
  readonly scaleFactor: number | null;
}
export const FIGURE_GESTURE_LIMITS = Object.freeze({
  maxGapMs: 250, maxAngularSpeed: 720 * Math.PI / 180, maxTranslationSpeed: 6,
  maxScaleSpeed: 4.5, maxShapeChange: 0.12, minTriangleArea: 0.08,
  identityDistance: 3, minHandednessConfidence: 0.7,
  spreadEnter: 0.0254, spreadExit: 0.020, pinchEnter: 0.012, pinchExit: 0.018,
  selectionOpen: 0.020, resizeDoublingHeight: 0.25,
});
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec) => Math.hypot(...a);
const unit = (a: Vec) => scale(a, 1 / length(a));
const finite = (p: HandPoint | undefined): p is HandPoint => Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
const inside = (p: Vec, r: GestureRect) => p[0] >= r.left && p[0] <= r.left + r.width && p[1] >= r.top && p[1] <= r.top + r.height;
interface Sample {
  center: Vec; palmSize: number; tips: Vec[]; cursor: Vec; thumb: Vec; index: Vec;
  distances: number[]; basis: Vec[] | null; shape: number[]; timestamp: number;
}
function sample(frame: FigureGestureFrame, index: number, mirrored: boolean, preview: GestureRect): Sample | null {
  const image = frame.hands[index]; const world = frame.handWorldLandmarks[index];
  if (!image || !world || ![0, 4, 5, 8, 12, 17].every(i => finite(image[i]) && finite(world[i]))) return null;
  if (![0, 4, 5, 8, 12, 17].every(i => image[i]!.x >= 0 && image[i]!.x <= 1 && image[i]!.y >= 0 && image[i]!.y <= 1)) return null;
  const screen = (i: number): Vec => [image[i]!.x * frame.width / frame.height, image[i]!.y, 0];
  const pixel = (i: number): Vec => [preview.left + (mirrored ? 1 - image[i]!.x : image[i]!.x) * preview.width, preview.top + image[i]!.y * preview.height, 0];
  const palmSize = length(sub(screen(5), screen(17)));
  if (palmSize < 0.01) return null;
  const tips: Vec[] = [4, 8, 12].map(i => [world[i]!.x * (mirrored ? -1 : 1), -world[i]!.y, -world[i]!.z]);
  const sides = [sub(tips[1]!, tips[0]!), sub(tips[2]!, tips[1]!), sub(tips[0]!, tips[2]!)];
  const distances = sides.map(length); const perimeter = distances.reduce((a, b) => a + b, 0);
  const normal = cross(sides[0]!, scale(sides[2]!, -1));
  const usable = perimeter > 0.015 && length(normal) / Math.max(...distances) ** 2 >= FIGURE_GESTURE_LIMITS.minTriangleArea;
  const x = usable ? unit(sides[0]!) : null;
  const z = usable ? unit(normal) : null;
  return { center: scale(add(add(screen(0), screen(5)), screen(17)), 1 / 3), palmSize, tips,
    cursor: scale([4, 8, 12].map(pixel).reduce(add, [0, 0, 0]), 1 / 3), thumb: pixel(4), index: pixel(8), distances,
    basis: x && z ? [x, cross(z, x), z] : null, shape: distances.map(d => perimeter ? d / perimeter : 0), timestamp: frame.timestamp };
}
// Full relative rotation R = currentBasis * previousBasis^T; quaternion extraction
// handles half-turns as well as small changes. No twist-only path remains.
function orientationChange(previous: Vec[], current: Vec[]): { axis: Vec; angle: number } {
  const m = (r: number, c: number) => current.reduce((sum, v, i) => sum + v[r]! * previous[i]![c]!, 0);
  const m00 = m(0, 0), m11 = m(1, 1), m22 = m(2, 2), trace = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1); w = s / 4;
    x = (m(2, 1) - m(1, 2)) / s; y = (m(0, 2) - m(2, 0)) / s; z = (m(1, 0) - m(0, 1)) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22); x = s / 4;
    w = (m(2, 1) - m(1, 2)) / s; y = (m(0, 1) + m(1, 0)) / s; z = (m(0, 2) + m(2, 0)) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22); y = s / 4;
    w = (m(0, 2) - m(2, 0)) / s; x = (m(0, 1) + m(1, 0)) / s; z = (m(1, 2) + m(2, 1)) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11); z = s / 4;
    w = (m(1, 0) - m(0, 1)) / s; x = (m(0, 2) + m(2, 0)) / s; y = (m(1, 2) + m(2, 1)) / s;
  }
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const magnitude = Math.hypot(x, y, z);
  return { axis: magnitude > 1e-10 ? [x / magnitude, y / magnitude, z / magnitude] : [0, 0, 1], angle: 2 * Math.atan2(magnitude, w) };
}
export function createFigureGestureController() {
  let owner: string | null = null;
  let previous: Sample | null = null;
  let mode: Mode = 'inactive';
  let lastTimestamp: number | null = null;
  let lastMirrored: boolean | null = null;
  let activeFigure: FigureId | null = null;
  let layoutKey = '';
  const pinchArmed = new Map<string, boolean>();
  function reset(): void {
    owner = null; previous = null; mode = 'inactive'; lastTimestamp = null; lastMirrored = null; pinchArmed.clear(); layoutKey = '';
  }
  function update(frame: FigureGestureFrame, mirrored: boolean, context: FigureGestureContext): FigureGestureResult {
    const out = (state: FigureGestureResult['state'] = 'waiting', extra: Partial<FigureGestureResult> = {}): FigureGestureResult =>
      ({ mode, state, selection: null, rotation: null, scaleFactor: null, ...extra });
    if (!Number.isFinite(frame.timestamp) || !(frame.width > 0) || !(frame.height > 0)
      || !Number.isFinite(frame.width) || !Number.isFinite(frame.height) || !(context.preview.width > 0) || !(context.preview.height > 0)
      || frame.hands.length !== frame.handWorldLandmarks.length || frame.hands.length !== frame.handedness.length) {
      reset(); return out();
    }
    const key = JSON.stringify([context.preview, context.palette, context.targets, frame.width, frame.height]);
    if ((lastTimestamp !== null && (frame.timestamp <= lastTimestamp || frame.timestamp - lastTimestamp > FIGURE_GESTURE_LIMITS.maxGapMs))
      || (lastMirrored !== null && mirrored !== lastMirrored) || (layoutKey && key !== layoutKey)) reset();
    if (context.activeFigure !== activeFigure) { previous = null; mode = 'inactive'; }
    activeFigure = context.activeFigure; layoutKey = key; lastTimestamp = frame.timestamp; lastMirrored = mirrored;
    const samples = new Map<string, Sample>();
    frame.handedness.forEach((label, i) => {
      if ((label !== 'Left' && label !== 'Right') || frame.handedness.filter(h => h === label).length !== 1) return;
      const current = sample(frame, i, mirrored, context.preview);
      if (current) samples.set(label, current);
    });
    for (const label of pinchArmed.keys()) if (!samples.has(label)) pinchArmed.delete(label);
    if (owner !== null && !samples.has(owner)) { owner = null; previous = null; mode = 'inactive'; }
    if (owner === null) {
      owner = [...samples].find(([, s]) => inside(s.cursor, context.palette) || inside(s.thumb, context.palette) || inside(s.index, context.palette)
        || (activeFigure && (Math.max(...s.distances) <= FIGURE_GESTURE_LIMITS.pinchEnter
          || (s.basis && Math.min(...s.distances) >= FIGURE_GESTURE_LIMITS.spreadEnter))))?.[0] ?? null;
    }
    const current = owner === null ? null : samples.get(owner)!;
    const prior = previous; const priorMode = mode;
    previous = current;
    if (!current || !owner) { mode = 'inactive'; return out(); }
    const limits = FIGURE_GESTURE_LIMITS;
    if (prior && length(sub(current.center, prior.center)) / prior.palmSize > limits.identityDistance) {
      mode = 'inactive'; pinchArmed.delete(owner); return out('ignored');
    }
    const minimum = Math.min(...current.distances), maximum = Math.max(...current.distances);
    const triple = maximum <= (priorMode === 'scaling' ? limits.pinchExit : limits.pinchEnter);
    const overPalette = inside(current.cursor, context.palette) || inside(current.thumb, context.palette) || inside(current.index, context.palette);
    // Triple pinch consumes two-finger pinch recognition even over the palette.
    const armed = pinchArmed.get(owner) === true;
    if (current.distances[0]! >= limits.selectionOpen) pinchArmed.set(owner, true);
    else if (current.distances[0]! <= limits.pinchEnter) pinchArmed.set(owner, false);
    if (overPalette) {
      mode = 'palette';
      if (!triple && armed && current.distances[0]! <= limits.pinchEnter
        && current.distances[1]! >= limits.spreadEnter && current.distances[2]! >= limits.spreadEnter) {
        const target = context.targets.find(t => inside(current.thumb, t.bounds) && inside(current.index, t.bounds));
        if (target) return out('controlling', { selection: target.id });
      }
      return out();
    }
    mode = !activeFigure ? 'inactive' : triple ? 'scaling'
      : current.basis && minimum >= (priorMode === 'rotation' ? limits.spreadExit : limits.spreadEnter) ? 'rotation' : 'inactive';
    if (!prior || mode === 'inactive' || mode !== priorMode) return out();
    const dt = (current.timestamp - prior.timestamp) / 1000;
    const translation = length(sub(current.center, prior.center)) / ((current.palmSize + prior.palmSize) / 2) / dt;
    const sizeSpeed = Math.abs(Math.log(current.palmSize / prior.palmSize)) / dt;
    if (translation > limits.maxTranslationSpeed || sizeSpeed > limits.maxScaleSpeed) return out('ignored');
    if (mode === 'scaling') {
      const dy = (prior.cursor[1] - current.cursor[1]) / context.preview.height;
      return out('controlling', { scaleFactor: 2 ** (dy / limits.resizeDoublingHeight) });
    }
    if (!prior.basis || !current.basis) return out();
    const rotation = orientationChange(prior.basis, current.basis);
    const shapeChange = Math.max(...current.shape.map((value, i) => Math.abs(value - prior.shape[i]!)));
    if (rotation.angle / dt > limits.maxAngularSpeed || shapeChange > limits.maxShapeChange) return out('ignored');
    return out('controlling', { rotation });
  }
  return { update, reset };
}
