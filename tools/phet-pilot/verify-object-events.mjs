// Verify object-local notifications and the absence of idle model scans.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installEventDrain } from './event-drain.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const collectorHash = hash(await readFile(path.join(root, 'packages/phet-monitor/collector.js')));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  for (const pilot of manifest.pilots.filter(p => !process.argv[2] || p.simulation === process.argv[2])) {
    const directory = path.join(root, 'tmp/phet-pilot', pilot.simulation, 'monitored');
    const build = JSON.parse(await readFile(path.join(directory, 'monitored-build-result.json'), 'utf8'));
    assert.equal(build.collectorHash, collectorHash);
    const html = await readFile(path.join(directory, pilot.simulation, pilot.buildArtifact));
    assert.equal(hash(html), build.artifactHash);
    const server = createServer((request, response) => response.writeHead(200, { 'Content-Type': 'text/html' }).end(html));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.addInitScript(installEventDrain, { trace: 'objectEventTrace' });
      await page.goto(`http://127.0.0.1:${server.address().port}/${pilot.simulation === 'pendulum-lab' ? '?accessibility' : ''}`);
      await page.waitForFunction(() => window.phetResearchMonitor?.status().frame >= 30, null, { timeout: 60000 });
      await page.mouse.click(300, 440);
      for (let index = 0; index < 12; index++) {
        await page.evaluate(({ simulation, index }) => {
          const sim = phet.joist.sim;
          const models = sim.screens.map(screen => screen.model);
          if (simulation === 'density') {
            const model = models.find(model => model.blockA);
            model.blockA.volumeProperty.value = index % 2 ? .005 : .006;
          } else if (simulation === 'pendulum-lab') {
            const model = models.find(model => model.pendula);
            model.pendula[0].lengthProperty.value = index % 2 ? .7 : .8;
            if (index === 0) model.pendula[0].angleProperty.value = -.5;
          } else {
            const model = models.find(model => model.circuit);
            if (index % 2) model.reset();
            else {
              const c = model.circuit, V = phet.dot.Vector2;
              const a = c.vertexGroup.createNextElement(new V(300,250)), b = c.vertexGroup.createNextElement(new V(450,250)), d = c.vertexGroup.createNextElement(new V(450,400));
              c.circuitElements.push(c.batteryGroup.createNextElement(a,b));
              c.circuitElements.push(c.wireGroup.createNextElement(b,d));
              c.circuitElements.push(c.resistorGroup.createNextElement(d,a));
            }
          }
          // Exercise inactive-model notifications as well as active physics.
          if (index === 4 || index === 8) {
            const next = index === 4 ? sim.screens.length - 1 : 0;
            if (sim.selectedScreenProperty) sim.selectedScreenProperty.value = sim.screens[next];
            else sim.screenIndexProperty.value = next;
          }
          if (index === 11) models.forEach(model => model.reset());
        }, { simulation: pilot.simulation, index });
        await page.waitForTimeout(500);
      }
      const result = await page.evaluate(() => {
        const monitor = phetResearchMonitor;
        monitor.frame();
        const before = monitor.status().objectInspections;
        for (let index=0; index<1000; index++) monitor.frame();
        const idleInspections = monitor.status().objectInspections - before;
        objectEventTrace.push(...monitor.drain());
        const trace = objectEventTrace;
        const coverage = trace.filter(record=>record.type==='catalog').map(record=>record.data);
        return { idleInspections, status:monitor.status(), coverage,
          counts:Object.fromEntries(['property','event','sample','disposed','detached'].map(type=>[type,trace.filter(record=>record.type===type).length])),
          unlabeledSamples:trace.filter(record=>record.type==='sample' && !record.data.trigger).length };
      });
      await writeFile(path.join(directory, 'object-events-probe.json'), JSON.stringify({ buildId:build.identity, collectorHash, browser:browser.version(), errors, ...result }, null, 2)+'\n');
      assert.equal(errors.length,0,JSON.stringify(errors));
      assert.equal(result.status.complete,true);
      assert.equal(result.idleInspections,0,'Idle frame callbacks cannot inspect models');
      assert.equal(result.unlabeledSamples,0);
      assert.ok(result.counts.property>0);
      assert.ok(result.coverage.some(item=>item.coverage==='unsupported'));
      console.log(JSON.stringify({ simulation:pilot.simulation, idleInspections:result.idleInspections, counts:result.counts }));
    } finally { await page.close(); await new Promise(resolve => server.close(resolve)); }
  }
} finally { await browser.close(); }
