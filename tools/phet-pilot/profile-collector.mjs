// CPU profile of the compiled collector with all shared hooks intact.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { installEventDrain } from './event-drain.mjs';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const pilot = manifest.pilots.find(p => p.simulation === process.argv[2]);
if (!pilot) throw new Error('Specify a pilot simulation');
const directory = path.join(root, 'tmp/phet-pilot', pilot.simulation);
const build = JSON.parse(await readFile(path.join(directory,'monitored/monitored-build-result.json'),'utf8'));
const hash = value=>createHash('sha256').update(value).digest('hex');
if(build.collectorHash!==hash(await readFile(path.join(root,'packages/phet-monitor/collector.js'))))throw new Error('Rebuild current collector first');
const html = await readFile(path.join(directory, 'monitored', pilot.simulation, pilot.buildArtifact));
const server = createServer((request, response) => response.writeHead(200, { 'Content-Type': 'text/html' }).end(html));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(installEventDrain);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.phetResearchMonitor?.status().frame > 60, null, { timeout: 60000 });
  await page.mouse.click(300, 440);
  await page.evaluate(() => {
    window.collectorCosts = [];
    const original = phetResearchMonitor.frame;
    phetResearchMonitor.frame = () => {
      const before = performance.now(); original(); collectorCosts.push(performance.now() - before);
    };
  });
  await page.waitForTimeout(1000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  await page.waitForTimeout(10000);
  const { profile } = await cdp.send('Profiler.stop');
  await writeFile(path.join(directory, 'profile-current.json'), JSON.stringify(profile));
  console.log(await page.evaluate(() => {
    const values = collectorCosts.slice(60).sort((a, b) => a - b);
    const census = {};
    phetResearchMonitor.snapshot().forEach(entry => {
      const bucket = census[entry.kind] ||= { objects: 0, fields: 0, immutable: 0 };
      bucket.objects++; bucket.fields += Object.keys(entry.state.fields || entry.state.values || {}).length;

    });
    return { p95CollectorMs: values[Math.floor(values.length * .95)], status: phetResearchMonitor.status(), census };
  }));
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const costs = new Map();
  profile.samples.forEach((id, index) => {
    const node = nodes.get(id), key = `${node.callFrame.functionName}@${node.callFrame.lineNumber}`;
    costs.set(key, (costs.get(key) || 0) + profile.timeDeltas[index]);
  });
  console.log([...costs].sort((a, b) => b[1] - a[1]).slice(0, 18));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
