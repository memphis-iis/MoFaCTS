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
  function projectFigure(id: FigureId, state: typeof states.cube, width: number, height: number, maxEdgeLength: number): FigureProjection | null {
    if (width <= 0 || height <= 0) return null;
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Invalid figure viewport');
    const definition = FIGURES[id];
    const value = Number(state.edgeLength.toFixed(2));
    const measurement = `${value} ${value === 1 ? 'unit' : 'units'}`;
    const lines = width < 76 ? ['AB = ', `${value} `, value === 1 ? 'unit' : 'units']
      : width < 130 ? ['AB = ', measurement] : [`AB = ${measurement}`];
    // Frame the fixed model-space anchors too. Reserve screen space for text
    // instead of moving labels independently when they approach a viewport edge.
    const radius = Math.sqrt(3) / 2 * maxEdgeLength * 1.25;
    const labelWidth = width < 76 ? 40 : width < 130 ? 76 : 124;
    const pixelsPerUnit = Math.min(Math.max(1, width - labelWidth), Math.max(1, height - lines.length * 16 - 8)) / (2 * radius);
    camera.left = -width / (2 * pixelsPerUnit); camera.right = -camera.left;
    camera.top = height / (2 * pixelsPerUnit); camera.bottom = -camera.top; camera.updateProjectionMatrix();
    const world = Object.fromEntries(Object.entries(definition.vertices).map(([id, v]) => [id, new THREE.Vector3(...v).multiplyScalar(state.edgeLength).applyQuaternion(state.orientation)]));
    const projectPoint = (point: THREE.Vector3): FigureScreenPoint => {
      const p = point.clone().project(camera);
      return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 };
    };
    const screen = Object.fromEntries(Object.entries(world).map(([id, point]) => [id, projectPoint(point)]));
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
    // Each anchor has one fixed position relative to the solid's centroid.
    // Rotation/scale therefore transform labels exactly as they transform edges.
    const vertices = Object.entries(world).map(([id, point]) => ({ id, ...projectPoint(point.clone().multiplyScalar(1.25)) }));
    const lengthLabel = { ...projectPoint(world.A!.clone().add(world.B!).multiplyScalar(0.75)), text: `AB = ${measurement}`, lines };
    return { name: definition.name, edges, vertices, lengthLabel };
  }
  function project(width: number, height: number): FigureProjection | null {
    return selected ? projectFigure(selected, states[selected], width, height, FIGURE_SIZE_LIMITS.max) : null;
  }
  function thumbnail(id: FigureId): FigureProjection {
    return projectFigure(id, { orientation: new THREE.Quaternion(), edgeLength: 1 }, 240, 220, 1)!;
  }
  return { select, apply, project, thumbnail, get activeFigure() { return selected; } };
}
