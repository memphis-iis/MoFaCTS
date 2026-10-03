const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function calibrationPanelHarness() {
  const timers = new Map();
  let nextTimer = 0;
  let recorded = 0;
  let validationRuns = 0;
  let faceVisible = true;
  let destroy;
  const document = { hidden: false };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../client/views/experiment/svelte/components/GazeCalibration.svelte'), 'utf8');
  const script = source.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
  const code = ts.transpileModule('let target;\n' + script + '\nexports.panel = { start, train, finish, state: () => ({stage, index, sampling, samples, message}) };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, document, window: { innerWidth: 1000, innerHeight: 800 },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === 'svelte') return { createEventDispatcher: () => () => {}, onDestroy(fn) { destroy = fn; } };
      if (name.endsWith('GazeDot.svelte')) return {};
      if (name.endsWith('gazeTracking')) return {
        startGazeCalibration: async () => {},
        trainGazeTarget() { if (!faceVisible) return false; recorded++; return true; },
        beginGazeValidation() { validationRuns++; },
        acceptGazeCalibration() {}, cancelGazeCalibration() {},
      };
      throw new Error(name);
    },
  });
  return { api: exports.panel, document, recorded: () => recorded, validations: () => validationRuns,
    faceVisible(value) { faceVisible = value; }, destroy: () => destroy(),
    tick() { const first = timers.entries().next().value; assert.ok(first, 'Expected a pending timer'); timers.delete(first[0]); first[1](); },
    timerCount: () => timers.size,
  };
}

test('one click samples a target over time and all nine targets lead to validation', async () => {
  const h = calibrationPanelHarness();
  await h.api.start();
  for (let target = 0; target < 9; target++) {
    h.api.train();
    h.api.train(); // A repeated click during collection cannot add samples or timers.
    assert.equal(h.recorded(), target * 5 + 1);
    assert.equal(h.timerCount(), 1);
    for (let sample = 0; sample < 4; sample++) h.tick();
  }
  assert.equal(h.recorded(), 45);
  assert.equal(h.api.state().stage, 'validation');
  assert.equal(h.validations(), 1);
  for (let target = 0; target < 5; target++) h.tick();
  assert.equal(h.api.state().stage, 'review');
  assert.equal(h.recorded(), 45); // Validation never trains on the check targets.
});

test('timed calibration pauses in hidden tabs, retries missing faces, and cancels on exit', async () => {
  const h = calibrationPanelHarness();
  await h.api.start();
  h.api.train();
  h.document.hidden = true;
  h.tick();
  assert.equal(h.recorded(), 1);
  h.document.hidden = false;
  h.faceVisible(false);
  h.tick();
  assert.equal(h.api.state().sampling, false);
  assert.match(h.api.state().message, /click the target again/);
  assert.equal(h.api.state().index, 0);
  h.faceVisible(true);
  h.api.train();
  await h.api.start();
  assert.equal(h.timerCount(), 0);
  h.api.train();
  h.api.finish(false);
  assert.equal(h.timerCount(), 0);
  h.destroy();
  assert.equal(h.timerCount(), 0);
});

test('registered calibration initializes without practice stimuli or an adaptive model', async () => {
  const componentRoot = path.resolve(__dirname, '../../learning-components');
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    vm.runInNewContext(code, {
      exports,
      require(name) {
        if (!name.startsWith('.')) return require(name);
        const resolved = path.resolve(path.dirname(filename), name + '.ts');
        if (resolved === path.join(componentRoot, 'defaultLearningComponentCatalog.ts')) {
          return { defaultUnitComponentManifestsFromCatalog: [
            load(path.join(componentRoot, 'units/gaze-calibration/manifest.ts')).gazeCalibrationUnitComponentManifest,
          ] };
        }
        if (resolved === path.join(componentRoot, 'units/createBaseUnitEngine.ts')) {
          return { createBaseUnitEngine() { throw new Error('Practice base must not be constructed for calibration'); } };
        }
        return load(resolved);
      },
    }, { filename });
    return exports;
  }
  const factory = load(path.join(componentRoot, 'units/createUnitEngine.ts'));
  const registry = load(path.join(componentRoot, 'units/UnitEngineRegistry.ts'));
  const unavailable = () => { throw new Error('Practice stimuli are unavailable'); };
  const deps = {
    stimuli: { getStimCount: unavailable, getStimCluster: unavailable },
    adaptiveModel: { createAdaptiveCoordinator() { throw new Error('Calibration has no adaptive model'); } },
  };
  const engine = await factory.createUnitEngineByType(deps, {}, 'gaze-calibration');
  await engine.loadResumeState();
  assert.equal(engine.unitFinished(), false);
  await assert.rejects(engine.cardAnswered(), /does not accept trial answers/);
  engine.completeCalibration();
  assert.equal(engine.unitFinished(), true);
  assert.equal(engine.isFinished(), true);
  const fresh = await factory.createUnitEngineByType(deps, {}, 'gaze-calibration');
  assert.equal(fresh.unitFinished(), false);
  // A practice engine must still enforce its required stimulus contract.
  registry.registerUnitEngine('practice-contract-check', () => engine);
  await assert.rejects(factory.createUnitEngineByType(deps, {}, 'practice-contract-check'), /Practice stimuli are unavailable/);
});

function harness(beginOverride) {
  let snapshot;
  let listener;
  let pauses = 0;
  let resumes = 0;
  let stops = 0;
  let ends = 0;
  let now = 1000;
  const handlers = new Map();
  const regression = { eyeFeaturesClicks: { length: 0 }, init() { this.eyeFeaturesClicks.length = 0; } };
  const fake = {
    params: {},
    begin: beginOverride || (async () => {}),
    pause() { pauses++; },
    async resume() { resumes++; },
    end() { ends++; },
    removeMouseEventListeners() { this.mouseRemoved = true; },
    recordScreenPosition() { regression.eyeFeaturesClicks.length++; },
    setGazeListener(fn) { listener = fn; return this; },
    getRegression() { return [regression]; },
    getTracker() { return { getPositions: () => [1] }; },
  };
  for (const name of ['saveDataAcrossSessions', 'applyKalmanFilter', 'showPredictionPoints',
    'showVideoPreview', 'showFaceOverlay', 'showFaceFeedbackBox']) {
    fake[name] = value => { fake[name + 'Value'] = value; return fake; };
  }
  const events = {
    addEventListener(name, fn) { handlers.set(name, fn); },
    removeEventListener(name) { handlers.delete(name); },
  };
  const document = { ...events, hidden: false, getElementById(id) {
    if (id === 'webgazerVideoFeed') return { srcObject: {
      getVideoTracks: () => [], getTracks: () => [{ stop() { stops++; } }],
    } };
    return { remove() {} };
  } };
  const windowRef = { ...events, innerWidth: 1000, innerHeight: 800 };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../client/views/experiment/svelte/services/gazeTracking.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, {
    exports, performance: { now: () => now }, setTimeout, clearTimeout, document,
    window: windowRef,
    require(name) {
      if (name === 'svelte/store') return { writable: value => {
        snapshot = value; return { set(next) { snapshot = next; } };
      } };
      if (name === 'meteor/tracker') return { Tracker: { autorun(fn) { fn(); } } };
      if (name === 'meteor/meteor') return { Meteor: { userId: () => 'user' } };
      if (name.endsWith('lessonRoute')) return { isLessonRoutePath: (p, s) => p === s };
      if (name === 'meteor/ostrio:flow-router-extra') return { FlowRouter: {
        watchPathChange() {}, current: () => ({ path: '/content' }),
      } };
      if (name === 'webgazer/dist/webgazer.commonjs2.js') return { webgazer: fake };
      throw new Error(name);
    },
  });
  return { api: exports, fake, regression, document, handlers, windowRef,
    sample: value => listener(value), state: () => snapshot,
    counts: () => ({ pauses, resumes, stops, ends }), advance: () => { now += 1000; },
    advanceMs: ms => { now += ms; } };
}

function emitBin(h, x, y) {
  for (let i = 0; i < 5; i++) {
    h.sample({ x, y });
    if (i < 4) h.advanceMs(100);
  }
}

test('calibration is ephemeral, manual training works, and disabled units retain calibration', async () => {
  const h = harness();
  await h.api.startGazeCalibration();
  assert.equal(h.fake.saveDataAcrossSessionsValue, false);
  assert.equal(h.fake.applyKalmanFilterValue, false);
  assert.equal(h.fake.mouseRemoved, true);
  h.sample(null);
  assert.equal(h.api.trainGazeTarget(100, 100), true);
  h.api.beginGazeValidation();
  assert.equal(h.regression.eyeFeaturesClicks.length, 1);
  h.api.acceptGazeCalibration();
  h.api.setGazeContext({ lessonId: 'lesson', unitId: 1, enabled: true });
  emitBin(h, 125, 250);
  assert.equal(h.state().sample.x, 125);
  h.api.setGazeContext({ lessonId: 'lesson', unitId: 2, enabled: false });
  assert.equal(h.state().sample, null);
  assert.equal(h.state().calibrated, true);
  h.api.setGazeContext({ lessonId: 'lesson', unitId: 3, enabled: true });
  emitBin(h, 200, 300);
  assert.equal(h.state().sample.x, 200);
  h.api.disposeGazeTracking();
  assert.equal(h.state().calibrated, false);
  assert.equal(h.counts().stops, 1);
});

test('live gaze caps input at 10 Hz and publishes one five-point mean per bin', async () => {
  const h = harness();
  await h.api.startGazeCalibration();
  h.api.acceptGazeCalibration();
  h.api.setGazeContext({ lessonId: 'lesson', unitId: 1, enabled: true });
  for (const [index, [x, y]] of [[0, 0], [10, 20], [20, 40], [30, 60], [40, 80]].entries()) {
    h.sample({ x, y });
    if (index < 4) assert.equal(h.state().sample, null);
    h.advanceMs(50);
    h.sample({ x: 999, y: 999 }); // More frequent callbacks do not enter the bin.
    h.advanceMs(50);
  }
  // The fifth accepted prediction arrived before the final two clock advances.
  assert.equal(h.state().sample.x, 20);
  assert.equal(h.state().sample.y, 40);
  h.sample({ x: 100, y: 100 });
  h.sample(null); // Invalid prediction discards a partial next bin.
  emitBin(h, 200, 300);
  assert.equal(h.state().sample.x, 200);
  assert.equal(h.state().sample.y, 300);
  h.api.disposeGazeTracking();
});

test('invalid and stale predictions disappear; hidden tabs pause', async () => {
  const h = harness();
  await h.api.startGazeCalibration();
  h.sample({ x: 100, y: 100 });
  await new Promise(resolve => setTimeout(resolve, 280));
  assert.equal(h.state().sample, null);
  h.sample({ x: NaN, y: 100 });
  assert.equal(h.state().sample, null);
  h.document.hidden = true;
  h.handlers.get('visibilitychange')();
  assert.ok(h.counts().pauses > 0);
  h.api.disposeGazeTracking();
});

test('permission denial gives explicit unavailable state without calibration', async () => {
  const h = harness(async () => { throw new Error('Permission denied'); });
  await assert.rejects(h.api.startGazeCalibration(), /Permission denied/);
  assert.equal(h.state().calibrated, false);
  assert.match(h.state().status, /unavailable/);
  assert.equal(h.state().sample, null);
  h.api.disposeGazeTracking();
});

test('leaving while permission is pending cleans up a late camera grant', async () => {
  let grant;
  const h = harness(() => new Promise(resolve => { grant = resolve; }));
  const pending = h.api.startGazeCalibration();
  await new Promise(resolve => setImmediate(resolve));
  h.api.disposeGazeTracking();
  grant();
  await pending;
  assert.equal(h.state().calibrated, false);
  assert.equal(h.counts().stops, 1);
  assert.equal(h.counts().ends, 1);
});


test('example configuration validates and calibration cannot share a session selector', () => {
  const Ajv = require('ajv');
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/tdfSchema.json'), 'utf8'));
  const validate = new Ajv({ strict: false, validateFormats: false }).compile(schema);
  const doc = { tutor: { setspec: { lessonname: 'Gaze check', stimulusfile: 'synthetic.json' },
    unit: [{ gazecalibrationsession: {} }, { gazeTracking: true, assessmentsession: { clusterlist: '0-0' } }] } };
  assert.equal(validate(doc), true);
  doc.tutor.unit[0].learningsession = {};
  assert.equal(validate(doc), false);
  delete doc.tutor.unit[0].learningsession;
  doc.tutor.unit[1].gazeTracking = 'true';
  assert.equal(validate(doc), false);
});

test('calibration engine completes explicitly and rejects fabricated response trials', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../learning-components/units/gaze-calibration/manifest.ts'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  const engine = exports.createGazeCalibrationUnitEngine();
  assert.equal(engine.unitFinished(), false);
  await assert.rejects(engine.cardAnswered(), /does not accept/);
  engine.completeCalibration();
  assert.equal(engine.unitFinished(), true);
});


test('a lesson change clears the prior calibration', async () => {
  const h = harness();
  await h.api.startGazeCalibration();
  h.api.acceptGazeCalibration();
  h.api.setGazeContext({ lessonId: 'first', unitId: 1, enabled: true });
  h.sample({ x: 100, y: 100 });
  h.api.setGazeContext({ lessonId: 'second', unitId: 0, enabled: false });
  assert.equal(h.state().calibrated, false);
  assert.equal(h.state().sample, null);
  assert.equal(h.counts().stops, 1);
});


test('viewport resizing invalidates calibration and forbids accepting an invalidated check', async () => {
  const h = harness();
  await h.api.startGazeCalibration();
  h.windowRef.innerWidth = 1200;
  h.handlers.get('resize')();
  assert.equal(h.state().calibrated, false);
  assert.match(h.state().status, /Viewport changed/);
  assert.throws(() => h.api.acceptGazeCalibration(), /recalibrate first/);
  h.api.disposeGazeTracking();
});
