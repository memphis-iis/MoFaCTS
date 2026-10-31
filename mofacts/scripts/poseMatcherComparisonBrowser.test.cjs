// Offline panel check: no application server, camera, account, or external requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rspack } = require('@rspack/core');
const { chromium } = require('playwright');
const app = path.resolve(__dirname, '..');

test('comparison panel captures template, independently calibrates and shows both scores on shared frames', { timeout: 60000 }, async () => {
  const temporaryRoot = path.resolve(app, '../tmp');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'pose-comparison-'));
  const component = path.join(app, 'client/views/experiment/svelte/components/PoseMatcherComparison.svelte').replaceAll('\\', '/');
  fs.writeFileSync(path.join(directory, 'Panel.svelte'), `<script>
    import Comparison from ${JSON.stringify(component)};
    import { writable } from 'svelte/store';
    const observation = writable(null);
    window.poseFixture = { emit: value => observation.set(value) };
    </script><Comparison observation={$observation} />`);
  fs.writeFileSync(path.join(directory, 'entry.js'), `import { mount } from 'svelte';
    import Panel from './Panel.svelte'; mount(Panel, { target: document.querySelector('main') });`);
  const compiler = rspack({ context: app, mode: 'development', devtool: false,
    entry: path.join(directory, 'entry.js'), output: { path: directory, filename: 'fixture.js' },
    resolve: { extensions: ['.svelte', '.ts', '.js'], conditionNames: ['svelte', 'browser', 'import', 'default'], modules: [path.join(app, 'node_modules')] },
    module: { rules: [
      { test: /\.svelte$/, use: [{ loader: require.resolve('./loaders/svelte-loader-wrapper.cjs'), options: { compilerOptions: { dev: true } } }] },
      { test: /\.ts$/, type: 'javascript/auto', use: [{ loader: 'builtin:swc-loader', options: { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' } } }] },
    ] }, optimization: { minimize: false, splitChunks: false }, performance: { hints: false },
  });
  await new Promise((resolve, reject) => compiler.run((error, stats) => compiler.close(closeError => {
    if (error || closeError) reject(error || closeError);
    else if (stats.hasErrors()) reject(Error(stats.toString({ all: false, errors: true })));
    else resolve();
  })));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'pose-fixture.test') return route.abort();
      if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(directory, 'fixture.js')) });
      if (url.pathname === '/classic.css') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(app, 'public/styles/classic.css')) });
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/classic.css"></head><body><main class="card-body"></main><script src="/fixture.js"></script></body></html>' });
    });
    await page.goto('http://pose-fixture.test/');
    await page.getByText('3D pose matcher comparison', { exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Capture template' }).isDisabled(), true);
    let timestamp = 0;
    async function emit(change = false, invalid = false) {
      timestamp += 100;
      await page.evaluate(({ timestamp, change, invalid }) => {
        const points = [];
        [[11, 0, 0, 0], [12, 2, 0, 0], [13, -.5, 1, .3], [15, -.7, 2, 1], [14, 2.7, .8, -.3], [16, 2.4, 1.2, -1.3]]
          .forEach(([id, x, y, z]) => { points[id] = { x, y, z, visibility: invalid ? .1 : 1 }; });
        if (change) points[15].x += 2;
        window.poseFixture.emit({ worldLandmarks: points, timestamp });
      }, { timestamp, change, invalid });
      await page.waitForTimeout(5);
    }
    await emit();
    await page.getByRole('button', { name: 'Capture template' }).click();
    await page.getByRole('button', { name: 'Calibrate person' }).click();
    for (let i = 0; i < 45; i++) await emit();
    await page.getByText(/Calibration: 45\/45 valid frames \(ready\)/).waitFor();
    assert.match(await page.locator('details').innerText(), /Simple distances: 0\.000000.*Calibrated skeleton: 0\.000000/);
    await emit(true);
    assert.doesNotMatch(await page.locator('details').innerText(), /Simple distances: 0\.000000/);
    await page.getByRole('checkbox').uncheck();
    assert.match(await page.locator('details').innerText(), /scale 1\.000/);
    await emit(false, true);
    assert.match(await page.locator('details').innerText(), /Simple distances: Unavailable\. Calibrated skeleton: Unavailable/);
    await page.getByRole('button', { name: 'Clear comparison' }).click();
    assert.match(await page.locator('details').innerText(), /Template: needed\. Calibration: 0\/45/);
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 667 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Panel fits width');
      assert.ok(await page.locator('.pose-matcher-comparison-body').evaluate(element => element.getBoundingClientRect().height <= innerHeight * .25 + 1), 'Expanded content preserves preview space');
      await page.screenshot({ path: path.join(directory, `panel-${viewport.width}.png`) });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
