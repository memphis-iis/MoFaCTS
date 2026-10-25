const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../../learning-components/units/skeleton-demo/handRotation.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject });
const { createHandRotationController } = exportsObject;
const rad = Math.PI / 180;

function hand({ angle = 0, tilt = 0, x = 0.5, y = 0.5, size = 1, label = 'Right', malformed = false } = {}) {
  const world = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  world[4] = { x: -0.03, y: 0.02, z: 0 };
  world[8] = { x: 0, y: -0.04, z: 0 };
  world[12] = { x: 0.03, y: 0.02, z: 0 };
  for (const i of [4, 8, 12]) {
    const p = world[i];
    const px = p.x * Math.cos(angle * rad) - p.y * Math.sin(angle * rad);
    const py = p.x * Math.sin(angle * rad) + p.y * Math.cos(angle * rad);
    world[i] = { x: px, y: py * Math.cos(tilt * rad), z: py * Math.sin(tilt * rad) };
  }
  if (malformed) world[12] = { ...world[8] };
  const image = world.map(p => ({ x: x + p.x * size, y: y + p.y * size, z: p.z }));
  image[0] = { x, y: y + 0.05 * size, z: 0 };
  image[5] = { x: x - 0.05 * size, y: y - 0.025 * size, z: 0 };
  image[17] = { x: x + 0.05 * size, y: y - 0.025 * size, z: 0 };
  return { world, image, label };
}
function frame(timestamp, hands = [hand()]) {
  return { timestamp, width: 640, height: 480, hands: hands.map(h => h.image),
    handWorldLandmarks: hands.map(h => h.world), handedness: hands.map(h => h.label) };
}
function baseline(controller, start = 0, options = {}, mirrored = false) {
  const result = controller.update(frame(start + 300, [hand(options)]), mirrored);
  assert.equal(result.rotation, null, 'One observation establishes a reference, without a dwell timer');
  assert.equal(result.state, 'waiting');
}
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ~= ${expected}`);

test('both directions apply 1:1 rotation and a slow reversal remains connected', () => {
  const controller = createHandRotationController(); baseline(controller);
  const first = controller.update(frame(400, [hand({ angle: 5 })]), false);
  near(Math.abs(first.rotation.angle), 5 * rad);
  const second = controller.update(frame(500, [hand({ angle: 4 })]), false);
  assert.equal(second.state, 'controlling');
  assert.ok(first.rotation.angle * second.rotation.angle < 0);
  near(Math.abs(second.rotation.angle), rad);
});

test('plane tilt alone does not spin; subsequent twist uses the tilted plane', () => {
  const controller = createHandRotationController(); baseline(controller);
  const tilted = controller.update(frame(400, [hand({ tilt: 15 })]), false);
  near(tilted.rotation.angle, 0);
  const turned = controller.update(frame(500, [hand({ tilt: 15, angle: 5 })]), false);
  near(Math.abs(turned.rotation.angle), 5 * rad);
  assert.ok(Math.abs(turned.rotation.axis[1]) > 0.2);
});

test('translation alone does not spin and fast translation freezes before applying rotation', () => {
  const controller = createHandRotationController(); baseline(controller);
  near(controller.update(frame(400, [hand({ x: 0.505 })]), false).rotation.angle, 0);
  const reset = controller.update(frame(500, [hand({ x: 0.6, angle: 5 })]), false);
  assert.equal(reset.state, 'ignored'); assert.equal(reset.rotation, null);
});

test('fast turn is ignored and the very next slow increment applies without replay or stillness', () => {
  const controller = createHandRotationController();
  controller.update(frame(0), false);
  const moving = controller.update(frame(67, [hand({ angle: 5 })]), false);
  near(Math.abs(moving.rotation.angle), 5 * rad);
  const fast = controller.update(frame(134, [hand({ angle: 65 })]), false);
  assert.equal(fast.state, 'ignored'); assert.equal(fast.rotation, null);
  const resumed = controller.update(frame(201, [hand({ angle: 70 })]), false);
  assert.equal(resumed.state, 'controlling'); near(Math.abs(resumed.rotation.angle), 5 * rad);
});

test('reversal below the speed cutoff applies even with high acceleration', () => {
  const controller = createHandRotationController(); baseline(controller);
  const first = controller.update(frame(400, [hand({ angle: 10 })]), false);
  const reversed = controller.update(frame(500, [hand({ angle: -30 })]), false);
  assert.equal(reversed.state, 'controlling');
  near(Math.abs(reversed.rotation.angle), 40 * rad);
  assert.ok(first.rotation.angle * reversed.rotation.angle < 0);
});

test('fast apparent depth movement is ignored and slowing resumes without a stable-size gate', () => {
  const controller = createHandRotationController(); baseline(controller);
  const reset = controller.update(frame(400, [hand({ size: 1.7, angle: 5 })]), false);
  assert.equal(reset.state, 'ignored'); assert.equal(reset.rotation, null);
  const resumed = controller.update(frame(500, [hand({ size: 1.8, angle: 10 })]), false);
  assert.equal(resumed.state, 'controlling'); near(Math.abs(resumed.rotation.angle), 5 * rad);
});

test('ordinary faster turns, hand translation and size changes stay connected', () => {
  for (const motion of [{ angle: 30 }, { angle: 5, x: 0.54 }, { angle: 5, size: 1.3 }]) {
    const controller = createHandRotationController(); baseline(controller);
    const result = controller.update(frame(400, [hand(motion)]), false);
    assert.equal(result.state, 'controlling');
    near(Math.abs(result.rotation.angle), motion.angle * rad);
  }
});

test('malformed triangles, nonfinite coordinates, and deformation cannot rotate the cube', () => {
  for (const mutate of [
    h => { h.world[12] = { ...h.world[8] }; },
    h => { h.world[4].z = NaN; },
    h => { h.image[8].x = 1.2; },
    h => { h.world[4].x = -0.3; },
  ]) {
    const controller = createHandRotationController(); baseline(controller);
    const bad = hand({ angle: 5 }); mutate(bad);
    const result = controller.update(frame(400, [bad]), false);
    assert.notEqual(result.state, 'controlling'); assert.equal(result.rotation, null);
  }
});

test('tracking loss and invalid timestamps require only a new reference pair', () => {
  for (const badFrame of [frame(400, []), frame(NaN)]) {
    const controller = createHandRotationController(); baseline(controller);
    const result = controller.update(badFrame, false);
    assert.equal(result.state, 'waiting'); assert.equal(result.rotation, null);
    const next = controller.update(frame(800, [hand({ angle: 5 })]), false);
    assert.equal(next.rotation, null);
    near(Math.abs(controller.update(frame(867, [hand({ angle: 10 })]), false).rotation.angle), 5 * rad);
  }
});

test('gaps and repeated timestamps rebase without a dwell period', () => {
  for (const timestamp of [300, 700]) {
    const controller = createHandRotationController(); baseline(controller);
    assert.equal(controller.update(frame(timestamp, [hand({ angle: 50 })]), false).rotation, null);
    near(Math.abs(controller.update(frame(timestamp + 67, [hand({ angle: 55 })]), false).rotation.angle), 5 * rad);
  }
});

test('hand identity survives array reordering but never jumps to another hand', () => {
  const controller = createHandRotationController(); baseline(controller);
  const left = hand({ label: 'Left', x: 0.25, angle: -10 });
  const result = controller.update(frame(400, [left, hand({ angle: 5 })]), false);
  near(Math.abs(result.rotation.angle), 5 * rad);
  const lost = controller.update(frame(500, [left]), false);
  assert.equal(lost.rotation, null); assert.equal(lost.state, 'waiting');
  const next = controller.update(frame(600, [left]), false);
  near(next.rotation.angle, 0); assert.equal(next.state, 'controlling');
});

test('either hand can acquire; duplicate identity and distant replacements disengage', () => {
  const leftController = createHandRotationController(); baseline(leftController, 0, { label: 'Left' });
  assert.ok(leftController.update(frame(400, [hand({ label: 'Left', angle: 5 })]), false).rotation);
  for (const hands of [[hand(), hand({ x: 0.75 })], [hand({ x: 0.9 })]]) {
    const controller = createHandRotationController(); baseline(controller);
    const result = controller.update(frame(400, hands), false);
    assert.notEqual(result.state, 'controlling'); assert.equal(result.rotation, null);
  }
});

test('mirroring reverses apparent screen spin, and camera lifecycle resets acquisition', () => {
  const results = [false, true].map(mirrored => {
    const controller = createHandRotationController(); baseline(controller, 0, {}, mirrored);
    const result = controller.update(frame(400, [hand({ angle: 5 })]), mirrored);
    controller.reset();
    assert.equal(controller.update(frame(500), mirrored).state, 'waiting');
    return result.rotation;
  });
  near(results[0].angle * results[0].axis[2], -results[1].angle * results[1].axis[2]);
});

test('a second hand never inherits the selected hand reference', () => {
  const controller = createHandRotationController();
  for (let t = 0; t <= 400; t += 100) controller.update(frame(t, [hand(), hand({ label: 'Left', x: 0.2 })]), false);
  const result = controller.update(frame(500, [hand({ x: 0.9 }), hand({ label: 'Left', x: 0.2 })]), false);
  assert.equal(result.state, 'ignored'); assert.equal(result.rotation, null);
  assert.equal(controller.update(frame(600, [hand({ label: 'Left', x: 0.2 })]), false).rotation, null);
  const next = controller.update(frame(667, [hand({ label: 'Left', x: 0.2, angle: 5 })]), false);
  near(Math.abs(next.rotation.angle), 5 * rad);
});

test('normal crossing stays continuous through a large cumulative plane tilt', () => {
  const controller = createHandRotationController(); baseline(controller);
  for (let i = 1; i <= 12; i++) {
    const result = controller.update(frame(300 + i * 100, [hand({ tilt: i * 15 })]), false);
    assert.equal(result.state, 'controlling'); near(result.rotation.angle, 0);
  }
});
