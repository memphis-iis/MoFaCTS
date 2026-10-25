const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function moduleFrom(filename, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require(name) { if (!(name in imports)) throw Error(name); return imports[name]; } });
  return exports;
}
const geometry = moduleFrom(path.join(__dirname, '../../learning-components/units/skeleton-demo/figureGeometry.ts'));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ~= ${b}`);
const control = extra => ({ mode: 'rotation', state: 'controlling', selection: null, rotation: null, scaleFactor: null, ...extra });
async function sceneFactory() {
  return moduleFrom(path.join(__dirname, '../client/views/experiment/svelte/services/figureScene.ts'), {
    three: await import('three'), '../../../../../../learning-components/units/skeleton-demo/figureGeometry': geometry,
  }).createFigureScene();
}
test('both exact solids have unit edges and solid-volume centroid at zero', async () => {
  const THREE = await import('three');
  for (const figure of Object.values(geometry.FIGURES)) {
    const vertices = Object.fromEntries(Object.entries(figure.vertices).map(([k, v]) => [k, new THREE.Vector3(...v)]));
    for (const edge of figure.edges) near(vertices[edge[0]].distanceTo(vertices[edge[1]]), 1);
    let volume = 0; const moment = new THREE.Vector3();
    for (const face of figure.faces) {
      const a = vertices[face[0]];
      for (let i = 1; i < face.length - 1; i++) {
        const b = vertices[face[i]], c = vertices[face[i + 1]];
        const tetra = Math.abs(a.dot(b.clone().cross(c))) / 6;
        volume += tetra; moment.add(a.clone().add(b).add(c).multiplyScalar(tetra / 4));
      }
    }
    near(moment.divideScalar(volume).length(), 0);
    near(volume, figure.id === 'cube' ? 1 : Math.SQRT1_2 / 3);
  }
  near(geometry.FIGURES.pyramid.vertices.E[2] - geometry.FIGURES.pyramid.vertices.A[2], Math.SQRT1_2);
});
test('hidden edges, congruence ticks and vertex labels follow real geometry', async () => {
  const scene = await sceneFactory(); assert.equal(scene.project(800, 600), null);
  for (const [id, count] of [['cube', 12], ['pyramid', 8]]) {
    scene.select(id); const p = scene.project(800, 600);
    assert.equal(p.edges.length, count); assert.equal(p.vertices.length, id === 'cube' ? 8 : 5);
    assert.equal(p.edges.filter(e => !e.visible).length, 3);
    for (const edge of p.edges) {
      near(Math.hypot(edge.tickEnd.x - edge.tickStart.x, edge.tickEnd.y - edge.tickStart.y), 8);
      near((edge.tickEnd.x + edge.tickStart.x) / 2, (edge.from.x + edge.to.x) / 2);
      near((edge.tickEnd.y + edge.tickStart.y) / 2, (edge.from.y + edge.to.y) / 2);
    }
    assert.equal(p.lengthLabel.text, 'AB = 1 unit');
  }
});
test('rotation pivots at the centroid, changes visibility and retains each figure state', async () => {
  const scene = await sceneFactory(); scene.select('cube'); const original = scene.project(800, 600);
  scene.apply(control({ rotation: { axis: [0, 0, 1], angle: 1 }, scaleFactor: 2 }));
  const changed = scene.project(800, 600);
  assert.notEqual(JSON.stringify(original.edges), JSON.stringify(changed.edges));
  assert.equal(changed.lengthLabel.text, 'AB = 2 units');
  // A centroid-centered cube's projected paired opposite vertices remain symmetric.
  const endpoints = changed.edges.flatMap(e => [e.from, e.to]);
  near(endpoints.reduce((sum, p) => sum + p.x, 0) / endpoints.length, 400);
  near(endpoints.reduce((sum, p) => sum + p.y, 0) / endpoints.length, 300);
  scene.select('pyramid'); assert.equal(scene.project(800, 600).lengthLabel.text, 'AB = 1 unit');
  scene.select('cube'); assert.equal(JSON.stringify(scene.project(800, 600)), JSON.stringify(changed));
});
test('size limits, immediate reversal and fixed projection keep geometry and annotations in view', async () => {
  const scene = await sceneFactory(); scene.select('cube');
  scene.apply(control({ scaleFactor: 100 })); assert.equal(scene.project(800, 600).lengthLabel.text, 'AB = 4 units');
  scene.apply(control({ scaleFactor: .5 })); assert.equal(scene.project(800, 600).lengthLabel.text, 'AB = 2 units');
  scene.apply(control({ scaleFactor: .001 })); assert.equal(scene.project(800, 600).lengthLabel.text, 'AB = 0.25 units');
  scene.apply(control({ scaleFactor: 2 })); assert.equal(scene.project(800, 600).lengthLabel.text, 'AB = 0.5 units');
  for (const id of ['cube', 'pyramid']) for (const [width, height] of [[130, 300], [800, 600], [600, 130]]) {
    scene.select(id); scene.apply(control({ scaleFactor: 100 }));
    for (let i = 0; i < 40; i++) {
      scene.apply(control({ rotation: { axis: [0, 1, 0], angle: .37 } }));
      const p = scene.project(width, height);
      for (const point of [...p.vertices, ...p.edges.flatMap(e => [e.from, e.to, e.tickStart, e.tickEnd])]) {
        assert.ok(point.x > 0 && point.x < width && point.y > 0 && point.y < height);
      }
    }
  }
});
