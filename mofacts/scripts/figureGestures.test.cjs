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
  world[5] = { x: -.03, y: 0, z: 0 };
  world[17] = { x: .03, y: 0, z: 0 };
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
  const h = options => { const value = hand(options); value.world[5].x = -.02; value.world[17].x = .02; return value; };
  const c = createFigureGestureController(); c.update(frame(0, [h({ spacing: .4 })]), false, context);
  assert.equal(c.update(frame(67, [h({ spacing: .4, angle: 5 })]), false, context).rotation, null);
  assert.equal(c.update(frame(134, [h()]), false, context).rotation, null);
  assert.ok(c.update(frame(201, [h({ spacing: .37, angle: 5 })]), false, context).rotation);
  assert.equal(c.update(frame(268, [h({ spacing: .3, angle: 10 })]), false, context).mode, 'inactive');
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

test('selection accepts a finger-pad gap relative to hand size and requires a wider reopening', () => {
  for (const mirrored of [false, true]) for (const scale of [.7, 1, 1.5]) {
    const c = createFigureGestureController();
    const x = mirrored ? .93 : .07;
    const make = gap => {
      const h = hand({ x, y: .3, gesture: 'pinch' });
      h.world[4].x = -gap / 2; h.world[8].x = gap / 2;
      for (const p of h.world) { p.x *= scale; p.y *= scale; p.z *= scale; }
      return h;
    };
    c.update(frame(0, [make(.045)]), mirrored, context);
    assert.equal(c.update(frame(67, [make(.036)]), mirrored, context).selection, null, 'An open pinch must not select');
    assert.equal(c.update(frame(134, [make(.018)]), mirrored, context).selection, 'cube', 'Separated landmarks can represent touching finger pads');
    assert.equal(c.update(frame(201, [make(.018)]), mirrored, context).selection, null, 'Holding cannot repeat');
    c.update(frame(268, [make(.036)]), mirrored, context);
    assert.equal(c.update(frame(335, [make(.018)]), mirrored, context).selection, null, 'Small jitter cannot rearm');
    c.update(frame(402, [make(.045)]), mirrored, context);
    assert.equal(c.update(frame(469, [make(.018)]), mirrored, context).selection, 'cube', 'Opening permits another selection');
  }
});

test('invalid palm geometry cannot select a figure', () => {
  const c = createFigureGestureController(); start(c, { x: .07, y: .3 });
  const h = hand({ x: .07, y: .3, gesture: 'pinch' });
  h.world[17] = { ...h.world[5] };
  assert.equal(c.update(frame(67, [h]), false, context).selection, null);
});

test('tracking dropouts preserve opening and held-pinch suppression but never accumulated motion', () => {
  const c = createFigureGestureController(); start(c, { x: .07, y: .3 });
  c.update(frame(67, []), false, context);
  assert.equal(c.update(frame(134, [hand({ x: .07, y: .3, gesture: 'pinch' })]), false, context).selection, 'cube');
  c.update(frame(500, []), false, context);
  assert.equal(c.update(frame(567, [hand({ x: .07, y: .3, gesture: 'pinch' })]), false, context).selection, null);
  c.update(frame(634, [hand()]), false, context);
  const reacquired = c.update(frame(1000, [hand({ angle: 70 })]), false, context);
  assert.equal(reacquired.rotation, null);
  near(c.update(frame(1067, [hand({ angle: 75 })]), false, context).rotation.angle, 5 * rad);
});

test('triple pinch accepts non-touching landmarks across hand sizes and camera magnifications', () => {
  for (const worldScale of [.7, 1, 1.5]) for (const imageScale of [.7, 1.3]) {
    const c = createFigureGestureController();
    const make = y => {
      const h = hand({ gesture: 'triple', spacing: 4, size: imageScale, y });
      for (const p of h.world) { p.x *= worldScale; p.y *= worldScale; p.z *= worldScale; }
      return h;
    };
    assert.equal(c.update(frame(0, [make(.6)]), false, context).scaleFactor, null);
    const up = c.update(frame(100, [make(.58)]), false, context);
    assert.equal(up.mode, 'scaling'); assert.equal(up.rotation, null); near(up.scaleFactor, 2 ** (.02 / .25));
    assert.ok(c.update(frame(200, [make(.6)]), false, context).scaleFactor < 1);
  }
});
test('reopening enables a second pinch, while its center must hit a button', () => {
  const c = createFigureGestureController(); start(c, { x: .07, y: .3 });
  assert.equal(c.update(frame(67, [hand({ x: .07, y: .3, gesture: 'pinch' })]), false, context).selection, 'cube');
  c.update(frame(134, [hand({ x: .07, y: .6 })]), false, context);
  assert.equal(c.update(frame(201, [hand({ x: .07, y: .6, gesture: 'pinch' })]), false, context).selection, 'pyramid');
  c.update(frame(268, [hand({ x: .16, y: .3 })]), false, context);
  assert.equal(c.update(frame(335, [hand({ x: .16, y: .3, gesture: 'pinch' })]), false, context).selection, null);
});

test('opening before entering the palette arms selection, including closing before reaching the button', () => {
  for (const mirrored of [false, true]) {
    const c = createFigureGestureController();
    const ctx = { ...context, activeFigure: null };
    const x = value => mirrored ? 1 - value : value;
    start(c, { x: x(.3), y: .3 }, ctx, mirrored);
    c.update(frame(67, [hand({ x: x(.16), y: .3, gesture: 'pinch' })]), mirrored, ctx);
    assert.equal(c.update(frame(134, [hand({ x: x(.07), y: .3, gesture: 'pinch' })]), mirrored, ctx).selection, 'cube');
    assert.equal(c.update(frame(201, [hand({ x: x(.07), y: .6, gesture: 'pinch' })]), mirrored, ctx).selection, null,
      'Holding the accepted pinch cannot select a second figure');
  }
});

test('a pinch centered on the button selects even when one tip straddles its edge', () => {
  const c = createFigureGestureController();
  start(c, { x: .12, y: .3 });
  assert.equal(c.update(frame(67, [hand({ x: .16, y: .3, gesture: 'pinch' })]), false, context).selection, null);
  assert.equal(c.update(frame(134, [hand({ x: .155, y: .3, gesture: 'pinch' })]), false, context).selection, 'cube');
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
test('triple pinch has hand-relative hysteresis and opens into rotation without a jump', () => {
  const c = createFigureGestureController(); start(c, { gesture: 'triple' });
  assert.equal(c.update(frame(67, [hand({ gesture: 'triple', spacing: 6, y: .48 })]), false, context).mode, 'scaling');
  const exited = c.update(frame(134, [hand({ gesture: 'triple', spacing: 8, y: .46 })]), false, context);
  assert.equal(exited.mode, 'rotation'); assert.equal(exited.scaleFactor, null); assert.equal(exited.rotation, null);
  assert.equal(c.update(frame(201, [hand({ gesture: 'triple', spacing: 6, y: .44 })]), false, context).mode, 'rotation');
});
test('a relaxed hand does not claim control before another hand reaches a palette target', () => {
  const c = createFigureGestureController(); const ctx = { ...context, activeFigure: null };
  const relaxed = hand({ spacing: .3, x: .8 });
  c.update(frame(0, [relaxed, hand({ label: 'Left', x: .07, y: .3 })]), false, ctx);
  const result = c.update(frame(67, [relaxed, hand({ label: 'Left', x: .07, y: .3, gesture: 'pinch' })]), false, ctx);
  assert.equal(result.selection, 'cube');
});

test('either hand can select while the other retains rotation ownership', () => {
  for (const mirrored of [false, true]) for (const reverse of [false, true]) {
    const c = createFigureGestureController();
    const x = value => mirrored ? 1 - value : value;
    const owner = hand({ x: x(.65) });
    const hands = gesture => {
      const pair = [owner, hand({ label: 'Left', x: x(.07), y: .6, gesture })];
      return reverse ? pair.reverse() : pair;
    };
    c.update(frame(0, [owner]), mirrored, context);
    c.update(frame(67, hands('spread')), mirrored, context);
    const result = c.update(frame(134, hands('pinch')), mirrored, context);
    assert.equal(result.selection, 'pyramid');
    assert.equal(result.rotation, null); assert.equal(result.scaleFactor, null);
    assert.equal(c.update(frame(201, hands('pinch')), mirrored, context).selection, null);
  }
});

test('the selecting hand establishes its own reference without replaying the old owner motion', () => {
  const c = createFigureGestureController(); start(c);
  const owner = hand({ angle: 20 });
  c.update(frame(67, [owner, hand({ label: 'Left', x: .07, y: .6 })]), false, context);
  assert.equal(c.update(frame(134, [owner, hand({ label: 'Left', x: .07, y: .6, gesture: 'pinch' })]), false, context).selection, 'pyramid');
  const ctx = { ...context, activeFigure: 'pyramid' };
  assert.equal(c.update(frame(201, [owner, hand({ label: 'Left', x: .7, angle: 40 })]), false, ctx).rotation, null);
  near(c.update(frame(268, [owner, hand({ label: 'Left', x: .7, angle: 45 })]), false, ctx).rotation.angle, 5 * rad);
});

test('selection reports target, pinch, middle-finger and tracking blockers without relaxing validity', () => {
  const c = createFigureGestureController();
  assert.match(start(c, { x: .07, y: .3 }).selectionHint, /Pinch thumb/);
  assert.match(c.update(frame(67, [hand({ x: .07, y: .3, gesture: 'triple' })]), false, context).selectionHint, /middle finger/);
  assert.match(c.update(frame(134, [hand({ x: .07, y: .3, gesture: 'pinch' })]), false, context).selectionHint, /Open thumb/);
  c.update(frame(201, [hand({ x: .07, y: .3 })]), false, context);
  assert.match(c.update(frame(268, [hand({ x: .07, y: .46, gesture: 'pinch' })]), false, context).selectionHint, /center.*figure button/);
  const f = frame(335, [hand({ x: .07, y: .3, gesture: 'pinch' })]);
  f.handedness[0] = '';
  assert.equal(c.update(f, false, context).selection, null);
  assert.match(c.update(frame(402, []), false, context).selectionHint, /No hands/);
});

test('invalid or ambiguous second hands cannot select around a retained owner', () => {
  for (const invalid of ['world', 'offscreen', 'ambiguous', 'identity']) {
    const c = createFigureGestureController(); start(c);
    c.update(frame(67, [hand(), hand({ label: 'Left', x: invalid === 'identity' ? .9 : .07, y: .6 })]), false, context);
    const selecting = hand({ label: 'Left', x: .07, y: .6, gesture: 'pinch' });
    if (invalid === 'world') selecting.world[12].z = NaN;
    if (invalid === 'offscreen') selecting.image[17].x = -1;
    const hands = [hand(), selecting];
    if (invalid === 'ambiguous') hands.push(hand({ label: 'Left' }));
    assert.equal(c.update(frame(134, hands), false, context).selection, null, invalid);
  }
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
