// Independently spy on shared Axon notifications before the first frame, then
// compare each surviving, addressable model property/emitter with its trace.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const collectorHash = hash(await readFile(path.join(root, 'packages/phet-monitor/collector.js')));
const pilots = manifest.pilots.filter(pilot => !process.argv[2] || pilot.simulation === process.argv[2]);
if (!pilots.length) throw new Error('Unknown pilot');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  for (const pilot of pilots) {
    const directory = path.join(root, 'tmp/phet-pilot', pilot.simulation, 'monitored');
    const build = JSON.parse(await readFile(path.join(directory, 'monitored-build-result.json'), 'utf8'));
    assert.equal(build.collectorHash, collectorHash, 'Rebuild the current collector first');
    const html = await readFile(path.join(directory, pilot.simulation, pilot.buildArtifact));
    assert.equal(hash(html), build.artifactHash);
    const server = createServer((request, response) => response.writeHead(200, { 'Content-Type': 'text/html' }).end(html));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.addInitScript(() => {
        const probe = window.startupProbe = { models: [], beforeFrame: true, begun: false, candidates: new Map(), trace: [], registrations: new Map() };
        Object.defineProperty(window, 'phetResearchMonitor', { configurable: true, set(monitor) {
          Object.defineProperty(window, 'phetResearchMonitor', { configurable: true, writable: true, value: monitor });
          const begin = monitor.beginModel, model = monitor.model, emit = monitor.emit, frame = monitor.frame, register = monitor.register;
          monitor.register = (object, descriptor) => {
            probe.registrations.set(object, descriptor);
            return register(object, descriptor);
          };
          let scheduled = false;
          monitor.onRecords(() => {
            if (scheduled) return;
            scheduled = true;
            queueMicrotask(() => { scheduled = false; probe.trace.push(...monitor.drain()); });
          });
          monitor.beginModel = () => { probe.begun = true; return begin(); };
          monitor.model = value => { probe.models.push(value); return model(value); };
          monitor.emit = (object, args) => {
            if (probe.begun && probe.beforeFrame) {
              const records = probe.candidates.get(object) || [];
              // Scalar arguments allow an independent value/order comparison
              // without reusing the collector's reference-ID implementation.
              records.push(Array.from(args, value => value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value) ? value : '[object]'));
              probe.candidates.set(object, records);
            }
            return emit(object, args);
          };
          monitor.frame = () => { probe.beforeFrame = false; return frame(); };
        } });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => window.phetResearchMonitor?.status().frame >= 30 || window.phetResearchMonitor?.status().complete === false, null, { timeout: 60000 });
      const result = await page.evaluate(() => {
        const probe = startupProbe; probe.trace.push(...phetResearchMonitor.drain());
        const comparisons = [];
        for (const entry of phetResearchMonitor.snapshot()) {
          if (!['property', 'emitter'].includes(entry.kind)) continue;
          // Resolve discovery addresses using descriptors and explicit registered readers only.
          const parts = entry.path.split('.'); let object = probe.models[Number(parts[1])];
          for (const key of parts.slice(3)) {
            const registration = probe.registrations.get(object);
            if (key === 'value' && registration?.kind === 'property') object = registration.read();
            else if (registration?.kind === 'collection' && /^\d+$/.test(key)) object = registration.members[Number(key)];
            else if (registration?.kind === 'collection' && registration.children) object = registration.children()[key];
            else object = Object.getOwnPropertyDescriptor(object || {}, key)?.value;
          }
          if (!object) continue;
          const registration = probe.registrations.get(object);
          const expected = probe.candidates.get(registration?.source || object);
          if (!expected?.length) continue;
          const observed = probe.trace.filter(record => record.frame === 0 && record.data.id === entry.id && ['property', 'event'].includes(record.type))
            .map(record => record.data.args.map(value => value && typeof value === 'object' ? value.undefined ? undefined : value.number ? Number(value.number) : '[object]' : value));
          comparisons.push({ path: entry.path, expected, observed });
        }
        return { buildId: phetResearchBuild, status: phetResearchMonitor.status(), comparisons,
          startupRecords: probe.trace.filter(record => record.frame === 0 && ['property', 'event', 'disposed'].includes(record.type)).length };
      });
      assert.equal(result.status.complete, true);
      assert.ok(result.startupRecords > 0 && result.comparisons.length > 0, 'No independently checkable startup observations');
      for (const comparison of result.comparisons) assert.deepEqual(comparison.observed, comparison.expected, comparison.path);
      await writeFile(path.join(directory, 'startup-probe.json'), JSON.stringify({ ...result, browser: browser.version(),
        limitation: 'Independent checks cover surviving descriptor-addressable startup properties/emitters; transient constructor objects are covered by collector contract tests.' }, null, 2) + '\n');
      console.log(JSON.stringify({ simulation: pilot.simulation, startupRecords: result.startupRecords, checkedSources: result.comparisons.length }));
    } finally { await page.close(); await new Promise(resolve => server.close(resolve)); }
  }
} finally { await browser.close(); }
