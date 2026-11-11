// Real camera-session, gaze, capture and pose lifecycle code. Only browser/model
// inputs and Meteor session/route values are controlled; no physical camera.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const createPoseWorkerHarness = require('./helpers/poseTrackingWorkerHarness.cjs');
const services = path.resolve(__dirname, '../client/views/experiment/svelte/services');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function harness() {
  let now = 1000;
  let snapshot;
  let listener;
  let route = '/content/lesson';
  let user = 'synthetic';
  let lesson = 'lesson';
  let cameraGate, gazeGate, poseGate, handGate, resumeGate;
  let failure;
  let requests = 0;
  let begins = 0;
  let closes = 0;
  let poses = 0;
  const streams = [];
  const frames = new Map();
  const autoruns = [];
  const events = new Map();
  const nodes = new Map();
  const settings = [];
  const document = { hidden: false, getElementById: id => nodes.get(id),
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
  const window = { ...document, innerWidth: 1000, innerHeight: 800 };
  const regression = { eyeFeaturesClicks: { length: 0 }, init() { this.eyeFeaturesClicks.length = 0; } };
  function stream(deviceId) {
    const track = { readyState: 'live', handlers: [], stop() { this.readyState = 'ended'; },
      getSettings: () => ({ deviceId }), addEventListener(name, fn) { if (name === 'ended') this.handlers.push(fn); } };
    const value = { getTracks: () => [track], getVideoTracks: () => [track], track };
    streams.push(value); return value;
  }
  const mediaDevices = {
    async getUserMedia(options) {
      requests++; settings.push(options);
      assert.ok(streams.every(s => s.track.readyState === 'ended'), 'Never acquire alongside another live camera');
      if (cameraGate) await cameraGate.promise;
      if (failure) throw failure;
      return stream(options.video?.deviceId?.exact || 'front');
    },
    async enumerateDevices() { return ['front', 'rear'].map(deviceId => ({ kind: 'videoinput', deviceId })); },
  };
  const webgazer = {
    params: {},
    async begin() {
      begins++;
      const acquired = await mediaDevices.getUserMedia({ audio: false, video: true });
      nodes.set('webgazerVideoFeed', { srcObject: acquired });
      for (const id of ['webgazerVideoContainer', 'webgazerGazeDot']) nodes.set(id, { remove() { nodes.delete(id); } });
      if (gazeGate) await gazeGate.promise;
    },
    pause() {}, async resume() { if (resumeGate) await resumeGate.promise; },
    end() { nodes.clear(); }, removeMouseEventListeners() {},
    setGazeListener(fn) { listener = fn; return this; },
    getRegression: () => [regression], getTracker: () => ({ getPositions: () => [1] }),
    recordScreenPosition() { regression.eyeFeaturesClicks.length++; },
  };
  for (const name of ['saveDataAcrossSessions', 'applyKalmanFilter', 'showPredictionPoints', 'showVideoPreview', 'showFaceOverlay', 'showFaceFeedbackBox']) webgazer[name] = () => webgazer;
  const model = () => ({ close() { closes++; }, detectForVideo() { poses++; return { landmarks: [], worldLandmarks: [] }; } });
  const imports = {
    'meteor/tracker': { Tracker: { autorun(fn) { autoruns.push(fn); fn(); } } },
    'meteor/meteor': { Meteor: { userId: () => user } },
    'meteor/session': { Session: { get: () => lesson } },
    'meteor/ostrio:flow-router-extra': { FlowRouter: { watchPathChange() {}, current: () => ({ path: route }) } },
    '../../../../lib/lessonRoute': { isLessonRoutePath: (p, surface) => p === surface || p.startsWith(surface + '/') },
    'svelte/store': { writable(value) { snapshot = value; return { set(value) { snapshot = value; } }; } },
    'webgazer/dist/webgazer.commonjs2.js': { webgazer },
    '@mediapipe/tasks-vision': {
      FilesetResolver: { async forVisionTasks() { return {}; } },
      PoseLandmarker: { POSE_CONNECTIONS: [], async createFromOptions() { if (poseGate) await poseGate.promise; return model(); } },
      HandLandmarker: { HAND_CONNECTIONS: [], async createFromOptions() {
        if (handGate) await handGate.promise;
        return { close() { closes++; }, detectForVideo() { return { landmarks: [], worldLandmarks: [], handedness: [] }; } };
      } },
    },
  };
  const workers = createPoseWorkerHarness(imports['@mediapipe/tasks-vision']);
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {}; cache.set(name, exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(services, name + '.ts'), 'utf8').replaceAll('import.meta.url', JSON.stringify('http://localhost:3200/poseTracking.ts')), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    vm.runInNewContext(code, { exports, DOMException, Error, URL, Worker: workers.Worker, createImageBitmap: async () => ({ close() {} }), performance: { now: () => now },
      document, window, navigator: { mediaDevices }, setTimeout, clearTimeout,
      requestAnimationFrame(fn) { const id = Math.random(); frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
      require(dependency) {
        if (dependency in imports) return imports[dependency];
        if (dependency.startsWith('./')) return load(dependency.slice(2));
        throw Error('Unexpected dependency: ' + dependency);
      },
    });
    return exports;
  }
  const gaze = load('gazeTracking');
  const session = load('cameraTrackingSession');
  const capture = load('cameraCapture').createCameraCapture;
  const tracking = load('poseTracking').createPoseTracking;
  const context = enabled => gaze.setGazeContext({ lessonId: lesson, unitId: 1, enabled });
  async function calibrate() { context(true); await gaze.startGazeCalibration(); gaze.acceptGazeCalibration(); }
  return { gaze, session, capture, tracking, document, window, events, streams, settings, context, calibrate,
    workers, state: () => snapshot, listener: () => listener, regression,
    sample(x = 10) { for (let i = 0; i < 5; i++) { listener({ x, y: 20 }); now += 100; } },
    video: () => ({ srcObject: null, readyState: 2, currentTime: 0, videoWidth: 640, videoHeight: 480, pause() {}, async play() {} }),
    counts: () => ({ requests, begins, closes, poses, frames: frames.size }),
    frame(time) { for (const [id, fn] of [...frames]) { frames.delete(id); fn(time); } },
    cameraPending() { return cameraGate = deferred(); }, gazePending() { return gazeGate = deferred(); },
    posePending() { return poseGate = deferred(); }, handPending() { return handGate = deferred(); }, resumePending() { return resumeGate = deferred(); },
    fail(error) { failure = error; },
    route(value) { route = value; autoruns.forEach(fn => fn()); },
    logout() { user = null; autoruns.forEach(fn => fn()); },
    lesson(value) { lesson = value; autoruns.forEach(fn => fn()); },
  };
}

test('calibrated gaze retains ordinary disabled units, hands camera to pose, and requires recalibration on return', async () => {
  const h = harness();
  await h.calibrate(); h.sample();
  assert.ok(h.state().sample);
  h.context(false);
  assert.equal(h.state().calibrated, true);
  assert.equal(h.streams[0].track.readyState, 'live');
  h.context(true); assert.equal(h.counts().begins, 1);
  const oldListener = h.listener();
  const camera = h.capture(); const video = h.video();
  await camera.start(video, assert.fail);
  assert.equal(h.state().calibrated, false); assert.equal(h.state().sample, null);
  assert.equal(h.regression.eyeFeaturesClicks.length, 0);
  assert.equal(h.streams[0].track.readyState, 'ended');
  camera.stop();
  h.context(true); assert.equal(h.state().calibrated, false);
  await h.calibrate(); h.sample(90);
  const sample = h.state().sample;
  oldListener(null); assert.equal(h.state().sample, sample, 'Revoked callbacks cannot clear a new bin');
  h.session.stopCameraTracking();
  assert.ok(h.streams.every(s => s.track.readyState === 'ended'));
});

test('pending WebGazer begin drains before pose acquisition and closes a late gaze stream', async () => {
  const h = harness(); const gate = h.cameraPending();
  const gaze = h.gaze.startGazeCalibration();
  const rejected = assert.rejects(gaze, { name: 'AbortError' });
  await flush();
  const camera = h.capture(); const pose = camera.start(h.video(), assert.fail);
  assert.equal(h.counts().requests, 1);
  gate.resolve(); await rejected; await pose;
  assert.equal(h.counts().requests, 2);
  assert.equal(h.streams[0].track.readyState, 'ended');
  camera.stop();
});

test('cancellation during gaze model initialization is serialized with a newer gaze start', async () => {
  const h = harness(); const gate = h.gazePending();
  const first = h.gaze.startGazeCalibration(); const rejected = assert.rejects(first, { name: 'AbortError' });
  await flush(); h.gaze.cancelGazeCalibration();
  const next = h.gaze.startGazeCalibration();
  assert.equal(h.counts().begins, 1);
  gate.resolve(); await rejected; await next;
  assert.equal(h.counts().begins, 2); assert.equal(h.streams[0].track.readyState, 'ended');
  h.gaze.acceptGazeCalibration(); assert.equal(h.state().calibrated, true);
  h.session.stopCameraTracking();
});

test('pending pose acquisition releases its late stream before a gaze successor', async () => {
  const h = harness(); const gate = h.cameraPending();
  const camera = h.capture(); const first = camera.start(h.video(), assert.fail);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await flush(); const next = h.gaze.startGazeCalibration();
  assert.equal(h.counts().requests, 1);
  gate.resolve(); await rejected; await next;
  assert.equal(h.streams[0].track.readyState, 'ended');
  h.session.stopCameraTracking();
});

for (const boundary of ['route', 'logout', 'lesson', 'pagehide']) {
  test(`${boundary} revokes gaze and active/pending pose inference at the real session boundary`, async () => {
    for (const mode of ['gaze', 'pose', 'pose-pending', 'hand-pending']) {
      const h = harness(); let pending; let gate; let revoked = 0;
      const tracking = h.tracking();
      const camera = h.capture(() => { revoked++; tracking.stop(); });
      if (mode === 'gaze') await h.calibrate();
      else {
        await camera.start(h.video(), assert.fail);
        if (mode === 'pose-pending') gate = h.posePending();
        if (mode === 'hand-pending') gate = h.handPending();
        pending = tracking.start(h.video(), () => {}, assert.fail);
        await flush();
      }
      if (boundary === 'route') h.route('/dashboard');
      if (boundary === 'logout') h.logout();
      if (boundary === 'lesson') h.lesson('second');
      if (boundary === 'pagehide') h.events.get('pagehide')();
      gate?.resolve(); await pending;
      assert.ok(h.streams.every(s => s.track.readyState === 'ended'), mode);
      assert.equal(h.state().calibrated, false); assert.equal(h.counts().frames, 0);
      if (mode !== 'gaze') { assert.equal(revoked, 1); assert.ok(h.workers.instances.every(worker => worker.terminated)); }
    }
  });
}

test('denial/errors and exact switching fail explicitly without a substitute camera', async () => {
  const h = harness(); const camera = h.capture(); const video = h.video();
  h.fail(new DOMException('Denied', 'NotAllowedError'));
  await assert.rejects(camera.start(video, assert.fail), { name: 'NotAllowedError' });
  h.fail(null); await h.calibrate();
  await camera.start(video, assert.fail, 'rear');
  assert.equal(h.settings.at(-1).video.deviceId.exact, 'rear');
  h.fail(new DOMException('Unavailable', 'OverconstrainedError'));
  const count = h.counts().requests;
  await assert.rejects(camera.start(video, assert.fail, 'removed'), { name: 'OverconstrainedError' });
  assert.equal(h.counts().requests, count + 1); assert.equal(video.srcObject, null);
  assert.ok(h.streams.every(s => s.track.readyState === 'ended'));
  assert.ok(h.settings.every(options => options.audio === false));
});

test('old ended/resume callbacks cannot stop the successor and camera errors invalidate gaze', async () => {
  const h = harness(); await h.calibrate();
  const oldEnded = h.streams[0].track.handlers[0];
  const gate = h.resumePending(); h.context(true);
  const camera = h.capture(); await camera.start(h.video(), assert.fail);
  oldEnded(); gate.reject(Error('Old resume failed')); await flush();
  assert.equal(h.streams.at(-1).track.readyState, 'live');
  assert.equal(h.state().status, 'Not calibrated');
  camera.stop(); await h.calibrate();
  h.streams.at(-1).track.handlers[0]();
  assert.match(h.state().status, /Camera unavailable/); assert.equal(h.state().calibrated, false);
});

test('hidden gaze retains calibration and stream; pose cadence skips hidden and duplicate frames', async () => {
  const h = harness(); await h.calibrate();
  h.document.hidden = true; h.events.get('visibilitychange')();
  assert.equal(h.state().calibrated, true); assert.equal(h.state().sample, null);
  assert.equal(h.streams[0].track.readyState, 'live');
  h.document.hidden = false; h.events.get('visibilitychange')();
  const camera = h.capture(); const video = h.video(); await camera.start(video, assert.fail);
  const tracking = h.tracking(); await tracking.start(video, () => {}, assert.fail);
  h.frame(100); await flush(); h.frame(200); await flush(); assert.equal(h.counts().poses, 1);
  video.currentTime++; h.frame(210); await flush(); assert.equal(h.counts().poses, 2);
  video.currentTime++; h.frame(220); await flush(); assert.equal(h.counts().poses, 2);
  h.document.hidden = true; h.frame(400); await flush(); assert.equal(h.counts().poses, 2);
  tracking.stop(); camera.stop();
});


test('queued gaze cancellations and repeated stops cannot erase a newer start or acquire an extra stream', async () => {
  const h = harness();
  const first = h.gaze.startGazeCalibration();
  const rejected = assert.rejects(first, { name: 'AbortError' });
  h.gaze.cancelGazeCalibration();
  const next = h.gaze.startGazeCalibration();
  const sameStart = h.gaze.startGazeCalibration();
  await rejected; await next; await sameStart;
  assert.equal(h.counts().begins, 1);
  h.gaze.acceptGazeCalibration();
  h.gaze.disposeGazeTracking(); h.gaze.disposeGazeTracking();
  assert.ok(h.streams.every(stream => stream.track.readyState === 'ended'));
});

test('cancelled playback cannot detach a successor preview and a playback error releases its stream', async () => {
  const h = harness(); const gate = deferred(); const camera = h.capture();
  const video = h.video(); video.play = () => gate.promise;
  const first = camera.start(video, assert.fail);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await flush(); camera.stop();
  video.play = async () => {};
  const next = camera.start(video, assert.fail);
  gate.resolve(); await rejected; await next;
  assert.equal(video.srcObject, h.streams.at(-1));
  video.play = async () => { throw Error('Playback unavailable'); };
  await assert.rejects(camera.start(video, assert.fail), /Playback unavailable/);
  assert.equal(video.srcObject, null);
  assert.ok(h.streams.every(stream => stream.track.readyState === 'ended'));
});
