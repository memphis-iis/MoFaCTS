const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,
  '../../learning-components/units/skeleton-demo/poseDistanceMatcher.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: api });
const { POSE_JOINTS, POSE_TREE, distanceVector, segmentLengths, correctPose, scoreDistances, createPoseCalibration, CALIBRATION_FRAMES } = api;
function pose() {
  const p = [];
  [[11, 0, 0, 0], [12, 2, 0, 0], [13, -.5, 1, .3], [15, -.7, 2, 1], [14, 2.7, .8, -.3], [16, 2.4, 1.2, -1.3]]
    .forEach(([id, x, y, z]) => { p[id] = { x, y, z, visibility: 1 }; });
  return p;
}
const score = (a, b, fit = true) => scoreDistances(distanceVector(a), distanceVector(b), fit).residual;
function transform(p, factor = 1) {
  return p.map(q => ({ x: -q.y * factor + 12, y: q.x * factor - 4, z: q.z * factor + 7, visibility: 1 }));
}
test('labeled distances are invariant to translation, rotation and fitted uniform scale', () => {
  const target = pose();
  assert.ok(score(transform(target), target) < 1e-25);
  assert.ok(score(transform(target, 3), target) < 1e-25);
  assert.ok(score(transform(target, 3), target, false) > 1);
});
test('fixed per-segment calibration reconstructs proportions with identical articulation', () => {
  const target = pose();
  const targetLengths = segmentLengths(target);
  const altered = correctPose(target, [1, 1, 1, 1, 1], [1.4, .7, 1.6, .8, 1.3]);
  assert.ok(score(altered, target) > .005);
  const restored = correctPose(altered, segmentLengths(altered), targetLengths);
  assert.ok(score(restored, target, false) < 1e-25);
  assert.ok(Math.abs(distanceVector(restored)[POSE_JOINTS.length - 2] - distanceVector(target)[POSE_JOINTS.length - 2]) < 1e-10);
  const changed = pose(); changed[15] = { ...changed[15], x: .6, z: -.6 };
  const corrected = correctPose(changed, targetLengths, targetLengths);
  assert.ok(score(corrected, target) > .005, 'Changed elbow articulation remains distinguishable');
});
test('complete distance geometry retains articulation but accepts reflection without swapping labels', () => {
  const p = pose();
  const reflected = p.map(q => ({ ...q, x: -q.x }));
  assert.ok(score(reflected, p) < 1e-25);
  [reflected[15], reflected[16]] = [reflected[16], reflected[15]];
  assert.ok(score(reflected, p) > .005);
});
test('calibration is bounded, timestamp-unique and median robust; invalid samples cannot complete it', () => {
  const p = pose(); const calibration = createPoseCalibration();
  assert.equal(calibration.add([], 0), false);
  assert.equal(calibration.add(p, 1), true);
  assert.equal(calibration.add(p, 1), false);
  assert.equal(calibration.baseline(), null);
  for (let i = 2; i <= CALIBRATION_FRAMES; i++) calibration.add(i < 8 ? transform(p, 10) : p, i);
  assert.equal(calibration.count, CALIBRATION_FRAMES);
  assert.equal(calibration.add(p, 1000), false);
  segmentLengths(p).forEach((value, i) => assert.ok(Math.abs(value - calibration.baseline()[i]) < 1e-10));
  calibration.reset(); assert.equal(calibration.count, 0); assert.equal(calibration.baseline(), null);
});
test('missing, low quality, nonfinite and collapsed inputs are rejected; fixed ratios retain noise', () => {
  for (const bad of [undefined, { x: NaN, y: 0, z: 1, visibility: 1 }, { x: 1, y: 1, z: 1, visibility: .1 }]) {
    const p = pose(); p[15] = bad; assert.equal(distanceVector(p), null);
  }
  const p = pose(); p[15] = p[13]; assert.equal(segmentLengths(p), null);
  assert.equal(correctPose(pose(), [0, 1, 1, 1, 1], [1, 1, 1, 1, 1]), null);
  assert.equal(scoreDistances([0], [0]), null);
  assert.equal(scoreDistances([1], [Infinity]), null);
  assert.equal(scoreDistances([Number.MAX_VALUE], [1]), null);
  assert.equal(scoreDistances([1], [1, 2]), null);
  const noisy = pose(); noisy[15].z += .1;
  const corrected = correctPose(noisy, segmentLengths(pose()), segmentLengths(pose()));
  assert.ok(score(corrected, pose()) > 0);
  POSE_TREE.forEach(([a, b], i) => assert.ok(Math.abs(segmentLengths(corrected)[i] - segmentLengths(noisy)[i]) < 1e-10, `${a}-${b} noise retained`));
});
