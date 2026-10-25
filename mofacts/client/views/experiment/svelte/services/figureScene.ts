import * as THREE from 'three';
import { FIGURES, FIGURE_SIZE_LIMITS, type FigureId } from '../../../../../../learning-components/units/skeleton-demo/figureGeometry';
import type { FigureGestureResult } from '../../../../../../learning-components/units/skeleton-demo/figureGestures';
export interface FigureScreenPoint { readonly x: number; readonly y: number }
export interface FigureProjection {
  readonly name: string;
  readonly edges: readonly { readonly id: string; readonly from: FigureScreenPoint; readonly to: FigureScreenPoint;
    readonly tickStart: FigureScreenPoint; readonly tickEnd: FigureScreenPoint; readonly visible: boolean }[];
  readonly vertices: readonly { readonly id: string; readonly x: number; readonly y: number }[];
  readonly lengthLabel: { readonly x: number; readonly y: number; readonly text: string; readonly lines: readonly string[] };
}
// One vector renderer: Three.js owns exact 3D transforms/projection; the display
// draws those projected edges and screen-sized annotations as theme-owned SVG.
export function createFigureScene() {
  const states = { cube: { orientation: new THREE.Quaternion(), edgeLength: 1 }, pyramid: { orientation: new THREE.Quaternion(), edgeLength: 1 } };
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.up.set(0, 0, 1); camera.position.set(3, -6, 3); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const towardCamera = camera.position.clone().normalize();
  let selected: FigureId | null = null;
  function select(id: FigureId): void { selected = id; }
  function apply(control: FigureGestureResult): void {
    if (control.selection) select(control.selection);
    if (!selected) return;
    const state = states[selected];
    if (control.rotation) {
      const axis = new THREE.Vector3(...control.rotation.axis).applyQuaternion(camera.quaternion);
      state.orientation.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, control.rotation.angle)).normalize();
    }
    if (control.scaleFactor !== null) state.edgeLength = Math.max(FIGURE_SIZE_LIMITS.min, Math.min(FIGURE_SIZE_LIMITS.max, state.edgeLength * control.scaleFactor));
  }
  function project(width: number, height: number): FigureProjection | null {
    if (!selected || width <= 0 || height <= 0) return null;
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Invalid figure viewport');
    const definition = FIGURES[selected], state = states[selected];
    const radius = Math.sqrt(3) / 2 * FIGURE_SIZE_LIMITS.max;
    const pixelsPerUnit = Math.min(width * 0.72, height * 0.72) / (2 * radius);
    camera.left = -width / (2 * pixelsPerUnit); camera.right = -camera.left;
    camera.top = height / (2 * pixelsPerUnit); camera.bottom = -camera.top; camera.updateProjectionMatrix();
    const world = Object.fromEntries(Object.entries(definition.vertices).map(([id, v]) => [id, new THREE.Vector3(...v).multiplyScalar(state.edgeLength).applyQuaternion(state.orientation)]));
    const screen = Object.fromEntries(Object.entries(world).map(([id, point]) => {
      const p = point.clone().project(camera);
      return [id, { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 }];
    }));
    const front = definition.faces.map(face => {
      const a = world[face[0]!]!, b = world[face[1]!]!, c = world[face[2]!]!;
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (normal.dot(a) < 0) normal.negate();
      return { face, visible: normal.dot(towardCamera) >= -1e-10 };
    });
    const edges = definition.edges.map(id => {
      const from = screen[id[0]!]!, to = screen[id[1]!]!;
      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const dx = length > 1e-6 ? -(to.y - from.y) / length * 4 : 4;
      const dy = length > 1e-6 ? (to.x - from.x) / length * 4 : 0;
      return { id, from, to, tickStart: { x: mx - dx, y: my - dy }, tickEnd: { x: mx + dx, y: my + dy },
        visible: front.some(f => f.visible && f.face.includes(id[0]!) && f.face.includes(id[1]!)) };
    });
    const ab = edges.find(edge => edge.id === 'AB')!;
    const value = Number(state.edgeLength.toFixed(2));
    const measurement = `${value} ${value === 1 ? 'unit' : 'units'}`;
    const lines = width < 76 ? ['AB = ', `${value} `, value === 1 ? 'unit' : 'units']
      : width < 130 ? ['AB = ', measurement] : [`AB = ${measurement}`];
    const labelWidth = Math.min(124, width - 8);
    const verticalMargin = lines.length * 8 + 4;
    const lengthLabel = { x: Math.max(labelWidth / 2, Math.min(width - labelWidth / 2, (ab.from.x + ab.to.x) / 2)),
      y: Math.max(verticalMargin, Math.min(height - verticalMargin, (ab.from.y + ab.to.y) / 2 + 28)),
      text: `AB = ${measurement}`, lines };
    // Prefer offsets near each vertex, then move labels apart when projected
    // vertices coincide. Font/tick dimensions do not change with solid scale.
    const used = [{ x: lengthLabel.x, y: lengthLabel.y, halfWidth: labelWidth / 2 }];
    const vertices = Object.entries(screen).map(([id, point]) => {
      let best = { x: point.x, y: point.y, score: Infinity };
      for (const distance of [16, 30, 44, 58]) for (let step = 0; step < 8; step++) {
        const angle = Math.atan2(point.y - height / 2, point.x - width / 2) + step * Math.PI / 4;
        const x = Math.max(10, Math.min(width - 10, point.x + distance * Math.cos(angle)));
        const y = Math.max(12, Math.min(height - 12, point.y + distance * Math.sin(angle)));
        const overlaps = used.filter(p => Math.abs(p.x - x) < p.halfWidth + 10 && Math.abs(p.y - y) < 22).length;
        const score = overlaps * 10000 + Math.hypot(x - point.x, y - point.y) + step;
        if (score < best.score) best = { x, y, score };
      }
      used.push({ x: best.x, y: best.y, halfWidth: 8 });
      return { id, x: best.x, y: best.y };
    });
    return { name: definition.name, edges, vertices, lengthLabel };
  }
  return { select, apply, project, get activeFigure() { return selected; } };
}
