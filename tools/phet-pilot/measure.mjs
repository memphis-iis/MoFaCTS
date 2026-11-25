import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { installEventDrain } from './event-drain.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const pilot = manifest.pilots.find(p => p.simulation === process.argv[2]);
if (!pilot) throw new Error('Specify a pilot simulation');
const duration = Number(process.argv[3] || 10000);
if (!Number.isSafeInteger(duration) || duration < 1000) throw new Error('Invalid duration in milliseconds');
const workspace = path.join(root, 'tmp/phet-pilot', pilot.simulation);
const build = JSON.parse(await readFile(path.join(workspace, 'monitored/monitored-build-result.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
if (build.collectorHash !== hash(await readFile(path.join(root, 'packages/phet-monitor/collector.js')))
  || build.bridgeHash !== hash(await readFile(path.join(root, 'packages/phet-monitor/bridge.js')))) throw new Error('Rebuild current monitor before measuring');
const html = Object.fromEntries(await Promise.all(['baseline', 'monitored'].map(async mode => [mode,
  await readFile(path.join(workspace, mode, pilot.simulation, pilot.buildArtifact))])));
const baselineBuild = JSON.parse(await readFile(path.join(workspace, 'baseline/baseline-build.json'), 'utf8'));
if (hash(html.monitored) !== build.artifactHash || hash(html.baseline) !== baselineBuild.artifact.sha256) throw new Error('Measurement artifact hash mismatch');
const server = createServer((request, response) => {
  const mode = new URL(request.url, 'http://localhost').pathname.slice(1);
  if (!html[mode]) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html[mode]);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const results = {};
const quantile = (values, q) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))];
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  for (const mode of ['baseline', 'monitored']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(installEventDrain);
    await page.goto(`http://127.0.0.1:${server.address().port}/${mode}${pilot.simulation === 'pendulum-lab' ? '?accessibility' : ''}`);
    await page.waitForFunction(() => window.phet?.joist?.sim?.screens?.every(screen => screen.model && screen.view), null, { timeout: 60000 });
    const webgl = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('webgl');
      if (!context) return { available: false };
      const info = context.getExtension('WEBGL_debug_renderer_info');
      return { available: true, renderer: info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unavailable' };
    });
    if (pilot.simulation === 'density' && !webgl.available) throw new Error('Density requires working WebGL for a valid comparison');
    await page.evaluate(() => new Promise(resolve => {
      let count = 0;
      const emitter = window.phet.joist.sim.frameEndedEmitter;
      const listener = () => { if (++count === 60) { emitter.removeListener(listener); resolve(); } };
      emitter.addListener(listener);
    }));
    await page.mouse.click(300, 440);
    await page.waitForTimeout(1000);
    const screenActive = await page.evaluate(() => {
      const sim=phet.joist.sim;
      return sim.selectedScreenProperty ? sim.selectedScreenProperty.value!==sim.homeScreen : sim.showHomeScreenProperty.value===false;
    });
    if (!screenActive) throw new Error('Scripted measurement must enter an initialized simulation screen');
    await page.evaluate(() => {
      window.measureData = { intervals: [], objects: [], started: performance.now(), hiddenFrames: 0 };
      let last = performance.now();
      window.measureListener = () => {
        const now = performance.now(); window.measureData.intervals.push(now - last); last = now;
        if (document.visibilityState !== 'visible') window.measureData.hiddenFrames++;
        if (window.phetResearchMonitor && window.measureData.intervals.length % 60 === 0) {
          window.measureData.objects.push(window.phetResearchMonitor.status().activeObjects);
        }
      };
      window.phet.joist.sim.frameEndedEmitter.addListener(window.measureListener);
    });
    const started = Date.now();
    let interaction = 0;
    let nextProgress = 60000;
    const interactionStates = [];
    while (Date.now() - started < duration) {
      await page.evaluate(({simulation,index})=>{
        const models=phet.joist.sim.screens.map(screen=>screen.model);
        if(simulation==='density') models.find(model=>model.blockA).blockA.volumeProperty.value=index%2?.005:.006;
        else if(simulation==='pendulum-lab') {
          const model=models.find(model=>model.pendula);
          model.pendula[0].lengthProperty.value=index%2?.7:.8;
          if(index===0)model.pendula[0].angleProperty.value=-.5;
        } else {
          const model=models.find(model=>model.circuit);
          if(index%2)model.reset();
          else {
            const c=model.circuit,V=phet.dot.Vector2;
            const a=c.vertexGroup.createNextElement(new V(300,250)),b=c.vertexGroup.createNextElement(new V(450,250)),d=c.vertexGroup.createNextElement(new V(450,400));
            c.circuitElements.push(c.batteryGroup.createNextElement(a,b));
            c.circuitElements.push(c.wireGroup.createNextElement(b,d));
            c.circuitElements.push(c.resistorGroup.createNextElement(d,a));
          }
        }
      },{simulation:pilot.simulation,index:interaction});
      interaction++;
      await page.waitForTimeout(Math.min(2000, Math.max(0, duration - (Date.now() - started))));
      interactionStates.push(await page.evaluate(simulation => {
        const models = window.phet.joist.sim.screens.map(screen => screen.model);
        if (simulation === 'density') { const m = models.find(model => model.blockA); return { mass:m.blockA.massProperty.value, volume:m.blockA.volumeProperty.value }; }
        if (simulation === 'pendulum-lab') { const m = models.find(model => model.pendula); return { length:m.pendula[0].lengthProperty.value, angle:m.pendula[0].angleProperty.value }; }
        return { count:models.find(model => model.circuit).circuit.circuitElements.length };
      }, pilot.simulation));
      if (Date.now()-started>=nextProgress) {
        const progress=await page.evaluate(()=>({frames:window.measureData.intervals.length,monitor:window.phetResearchMonitor?.status()||null,visibility:document.visibilityState}));
        console.log(JSON.stringify({simulation:pilot.simulation,mode,elapsedSeconds:Math.round((Date.now()-started)/1000),...progress}));
        nextProgress+=60000;
      }
    }
    const data = await page.evaluate(() => {
      window.phet.joist.sim.frameEndedEmitter.removeListener(window.measureListener);
      return { ...window.measureData, ended: performance.now(), monitor: window.phetResearchMonitor?.status() || null };
    });
    results[mode] = { ...data, errors, webgl, interactions: interaction, interactionStates,
      maximumFrameGapMs: data.intervals.reduce((maximum,value) => Math.max(maximum,value), 0),
      measurementValid: data.hiddenFrames === 0 && data.intervals.every(value => value < 2000) && data.ended-data.started <= duration+5000,
      p95FrameMs: quantile(data.intervals.slice(1), 0.95), p95CollectorMs: null };
    console.log(JSON.stringify({ simulation: pilot.simulation, mode, p95FrameMs: results[mode].p95FrameMs, p95CollectorMs: results[mode].p95CollectorMs, complete: data.monitor?.complete }));
    await page.close();
  }
  const result = { simulation: pilot.simulation, buildId:build.identity, collectorHash:build.collectorHash, bridgeHash:build.bridgeHash,
    registrationContractHash:build.registrationContractHash, artifactHash:build.artifactHash, baselineArtifactHash:baselineBuild.artifact.sha256,
    recordedAt: new Date().toISOString(), harnessHash:hash(await readFile(fileURLToPath(import.meta.url))),
    eventDrainHash:hash(await readFile(new URL('./event-drain.mjs',import.meta.url))),
    nodeVersion:process.version, platform:process.platform, arch:process.arch, browser: browser.version(), durationRequestedMs: duration,
    qualification: 'Collector/rendering comparison using reproducible public-model API actions. Collector methods run without profiling wrappers; persistence, instructional-rule latency and pointer/keyboard accessibility are measured separately.',
    p95FrameOverhead: results.monitored.p95FrameMs / results.baseline.p95FrameMs - 1, results };
  await writeFile(path.join(workspace, `performance-${duration}ms.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ simulation: pilot.simulation, p95FrameOverhead: result.p95FrameOverhead }));
  if (results.baseline.errors.length || results.monitored.errors.length || !results.monitored.monitor?.complete
    || !results.baseline.measurementValid || !results.monitored.measurementValid) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
