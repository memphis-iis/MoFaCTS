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
// Analytic first sample after a fresh reference, including velocity filtering.
const firstSmoothedAngle = degrees => {
  const speed = degrees * rad / .067 * (1 - Math.exp(-2 * Math.PI * .067));
  const cutoff = Math.min(1 / (2 * Math.PI * .1), 1 / (2 * Math.PI * .225) + speed);
  return degrees * rad * (1 - Math.exp(-2 * Math.PI * cutoff * .067));
};
const context = { preview: { left: 100, top: 50, width: 640, height: 480 }, palette: { left: 100, top: 50, width: 100, height: 480 },
  targets: [{ id: 'cube', bounds: { left: 100, top: 140, width: 100, height: 100 } },
    { id: 'pyramid', bounds: { left: 100, top: 280, width: 100, height: 100 } }], activeFigure: 'cube' };
function hand({ angle = 0, tilt = 0, x = .65, y = .5, size = 1, label = 'Right', gesture = 'spread', spacing = 1 } = {}) {
  const world = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  world[0] = { x: 0, y: .06, z: 0 };
  world[5] = { x: -.03, y: 0, z: 0 };
  world[17] = { x: .03, y: 0, z: 0 };
  const positions = gesture === 'triple' ? [[-.003, 0], [.003, 0], [0, .004]]
    : gesture === 'pinch' ? [[-.003, 0], [.003, 0], [.04, -.04]] : [[-.03, .02], [0, -.04], [.03, .02]];
  [4, 8, 12].forEach((i, j) => {
    const [px, py] = positions[j].map(v => v * spacing);
    world[i] = { x: px, y: py, z: 0 };
  });
  for (const p of world) {
    const tx = p.x * Math.cos(angle * rad) - p.y * Math.sin(angle * rad);
    const ty = p.x * Math.sin(angle * rad) + p.y * Math.cos(angle * rad);
    p.x = tx; p.y = ty * Math.cos(tilt * rad); p.z = ty * Math.sin(tilt * rad);
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

test('palm orientation turns immediately with temporal smoothing', () => {
  for (const motion of [{ angle: 15 }, { angle: -15 }, { tilt: 15 }]) {
    const c = createFigureGestureController();
    assert.equal(start(c).rotation, null);
    const result = c.update(frame(67, [hand(motion)]), false, context);
    assert.equal(result.mode, 'rotation'); near(result.rotation.angle, firstSmoothedAngle(15));
  }
});
test('fast rotation is skipped and the next slow rotation resumes without replay', () => {
  const c = createFigureGestureController(); start(c);
  near(c.update(frame(67, [hand({ angle: 5 })]), false, context).rotation.angle, firstSmoothedAngle(5));
  assert.equal(c.update(frame(134, [hand({ angle: 65 })]), false, context).state, 'ignored');
  near(c.update(frame(201, [hand({ angle: 70 })]), false, context).rotation.angle, firstSmoothedAngle(5));
});
test('finger bending and fingertip movement do not rotate a stationary palm', () => {
  const c = createFigureGestureController(); start(c);
  const h = hand();
  for (const i of [2, 3, 4, 6, 7, 8, 10, 11, 12]) h.world[i].z += .04;
  const r = c.update(frame(67, [h]), false, context);
  assert.equal(r.mode, 'rotation'); near(r.rotation.angle, 0);
});

test('smoothing suppresses alternating jitter and converges to intentional motion', () => {
  const c = createFigureGestureController(); start(c);
  let total = 0;
  for (let i = 1; i <= 30; i++) {
    const r = c.update(frame(i * 67, [hand({ angle: i % 2 ? 1 : -1 })]), false, context).rotation;
    assert.ok(r.angle < 1 * rad); total += r.angle * -r.axis[2];
  }
  assert.ok(Math.abs(total) < .5 * rad);
  for (let i = 31; i <= 90; i++) {
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
    c.update(frame(0, [make(.058)]), mirrored, context);
    assert.equal(c.update(frame(67, [make(.052)]), mirrored, context).selection, null, 'An open pinch must not select');
    assert.equal(c.update(frame(134, [make(.046)]), mirrored, context).selection, 'cube', 'A loose 46 mm estimated gap selects without fingertip contact');
    assert.equal(c.update(frame(201, [make(.046)]), mirrored, context).selection, 'cube', 'Holding remains valid');
    c.update(frame(268, [make(.052)]), mirrored, context);
    assert.equal(c.update(frame(335, [make(.046)]), mirrored, context).selection, 'cube', 'No reopening is required');
    c.update(frame(402, [make(.058)]), mirrored, context);
    assert.equal(c.update(frame(469, [make(.046)]), mirrored, context).selection, 'cube', 'Selection depends only on the current pinch');
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
  near(c.update(frame(1067, [hand({ angle: 75 })]), false, context).rotation.angle, firstSmoothedAngle(5));
});

test('triple pinch accepts non-touching landmarks across hand sizes and camera magnifications', () => {
  for (const worldScale of [.7, 1, 1.5]) for (const imageScale of [.7, 1.3]) {
    const c = createFigureGestureController();
    const make = y => {
      const h = hand({ gesture: 'triple', spacing: 7.5, size: imageScale, y });
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
  near(c.update(frame(867, [hand({ angle: 45 })]), false, context).rotation.angle, firstSmoothedAngle(5));
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
  assert.equal(c.update(frame(67, [hand({ gesture: 'triple', spacing: 9, y: .48 })]), false, context).mode, 'scaling');
  const exited = c.update(frame(134, [hand({ gesture: 'triple', spacing: 10, y: .46 })]), false, context);
  assert.equal(exited.mode, 'rotation'); assert.equal(exited.scaleFactor, null); assert.equal(exited.rotation, null);
  assert.equal(c.update(frame(201, [hand({ gesture: 'triple', spacing: 9, y: .44 })]), false, context).mode, 'rotation');
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
  near(c.update(frame(268, [owner, hand({ label: 'Left', x: .7, angle: 45 })]), false, ctx).rotation.angle, firstSmoothedAngle(5));
});

test('selection reports target, pinch and tracking blockers', () => {
  const c = createFigureGestureController();
  assert.match(start(c, { x: .07, y: .3 }).selectionHint, /thumb and index/);
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
  near(c.update(frame(67, [left, hand({ angle: 5 })]), false, context).rotation.angle, firstSmoothedAngle(5));
  assert.equal(c.update(frame(134, [left]), false, context).rotation, null);
  near(c.update(frame(201, [hand({ label: 'Left', x: .85, angle: 5 })]), false, context).rotation.angle, firstSmoothedAngle(5));
});
test('gaps, duplicates, ambiguous identity, invalid data, layout and figure changes cannot jump', () => {
  for (const mutation of ['gap', 'duplicate', 'invalid', 'ambiguous', 'layout', 'figure']) {
    const c = createFigureGestureController(); start(c);
    let f = frame(mutation === 'gap' ? 400 : mutation === 'duplicate' ? 0 : 67, [hand({ angle: 20 })]);
    let ctx = context;
    if (mutation === 'invalid') f.handWorldLandmarks[0][0].z = NaN;
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


test('collapsed palm geometry disengages rotation and reacquires without a jump', () => {
  const c = createFigureGestureController(); start(c);
  const h = hand(); h.world[0] = { x: 0, y: 0, z: 0 };
  assert.equal(c.update(frame(67, [h]), false, context).rotation, null);
  assert.equal(c.update(frame(134, [hand({ angle: 30 })]), false, context).rotation, null);
  assert.ok(c.update(frame(201, [hand({ angle: 35 })]), false, context).rotation);
});

test('depth tilt rotates the palm plane and rigid 3D hand angles preserve pinch acceptance', () => {
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

test('palm rotation works with every fingertip missing or offscreen', () => {
  for (const kind of partialKinds) for (const mirrored of [false, true]) {
    const c = createFigureGestureController(); start(c, {}, context, mirrored);
    const h = hand({ angle: 5 });
    for (const tip of [4, 8, 12, 16, 20]) omitTip(h, tip, kind);
    const r = c.update(frame(67, [h]), mirrored, context);
    assert.equal(r.mode, 'rotation'); assert.ok(r.rotation.angle > 0);
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
    for (const tip of [0, 5, 17]) {
      if (['left', 'right', 'top', 'bottom'].includes(kind)) continue;
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


test('palm orientation follows a continuous depth turn past edge-on without reversing', () => {
  const c = createFigureGestureController(); start(c);
  for (let i = 1; i <= 36; i++) {
    const r = c.update(frame(i * 67, [hand({ tilt: i * 5 })]), false, context).rotation;
    assert.ok(r && r.angle > 0, `tilt ${i * 5}`);
    assert.ok(r.axis[0] < -.99, `reversed wrist-tilt direction at tilt ${i * 5}`);
  }
});


test('an edge-on projected knuckle row retains palm rotation', () => {
  const c = createFigureGestureController();
  const make = angle => {
    const h = hand({ angle });
    h.image[5] = { x: .65, y: .5, z: -.03 };
    h.image[17] = { x: .65, y: .5, z: .03 };
    return h;
  };
  c.update(frame(0, [make(0)]), false, context);
  assert.ok(c.update(frame(67, [make(5)]), false, context).rotation);
});


test('only camera-horizontal wrist tilt reverses, preserving yaw and roll in both camera orientations', () => {
  for (const mirrored of [false, true]) for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 2 / 3, 2 / 3]]) {
    for (const sign of [-1, 1]) {
      const c = createFigureGestureController(); start(c, {}, context, mirrored);
      const h = hand(); const angle = sign * 10 * rad;
      for (const p of h.world) {
        const v = [p.x, p.y, p.z];
        const dot = axis.reduce((sum, value, i) => sum + value * v[i], 0);
        const cross = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
        [p.x, p.y, p.z] = v.map((value, i) => value * Math.cos(angle) + cross[i] * Math.sin(angle) + axis[i] * dot * (1 - Math.cos(angle)));
      }
      const r = c.update(frame(67, [h]), mirrored, context).rotation;
      near(r.angle, firstSmoothedAngle(10));
      const expected = [-axis[0], axis[1] * (mirrored ? 1 : -1), axis[2] * (mirrored ? 1 : -1)];
      expected.forEach((value, i) => near(r.axis[i], sign * value));
    }
  }
});


test('smoothing bounds jitter and settling time across sample rates and wrist tilt', () => {
  for (const mirrored of [false, true]) for (const motion of ['angle', 'tilt']) {
    for (const intervals of [[1000 / 15], [1000 / 30], [1000 / 60], [25, 80, 80, 25]]) {
      const c = createFigureGestureController(); start(c, {}, context, mirrored);
      const component = motion === 'tilt' ? 0 : 2;
      const direction = motion === 'tilt' || !mirrored ? -1 : 1;
      let time = 0, position = 0, peak = 0;
      for (let i = 0; time < 2000; i++) {
        time += intervals[i % intervals.length];
        const r = c.update(frame(time, [hand({ [motion]: i % 2 ? -1 : 1 })]), mirrored, context).rotation;
        assert.ok(r);
        position += r.angle * r.axis[component] * direction / rad;
        if (time > 500) peak = Math.max(peak, Math.abs(position));
      }
      assert.ok(peak < .25, `One-degree jitter stays below a quarter degree: ${peak}`);
      // A deliberate 15-degree turn reaches 90% within 550 ms and never overshoots.
      let elapsed = 0;
      for (let i = 0; elapsed < 550 - 1e-8; i++) {
        const dt = Math.min(intervals[i % intervals.length], 550 - elapsed);
        elapsed += dt; time += dt;
        const r = c.update(frame(time, [hand({ [motion]: 15 * Math.min(1, elapsed / 50) })]), mirrored, context).rotation;
        assert.ok(r);
        position += r.angle * r.axis[component] * direction / rad;
        assert.ok(position <= 15 + 1e-8);
      }
      assert.ok(position > 13.5, `Turn settles at least 90% within 550 ms: ${position}`);
    }
  }
});


test('adaptive smoothing is steadier than fixed 100 ms and follows turns faster than fixed 225 ms', () => {
  for (const hz of [15, 30, 60]) {
    const c = createFigureGestureController(); start(c);
    const dt = 1000 / hz;
    let position = 0, fixed100 = 0, fixed225 = 0;
    let jitter = 0, fixedJitter = 0, returnedJitter = 0, returnedFixedJitter = 0;
    let lag = 0, fixedLag = 0;
    for (let i = 1; i <= 6 * hz; i++) {
      const seconds = i / hz;
      const target = seconds <= 2 ? (i % 2 ? 1 : -1)
        : seconds <= 3 ? (seconds - 2) * 30
          : seconds <= 4 ? 30 : 30 + (i % 2 ? 1 : -1);
      const r = c.update(frame(i * dt, [hand({ angle: target })]), false, context).rotation;
      assert.ok(r);
      position += r.angle * -r.axis[2] / rad;
      fixed100 += (target - fixed100) * (1 - Math.exp(-dt / 100));
      fixed225 += (target - fixed225) * (1 - Math.exp(-dt / 225));
      if (seconds > 1 && seconds <= 2) { jitter += position ** 2; fixedJitter += fixed100 ** 2; }
      if (seconds > 2.5 && seconds <= 3) { lag += target - position; fixedLag += target - fixed225; }
      if (seconds > 5) { returnedJitter += (position - 30) ** 2; returnedFixedJitter += (fixed100 - 30) ** 2; }
    }
    assert.ok(Math.sqrt(jitter / fixedJitter) < .7, 'At least 30% lower resting RMS jitter than fixed 100 ms');
    assert.ok(lag / fixedLag < .75, 'At least 25% lower turning lag than fixed 225 ms');
    assert.ok(Math.sqrt(returnedJitter / returnedFixedJitter) < .7, 'Strong smoothing returns after movement stops');
  }
});
