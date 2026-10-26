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
  world[1] = { x: -.06, y: .06, z: 0 }; world[9] = { x: .015, y: .035, z: 0 };
  for (const [base, joint1, joint2, tip] of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]) {
    for (const [joint, fraction] of [[joint1, 1 / 3], [joint2, 2 / 3]]) {
      world[joint] = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, world[base][axis] + fraction * (world[tip][axis] - world[base][axis])]));
    }
  }
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

test('extended three-finger orientation turns immediately with temporal smoothing', () => {
  for (const motion of [{ angle: 15 }, { angle: -15 }, { tilt: 15 }]) {
    const c = createFigureGestureController();
    assert.equal(start(c).rotation, null);
    const result = c.update(frame(67, [hand(motion)]), false, context);
    assert.equal(result.mode, 'rotation'); near(result.rotation.angle, 15 * rad * (1 - Math.exp(-.67)));
  }
});
test('fast rotation is skipped and the next slow rotation resumes without replay', () => {
  const c = createFigureGestureController(); start(c);
  near(c.update(frame(67, [hand({ angle: 5 })]), false, context).rotation.angle, 5 * rad * (1 - Math.exp(-.67)));
  assert.equal(c.update(frame(134, [hand({ angle: 65 })]), false, context).state, 'ignored');
  near(c.update(frame(201, [hand({ angle: 70 })]), false, context).rotation.angle, 5 * rad * (1 - Math.exp(-.67)));
});
test('each rotation finger must be extended, with no extension requirement for selection or resizing', () => {
  for (const joint of [2, 6, 10]) {
    const c = createFigureGestureController(); start(c);
    const bent = hand({ angle: 5 }); bent.world[joint].z += .07;
    assert.equal(c.update(frame(67, [bent]), false, context).mode, 'inactive');
    assert.equal(c.update(frame(134, [hand({ angle: 40 })]), false, context).rotation, null);
    assert.ok(c.update(frame(201, [hand({ angle: 45 })]), false, context).rotation);
    const selecting = hand({ x: .07, y: .3, gesture: 'pinch' }); selecting.world[joint].z += .07;
    assert.equal(createFigureGestureController().update(frame(0, [selecting]), false, context).selection, 'cube');
    const sizing = hand({ gesture: 'triple' }); sizing.world[joint].z += .07;
    assert.equal(createFigureGestureController().update(frame(0, [sizing]), false, context).mode, 'scaling');
  }
});

test('smoothing suppresses alternating jitter and converges to intentional motion', () => {
  const c = createFigureGestureController(); start(c);
  let total = 0;
  for (let i = 1; i <= 30; i++) {
    const r = c.update(frame(i * 67, [hand({ angle: i % 2 ? 1 : -1 })]), false, context).rotation;
    assert.ok(r.angle < 1 * rad); total += r.angle * -r.axis[2];
  }
  assert.ok(Math.abs(total) < .5 * rad);
  for (let i = 31; i <= 60; i++) {
    const r = c.update(frame(i * 67, [hand({ angle: 15 })]), false, context).rotation;
    total += r.angle * -r.axis[2];
  }
  near(total, 15 * rad, 1e-7);
});

test('camera pinch selects immediately, with offsets and mirroring accounted for', () => {
  for (const mirrored of [false, true]) {
    const ctx = { ...context, activeFigure: null };
    const c = createFigureGestureController();
    const x = mirrored ? .93 : .07;
    assert.equal(start(c, { x, y: .3, gesture: 'pinch' }, ctx, mirrored).selection, 'cube');
    const selected = c.update(frame(67, [hand({ x, y: .3, gesture: 'pinch' })]), mirrored, ctx);
    assert.equal(selected.selection, 'cube'); assert.equal(selected.rotation, null);
    assert.equal(c.update(frame(134, [hand({ x, y: .3, gesture: 'pinch' })]), mirrored, ctx).selection, 'cube');
  }
});

test('selection accepts a finger-pad gap relative to hand size without requiring reopening', () => {
  for (const mirrored of [false, true]) for (const scale of [.7, 1, 1.5]) {
    const c = createFigureGestureController();
    const x = mirrored ? .93 : .07;
    const make = gap => {
      const h = hand({ x, y: .3, gesture: 'pinch' });
      h.world[4].x = -gap / 2; h.world[8].x = gap / 2;
      for (const p of h.world) { p.x *= scale; p.y *= scale; p.z *= scale; }
      return h;
    };
    c.update(frame(0, [make(.051)]), mirrored, context);
    assert.equal(c.update(frame(67, [make(.040)]), mirrored, context).selection, null, 'An open pinch must not select');
    assert.equal(c.update(frame(134, [make(.034)]), mirrored, context).selection, 'cube', 'Separated landmarks can represent touching finger pads');
    assert.equal(c.update(frame(201, [make(.034)]), mirrored, context).selection, 'cube', 'Holding remains valid');
    c.update(frame(268, [make(.040)]), mirrored, context);
    assert.equal(c.update(frame(335, [make(.034)]), mirrored, context).selection, 'cube', 'No reopening is required');
    c.update(frame(402, [make(.051)]), mirrored, context);
    assert.equal(c.update(frame(469, [make(.034)]), mirrored, context).selection, 'cube', 'Selection depends only on the current pinch');
  }
});

test('invalid palm geometry cannot select a figure', () => {
  const c = createFigureGestureController(); start(c, { x: .07, y: .3 });
  const h = hand({ x: .07, y: .3, gesture: 'pinch' });
  h.world[17] = { ...h.world[5] };
  assert.equal(c.update(frame(67, [h]), false, context).selection, null);
});

test('tracking dropouts allow immediate selection but never accumulated motion', () => {
  const c = createFigureGestureController(); start(c, { x: .07, y: .3 });
  c.update(frame(67, []), false, context);
  assert.equal(c.update(frame(134, [hand({ x: .07, y: .3, gesture: 'pinch' })]), false, context).selection, 'cube');
  c.update(frame(500, []), false, context);
  assert.equal(c.update(frame(567, [hand({ x: .07, y: .3, gesture: 'pinch' })]), false, context).selection, 'cube');
  c.update(frame(634, [hand()]), false, context);
  const reacquired = c.update(frame(1000, [hand({ angle: 70 })]), false, context);
  assert.equal(reacquired.rotation, null);
  near(c.update(frame(1067, [hand({ angle: 75 })]), false, context).rotation.angle, 5 * rad * (1 - Math.exp(-.67)));
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
test('a held pinch can select another button, while its center must hit a button', () => {
  const c = createFigureGestureController(); start(c, { x: .07, y: .3 });
  assert.equal(c.update(frame(67, [hand({ x: .07, y: .3, gesture: 'pinch' })]), false, context).selection, 'cube');
  c.update(frame(134, [hand({ x: .07, y: .6 })]), false, context);
  assert.equal(c.update(frame(201, [hand({ x: .07, y: .6, gesture: 'pinch' })]), false, context).selection, 'pyramid');
  c.update(frame(268, [hand({ x: .16, y: .3 })]), false, context);
  assert.equal(c.update(frame(335, [hand({ x: .16, y: .3, gesture: 'pinch' })]), false, context).selection, null);
});

test('a hand arriving already pinched selects and can move between buttons', () => {
  for (const mirrored of [false, true]) {
    const c = createFigureGestureController();
    const ctx = { ...context, activeFigure: null };
    const x = value => mirrored ? 1 - value : value;
    start(c, { x: x(.3), y: .3, gesture: 'pinch' }, ctx, mirrored);
    c.update(frame(67, [hand({ x: x(.16), y: .3, gesture: 'pinch' })]), mirrored, ctx);
    assert.equal(c.update(frame(134, [hand({ x: x(.07), y: .3, gesture: 'pinch' })]), mirrored, ctx).selection, 'cube');
    assert.equal(c.update(frame(201, [hand({ x: x(.07), y: .6, gesture: 'pinch' })]), mirrored, ctx).selection, 'pyramid',
      'Holding the pinch selects a second figure immediately');
  }
});

test('a pinch centered on the button selects even when one tip straddles its edge', () => {
  const c = createFigureGestureController();
  start(c, { x: .12, y: .3 });
  assert.equal(c.update(frame(67, [hand({ x: .16, y: .3, gesture: 'pinch' })]), false, context).selection, null);
  assert.equal(c.update(frame(134, [hand({ x: .155, y: .3, gesture: 'pinch' })]), false, context).selection, 'cube');
});
test('button selection takes priority over triple pinch without rotating or resizing', () => {
  const c = createFigureGestureController(); start(c, { x: .07, y: .3 });
  const triple = c.update(frame(67, [hand({ x: .07, y: .3, gesture: 'triple' })]), false, context);
  assert.equal(triple.selection, 'cube'); assert.equal(triple.scaleFactor, null); assert.equal(triple.rotation, null);
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
  near(c.update(frame(867, [hand({ angle: 45 })]), false, context).rotation.angle, 5 * rad * (1 - Math.exp(-.67)));
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
    assert.equal(c.update(frame(201, hands('pinch')), mirrored, context).selection, 'pyramid');
  }
});

test('the selecting hand establishes its own reference without replaying the old owner motion', () => {
  const c = createFigureGestureController(); start(c);
  const owner = hand({ angle: 20 });
  c.update(frame(67, [owner, hand({ label: 'Left', x: .07, y: .6 })]), false, context);
  assert.equal(c.update(frame(134, [owner, hand({ label: 'Left', x: .07, y: .6, gesture: 'pinch' })]), false, context).selection, 'pyramid');
  const ctx = { ...context, activeFigure: 'pyramid' };
  assert.equal(c.update(frame(201, [owner, hand({ label: 'Left', x: .7, angle: 40 })]), false, ctx).rotation, null);
  near(c.update(frame(268, [owner, hand({ label: 'Left', x: .7, angle: 45 })]), false, ctx).rotation.angle, 5 * rad * (1 - Math.exp(-.67)));
});

test('selection reports target, pinch and tracking blockers', () => {
  const c = createFigureGestureController();
  assert.match(start(c, { x: .07, y: .3 }).selectionHint, /Pinch thumb/);
  assert.equal(c.update(frame(67, [hand({ x: .07, y: .3, gesture: 'triple' })]), false, context).selection, 'cube');
  assert.equal(c.update(frame(134, [hand({ x: .07, y: .3, gesture: 'pinch' })]), false, context).selection, 'cube');
  c.update(frame(201, [hand({ x: .07, y: .3 })]), false, context);
  assert.match(c.update(frame(268, [hand({ x: .07, y: .46, gesture: 'pinch' })]), false, context).selectionHint, /center.*figure button/);
  const f = frame(335, [hand({ x: .07, y: .3, gesture: 'pinch' })]);
  f.handedness[0] = '';
  assert.equal(c.update(f, false, context).selection, null);
  assert.match(c.update(frame(402, []), false, context).selectionHint, /No hands/);
});

test('invalid or ambiguous second hands cannot select around a retained owner', () => {
  for (const invalid of ['world', 'offscreen', 'ambiguous']) {
    const c = createFigureGestureController(); start(c);
    c.update(frame(67, [hand(), hand({ label: 'Left', x: .07, y: .6 })]), false, context);
    const selecting = hand({ label: 'Left', x: .07, y: .6, gesture: 'pinch' });
    if (invalid === 'world') selecting.world[8].z = NaN;
    if (invalid === 'offscreen') selecting.image[8].x = -1;
    const hands = [hand(), selecting];
    if (invalid === 'ambiguous') hands.push(hand({ label: 'Left' }));
    assert.equal(c.update(frame(134, hands), false, context).selection, null, invalid);
  }
});
test('hand identity survives array reordering and changes require one fresh reference', () => {
  const c = createFigureGestureController(); start(c);
  const left = hand({ label: 'Left', x: .85 });
  near(c.update(frame(67, [left, hand({ angle: 5 })]), false, context).rotation.angle, 5 * rad * (1 - Math.exp(-.67)));
  assert.equal(c.update(frame(134, [left]), false, context).rotation, null);
  near(c.update(frame(201, [hand({ label: 'Left', x: .85, angle: 5 })]), false, context).rotation.angle, 5 * rad * (1 - Math.exp(-.67)));
});
test('gaps, duplicates, ambiguous identity, invalid data, layout and figure changes cannot jump', () => {
  for (const mutation of ['gap', 'duplicate', 'invalid', 'ambiguous', 'layout', 'figure']) {
    const c = createFigureGestureController(); start(c);
    let f = frame(mutation === 'gap' ? 400 : mutation === 'duplicate' ? 0 : 67, [hand({ angle: 20 })]);
    let ctx = context;
    if (mutation === 'invalid') f.handWorldLandmarks[0][8].z = NaN;
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


test('narrow or collapsed fingertip triangles disengage rotation', () => {
  const c = createFigureGestureController(); start(c);
  const h = hand(); h.world[4] = { ...h.world[8] };
  assert.equal(c.update(frame(67, [h]), false, context).rotation, null);
  assert.equal(c.update(frame(134, [hand({ angle: 30 })]), false, context).rotation, null);
  assert.ok(c.update(frame(201, [hand({ angle: 35 })]), false, context).rotation);
});

test('depth tilt rotates the three-finger triangle and rigid 3D hand angles preserve pinch acceptance', () => {
  const c = createFigureGestureController(); start(c);
  const rotation = c.update(frame(67, [hand({ tilt: 15 })]), false, context).rotation;
  assert.ok(rotation.angle > 0); assert.ok(Math.abs(rotation.axis[0]) > .5);
  for (const angle of [0, 45, 80]) {
    const picker = createFigureGestureController(); start(picker, { x: .07, y: .3 });
    const h = hand({ x: .07, y: .3, gesture: 'pinch' });
    h.world[4].x = -.017; h.world[8].x = .017;
    for (const point of h.world) {
      const x = point.x, z = point.z;
      point.x = x * Math.cos(angle * rad) - z * Math.sin(angle * rad);
      point.z = x * Math.sin(angle * rad) + z * Math.cos(angle * rad);
    }
    assert.equal(picker.update(frame(67, [h]), false, context).selection, 'cube');
  }
});


test('three fingertips already together activate resizing on arrival and after a tracking gap', () => {
  const c = createFigureGestureController();
  const first = start(c, { gesture: 'triple', y: .6 });
  assert.equal(first.mode, 'scaling'); assert.equal(first.scaleFactor, null);
  assert.ok(c.update(frame(67, [hand({ gesture: 'triple', y: .58 })]), false, context).scaleFactor > 1);
  c.update(frame(134, []), false, context);
  assert.equal(c.update(frame(500, [hand({ gesture: 'triple', y: .4 })]), false, context).mode, 'scaling');
  assert.ok(c.update(frame(567, [hand({ gesture: 'triple', y: .42 })]), false, context).scaleFactor < 1);
});


const partialKinds = ['missing-image', 'missing-world', 'invalid-image', 'invalid-world', 'left', 'right', 'top', 'bottom'];
function omitTip(h, tip, kind) {
  if (kind === 'missing-image') delete h.image[tip];
  if (kind === 'missing-world') delete h.world[tip];
  if (kind === 'invalid-image') h.image[tip].x = NaN;
  if (kind === 'invalid-world') h.world[tip].z = NaN;
  if (kind === 'left') h.image[tip].x = -.01;
  if (kind === 'right') h.image[tip].x = 1.01;
  if (kind === 'top') h.image[tip].y = -.01;
  if (kind === 'bottom') h.image[tip].y = 1.01;
  return h;
}

test('rotation requires all three fingertips but ignores ring and little fingertips', () => {
  for (const kind of partialKinds) for (const mirrored of [false, true]) {
    for (const tip of [4, 8, 12]) {
      const c = createFigureGestureController(); start(c, {}, context, mirrored);
      assert.equal(c.update(frame(67, [omitTip(hand({ angle: 5 }), tip, kind)]), mirrored, context).rotation, null);
    }
    const c = createFigureGestureController(); start(c, {}, context, mirrored);
    const h = omitTip(omitTip(hand({ angle: 5 }), 16, kind), 20, kind);
    assert.ok(c.update(frame(67, [h]), mirrored, context).rotation);
  }
});

test('button selection needs no middle fingertip, including selection by the second hand', () => {
  for (const kind of partialKinds) for (const mirrored of [false, true]) {
    const c = createFigureGestureController(); start(c, {}, context, mirrored);
    const make = y => omitTip(hand({ label: 'Left', x: mirrored ? .93 : .07, y, gesture: 'pinch' }), 12, kind);
    assert.equal(c.update(frame(67, [hand(), make(.3)]), mirrored, context).selection, 'cube', kind);
    assert.equal(c.update(frame(134, [make(.6), hand()]), mirrored, context).selection, 'pyramid', kind);
  }
});

test('missing required fingertips disable only the affected gesture and reacquire without a jump', () => {
  for (const kind of partialKinds) {
    for (const tip of [4, 8]) {
      const c = createFigureGestureController();
      const h = omitTip(hand({ x: .07, y: .3, gesture: 'pinch' }), tip, kind);
      assert.equal(c.update(frame(0, [h]), false, context).selection, null);
    }
    for (const tip of [4, 8, 12]) {
      const c = createFigureGestureController(); start(c);
      assert.equal(c.update(frame(67, [omitTip(hand({ angle: 5 }), tip, kind)]), false, context).rotation, null);
      assert.equal(c.update(frame(134, [hand({ angle: 40 })]), false, context).rotation, null);
      assert.ok(c.update(frame(201, [hand({ angle: 45 })]), false, context).rotation);
    }
    for (const tip of [4, 8, 12]) {
      const c = createFigureGestureController(); start(c, { gesture: 'triple', y: .6 });
      assert.equal(c.update(frame(67, [omitTip(hand({ gesture: 'triple', y: .58 }), tip, kind)]), false, context).scaleFactor, null);
      const resumed = c.update(frame(134, [hand({ gesture: 'triple', y: .4 })]), false, context);
      assert.equal(resumed.mode, 'scaling'); assert.equal(resumed.scaleFactor, null);
      assert.ok(c.update(frame(201, [hand({ gesture: 'triple', y: .42 })]), false, context).scaleFactor < 1);
    }
  }
});


test('three-finger orientation follows a continuous depth turn past edge-on without reversing', () => {
  const c = createFigureGestureController(); start(c);
  for (let i = 1; i <= 36; i++) {
    const r = c.update(frame(i * 67, [hand({ tilt: i * 5 })]), false, context).rotation;
    assert.ok(r && r.angle > 0, `tilt ${i * 5}`);
    assert.ok(r.axis[0] > .99, `same rotation direction at tilt ${i * 5}`);
  }
});
