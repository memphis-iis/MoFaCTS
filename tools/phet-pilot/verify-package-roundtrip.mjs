// Export through the normal authenticated package method, then validate the ZIP.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { launchLocalPilotBrowser, signInLocalPilot, assertLocalPilotOrigin, LOCAL_APP_URL } from './local-app.mjs';
import { validateSimulationAsset, simulationAssetReferences, validateSimulationCatalog } from '../../packages/phet-monitor/assets.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const JSZip = require('jszip');
const activities = JSON.parse(await readFile(process.argv[2], 'utf8'));
const browser = await launchLocalPilotBrowser();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
try {
  const page = await browser.newPage(); await signInLocalPilot(page);
  for (const activity of activities) {
    const { link } = await page.evaluate(id => Meteor.callAsync('getPackageDownloadLink', id), activity.id);
    const url = new URL(link, LOCAL_APP_URL).href; assertLocalPilotOrigin(url);
    const response = await page.request.get(url, { timeout: 180000 });
    assert.ok(response.ok());
    const zip = await JSZip.loadAsync(await response.body());
    const stimuliName = Object.keys(zip.files).find(name => name.endsWith('_stims.json'));
    assert.ok(stimuliName, 'Package omitted stimulus JSON');
    const stimulus = JSON.parse(await zip.file(stimuliName).async('string'));
    const simulation = stimulus.setspec.sparcPages[0].display.nodes.find(node => node.atomType === 'simulation').simulation;
    const asset = validateSimulationAsset(simulation.asset);
    for (const reference of simulationAssetReferences(asset)) {
      const name = reference.url.split('?')[0];
      assert.ok(zip.file(name), `Export omitted packaged asset: ${name}`);
      assert.equal(hash(await zip.file(name).async('nodebuffer')), reference.sha256, `Export changed packaged asset: ${name}`);
    }
    validateSimulationCatalog(JSON.parse(await zip.file(asset.catalog.url).async('string')), simulation.buildId, asset.sha256);
    results.push({ buildId: simulation.buildId, filenamesRestored: true, hashesPreserved: true, sourceAndNoticesRetained: asset.attachments.length === 2 });
    console.log(`${simulation.buildId}: normal package export preserves assets and portable references`);
  }
  await writeFile(path.join(root, 'tmp/phet-pilot/package-roundtrip-acceptance.json'), JSON.stringify({ results }, null, 2) + '\n');
} finally { await browser.close(); }
