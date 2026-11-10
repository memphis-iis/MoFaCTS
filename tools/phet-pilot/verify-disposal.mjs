import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installEventDrain } from './event-drain.mjs';

// Dynamic-object lifetime probe, separate from frame-time measurements because
// explicitly forced garbage collection would invalidate those measurements.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const simulation = 'circuit-construction-kit-dc';
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const pilot = manifest.pilots.find(entry => entry.simulation === simulation);
const workspace = path.join(root, 'tmp/phet-pilot', simulation);
const build = JSON.parse(await readFile(path.join(workspace, 'monitored/monitored-build-result.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
assert.equal(build.collectorHash, hash(await readFile(path.join(root, 'packages/phet-monitor/collector.js'))));
const html = Object.fromEntries(await Promise.all(['baseline', 'monitored'].map(async mode => [mode,
  await readFile(path.join(workspace, mode, simulation, pilot.buildArtifact))])));
const server = createServer((request, response) => {
  const contents = html[request.url?.slice(1)];
  if (!contents) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(contents);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const results = {};
try {
  for (const mode of ['baseline', 'monitored']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(installEventDrain, { counts: 'disposalCounts' });
    await page.goto(`http://127.0.0.1:${server.address().port}/${mode}`);
    await page.waitForFunction(() => window.phet?.joist?.sim?.screens?.every(screen => screen.model && screen.view), null, { timeout: 60000 });
    const frames = async count => page.evaluate(count => new Promise(resolve => {
      const emitter = phet.joist.sim.frameEndedEmitter;
      const listener = () => { if (--count === 0) { emitter.removeListener(listener); resolve(); } };
      emitter.addListener(listener);
    }), count);
    await frames(60); await page.mouse.click(300, 440); await frames(10);
    await page.evaluate(() => { window.disposedProbes = []; });
    const cdp = await page.context().newCDPSession(page);
    if (process.argv.includes('--heap')) await cdp.send('HeapProfiler.enable');
    const rounds = [];
    for (let round = 0; round < 5; round++) {
      for (let cycle = 0; cycle < 20; cycle++) {
        await page.evaluate(() => {
          const model = phet.joist.sim.screens.find(screen => screen.model.circuit).model;
          const circuit = model.circuit, V = phet.dot.Vector2;
          const a = circuit.vertexGroup.createNextElement(new V(300, 250));
          const b = circuit.vertexGroup.createNextElement(new V(450, 250));
          const element = circuit.wireGroup.createNextElement(a, b);
          circuit.circuitElements.push(element);
          // Weak references do not keep the tested component/property alive.
          window.disposedProbes.push(new WeakRef(element), new WeakRef(element.currentProperty));
          model.reset();
        });
        await frames(2);
      }
      await frames(10);
      await cdp.send('HeapProfiler.collectGarbage');
      const retained = await page.evaluate(() => ({ tested: window.disposedProbes.length,
        retained: window.disposedProbes.filter(reference => reference.deref()).length,
        monitor: window.phetResearchMonitor?.status() || null, records: { ...window.disposalCounts } }));
      rounds.push(retained);
      if (process.argv.includes('--heap') && mode === 'monitored' && retained.retained) {
        const chunks = [];
        cdp.on('HeapProfiler.addHeapSnapshotChunk', event => chunks.push(event.chunk));
        await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
        await writeFile(path.join(workspace, 'retention.heapsnapshot'), chunks.join(''));
        const object = await cdp.send('Runtime.evaluate', { expression: 'disposedProbes.find(reference => reference.deref()).deref()', objectGroup: 'retention-probe' });
        const identity = await cdp.send('HeapProfiler.getHeapObjectId', { objectId: object.result.objectId });
        console.log(JSON.stringify({ retainedHeapObjectId: identity.heapSnapshotObjectId }));
        await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'retention-probe' });
        break;
      }
    }
    results[mode] = { rounds, errors };
    await page.close();
  }
  const result = { buildId: build.identity, browser: browser.version(), results,
    qualification: '100 create/reset cycles per build, testing weak references to 100 components and their current properties after forced Chromium garbage collection; not a complete heap audit.' };
  await writeFile(path.join(workspace, process.argv.includes('--heap') ? 'disposal-heap-probe.json' : 'disposal-probe.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  for (const value of Object.values(results)) {
    assert.deepEqual(value.errors, []);
    assert.ok(value.rounds.every(round => round.retained === 0), 'Disposed component/property references remain reachable');
  }
  assert.ok(results.monitored.rounds.every(round => round.monitor.complete));
  assert.ok(results.monitored.rounds.at(-1).records.disposed > 0);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
