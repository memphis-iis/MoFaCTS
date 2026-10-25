const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../../learning-components/units/skeleton-demo/figureGestures.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject });
const { createFigureGestureController } = exportsObject;
const rad = Math.PI / 180;
const context = { preview: { left: 100, top: 50, width: 640, height: 480 }, palette: { left: 100, top: 50, width: 100, height: 480 },
  targets: [{ id: 'cube', bounds: { left: 100, top: 140, width: 100, height: 100 } },
    { id: 'pyramid', bounds: { left: 100, top: 280, width: 100, height: 100 } }], activeFigure: 'cube' };
function hand({ angle = 0, tilt = 0, x = .65, y = .5, size = 1, label = 'Right', gesture = 'spread', spacing = 1 } = {}) {
  const world = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const positions = gesture === 'triple' ? [[-.003, 0], [.003, 0], [0, .004]]
    : gesture === 'pinch' ? [[-.003, 0], [.003, 0], [.04, -.04]] : [[-.03, .02], [0, -.04], [.03, .02]];
  [4, 8, 12].forEach((i, j) => {
    const [px, py] = positions[j].map(v => v * spacing);
    const tx = px * Math.cos(angle * rad) - py * Math.sin(angle * rad);
    const ty = px * Math.sin(angle * rad) + py * Math.cos(angle * rad);
    world[i] = { x: tx, y: ty * Math.cos(tilt * rad), z: ty * Math.sin(tilt * rad) };
  });
  const image = world.map(p => ({ x: x + p.x * size, y: y + p.y * size, z: p.z }));
  image[0] = { x, y: y + .05 * size, z: 0 };
  image[5] = { x: x - .05 * size, y: y - .025 * size, z: 0 };
  image[17] = { x: x + .05 * size, y: y - .025 * size, z: 0 };
  return { world, image, label };
}
function frame(timestamp, hands = [hand()]) {
  return { timestamp, width: 640, height: 480, hands: hands.map(h => h.image),
    handWorldLandmarks: hands.map(h => h.world), handedness: hands.map(h => h.label) };
}
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} ~= ${b}`);
const start = (controller, options = {}, ctx = context, mirrored = false) => controller.update(frame(0, [hand(options)]), mirrored, ctx);

test('full tilt and twist rotate at 1:1 without a dwell timer', () => {
  for (const motion of [{ angle: 15 }, { tilt: 15 }, { angle: -15 }]) {
    const c = createFigureGestureController();
    assert.equal(start(c).rotation, null);
    const result = c.update(frame(67, [hand(motion)]), false, context);
    assert.equal(result.mode, 'rotation'); near(result.rotation.angle, 15 * rad);
  }
});
test('fast rotation is skipped and the next slow rotation resumes without replay', () => {
  const c = createFigureGestureController(); start(c);
  near(c.update(frame(67, [hand({ angle: 5 })]), false, context).rotation.angle, 5 * rad);
  assert.equal(c.update(frame(134, [hand({ angle: 65 })]), false, context).state, 'ignored');
  near(c.update(frame(201, [hand({ angle: 70 })]), false, context).rotation.angle, 5 * rad);
});
test('a half turn at the cutoff has a valid finite axis', () => {
  const c = createFigureGestureController(); start(c);
  const result = c.update(frame(250, [hand({ tilt: 180 })]), false, context);
  near(result.rotation.angle, Math.PI); near(Math.hypot(...result.rotation.axis), 1);
});
test('inch-spread entry and hysteresis reject small/unstable triangles without requiring stillness', () => {
  const c = createFigureGestureController(); start(c, { spacing: .4 });
  assert.equal(c.update(frame(67, [hand({ spacing: .4, angle: 5 })]), false, context).rotation, null);
  assert.equal(c.update(frame(134, [hand()]), false, context).rotation, null);
  assert.ok(c.update(frame(201, [hand({ spacing: .37, angle: 5 })]), false, context).rotation);
  assert.equal(c.update(frame(268, [hand({ spacing: .3, angle: 10 })]), false, context).mode, 'inactive');
});
test('camera pinch selects one icon once, with offsets and mirroring accounted for', () => {
  for (const mirrored of [false, true]) {
    const ctx = { ...context, activeFigure: null };
    const c = createFigureGestureController();
    const x = mirrored ? .93 : .07;
    start(c, { x, y: .3 }, ctx, mirrored);
    const selected = c.update(frame(67, [hand({ x, y: .3, gesture: 'pinch' })]), mirrored, ctx);
    assert.equal(selected.selection, 'cube'); assert.equal(selected.rotation, null);
    assert.equal(c.update(frame(134, [hand({ x, y: .3, gesture: 'pinch' })]), mirrored, ctx).selection, null);
  }
});
test('reopening enables a second pinch, while both fingertips must hit the same button', () => {
  const c = createFigureGestureController(); start(c, { x: .07, y: .3 });
  assert.equal(c.update(frame(67, [hand({ x: .07, y: .3, gesture: 'pinch' })]), false, context).selection, 'cube');
  c.update(frame(134, [hand({ x: .07, y: .6 })]), false, context);
  assert.equal(c.update(frame(201, [hand({ x: .07, y: .6, gesture: 'pinch' })]), false, context).selection, 'pyramid');
  c.update(frame(268, [hand({ x: .155, y: .3 })]), false, context);
  assert.equal(c.update(frame(335, [hand({ x: .155, y: .3, gesture: 'pinch' })]), false, context).selection, null);
});
test('triple pinch takes priority and palette space never rotates or resizes', () => {
  const c = createFigureGestureController(); start(c, { x: .07, y: .3 });
  const triple = c.update(frame(67, [hand({ x: .07, y: .3, gesture: 'triple' })]), false, context);
  assert.equal(triple.selection, null); assert.equal(triple.scaleFactor, null); assert.equal(triple.rotation, null);
  const rotate = c.update(frame(134, [hand({ x: .07, y: .3, angle: 5 })]), false, context);
  assert.equal(rotate.rotation, null);
});
test('triple pinch up/down changes length proportionally; switching modes never jumps', () => {
  const c = createFigureGestureController(); start(c);
  assert.equal(c.update(frame(100, [hand({ gesture: 'triple', y: .7 })]), false, context).scaleFactor, null);
  let factor = 1;
  for (let i = 1; i <= 5; i++) {
    const result = c.update(frame(100 + i * 100, [hand({ gesture: 'triple', y: .7 - i * .05 })]), false, context);
    factor *= result.scaleFactor; assert.equal(result.rotation, null);
  }
  near(factor, 2);
  assert.ok(c.update(frame(700, [hand({ gesture: 'triple', y: .5 })]), false, context).scaleFactor < 1);
  assert.equal(c.update(frame(800, [hand({ angle: 40 })]), false, context).rotation, null);
  near(c.update(frame(900, [hand({ angle: 45 })]), false, context).rotation.angle, 5 * rad);
});
test('fast resizing is skipped and slowing down resumes on the next observation', () => {
  const c = createFigureGestureController(); start(c, { gesture: 'triple', y: .7 });
  const fast = c.update(frame(67, [hand({ gesture: 'triple', y: .5 })]), false, context);
  assert.equal(fast.state, 'ignored'); assert.equal(fast.scaleFactor, null);
  const slow = c.update(frame(134, [hand({ gesture: 'triple', y: .48 })]), false, context);
  near(slow.scaleFactor, 2 ** (.02 / .25));
});
test('triple pinch has distance hysteresis and neutral movement cannot resize', () => {
  const c = createFigureGestureController(); start(c, { gesture: 'triple' });
  assert.equal(c.update(frame(67, [hand({ gesture: 'triple', spacing: 2.5, y: .48 })]), false, context).mode, 'scaling');
  const exited = c.update(frame(134, [hand({ gesture: 'triple', spacing: 3.2, y: .46 })]), false, context);
  assert.equal(exited.mode, 'inactive'); assert.equal(exited.scaleFactor, null);
  assert.equal(c.update(frame(201, [hand({ gesture: 'triple', spacing: 2.5, y: .44 })]), false, context).mode, 'inactive');
});
test('a relaxed hand does not claim control before another hand reaches a palette target', () => {
  const c = createFigureGestureController(); const ctx = { ...context, activeFigure: null };
  const relaxed = hand({ spacing: .3, x: .8 });
  c.update(frame(0, [relaxed, hand({ label: 'Left', x: .07, y: .3 })]), false, ctx);
  const result = c.update(frame(67, [relaxed, hand({ label: 'Left', x: .07, y: .3, gesture: 'pinch' })]), false, ctx);
  assert.equal(result.selection, 'cube');
});
test('hand identity survives array reordering and changes require one fresh reference', () => {
  const c = createFigureGestureController(); start(c);
  const left = hand({ label: 'Left', x: .85 });
  near(c.update(frame(67, [left, hand({ angle: 5 })]), false, context).rotation.angle, 5 * rad);
  assert.equal(c.update(frame(134, [left]), false, context).rotation, null);
  near(c.update(frame(201, [hand({ label: 'Left', x: .85, angle: 5 })]), false, context).rotation.angle, 5 * rad);
});
test('gaps, duplicates, ambiguous identity, invalid data, layout and figure changes cannot jump', () => {
  for (const mutation of ['gap', 'duplicate', 'invalid', 'ambiguous', 'layout', 'figure']) {
    const c = createFigureGestureController(); start(c);
    let f = frame(mutation === 'gap' ? 400 : mutation === 'duplicate' ? 0 : 67, [hand({ angle: 20 })]);
    let ctx = context;
    if (mutation === 'invalid') f.handWorldLandmarks[0][4].z = NaN;
    if (mutation === 'ambiguous') f = frame(67, [hand(), hand({ x: .85 })]);
    if (mutation === 'layout') ctx = { ...context, preview: { ...context.preview, width: 600 } };
    if (mutation === 'figure') ctx = { ...context, activeFigure: 'pyramid' };
    assert.equal(c.update(f, false, ctx).rotation, null, mutation);
  }
});
test('reflection reverses screen twist and camera reset clears only gesture references', () => {
  const rotations = [false, true].map(mirrored => {
    const c = createFigureGestureController(); start(c, {}, context, mirrored);
    const result = c.update(frame(67, [hand({ angle: 5 })]), mirrored, context);
    c.reset(); assert.equal(c.update(frame(134), mirrored, context).rotation, null);
    return result.rotation;
  });
  near(rotations[0].axis[2], -rotations[1].axis[2]);
});
