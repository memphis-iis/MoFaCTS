import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const simulation = process.argv[2];
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const pilot = manifest.pilots.find(candidate => candidate.simulation === simulation);
if (!pilot) throw new Error('Specify a pilot simulation');
const workspace = path.join(root, 'tmp/phet-pilot', simulation);
const file = path.join(workspace, 'baseline', simulation, pilot.buildArtifact);
const html = await readFile(file);
const server = createServer((request, response) => {
  if (request.url !== '/') { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  // Keep a baseline self-contained: no analytics or other remote requests.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => {
    const sim = window.phet?.joist?.sim;
    return sim?.screens?.length > 0 && sim.screens.every(screen => screen.model && screen.view);
  }, null, { timeout: 60000 });
  // Observe actual frame completion rather than treating the early Sim
  // constructor/global assignment as a successful launch.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const emitter = window.phet.joist.sim.frameEndedEmitter;
    let remaining = 3;
    const timeout = setTimeout(() => {
      emitter.removeListener(onFrame);
      reject(new Error('No three completed simulation frames within 30 seconds'));
    }, 30000);
    function onFrame() {
      if (--remaining === 0) {
        clearTimeout(timeout);
        emitter.removeListener(onFrame);
        resolve();
      }
    }
    emitter.addListener(onFrame);
  }));
  const state = await page.evaluate(() => {
    const sim = window.phet.joist.sim;
    return { screenCount: sim.screens.length, title: document.title };
  });
  await page.screenshot({ path: path.join(workspace, 'baseline.png') });
  const result = { simulation, file, browser: browser.version(), ...state, pageErrors,
    status: pageErrors.length ? 'failed' : 'launch-verified',
    limitation: 'Launch smoke check only; interaction and ten-minute performance checks remain pending.' };
  await writeFile(path.join(workspace, 'baseline-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  if (pageErrors.length) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
