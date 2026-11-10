import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ObservedState, validateBatch } from '../../packages/phet-monitor/protocol.ts';
import { installEventDrain } from './event-drain.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const collectorHash = hash(await readFile(path.join(root, 'packages/phet-monitor/collector.js')));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const results = [];
try {
  for (const pilot of manifest.pilots) {
    const simulation = pilot.simulation;
    const workspace = path.join(root, 'tmp/phet-pilot', simulation, 'monitored');
    const build = JSON.parse(await readFile(path.join(workspace, 'monitored-build-result.json'), 'utf8'));
    assert.equal(build.collectorHash, collectorHash);
    const html = await readFile(path.join(workspace, simulation, pilot.buildArtifact));
    assert.equal(hash(html), build.artifactHash);
    const server = createServer((request, response) => {
      if (!['/', '/?accessibility'].includes(request.url)) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [], checkpoints = [], trace = [];
    const state = new ObservedState();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await page.addInitScript(installEventDrain, { trace: 'interactionTrace' });
      // The pinned AMD generation explicitly gates its keyboard/parallel DOM
      // behind this documented shared Chipper launch flag. No model is patched.
      const query = simulation === 'pendulum-lab' ? '?accessibility' : '';
      await page.goto(`http://127.0.0.1:${server.address().port}/${query}`);
      await page.waitForFunction(() => window.phetResearchMonitor?.status().frame >= 60, null, { timeout: 60000 });
      await page.mouse.click(300, 440); await page.waitForTimeout(500);
      const checkpoint = async label => {
        const capture = await page.evaluate(() => {
          window.interactionTrace.push(...phetResearchMonitor.drain());
          const records = window.interactionTrace.splice(0);
          return { records, snapshot: phetResearchMonitor.snapshot(), status: phetResearchMonitor.status() };
        });
        for (let offset = 0; offset < capture.records.length; offset += 1000) {
          const records = capture.records.slice(offset, offset + 1000);
          state.apply(validateBatch({ firstSequence: records[0].sequence, lastSequence: records.at(-1).sequence, records }));
        }
        for (const item of capture.snapshot) assert.deepEqual(state.states.get(item.id), item.state, `${simulation}/${label}: ${item.path}`);
        assert.equal(state.states.size, capture.snapshot.length);
        assert.equal(capture.status.complete, true);
        trace.push(...capture.records); checkpoints.push({ label, sequence: state.lastSequence, activeObjects: capture.status.activeObjects });
      };
      const screenIndex = () => page.evaluate(() => {
        const sim = phet.joist.sim;
        return sim.selectedScreenProperty ? sim.screens.indexOf(sim.selectedScreenProperty.value) : sim.screenIndexProperty.value;
      });
      const initialScreen = await screenIndex();
      await checkpoint('intro');
      if (simulation === 'density' || simulation === 'pendulum-lab') {
        const sliders = page.getByRole('slider');
        const targetValue = simulation === 'density' ? 5 : .7;
        const values = await sliders.evaluateAll(elements => elements.map(element => Number(element.value)));
        // This historical NumberControl exposes its length slider first. Its
        // native range element rounds .7 to 1; verify the actual model below.
        const index = simulation === 'pendulum-lab' ? 0 : values.indexOf(targetValue);
        assert.ok(index >= 0, `Expected native slider ${targetValue}; found ${values}`);
        await sliders.nth(index).press('End');
        await page.waitForFunction(simulation => {
          const models = phet.joist.sim.screens.map(screen => screen.model);
          return simulation === 'density' ? models.find(model => model.blockA).blockA.volumeProperty.value > .005
            : models.find(model => model.pendula).pendula[0].lengthProperty.value === 1;
        }, simulation);
        if (simulation === 'pendulum-lab') {
          // Read the public view transform to aim a real pointer drag at the bob.
          const bob = await page.evaluate(() => {
            const screen = phet.joist.sim.screens.find(screen => screen.model.pendula);
            const transform = phet.pendulumLab.PendulumLabConstants.MODEL_VIEW_TRANSFORM;
            const point = screen.view.localToGlobalPoint(transform.modelToViewPosition(screen.model.pendula[0].positionProperty.value));
            return { x: point.x, y: point.y };
          });
          await page.mouse.move(bob.x, bob.y); await page.mouse.down();
          await page.mouse.move(bob.x - 200, bob.y - 50, { steps: 15 }); await page.mouse.up();
          await page.waitForFunction(() => Math.abs(phet.joist.sim.screens.find(screen => screen.model.pendula).model.pendula[0].angleProperty.value) > .1);
        }
      } else {
        await page.mouse.move(90, 95); await page.mouse.down(); await page.mouse.move(400, 400, { steps: 15 }); await page.mouse.up();
        await page.waitForFunction(() => phet.joist.sim.screens.find(screen => screen.model.circuit).model.circuit.circuitElements.length === 1);
        await checkpoint('component-created');
        await page.getByRole('application', { name: /^Wire 1 of 1/ }).press('Delete');
        await page.waitForFunction(() => phet.joist.sim.screens.find(screen => screen.model.circuit).model.circuit.circuitElements.length === 0);
      }
      await page.waitForTimeout(300); await checkpoint('keyboard-and-pointer');
      await page.getByRole('button', { name: /Reset All/i }).press('Space');
      await page.waitForTimeout(300); await checkpoint('reset');
      assert.equal(await page.evaluate(simulation => {
        const models = phet.joist.sim.screens.map(screen => screen.model);
        if (simulation === 'density') return models.find(model => model.blockA).blockA.volumeProperty.value === .005;
        if (simulation === 'pendulum-lab') return models.find(model => model.pendula).pendula[0].lengthProperty.value === .7;
        return models.find(model => model.circuit).circuit.circuitElements.length === 0;
      }, simulation), true, 'Reset did not restore the expected model values');
      await page.mouse.click(simulation === 'density' ? 640 : simulation === 'pendulum-lab' ? 675 : 690, 860); await page.waitForTimeout(500);
      assert.notEqual(await screenIndex(), initialScreen, 'Navigation pointer did not switch screen');
      await checkpoint('screen-switch');
      const stopped = await page.evaluate(() => { phetResearchMonitor.stop(); return phetResearchMonitor.status(); });
      assert.equal(stopped.activeObjects, 0); assert.equal(stopped.pendingEvents, 0); assert.equal(stopped.queuedRecords, 0);
      assert.deepEqual(errors, []);
      const result = { simulation, buildId: build.identity, query, keyboard: true, pointer: true, reset: true, screenSwitch: true,
        reconstruction: true, collectorResourcesReleased: true, checkpoints, errors };
      results.push(result);
      await writeFile(path.join(workspace, 'interaction-trace.json.gz'), gzipSync(JSON.stringify({ ...result, trace })));
      console.log(JSON.stringify(result));
    } catch (error) {
      console.log(JSON.stringify({ simulation, errors, failure: error.message,
        controls: await page.locator('button,input').evaluateAll(elements => elements.map(element => ({
          type: element.type, label: element.getAttribute('aria-label'), text: element.textContent, value: element.value,
        }))) }));
      await page.screenshot({ path: path.join(workspace, 'interaction-failure.png') });
      throw error;
    } finally { await page.close(); await new Promise(resolve => server.close(resolve)); }
  }
  await writeFile(path.join(root, 'tmp/phet-pilot/interaction-acceptance.json'), JSON.stringify({ browser: browser.version(), results,
    limitations: ['These representative controls do not constitute a complete accessibility audit.',
      'Pendulum keyboard verification and timing use the upstream accessibility flag.'] }, null, 2) + '\n');
} finally { await browser.close(); }
