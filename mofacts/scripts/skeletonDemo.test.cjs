const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const app = path.resolve(__dirname, '..');
function load(relative, globals = {}, imports = {}) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(app, relative), 'utf8');
  const code = ts.transpileModule(source.replaceAll('import.meta.url', JSON.stringify('http://localhost:3200/poseTracking.ts')), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, DOMException, ...globals, require(name) {
    if (name.endsWith('cameraTrackingSession')) return load('client/views/experiment/svelte/services/cameraTrackingSession.ts', { window: { addEventListener() {} } }, {
      'meteor/tracker': { Tracker: { autorun() {} } }, 'meteor/meteor': {}, 'meteor/session': {},
      '../../../../lib/lessonRoute': {}, 'meteor/ostrio:flow-router-extra': {},
    });
    if (name.endsWith('/skeleton-demo/figureGestures')) return load('../learning-components/units/skeleton-demo/figureGestures.ts');
    if (!(name in imports)) throw Error(`Unexpected dependency ${name}`);
    return imports[name];
  } });
  return exports;
}

test('demo lifecycle completes explicitly without stimuli, responses, or history', async () => {
  const demo = load('../learning-components/units/skeleton-demo/manifest.ts');
  let factory;
  demo.skeletonDemoUnitComponentManifest.register({ registerUnitEngine(type, create) {
    assert.equal(type, 'skeleton-demo'); factory = create;
  } });
  const engine = factory();
  await engine.init();
  await engine.loadResumeState();
  assert.equal(engine.isFinished(), false);
  await assert.rejects(engine.cardAnswered(), /does not accept trial answers/);
  await assert.rejects(engine.advanceAfterAnswer(), /does not accept trial answers/);
  engine.completeDemo();
  assert.equal(engine.isFinished(), true);
  assert.equal(factory().isFinished(), false, 'Re-entry starts a fresh display-only unit');
});

test('demo schema rejects shared sessions, adaptive transitions, gaze, and invented settings', () => {
  const Ajv = require('ajv');
  const validate = new Ajv({ strict: false, validateFormats: false }).compile(
    JSON.parse(fs.readFileSync(path.join(app, 'public/tdfSchema.json'), 'utf8')));
  const doc = unit => ({ tutor: { setspec: { lessonname: 'Camera demo', stimulusfile: 'existing.json' }, unit: [unit] } });
  assert.equal(validate(doc({ skeletondemosession: {} })), true);
  assert.equal(validate(doc({ skeletondemosession: {}, gazeTracking: false })), true);
  for (const field of ['learningsession', 'assessmentsession', 'sparcsession', 'videosession', 'gazecalibrationsession', 'adaptive']) {
    assert.equal(validate(doc({ skeletondemosession: {}, [field]: {} })), false, field);
  }
  assert.equal(validate(doc({ skeletondemosession: {}, gazeTracking: true })), false);
  assert.equal(validate(doc({ skeletondemosession: { record: true } })), false);
});

test('resolver preserves existing unit types and rejects mixed demo sessions', () => {
  const { resolveUnitEngineTypeForUnit: resolve } = load('client/views/experiment/engineConstructors.ts', {}, {
    '../../../common/Definitions': { MODEL_UNIT: 'model', SPARC_UNIT: 'sparc', SCHEDULE_UNIT: 'schedule', VIDEO_UNIT: 'video' },
    './unitEngine': {},
  });
  const shapes = { skeletondemosession: 'skeleton-demo', gazecalibrationsession: 'gaze-calibration',
    learningsession: 'model', assessmentsession: 'schedule', sparcsession: 'sparc', videosession: 'video' };
  for (const [selector, type] of Object.entries(shapes)) {
    assert.equal(resolve({ [selector]: {} }, 'test'), type);
    if (selector !== 'skeletondemosession') {
      assert.throws(() => resolve({ [selector]: {}, skeletondemosession: {} }, 'test'), /multiple runnable/);
    }
  }
  assert.equal(resolve({ unitinstructions: 'Read' }, 'test'), 'instruction-only');
  assert.throws(() => resolve({ skeletondemosession: {}, gazeTracking: true }, 'test'), /cannot enable/);
});

test('camera releases streams granted after cancellation and never requests audio', async () => {
  let grant;
  let constraints;
  let stops = 0;
  const api = load('client/views/experiment/svelte/services/cameraCapture.ts', {
    navigator: { mediaDevices: { getUserMedia(options) {
      constraints = options; return new Promise(resolve => { grant = resolve; });
    } } },
  });
  const camera = api.createCameraCapture();
  const video = { srcObject: null, pause() {}, async play() {} };
  const pending = camera.start(video, () => {});
  await new Promise(resolve => setImmediate(resolve));
  camera.stop();
  grant({ getTracks: () => [{ stop() { stops++; } }] });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(stops, 1);
  assert.equal(video.srcObject, null);
  assert.equal(constraints.audio, false);
});

test('camera start/stop detaches the preview and releases every acquired track', async () => {
  let stops = 0;
  const track = { stop() { stops++; }, addEventListener() {}, getSettings: () => ({ deviceId: 'webcam' }) };
  const api = load('client/views/experiment/svelte/services/cameraCapture.ts', {
    navigator: { mediaDevices: { async getUserMedia() { return { getTracks: () => [track], getVideoTracks: () => [track] }; },
      async enumerateDevices() { return [{ kind: 'videoinput', deviceId: 'webcam' }]; } } },
  });
  const camera = api.createCameraCapture();
  const video = { srcObject: null, pause() {}, async play() {} };
  await camera.start(video, () => {});
  assert.ok(video.srcObject);
  camera.stop(); camera.stop();
  assert.equal(video.srcObject, null);
  assert.equal(stops, 1);
});

test('camera switching releases the old stream before requesting the exact device ID', async () => {
  const tracks = [];
  const requests = [];
  let ended = 0;
  let deny = false;
  const api = load('client/views/experiment/svelte/services/cameraCapture.ts', {
    navigator: { mediaDevices: { async getUserMedia(options) {
      assert.ok(tracks.every(track => track.stopped), 'Release previous camera before acquiring another');
      requests.push(options);
      if (deny) throw new DOMException('No rear camera', 'OverconstrainedError');
      const track = { stopped: false, stop() { this.stopped = true; }, addEventListener(name, listener) { this.ended = listener; },
        getSettings: () => ({ deviceId: options.video.deviceId?.exact || 'front' }) };
      tracks.push(track);
      return { getTracks: () => [track], getVideoTracks: () => [track] };
    }, async enumerateDevices() { return ['front', 'rear'].map(deviceId => ({ kind: 'videoinput', deviceId })); } } },
  });
  const camera = api.createCameraCapture();
  const video = { srcObject: null, pause() {}, async play() {} };
  await camera.start(video, () => ended++);
  await camera.start(video, () => ended++, 'rear');
  tracks[0].ended();
  assert.equal(ended, 0, 'Old camera events cannot stop the new camera');
  await camera.start(video, () => ended++, 'front');
  assert.deepEqual(requests.map(request => request.video.deviceId?.exact), [undefined, 'rear', 'front']);
  assert.ok(requests.every(request => request.audio === false));
  deny = true;
  await assert.rejects(camera.start(video, () => ended++, 'rear'), { name: 'OverconstrainedError' });
  assert.equal(requests.length, 4, 'An unavailable direction must not request a substitute camera');
  assert.equal(video.srcObject, null);
  assert.ok(tracks.every(track => track.stopped));
});

test('pose worker preserves observations and cadence, terminates active and pending models, and ignores stale replies', async () => {
  const createPoseWorkerHarness = require('./helpers/poseTrackingWorkerHarness.cjs');
  let frame;
  let detections = 0;
  let samples = 0;
  let releaseModel;
  let pendingModel = false;
  const workers = createPoseWorkerHarness({
    FilesetResolver: { async forVisionTasks() { return {}; } },
    PoseLandmarker: { POSE_CONNECTIONS: [], async createFromOptions() {
      if (pendingModel) await new Promise(resolve => { releaseModel = resolve; });
      return { close() {}, detectForVideo() { detections++; return { landmarks: [], worldLandmarks: [[{ x: 1, y: 2, z: 3, visibility: 1 }]] }; } };
    } },
    HandLandmarker: { HAND_CONNECTIONS: [], async createFromOptions() {
      return { close() {}, detectForVideo() { return { landmarks: [[{ x: .5, y: .5, z: 0, visibility: 0 }]],
        worldLandmarks: [[{ x: .01, y: .02, z: .03 }]], handedness: [[{ categoryName: 'Right', score: .65 }]] }; } };
    } },
  });
  const api = load('client/views/experiment/svelte/services/poseTracking.ts', {
    URL, Worker: workers.Worker, document: { hidden: false },
    createImageBitmap: async () => ({ close() {} }),
    requestAnimationFrame(fn) { frame = fn; return 1; }, cancelAnimationFrame() { frame = null; },
  });
  const tracking = api.createPoseTracking();
  const video = { readyState: 2, currentTime: 0, videoWidth: 640, videoHeight: 480 };
  const consume = observation => {
    samples++;
    assert.equal(observation.worldLandmarks[0].z, 3);
    assert.equal(observation.handWorldLandmarks[0][0].z, .03);
    assert.equal(observation.handedness[0], 'Right');
    assert.equal(observation.handednessConfidence[0], .65, 'Inference retains confidence; the gesture consumer owns policy');
    assert.equal(api.isInFrameLandmark(observation.hands[0][0]), true);
    assert.equal(api.isVisiblePoseLandmark(observation.hands[0][0]), false);
  };
  await tracking.start(video, consume, assert.fail);
  frame(100); await new Promise(resolve => setImmediate(resolve)); video.currentTime++;
  frame(110); frame(180); await new Promise(resolve => setImmediate(resolve));
  assert.equal(detections, 2); assert.equal(samples, 2);
  const stale = workers.instances[0].onmessage;
  tracking.stop();
  stale({ data: { type: 'frame', observation: {} } });
  assert.equal(samples, 2); assert.equal(frame, null); assert.equal(workers.instances[0].terminated, true);
  pendingModel = true;
  const pending = tracking.start(video, assert.fail, assert.fail);
  await new Promise(resolve => setImmediate(resolve));
  tracking.stop(); await pending; releaseModel(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(workers.instances[1].terminated, true);
  assert.equal(frame, null);
});

test('hand initialization errors close created models, reject startup, and terminate the worker', async () => {
  const createPoseWorkerHarness = require('./helpers/poseTrackingWorkerHarness.cjs');
  let closed = 0;
  const workers = createPoseWorkerHarness({
    FilesetResolver: { async forVisionTasks() { return {}; } },
    PoseLandmarker: { async createFromOptions() { return { close() { closed++; } }; } },
    HandLandmarker: { async createFromOptions() { throw Error('Hand model unavailable'); } },
  });
  const api = load('client/views/experiment/svelte/services/poseTracking.ts', {
    URL, Worker: workers.Worker, document: { hidden: false }, requestAnimationFrame: assert.fail, cancelAnimationFrame() {},
  });
  const tracking = api.createPoseTracking();
  await assert.rejects(tracking.start({}, assert.fail, assert.fail), /Hand model unavailable/);
  assert.equal(closed, 1); assert.equal(workers.instances[0].terminated, true);
});
