const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('cube remains fixed in rotating axis coordinates and the full swept volume fits the view', async () => {
  const THREE = await import('three');
  let renderedScene;
  let renderedCamera;
  let resize;
  const exports = {};
  const host = { clientWidth: 800, clientHeight: 600, parentElement: null, prepend() {} };
  const labels = Array.from({ length: 3 }, () => ({ style: {} }));
  // Use real Three.js scene geometry/matrices with only the GPU and DOM boundary replaced.
  class Renderer {
    domElement = { setAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() {} };
    setPixelRatio() {} setClearColor() {} setSize() {} dispose() {} forceContextLoss() {}
    render(scene, camera) {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      renderedScene = scene; renderedCamera = camera;
    }
  }
  const source = fs.readFileSync(path.join(__dirname, '../client/views/experiment/svelte/services/handCubeScene.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require(name) { assert.equal(name, 'three'); return { ...THREE, WebGLRenderer: Renderer }; },
    window: { devicePixelRatio: 1 },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ color: '#000000', getPropertyValue: () => '#27641A' }),
  });
  const view = exports.createHandCubeScene(host, labels, assert.fail);
  const axes = renderedScene.getObjectsByProperty('type', 'AxesHelper')[0];
  const mesh = renderedScene.getObjectsByProperty('type', 'Mesh')[0];
  const relativePosition = axes.worldToLocal(mesh.getWorldPosition(new THREE.Vector3()));
  const originalWorldPosition = mesh.getWorldPosition(new THREE.Vector3());
  for (const aspect of [0.5, 1, 2.5]) {
    host.clientWidth = 600 * aspect; host.clientHeight = 600; resize();
    for (let i = 0; i < 32; i++) {
      const axis = new THREE.Vector3(Math.sin(i + 1), Math.cos(i + 2), Math.sin(i + 3)).normalize();
      view.rotate({ axis: axis.toArray(), angle: 0.31 });
      const position = axes.worldToLocal(mesh.getWorldPosition(new THREE.Vector3()));
      assert.ok(position.distanceTo(relativePosition) < 1e-9, 'The cube retains its coordinates relative to the axes');
      const relativeOrientation = axes.getWorldQuaternion(new THREE.Quaternion()).invert()
        .multiply(mesh.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(relativeOrientation.angleTo(new THREE.Quaternion()) < 1e-7, 'The cube retains its orientation relative to the axes');
      for (const x of [-0.475, 0.475]) for (const y of [-0.475, 0.475]) for (const z of [-0.475, 0.475]) {
        const point = mesh.localToWorld(new THREE.Vector3(x, y, z)).project(renderedCamera);
        assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, 'Every cube corner remains in view');
      }
      for (const [index, endpoint] of [[0, [1.4, 0, 0]], [1, [0, 1.4, 0]], [2, [0, 0, 1.4]]]) {
        const projected = axes.localToWorld(new THREE.Vector3(...endpoint)).project(renderedCamera);
        assert.ok(Math.abs(parseFloat(labels[index].style.left) - (projected.x + 1) * 50) < 1e-8);
        assert.ok(Math.abs(parseFloat(labels[index].style.top) - (1 - projected.y) * 50) < 1e-8);
      }
    }
  }
  assert.ok(mesh.getWorldPosition(new THREE.Vector3()).distanceTo(originalWorldPosition) > 0.1,
    'An offset cube moves around the axis origin instead of spinning in place');
  view.dispose();
});
