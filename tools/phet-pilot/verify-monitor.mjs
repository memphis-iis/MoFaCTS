import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { ObservedState, validateBatch } from '../../packages/phet-monitor/protocol.ts';
import { installEventDrain } from './event-drain.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const simulation = process.argv[2];
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const pilot = manifest.pilots.find(p => p.simulation === simulation);
if (!pilot) throw new Error('Specify a pilot simulation');
const workspace = path.join(root, 'tmp/phet-pilot', simulation, 'monitored');
const build = JSON.parse(await readFile(path.join(workspace, 'monitored-build-result.json'), 'utf8'));
if (build.status !== 'built') throw new Error('Monitored build not successful');
const html = await readFile(path.join(workspace, simulation, pilot.buildArtifact));
const server = createServer((request, response) => {
  if (request.url !== '/') { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(installEventDrain, { trace: 'researchTestTrace' });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.phetResearchMonitor?.status().frame >= 30 || window.phetResearchMonitor?.status().complete === false, null, { timeout: 60000 });
  const firstStatus = await page.evaluate(() => window.phetResearchMonitor.status());
  if (firstStatus.complete) {
    // The first Intro thumbnail occupies this point in all three verified
    // 1280x900 baseline screenshots. This is a test interaction, not a collector hook.
    await page.mouse.click(300, 440);
    await page.keyboard.press('Tab');
    await page.waitForFunction(frame => window.phetResearchMonitor.status().frame >= frame + 60 || !window.phetResearchMonitor.status().complete,
      firstStatus.frame, { timeout: 60000 });
  }
  const result = await page.evaluate(() => {
    window.researchTestTrace.push(...window.phetResearchMonitor.drain());
    return { buildId: window.phetResearchBuild, status: window.phetResearchMonitor.status(),
      snapshot: window.phetResearchMonitor.snapshot(), trace: window.researchTestTrace };
  });
  const counts = {};
  for (const record of result.trace) counts[record.type] = (counts[record.type] || 0) + 1;
  const coverage = result.trace.filter(r => r.type === 'catalog').map(r => r.data);
  const unsupportedFields = [];
  function inventoryUnsupported(value, field, item) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.unsupported === 'string') {
      unsupportedFields.push({ id: item.id, path: item.path, field, reason: value.unsupported });
      return;
    }
    for (const [key, child] of Object.entries(value)) inventoryUnsupported(child, `${field}.${key}`, item);
  }
  for (const item of result.snapshot) {
    inventoryUnsupported(item.state, 'state', item);
    for (const [field, reason] of Object.entries(item.state.fieldCoverage || {})) {
      if (reason.startsWith('initial-only') || reason.startsWith('unsupported')) unsupportedFields.push({ id:item.id, path:item.path, field, reason });
    }
    if (item.state.changeCoverage === 'unsupported') unsupportedFields.push({ id:item.id, path:item.path, field:'*', reason:'no-change-signal' });
  }
  const reconstructed = new ObservedState();
  const reconstructionErrors = [];
  try {
    // Match transport-sized pieces while preserving the global ordered stream.
    for (let start = 0; start < result.trace.length; start += 1000) {
      const records = result.trace.slice(start, start + 1000);
      reconstructed.apply(validateBatch({ firstSequence: records[0].sequence, lastSequence: records.at(-1).sequence, records }));
    }
    for (const item of result.snapshot) {
      if (JSON.stringify(reconstructed.states.get(item.id)) !== JSON.stringify(item.state)) reconstructionErrors.push(item.path);
    }
    if (reconstructed.states.size !== result.snapshot.length) reconstructionErrors.push('active-object-count');
  } catch (error) { reconstructionErrors.push(error.message); }
  const inventory = { simulation, buildId: result.buildId, browser: browser.version(), status: result.status, errors, counts, coverage, unsupportedFields,
    startupRecords: result.trace.filter(record => record.frame === 0 && ['property', 'event', 'disposed'].includes(record.type)).length,
    reconstructionErrors,
    monitoringErrors: result.trace.filter(r => r.type === 'monitoring-error'),
    limitations: ['Launch and first-screen pointer probe only; keyboard focus is exercised but not validated.', 'No lesson bindings, transport, task scoring or performance acceptance established.',
      'Capture starts before the shared Joist screen-model factory; earlier module-loading activity is outside the model trace.',
      'Plain-object detachment is recorded by reachability; universal plain-object disposal notification is not established.'] };
  await writeFile(path.join(workspace, 'monitor-probe.json'), JSON.stringify(inventory, null, 2) + '\n');
  await writeFile(path.join(workspace, 'monitor-trace.json.gz'), gzipSync(JSON.stringify(result)));
  await page.screenshot({ path: path.join(workspace, 'monitor-probe.png') });
  console.log(JSON.stringify({ simulation, status: result.status, errors, counts, reconstructionErrors: reconstructionErrors.slice(0, 10) }));
  if (!result.status.complete || errors.length || reconstructionErrors.length) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
