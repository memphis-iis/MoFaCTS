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

async function buildFixture() {
  const temporaryRoot = path.join(app, '../tmp');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'skeleton-demo-'));
  const write = (name, body) => {
    const filename = path.join(directory, name); fs.writeFileSync(filename, body); return filename;
  };
  const replacements = {};
  const stub = (name, body) => { replacements[name] = write(`${name.replaceAll('/', '-')}.js`, body); };
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
      instance = mount(Unit, { target: document.querySelector('main'), props: { tdfId: 'synthetic', unitId: 0, userId: 'synthetic' } }); await tick();
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
    window.cameraTest = { streams: [], denied: false, unavailable: false, requestedAudio: false, directions: [] };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async options => {
      window.cameraTest.requestedAudio ||= options.audio !== false;
      window.cameraTest.directions.push(options.video.facingMode);
      if (window.cameraTest.denied) throw new DOMException('Synthetic denial', 'NotAllowedError');
      if (window.cameraTest.unavailable) throw new DOMException('Synthetic missing camera', 'OverconstrainedError');
      const rear = options.video.facingMode.exact === 'environment';
      const canvas = document.createElement('canvas'); canvas.width = rear ? 480 : 640; canvas.height = rear ? 640 : 480;
      const context = canvas.getContext('2d');
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      const stream = canvas.captureStream(15);
      window.cameraTest.streams.push(stream);
      return stream;
    } });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost:3200') { externalRequests.push(url.origin); return route.abort(); }
    if (url.pathname === '/__skeleton-fixture') return route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main></main><script src="/__skeleton-fixture/fixture.js"></script></body></html>' });
    if (url.pathname.startsWith('/__skeleton-fixture/')) {
      const filename = path.basename(url.pathname);
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(directory, filename)) });
    }
    return route.continue();
  });
  try {
    await page.goto('http://localhost:3200/__skeleton-fixture');
    await page.addStyleTag({ content: fs.readFileSync(path.join(app, 'public/styles/classic.css'), 'utf8') });
    await page.addStyleTag({ content: fs.readFileSync(path.join(app, 'client/views/theme.css'), 'utf8') });
    await page.evaluate(() => window.fixture.mount());
    assert.equal(await page.getByRole('button', { name: 'Switch camera to rear', includeHidden: true }).isVisible(), false);
    await page.setViewportSize({ width: 390, height: 667 });
    await page.getByRole('button', { name: 'Switch camera to rear' }).waitFor();
    async function checkMobileLayout() {
      const geometry = await page.evaluate(() => {
        const preview = document.querySelector('.pose-camera-mirror').getBoundingClientRect();
        const video = document.querySelector('video');
        return { preview: { width: preview.width, height: preview.height },
          ratio: video.videoWidth ? video.videoWidth / video.videoHeight : 4 / 3,
          width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
          controls: [...document.querySelectorAll('.skeleton-demo-controls button')].map(button => {
            const rect = button.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, height: rect.height };
          }) };
      });
      assert.ok(geometry.scrollWidth <= geometry.width, 'No horizontal scrolling');
      assert.ok(geometry.preview.height <= geometry.height / 2 + 1, 'Preview fits half the mobile viewport height');
      assert.ok(Math.abs(geometry.preview.width / geometry.preview.height - geometry.ratio) < 0.01, 'Overlay geometry matches uncropped video');
      assert.ok(geometry.controls.every(rect => rect.top >= 0 && rect.bottom < geometry.height && rect.height >= 44), 'Controls are visible with touch-sized targets');
    }
    await checkMobileLayout();
    assert.equal(await page.evaluate(() => window.fixture.practiceMounts), 0);
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'No body detected' }).waitFor({ timeout: 45000 });
    assert.equal(await page.locator('video').evaluate(video => video.videoWidth), 640);
    assert.equal(await page.locator('svg circle').count(), 0, 'No fabricated body on blank camera input');
    assert.equal(await page.evaluate(() => window.cameraTest.requestedAudio), false);
    await page.getByRole('button', { name: 'Switch camera to rear' }).click();
    await page.getByRole('status').filter({ hasText: 'No body detected' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.cameraTest.directions.at(-1)), { exact: 'environment' });
    assert.equal(await page.locator('.pose-camera-mirror').evaluate(element => getComputedStyle(element).transform), 'none');
    assert.equal(await page.evaluate(() => window.cameraTest.streams.slice(0, -1).every(s => s.getTracks().every(t => t.readyState === 'ended'))), true);
    for (const viewport of [{ width: 390, height: 667 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport);
      await checkMobileLayout();
      await page.screenshot({ path: path.join(app, `../tmp/skeleton-mobile-${viewport.width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 667 });
    await page.getByRole('button', { name: 'Switch camera to front' }).click();
    await page.getByRole('status').filter({ hasText: 'No body detected' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.cameraTest.directions.at(-1)), { exact: 'user' });
    assert.equal(await page.locator('.pose-camera-mirror').evaluate(element => getComputedStyle(element).transform), 'matrix(-1, 0, 0, 1, 0, 0)');
    await page.evaluate(() => { window.cameraTest.unavailable = true; });
    await page.getByRole('button', { name: 'Switch camera to rear' }).click();
    await page.getByRole('alert').filter({ hasText: 'selected camera is unavailable' }).waitFor();
    assert.equal(await page.locator('video').evaluate(video => video.srcObject), null);
    await page.evaluate(() => { window.cameraTest.unavailable = false; });
    await page.getByRole('button', { name: 'Switch camera to front' }).click();
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
