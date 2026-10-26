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
  readonly selectionHint?: string | undefined;
}
export const FIGURE_GESTURE_LIMITS = Object.freeze({
  maxGapMs: 250, maxAngularSpeed: 720 * Math.PI / 180, maxTranslationSpeed: 6,
  maxScaleSpeed: 4.5, rotationSmoothingMs: 100, minFingerStraightness: 0.90,
  minTriangleArea: 0.08, maxShapeChange: 0.12,
  identityDistance: 3, minHandednessConfidence: 0.7,
  spreadEnter: 0.0254, spreadExit: 0.020,
  // Both pinch gestures permit separated landmarks when the finger pads meet.
  // Ratios use 3D palm width (index MCP to little-finger MCP), not camera distance.
  pinchEnter: 0.50, pinchExit: 0.70, selectionPinchEnter: 0.60, resizeDoublingHeight: 0.25,
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
  center: Vec; palmSize: number; timestamp: number;
  pinch: { center: Vec; thumb: Vec; index: Vec; ratio: number } | null;
  rotation: { basis: Vec[]; shape: number[]; separation: number; cursor: Vec } | null;
  scaling: { cursor: Vec; ratio: number } | null;
}
function sample(frame: FigureGestureFrame, index: number, mirrored: boolean, preview: GestureRect): Sample | null {
  const image = frame.hands[index]; const world = frame.handWorldLandmarks[index];
  // Palm estimates supply hand scale and motion continuity. Each gesture below
  // separately validates only its own fingertips; missing points are never filled in.
  if (!image || !world || ![0, 5, 17].every(i => finite(image[i]))
    || ![5, 17].every(i => finite(world[i]))) return null;
  const usable = (i: number) => finite(image[i]) && finite(world[i])
    && image[i]!.x >= 0 && image[i]!.x <= 1 && image[i]!.y >= 0 && image[i]!.y <= 1;
  const screen = (i: number): Vec => [image[i]!.x * frame.width / frame.height, image[i]!.y, 0];
  const pixel = (i: number): Vec => [preview.left + (mirrored ? 1 - image[i]!.x : image[i]!.x) * preview.width, preview.top + image[i]!.y * preview.height, 0];
  const point = (i: number): Vec => [world[i]!.x * (mirrored ? -1 : 1), -world[i]!.y, -world[i]!.z];
  const palmSize = length(sub(screen(5), screen(17)));
  if (palmSize < 0.01) return null;
  const worldPalmWidth = length(sub(point(5), point(17)));
  if (worldPalmWidth <= 1e-6) return null;
  const thumb = usable(4), indexTip = usable(8), middle = usable(12);
  const pinch = thumb && indexTip ? {
    center: scale(add(pixel(4), pixel(8)), 0.5), thumb: pixel(4), index: pixel(8),
    ratio: length(sub(point(8), point(4))) / worldPalmWidth,
  } : null;
  const scaling = pinch && middle ? {
    cursor: scale(add(add(pixel(4), pixel(8)), pixel(12)), 1 / 3),
    ratio: Math.max(pinch.ratio, length(sub(point(12), point(8))) / worldPalmWidth,
      length(sub(point(4), point(12))) / worldPalmWidth),
  } : null;
  // Extension is measured along each finger in 3D, independently of camera angle.
  const extended = (joints: number[]) => {
    if (!joints.every(i => finite(world[i]))) return false;
    const chain = joints.map(point);
    const pathLength = chain.slice(1).reduce((sum, p, i) => sum + length(sub(p, chain[i]!)), 0);
    return pathLength > 1e-6 && length(sub(chain[3]!, chain[0]!)) / pathLength >= FIGURE_GESTURE_LIMITS.minFingerStraightness;
  };
  let rotation: Sample['rotation'] = null;
  if (scaling && extended([1, 2, 3, 4]) && extended([5, 6, 7, 8]) && extended([9, 10, 11, 12])) {
    const sides = [sub(point(8), point(4)), sub(point(12), point(8)), sub(point(4), point(12))];
    const distances = sides.map(length);
    const normal = cross(sides[0]!, scale(sides[2]!, -1));
    const longest = Math.max(...distances);
    if (longest > 1e-6 && length(normal) / longest ** 2 >= FIGURE_GESTURE_LIMITS.minTriangleArea) {
      const x = unit(sides[0]!), z = unit(normal);
      const perimeter = distances.reduce((sum, d) => sum + d, 0);
      rotation = { basis: [x, cross(z, x), z], shape: distances.map(d => d / perimeter),
        separation: Math.min(...distances), cursor: scaling.cursor };
    }
  }
  if (!pinch && !rotation && !scaling) return null;
  return { center: scale(add(add(screen(0), screen(5)), screen(17)), 1 / 3), palmSize,
    pinch, rotation, scaling, timestamp: frame.timestamp };
}
// An ordered fingertip triangle supplies all three axes of orientation.
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
function rotateBasis(basis: Vec[], axis: Vec, angle: number): Vec[] {
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return basis.map(v => add(add(scale(v, cosine), scale(cross(axis, v), sine)),
    scale(axis, (1 - cosine) * v.reduce((sum, value, i) => sum + value * axis[i]!, 0))));
}
export function createFigureGestureController() {
  let owner: string | null = null;
  let smoothedBasis: Vec[] | null = null;
  let previous: Sample | null = null;
  let mode: Mode = 'inactive';
  let lastTimestamp: number | null = null;
  let lastMirrored: boolean | null = null;
  let activeFigure: FigureId | null = null;
  let layoutKey = '';
  function resetReferences(): void {
    owner = null; previous = null; smoothedBasis = null; mode = 'inactive'; lastTimestamp = null; lastMirrored = null; layoutKey = '';
  }
  function reset(): void { resetReferences(); }
  function update(frame: FigureGestureFrame, mirrored: boolean, context: FigureGestureContext): FigureGestureResult {
    const out = (state: FigureGestureResult['state'] = 'waiting', extra: Partial<FigureGestureResult> = {}): FigureGestureResult =>
      ({ mode, state, selection: null, rotation: null, scaleFactor: null, ...extra });
    if (!Number.isFinite(frame.timestamp) || !(frame.width > 0) || !(frame.height > 0)
      || !Number.isFinite(frame.width) || !Number.isFinite(frame.height) || !(context.preview.width > 0) || !(context.preview.height > 0)
      || frame.hands.length !== frame.handWorldLandmarks.length || frame.hands.length !== frame.handedness.length) {
      resetReferences(); return out();
    }
    const key = JSON.stringify([context.preview, context.palette, context.targets, frame.width, frame.height]);
    if ((lastTimestamp !== null && (frame.timestamp <= lastTimestamp || frame.timestamp - lastTimestamp > FIGURE_GESTURE_LIMITS.maxGapMs))
      || (lastMirrored !== null && mirrored !== lastMirrored) || (layoutKey && key !== layoutKey)) resetReferences();
    if (context.activeFigure !== activeFigure) { previous = null; mode = 'inactive'; }
    activeFigure = context.activeFigure; layoutKey = key; lastTimestamp = frame.timestamp; lastMirrored = mirrored;
    const samples = new Map<string, Sample>();
    frame.handedness.forEach((label, i) => {
      if ((label !== 'Left' && label !== 'Right') || frame.handedness.filter(h => h === label).length !== 1) return;
      const current = sample(frame, i, mirrored, context.preview);
      if (current) samples.set(label, current);
    });
    // Palette selection belongs to either valid hand, independently of the hand
    // retained for rotation/scaling. Only an accepted selection transfers control.
    const limits = FIGURE_GESTURE_LIMITS;
    const overPalette = (s: Sample) => Boolean(
      (s.pinch && [s.pinch.center, s.pinch.thumb, s.pinch.index].some(p => inside(p, context.palette)))
      || (s.rotation && inside(s.rotation.cursor, context.palette))
      || (s.scaling && inside(s.scaling.cursor, context.palette)));
    const paletteHands = [...samples].filter(([, s]) => overPalette(s));
    // Resolve simultaneous selections deterministically, preferring the owner.
    paletteHands.sort(([a], [b]) => a === owner ? -1 : b === owner ? 1 : a.localeCompare(b));
    let selectionHint: string | undefined;
    for (const [label, s] of paletteHands) {
      if (!s.pinch) {
        selectionHint ??= 'Keep thumb and index fingertips in view to select a figure.';
        continue;
      }
      const target = context.targets.find(t => inside(s.pinch!.center, t.bounds));
      const hint = !target ? 'Place the center of your thumb and index pinch over a figure button.'
        : s.pinch.ratio > limits.selectionPinchEnter ? 'Pinch thumb and index together to select.' : undefined;
      if (!hint && target) {
        owner = label; previous = s; mode = 'palette';
        return out('controlling', { selection: target.id });
      }
      selectionHint ??= hint;
    }
    if (!samples.size) selectionHint = frame.hands.length ? 'Hand tracking is incomplete or uncertain. Keep the fingertips used by the gesture in view.'
      : 'No hands detected. Bring a hand into view.';
    if (owner !== null && !samples.has(owner)) { owner = null; previous = null; smoothedBasis = null; mode = 'inactive'; }
    if (owner === null) {
      owner = [...samples].find(([, s]) => overPalette(s)
        || (activeFigure && (s.scaling && s.scaling.ratio <= FIGURE_GESTURE_LIMITS.pinchEnter
          || (s.rotation && s.rotation.separation >= FIGURE_GESTURE_LIMITS.spreadEnter))))?.[0] ?? null;
    }
    const current = owner === null ? null : samples.get(owner)!;
    const prior = previous; const priorMode = mode;
    previous = current;
    if (!current || !owner) { mode = 'inactive'; return out('waiting', { selectionHint }); }
    if (prior && length(sub(current.center, prior.center)) / prior.palmSize > limits.identityDistance) {
      mode = 'inactive'; return out('ignored');
    }
    const triple = current.scaling && current.scaling.ratio <= (priorMode === 'scaling' ? limits.pinchExit : limits.pinchEnter);
    if (overPalette(current)) {
      mode = 'palette';
      return out('waiting', { selectionHint });
    }
    mode = !activeFigure ? 'inactive' : triple ? 'scaling'
      : current.rotation && current.rotation.separation >= (priorMode === 'rotation' ? limits.spreadExit : limits.spreadEnter) ? 'rotation' : 'inactive';
    if (!prior || mode === 'inactive' || mode !== priorMode) {
      smoothedBasis = current.rotation?.basis ?? null;
      return out('waiting', { selectionHint });
    }
    const dt = (current.timestamp - prior.timestamp) / 1000;
    const translation = length(sub(current.center, prior.center)) / ((current.palmSize + prior.palmSize) / 2) / dt;
    const sizeSpeed = Math.abs(Math.log(current.palmSize / prior.palmSize)) / dt;
    if (translation > limits.maxTranslationSpeed || sizeSpeed > limits.maxScaleSpeed) {
      smoothedBasis = current.rotation?.basis ?? null; return out('ignored');
    }
    if (mode === 'scaling') {
      if (!prior.scaling || !current.scaling) return out();
      const dy = (prior.scaling.cursor[1] - current.scaling.cursor[1]) / context.preview.height;
      return out('controlling', { scaleFactor: 2 ** (dy / limits.resizeDoublingHeight), selectionHint });
    }
    if (!prior.rotation || !current.rotation) return out();
    const rawRotation = orientationChange(prior.rotation.basis, current.rotation.basis);
    const shapeChange = Math.max(...current.rotation.shape.map((value, i) => Math.abs(value - prior.rotation!.shape[i]!)));
    if (rawRotation.angle / dt > limits.maxAngularSpeed || shapeChange > limits.maxShapeChange) {
      smoothedBasis = current.rotation?.basis ?? null; return out('ignored');
    }
    const from = smoothedBasis ?? prior.rotation.basis;
    const remaining = orientationChange(from, current.rotation.basis);
    // Time-based spherical low-pass filtering removes frame-to-frame jitter
    // without discarding slow intentional motion. Reset on rejected motion.
    const angle = remaining.angle * (1 - Math.exp(-dt * 1000 / limits.rotationSmoothingMs));
    smoothedBasis = rotateBasis(from, remaining.axis, angle);
    const rotation = { axis: remaining.axis, angle };
    return out('controlling', { rotation, selectionHint });
  }
  return { update, reset };
}
