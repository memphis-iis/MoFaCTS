// Real Svelte display + camera/tracker + MediaPipe inference. App persistence is
// replaced by an explicit test boundary; no account or learner data is accessed.
// Run with the supported localhost watcher: node --test scripts/skeletonDemoBrowser.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { rspack, NormalModuleReplacementPlugin } = require('@rspack/core');
const app = path.resolve(__dirname, '..');
const shellStylesheets = [...fs.readFileSync(path.join(app, 'client/index.html'), 'utf8')
  .matchAll(/<link\b[^>]*>/g)].map(match => match[0]).filter(tag => /rel="stylesheet"/.test(tag)).join('\n');

async function buildFixture(syntheticTracking = false) {
  const temporaryRoot = path.join(app, '../tmp');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'skeleton-demo-'));
  const write = (name, body) => {
    const filename = path.join(directory, name); fs.writeFileSync(filename, body); return filename;
  };
  const replacements = {};
  const stub = (name, body) => { replacements[name] = write(`${name.replaceAll('/', '-')}.js`, body); };
  if (syntheticTracking) {
    const tracker = path.join(app, 'client/views/experiment/svelte/services/poseTracking.ts').replaceAll('\\', '/');
    stub('poseTracking', `export { isInFrameLandmark, isVisiblePoseLandmark } from ${JSON.stringify(tracker)};
      export function createPoseTracking() {
        let callback = null;
        window.handTest = { emit(frame) { callback?.(frame, [], [{ start: 4, end: 8 }]); } };
        return { async start(video, onFrame) { callback = onFrame; }, stop() { callback = null; } };
      }`);
  }
  const engine = path.join(app, '../learning-components/units/skeleton-demo/manifest.ts').replaceAll('\\', '/');
  stub('meteor/session', `const listeners = new Set();
    const units = [{ skeletondemosession: {} }, { skeletondemosession: {} }, { unitinstructions: 'Practice boundary' }];
    const values = { currentTdfId: 'synthetic', currentUnitNumber: 0, currentTdfUnit: units[0],
      currentTdfFile: { tdfs: { tutor: { unit: units } } } };
    export const Session = { get: key => values[key], set(key, value) { values[key] = value; },
      advance() { values.currentTdfUnit = units[++values.currentUnitNumber]; for (const fn of listeners) fn(); } };
    export const Tracker = { autorun(fn) { listeners.add(fn); fn(); return { stop() { listeners.delete(fn); } }; } };`);
  replacements['meteor/tracker'] = replacements['meteor/session'];
  stub('unitEngineService', `import { createSkeletonDemoUnitEngine } from ${JSON.stringify(engine)};
    export async function initializeEngine() { return createSkeletonDemoUnitEngine(); }`);
  stub('unitProgression', `import { Session } from 'meteor/session';
    export async function unitIsFinished() { window.fixture.completions++; Session.advance(); }`);
  stub('engineManager', 'let engine; export function setEngine(value) { engine = value; } export function getEngine() { return engine; }');
  stub('launchLoading', 'export function finishLaunchLoading() {}');
  stub('contentSurfaceInstance', "import { writable } from 'svelte/store'; export const contentSurfaceRevision = writable(0);");
  stub('gazeTracking', `import { writable } from 'svelte/store'; export const gazeState = writable({ calibrated: false });
    export const getGazeContext = () => ({}); export function setGazeContext() {} export function cancelGazeCalibration() {}`);
  stub('engineConstructors', `export function resolveUnitEngineTypeForUnit(unit) {
    if (unit.skeletondemosession) return 'skeleton-demo'; throw Error('Unexpected calibration engine'); }`);
  replacements['ContentSurface.svelte'] = write('Practice.svelte', `<script>import { onMount } from 'svelte';
    onMount(() => { window.fixture.practiceMounts++; });</script><p>Practice surface boundary</p>`);
  replacements['GazeCalibration.svelte'] = replacements['GazeDot.svelte'] = write('Empty.svelte', '<div></div>');
  const component = path.join(app, 'client/views/experiment/svelte/components/ContentRouteSurface.svelte').replaceAll('\\', '/');
  const entry = write('entry.js', `import { mount, unmount, tick } from 'svelte';
    import Unit from ${JSON.stringify(component)};
    let instance;
    window.fixture = { completions: 0, practiceMounts: 0, async mount() {
      instance = mount(Unit, { target: document.querySelector('#content-root'), props: { tdfId: 'synthetic', unitId: 0, userId: 'synthetic' } }); await tick();
    }, async destroy() { await unmount(instance); await tick(); } };`);
  const compiler = rspack({
    context: app, mode: 'development', devtool: false, entry,
    output: { path: directory, filename: 'fixture.js', publicPath: '/__skeleton-fixture/' },
    resolve: { extensions: ['.ts', '.js', '.svelte'], conditionNames: ['svelte', 'browser', 'import', 'default'], modules: [path.join(app, 'node_modules'), 'node_modules'] },
    module: { rules: [
      { test: /\.svelte$/, use: [{ loader: require.resolve('./loaders/svelte-loader-wrapper.cjs'), options: { compilerOptions: { dev: true } } }] },
      { test: /\.ts$/, exclude: /node_modules/, type: 'javascript/auto', use: [{ loader: 'builtin:swc-loader', options: { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' } } }] },
    ] },
    plugins: [new NormalModuleReplacementPlugin(/./, resource => {
      const name = replacements[resource.request] ? resource.request : resource.request.split('/').at(-1);
      if (replacements[name]) resource.request = replacements[name];
    })],
    optimization: { minimize: false, splitChunks: false }, performance: { hints: false },
  });
  await new Promise((resolve, reject) => compiler.run((error, stats) => {
    compiler.close(closeError => {
      if (error || closeError) reject(error || closeError);
      else if (stats.hasErrors()) reject(Error(stats.toString({ all: false, errors: true })));
      else resolve();
    });
  }));
  return directory;
}

test('live demo runs real local inference and releases the camera on stop, exit and denied permission', { timeout: 120000 }, async () => {
  assert.equal((await fetch('http://localhost:3200/health')).ok, true, 'Start deploy/hotfix-local.ps1 first');
  const directory = await buildFixture();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  // A blank canvas is synthetic camera input; inference must report no body.
  await page.addInitScript(() => {
    window.cameraTest = { streams: [], denied: false, unavailable: false, requestedAudio: false, selections: [] };
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { value: async () =>
      ['front', 'rear'].map(deviceId => ({ kind: 'videoinput', deviceId })) });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async options => {
      window.cameraTest.requestedAudio ||= options.audio !== false;
      const deviceId = options.video.deviceId?.exact || 'front';
      window.cameraTest.selections.push(deviceId);
      if (window.cameraTest.denied) throw new DOMException('Synthetic denial', 'NotAllowedError');
      if (window.cameraTest.unavailable) throw new DOMException('Synthetic missing camera', 'OverconstrainedError');
      const rear = deviceId === 'rear';
      const canvas = document.createElement('canvas'); canvas.width = rear ? 480 : 640; canvas.height = rear ? 640 : 480;
      const context = canvas.getContext('2d');
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      const stream = canvas.captureStream(15);
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      track.getSettings = () => ({ ...settings, deviceId, facingMode: rear ? 'environment' : 'user' });
      window.cameraTest.streams.push(stream);
      return stream;
    } });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost:3200') { externalRequests.push(url.origin); return route.abort(); }
    if (url.pathname === '/__skeleton-fixture') return route.fulfill({ contentType: 'text/html',
      body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${shellStylesheets}</head><body><div class="theme-bootstrap theme-bootstrap-ready"><div class="app home-app practice-app"><div class="main practice-main"><header class="top-header practice-top-header"><h1 class="page-title">Skeleton demo</h1><div class="header-right"><button class="btn practice-return-button">Save and return</button></div></header><main class="content practice-content"><div class="app-page-root container"><div id="content-root" class="content-container"></div></div></main></div></div></div><script src="/__skeleton-fixture/fixture.js"></script></body></html>` });
    if (url.pathname.startsWith('/__skeleton-fixture/')) {
      const filename = path.basename(url.pathname);
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(directory, filename)) });
    }
    return route.continue();
  });
  try {
    await page.goto('http://localhost:3200/__skeleton-fixture');
    await page.addStyleTag({ content: fs.readFileSync(path.join(app, 'client/views/home/home.css'), 'utf8') });
    await page.evaluate(() => window.fixture.mount());
    await page.getByRole('button', { name: 'Cube', exact: true }).click();
    await page.locator('.figure-wireframe').waitFor();
    assert.equal(await page.locator('.figure-vertex-label').count(), 8);
    assert.equal(await page.locator('.figure-tick').count(), 12);
    assert.equal(await page.getByRole('button', { name: 'Switch camera' }).count(), 0);
    await page.setViewportSize({ width: 390, height: 667 });
    async function checkMobileLayout() {
      // Svelte's dimension bindings update through ResizeObserver after a resize.
      // Measure only once the preview reflects the current available viewport.
      await page.waitForFunction(() => {
        const stage = document.querySelector('.pose-camera-preview');
        const preview = document.querySelector('.pose-camera-mirror');
        const ratio = Number(getComputedStyle(preview).getPropertyValue('--pose-aspect-ratio'));
        const expectedWidth = Math.min(stage.clientWidth, stage.clientHeight * ratio);
        return expectedWidth > 0 && Math.abs(preview.getBoundingClientRect().width - expectedWidth) < 1;
      });
      const geometry = await page.evaluate(() => {
        const preview = document.querySelector('.pose-camera-mirror').getBoundingClientRect();
        const cube = document.querySelector('.figure-overlay').getBoundingClientRect();
        const video = document.querySelector('video');
        const stage = document.querySelector('.pose-camera-preview').getBoundingClientRect();
        return { preview: { width: preview.width, height: preview.height },
          cube: { width: cube.width, height: cube.height, x: cube.x, y: cube.y },
          aligned: Math.abs(cube.x - preview.x) < 1 && Math.abs(cube.y - preview.y) < 1,
          labelsInside: [...document.querySelectorAll('.figure-vertex-label, .figure-length-label')].every(label => {
            const rect = label.getBoundingClientRect();
            return rect.left >= cube.left - 1 && rect.right <= cube.right + 1 && rect.top >= cube.top - 1 && rect.bottom <= cube.bottom + 1;
          }),
          stage: { width: stage.width, height: stage.height },
          ratio: video.videoWidth ? video.videoWidth / video.videoHeight : Number(getComputedStyle(document.querySelector('.pose-camera-mirror')).getPropertyValue('--pose-aspect-ratio')),
          width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
          scrolling: [...document.querySelectorAll('body, .theme-bootstrap, .practice-app, .practice-main, .practice-content, .app-page-root, #content-root, .skeleton-demo, .pose-camera-preview')]
            .filter(element => element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)
            .map(element => element.className || element.tagName),
          controls: [...document.querySelectorAll('.skeleton-demo-controls button')].filter(button => button.getClientRects().length > 0).map(button => {
            const rect = button.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, height: rect.height };
          }) };
      });
      assert.ok(geometry.scrollWidth <= geometry.width, 'No horizontal scrolling');
      assert.ok(geometry.aligned && Math.abs(geometry.cube.width - geometry.preview.width) < 1
        && Math.abs(geometry.cube.height - geometry.preview.height) < 1, 'Figure overlay aligns with the complete preview');
      assert.ok(geometry.labelsInside, `Figure labels fit inside the preview: ${JSON.stringify(geometry)}`);
      assert.deepEqual(geometry.scrolling, [], `No page or nested container needs a scrollbar: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.preview.height <= geometry.stage.height + 1 && geometry.preview.width <= geometry.stage.width + 1, 'Video fits available space');
      assert.ok(Math.abs(geometry.preview.width / geometry.preview.height - geometry.ratio) < 0.01, 'Overlay geometry matches uncropped video');
      assert.ok(geometry.controls.every(rect => rect.top >= 0 && rect.bottom < geometry.height && rect.height >= 36), 'Controls stay visible');
    }
    await checkMobileLayout();
    assert.equal(await page.evaluate(() => window.fixture.practiceMounts), 0);
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'No body detected' }).waitFor({ timeout: 45000 });
    assert.equal(await page.locator('video').evaluate(video => video.videoWidth), 640);
    assert.equal(await page.locator('svg circle').count(), 0, 'No fabricated body on blank camera input');
    assert.equal(await page.evaluate(() => window.cameraTest.requestedAudio), false);
    await page.getByRole('button', { name: 'Switch camera' }).click();
    await page.getByRole('status').filter({ hasText: 'No body detected' }).waitFor();
    assert.equal(await page.evaluate(() => window.cameraTest.selections.at(-1)), 'rear');
    for (const layer of ['video', 'svg']) {
      assert.equal(await page.locator(`.pose-camera-mirror > ${layer}`).evaluate(element => getComputedStyle(element).transform), 'none');
    }
    assert.equal(await page.evaluate(() => window.cameraTest.streams.slice(0, -1).every(s => s.getTracks().every(t => t.readyState === 'ended'))), true);
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 667 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const video = document.querySelector('video').getBoundingClientRect();
        const stage = document.querySelector('.pose-camera-preview').getBoundingClientRect();
        return video.width > 0 && video.width <= stage.width && video.height <= stage.height;
      });
      await page.screenshot({ path: path.join(app, `../tmp/skeleton-mobile-${viewport.width}.png`), fullPage: true });
      await checkMobileLayout();
    }
    await page.setViewportSize({ width: 390, height: 667 });
    await page.getByRole('button', { name: 'Switch camera' }).click();
    await page.getByRole('status').filter({ hasText: 'No body detected' }).waitFor();
    assert.equal(await page.evaluate(() => window.cameraTest.selections.at(-1)), 'front');
    for (const layer of ['video', 'svg']) {
      assert.equal(await page.locator(`.pose-camera-mirror > ${layer}`).evaluate(element => getComputedStyle(element).transform), 'matrix(-1, 0, 0, 1, 0, 0)');
    }
    assert.equal(await page.locator('.figure-overlay').evaluate(element => getComputedStyle(element).transform), 'none', 'Figure text must not mirror');
    await page.evaluate(() => { window.cameraTest.unavailable = true; });
    await page.getByRole('button', { name: 'Switch camera' }).click();
    await page.getByRole('alert').filter({ hasText: 'selected camera is unavailable' }).waitFor();
    assert.equal(await page.locator('video').evaluate(video => video.srcObject), null);
    await page.evaluate(() => { window.cameraTest.unavailable = false; });
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'No body detected' }).waitFor();
    await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
    assert.equal(await page.evaluate(() => window.cameraTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), true);
    assert.equal(await page.locator('video').evaluate(video => video.srcObject), null);
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'No body detected' }).waitFor();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.completions), 1);
    assert.equal(await page.evaluate(() => window.cameraTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), true);
    assert.equal(await page.evaluate(() => window.fixture.practiceMounts), 0, 'The next demo must not mount practice');
    await page.getByRole('button', { name: 'Start camera', exact: true }).waitFor();
    await page.evaluate(() => { window.cameraTest.denied = true; });
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /unavailable/);
    assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('Practice surface boundary', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.practiceMounts), 1);
    await page.evaluate(() => window.fixture.destroy());
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, [], 'Inference never needs a third-party runtime request');
  } finally {
    await browser.close();
    // The fixture directory was created directly under the ignored workspace tmp root.
    assert.equal(path.dirname(directory), path.resolve(app, '../tmp'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('camera palette selection, full rotation and triple-pinch resize use the real display', { timeout: 60000 }, async () => {
  const directory = await buildFixture(true);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = []; let failRenderer = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { value: async () => [] });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      canvas.getContext('2d').fillRect(0, 0, 640, 480); return canvas.captureStream(15);
    } });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost:3200') return route.abort();
    if (url.pathname === '/__skeleton-fixture') return route.fulfill({ contentType: 'text/html', body:
      `<!doctype html><html><head><meta charset="utf-8">${shellStylesheets}</head><body><div id="content-root" style="height:600px;width:800px"></div><script src="/__skeleton-fixture/fixture.js"></script></body></html>` });
    if (url.pathname.startsWith('/__skeleton-fixture/')) {
      if (failRenderer && url.pathname.includes('figureScene')) return route.abort();
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(directory, path.basename(url.pathname))) });
    }
    return route.continue();
  });
  try {
    await page.goto('http://localhost:3200/__skeleton-fixture');
    await page.evaluate(() => window.fixture.mount());
    assert.equal(await page.locator('.figure-wireframe').count(), 0, 'No figure selected initially');
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Looking for a person' }).waitFor();
    let timestamp = 0;
    async function emit(options = {}) {
      await page.evaluate(({ timestamp, options }) => {
        const { gesture = 'spread', angle = 0, tilt = 0, target = null, y = .5 } = options;
        const host = document.querySelector('.figure-overlay').getBoundingClientRect();
        let x = .7; let cy = y;
        if (target) {
          const button = [...document.querySelectorAll('.figure-palette-button')].find(b => b.textContent.trim() === target).getBoundingClientRect();
          x = (button.x + button.width / 2 - host.x) / host.width;
          cy = (button.y + button.height / 2 - host.y) / host.height;
        }
        if (document.querySelector('.pose-camera-mirror').classList.contains('mirrored')) x = 1 - x;
        const world = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
        const positions = gesture === 'triple' ? [[-.003, 0], [.003, 0], [0, .004]]
          : gesture === 'pinch' ? [[-.003, 0], [.003, 0], [.04, -.04]] : [[-.03, .02], [0, -.04], [.03, .02]];
        [4, 8, 12].forEach((i, j) => {
          const [px, py] = positions[j]; const a = angle * Math.PI / 180, t = tilt * Math.PI / 180;
          const tx = px * Math.cos(a) - py * Math.sin(a), ty = px * Math.sin(a) + py * Math.cos(a);
          world[i] = { x: tx, y: ty * Math.cos(t), z: ty * Math.sin(t) };
        });
        const image = world.map(p => ({ x: x + p.x, y: cy + p.y, z: p.z }));
        image[0] = { x, y: cy + .05, z: 0 }; image[5] = { x: x - .05, y: cy - .025, z: 0 }; image[17] = { x: x + .05, y: cy - .025, z: 0 };
        window.handTest.emit({ landmarks: [], hands: [image], handWorldLandmarks: [world], handedness: ['Right'], timestamp, width: 640, height: 480 });
      }, { timestamp, options });
      timestamp += 100;
    }
    const geometry = () => page.locator('.figure-wireframe g[data-edge]').evaluateAll(edges => edges.map(edge => edge.outerHTML).join(''));
    // Open away from the palette; close before arriving over the icon.
    await emit(); await emit({ gesture: 'pinch' }); await emit({ target: 'Cube', gesture: 'pinch' });
    await page.locator('.figure-wireframe').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cube', exact: true }).getAttribute('aria-pressed'), 'true');
    for (const mirrored of [true, false]) {
      const layers = await page.evaluate(mirrored => {
        const mirror = document.querySelector('.pose-camera-mirror');
        mirror.classList.toggle('mirrored', mirrored);
        const tracking = mirror.querySelector('svg');
        // Include the otherwise non-interactive tracking layer in paint-order hit testing.
        tracking.style.pointerEvents = 'auto';
        const button = document.querySelector('.figure-palette-button');
        const r = button.getBoundingClientRect();
        const stack = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const result = { tracking: stack.indexOf(tracking), button: stack.indexOf(button), video: stack.indexOf(mirror.querySelector('video')) };
        tracking.style.removeProperty('pointer-events');
        return result;
      }, mirrored);
      assert.ok(layers.tracking >= 0 && layers.tracking < layers.button && layers.button < layers.video,
        `Tracking paints above clickable icons, video below (mirrored=${mirrored}): ${JSON.stringify(layers)}`);
    }
    await page.locator('.pose-camera-mirror').evaluate(e => e.classList.add('mirrored'));
    await page.screenshot({ path: path.join(app, '../tmp/skeleton-demo-palette-tracking.png'), fullPage: true });
    assert.equal(await page.locator('.figure-tick').count(), 12);
    assert.equal(await page.locator('.figure-vertex-label').allTextContents().then(labels => labels.sort().join('')), 'ABCDEFGH');
    assert.equal(await page.locator('.figure-hidden-edge').first().evaluate(e => getComputedStyle(e).opacity), '0.3');
    await emit(); await emit(); const original = await geometry();
    await emit({ tilt: 15 }); assert.notEqual(await geometry(), original, 'Tilt itself rotates the figure');
    const tilted = await geometry();
    await emit({ tilt: 105 }); assert.equal(await geometry(), tilted, 'Fast full-plane rotation is ignored');
    await emit({ tilt: 110 }); assert.notEqual(await geometry(), tilted, 'Next slower increment resumes immediately');
    await emit({ gesture: 'triple', y: .85 }); await emit({ gesture: 'triple', y: .85 });
    for (let i = 1; i <= 10; i++) await emit({ gesture: 'triple', y: .85 - i * .05 });
    assert.equal(await page.locator('.figure-length-label').textContent(), 'AB = 4 units');
    await emit({ gesture: 'triple', y: .4 });
    const savedLength = await page.locator('.figure-length-label').textContent();
    assert.notEqual(savedLength, 'AB = 4 units', 'Downward reversal responds immediately at the upper limit');
    await emit({ target: 'Pyramid' }); await emit({ target: 'Pyramid' }); await emit({ target: 'Pyramid', gesture: 'pinch' });
    assert.equal(await page.getByRole('button', { name: 'Pyramid', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.figure-vertex-label').count(), 5); assert.equal(await page.locator('.figure-tick').count(), 8);
    assert.equal(await page.locator('.figure-length-label').textContent(), 'AB = 1 unit');
    await page.getByRole('button', { name: 'Cube', exact: true }).focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.figure-length-label').textContent(), savedLength, 'Keyboard selection restores saved size');
    await page.evaluate(() => { window.visibilityTestStream = document.querySelector('video').srcObject; });
    for (const [cameraVisible, wireframeVisible] of [[true, true], [true, false], [false, true], [false, false]]) {
      for (const [name, visible] of [['Camera visibility', cameraVisible], ['Wireframe visibility', wireframeVisible]]) {
        const button = page.getByRole('button', { name, exact: true });
        if ((await button.getAttribute('aria-pressed')) !== String(visible)) await button.click();
      }
      assert.equal(await page.locator('.pose-camera-mirror > video').evaluate(e => getComputedStyle(e).visibility), cameraVisible ? 'visible' : 'hidden');
      assert.equal(await page.locator('.pose-camera-mirror > svg').evaluate(e => getComputedStyle(e).visibility), wireframeVisible ? 'visible' : 'hidden');
      assert.equal(await page.locator('.figure-wireframe').isVisible(), true, 'The geometric figure remains visible in every mode');
      assert.equal(await page.evaluate(() => document.querySelector('video').srcObject === window.visibilityTestStream
        && window.visibilityTestStream.getVideoTracks().every(t => t.readyState === 'live')), true, 'Visibility never replaces/stops capture');
      await emit({ tilt: 10 }); const before = await geometry();
      await emit({ tilt: 20 }); assert.notEqual(await geometry(), before, 'Gesture rotation works in all four visibility combinations');
    }
    for (const themeId of ['mofacts-default', 'dark-industrial']) {
      const theme = JSON.parse(fs.readFileSync(path.join(app, `public/themes/${themeId}.json`), 'utf8'));
      await page.evaluate(properties => {
        for (const [name, value] of Object.entries(properties)) document.documentElement.style.setProperty(`--${name.replaceAll('_', '-')}`, String(value));
      }, theme.properties);
      await page.mouse.move(0, 0);
      await page.waitForFunction(() => {
        const probe = document.createElement('div'); probe.style.backgroundColor = 'var(--app-primary-action-surface-color)';
        probe.style.color = 'var(--app-primary-action-text-color)'; document.body.append(probe);
        const button = getComputedStyle(document.querySelector('.skeleton-demo-controls .btn-primary'));
        const expected = getComputedStyle(probe);
        const ready = button.backgroundColor === expected.backgroundColor && button.color === expected.color;
        probe.remove(); return ready;
      });
      const themed = await page.evaluate(() => {
        const probe = document.createElement('div'); probe.style.backgroundColor = 'var(--learning-card-surface-color)';
        probe.style.borderRadius = 'var(--app-border-radius-lg)'; probe.style.color = 'var(--app-accent-color)'; document.body.append(probe);
        const expected = getComputedStyle(probe);
        const result = { cards: [...document.querySelectorAll('.skeleton-demo .card')].every(card =>
          getComputedStyle(card).backgroundColor === expected.backgroundColor && getComputedStyle(card).borderRadius === expected.borderRadius),
          edges: getComputedStyle(document.querySelector('.figure-wireframe line')).stroke === expected.color };
        probe.remove(); return result;
      });
      assert.equal(themed.cards, true, `${themeId}: shared card colors and radius`);
      assert.equal(themed.edges, true, `${themeId}: figure follows theme accent`);
      await page.screenshot({ path: path.join(app, `../tmp/skeleton-demo-${themeId}.png`), fullPage: true });
    }
    const preserved = await geometry();
    await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
    assert.equal(await geometry(), preserved, 'Stopping retains figure state');
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Looking for a person' }).waitFor();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.getByRole('button', { name: 'Start camera', exact: true }).waitFor();
    assert.equal(await page.locator('video').evaluate(video => video.srcObject), null);
    await emit({ tilt: 15 }); assert.equal(await geometry(), preserved, 'Hidden/stopped callbacks cannot change figures');
    await page.evaluate(() => window.fixture.destroy()); assert.equal(await page.locator('.figure-overlay').count(), 0);
    assert.deepEqual(errors, []);
    failRenderer = true; await page.reload(); await page.evaluate(() => window.fixture.mount());
    await page.getByRole('alert').filter({ hasText: '3D figures are unavailable' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start camera', exact: true }).isDisabled(), true);
    await page.evaluate(() => window.fixture.destroy());
  } finally {
    await browser.close(); assert.equal(path.dirname(directory), path.resolve(app, '../tmp')); fs.rmSync(directory, { recursive: true, force: true });
  }
});
