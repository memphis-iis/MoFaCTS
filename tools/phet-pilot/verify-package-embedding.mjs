// Browser qualification of uploaded-asset isolation and the shared portable bridge.
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SIMULATION_HTML_CSP } from '../../packages/phet-monitor/assets.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const pilots = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8')).pilots;
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const results = [];
try {
  for (const pilot of pilots) {
    const workspace = path.join(root, 'tmp/phet-pilot', pilot.simulation, 'monitored');
    const build = JSON.parse(await readFile(path.join(workspace, 'monitored-build-result.json'), 'utf8'));
    const html = await readFile(path.join(workspace, pilot.simulation, pilot.buildArtifact));
    const server = createServer((request, response) => {
      if (request.url.startsWith('/simulation')) response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': SIMULATION_HTML_CSP }).end(html);
      else response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Package embedding test</title><iframe sandbox="allow-scripts" referrerpolicy="origin" style="width:1280px;height:900px;border:0"></iframe>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const page = await browser.newPage({ viewport: { width: 1320, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(({ buildId, accessibility }) => {
        const frame = document.querySelector('iframe'), sessionId = crypto.randomUUID();
        window.result = { batches: 0, records: 0, origins: [], ready: false };
        window.addEventListener('message', event => {
          const message = event.data;
          if (event.source !== frame.contentWindow || event.origin !== 'null' || message?.buildId !== buildId || message.sessionId !== sessionId) return;
          window.result.origins.push(event.origin);
          if (message.kind === 'ready') window.result.ready = message.data.evidenceComplete;
          if (message.kind === 'batch') {
            window.result.batches++; window.result.records += message.data.records.length;
            frame.contentWindow.postMessage({ protocol: 'phet-research', version: 3, buildId, sessionId, kind: 'ack', data: { sequence: message.data.lastSequence } }, '*');
          }
          if (message.kind === 'error') window.result.error = message.data.reason;
        });
        frame.onload = () => frame.contentWindow.postMessage({ protocol: 'phet-research', version: 3, buildId, sessionId, kind: 'initialize', data: {} }, '*');
        frame.src = '/simulation' + (accessibility ? '?accessibility' : '');
      }, { buildId: build.identity, accessibility: pilot.simulation === 'pendulum-lab' });
      await page.waitForFunction(() => window.result.ready && window.result.records > 0 || window.result.error, null, { timeout: 60000 });
      const frame = page.frames().find(frame => frame.url().includes('/simulation'));
      const isolation = await frame.evaluate(() => {
        let parentDenied = false, storageDenied = false;
        try { void parent.document.body; } catch { parentDenied = true; }
        try { void localStorage.length; } catch { storageDenied = true; }
        return { parentDenied, storageDenied, complete: window.phetResearchMonitor.status().complete };
      });
      const result = await page.evaluate(() => window.result);
      assert.equal(result.error, undefined); assert.ok(isolation.parentDenied && isolation.storageDenied && isolation.complete);
      assert.deepEqual(errors, []);
      const direct = await browser.newPage();
      let directStorageDenied;
      try {
        await direct.goto(`http://127.0.0.1:${server.address().port}/simulation`);
        directStorageDenied = await direct.evaluate(() => { try { void localStorage.length; return false; } catch { return true; } });
        assert.equal(directStorageDenied, true, 'Direct HTML navigation must retain HTTP sandbox isolation');
      } finally { await direct.close(); }
      results.push({ simulation: pilot.simulation, buildId: build.identity, ...isolation, directStorageDenied, records: result.records, opaqueMessageOrigin: result.origins.every(origin => origin === 'null') });
      console.log(`${pilot.simulation}: opaque sandbox and portable shared bridge passed`);
    } finally { await page.close(); await new Promise(resolve => server.close(resolve)); }
  }
  await writeFile(path.join(root, 'tmp/phet-pilot/package-embedding-acceptance.json'), JSON.stringify({ browser: browser.version(), results }, null, 2) + '\n');
} finally { await browser.close(); }
