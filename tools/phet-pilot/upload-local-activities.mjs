import { launchLocalPilotBrowser, signInLocalPilot } from './local-app.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// Repeatable local integration fixtures use new lesson identities. Never clear
// learner progress or rewrite a completed activity to make a test pass again.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = process.argv[2];
const run = process.argv[3];
if (!directory || !path.isAbsolute(directory) || !/^[a-z0-9-]{1,50}$/.test(run || '')) {
  throw new Error('Specify the absolute lesson directory and a unique lowercase local run label');
}
const require = createRequire(path.join(root, 'mofacts/package.json'));
const JSZip = require('jszip');
const zip = new JSZip();
const titles = [];
const collectExisting = process.argv.includes('--collect-existing');
const simulations = ['density', 'pendulum-lab', 'circuit-construction-kit-dc'];
const selected = process.argv.find(value => value.startsWith('--simulation='))?.slice('--simulation='.length);
if (selected && !simulations.includes(selected)) throw new Error('Unknown pilot simulation');
for (const simulation of simulations.filter(value => !selected || value === selected)) {
  const stem = `phet-${simulation}`;
  const tdf = JSON.parse(await readFile(path.join(directory, `${stem}_TDF.json`), 'utf8'));
  const stimuli = JSON.parse(await readFile(path.join(directory, `${stem}_stims.json`), 'utf8'));
  const asset = stimuli.setspec.sparcPages[0].display.nodes.find(node => node.atomType === 'simulation').simulation.asset;
  if (!collectExisting) for (const name of [asset.url.split('?')[0], asset.catalog.url, ...asset.attachments.map(reference => reference.url)]) zip.file(name, await readFile(path.join(directory, name)));
  const title = `${tdf.tutor.setspec.lessonname} [${run}]`;
  titles.push(title);
  tdf.tutor.setspec.lessonname = title;
  tdf.tutor.unit[0].unitname = title;
  stimuli.setspec.lessonname = title;
  tdf.tutor.setspec.stimulusfile = `${stem}-${run}_stims.json`;
  zip.file(`${stem}-${run}_TDF.json`, JSON.stringify(tdf, null, 2));
  zip.file(tdf.tutor.setspec.stimulusfile, JSON.stringify(stimuli, null, 2));
}
const output = path.join(root, 'tmp/phet-pilot');
await mkdir(output, { recursive: true });
const filename = path.join(output, `local-activities-${run}.zip`);
if (!collectExisting) await writeFile(filename, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(collectExisting ? 'Reading existing fixture IDs through normal content UI.' : 'Fixture ZIP ready; opening normal upload UI.');
const browser = await launchLocalPilotBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', error => console.log(`Upload browser error: ${error.message.slice(0, 500)}`));
  page.on('console', message => { if (message.text().startsWith('[Pilot upload status]')) console.log(message.text()); });
  page.on('framenavigated', frame => { if (frame === page.mainFrame() && frame.url().startsWith('http')) console.log(`Upload UI route: ${new URL(frame.url()).pathname}`); });
  await signInLocalPilot(page);
  await page.goto('http://localhost:3200/contentUpload');
  await page.locator('#upload-file').waitFor({ state: 'attached', timeout: 60000 });
  async function loadAllFixtureRows() {
    await page.locator('.content-upload-table-wrapper[aria-busy="false"]').waitFor({ state: 'attached', timeout: 60000 });
    while (await page.locator('#load-more-tdfs').count()) {
      const count = await page.locator('tr').count();
      await page.locator('#load-more-tdfs').click();
      await page.waitForFunction(previous => document.querySelectorAll('tr').length > previous || !document.getElementById('load-more-tdfs'), count);
    }
  }
  await loadAllFixtureRows();
  if (!process.argv.includes('--collect-existing')) {
    for (const title of titles) assert.equal(await page.locator('tr').filter({ hasText: title }).count(), 0, 'Run label already exists; choose a fresh label');
    await page.locator('#emailInsteadOfAlert').uncheck();
    await page.evaluate(name => {
      let previous = '';
      const observer = new MutationObserver(() => {
        const row = [...document.querySelectorAll('tr')].find(element => element.textContent.includes(name));
        const value = row?.textContent.replace(/\s+/g, ' ').trim().slice(0, 500) || '';
        if (value && value !== previous) { previous = value; console.log('[Pilot upload status] ' + value); }
      });
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
      window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    }, path.basename(filename));
    await page.locator('#upload-file').setInputFiles(filename);
    console.log('Submitted fixture ZIP through normal file input.');
    try {
      // Queue completion resets the file input. Then enumerate the refreshed
      // content list, including entries beyond its initial visible page.
      // Complete corresponding-source archives make combined fixtures large;
      // allow the measured DDP transfer to finish before diagnosing failure.
      await page.waitForFunction(() => document.querySelector('#upload-file')?.files.length === 0, null, { timeout: 600000 });
      const errors = await page.locator('.content-upload-root .admin-status-error').allTextContents();
      if (errors.length) throw new Error(errors.join(' ').slice(0, 1000));
      await loadAllFixtureRows();
      await page.locator('tr').filter({ hasText: titles[0] }).locator('#tdf-edit-btn').waitFor({ state: 'attached', timeout: 300000 });
    } catch (error) {
      const diagnostic = await page.locator('tr').filter({ hasText: path.basename(filename) }).allTextContents();
      console.log(JSON.stringify({ fixtureUploadStatus: diagnostic.map(text => text.slice(0, 1500)) }));
      throw error;
    }
    await loadAllFixtureRows();
  }
  const ids = [];
  for (const title of titles) {
    const row = page.locator('tr').filter({ hasText: title });
    await row.locator('#tdf-edit-btn').waitFor({ state: 'attached', timeout: 60000 });
    assert.equal(await row.count(), 1);
    ids.push(await row.locator('#tdf-edit-btn').evaluate(element => ({ id: element.value, label: element.getAttribute('aria-label') })));
  }
  const idFile = path.join(output, `local-activity-ids-${run}.json`);
  await writeFile(idFile, JSON.stringify(ids, null, 2) + '\n');
  console.log(`${process.argv.includes('--collect-existing') ? 'Collected existing' : 'Uploaded fresh'} localhost fixtures. Activity IDs: ${idFile}`);
} finally { await browser.close(); }
