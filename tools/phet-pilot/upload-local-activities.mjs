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
const { chromium } = require('playwright');
const zip = new JSZip();
const titles = [];
for (const simulation of ['density', 'pendulum-lab', 'circuit-construction-kit-dc']) {
  const stem = `phet-${simulation}`;
  const tdf = JSON.parse(await readFile(path.join(directory, `${stem}_TDF.json`), 'utf8'));
  const stimuli = JSON.parse(await readFile(path.join(directory, `${stem}_stims.json`), 'utf8'));
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
await writeFile(filename, await zip.generateAsync({ type: 'nodebuffer' }));
const secrets = Object.fromEntries((await readFile(path.join(root, 'deploy/local-hotfix/agent-secrets.env'), 'utf8'))
  .split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto('http://localhost:3200');
  await page.waitForFunction(() => window.Meteor?.loginWithPassword, null, { timeout: 60000 });
  await page.evaluate(({ email, password }) => new Promise((resolve, reject) =>
    Meteor.loginWithPassword(email, password, error => error ? reject(Error(error.reason)) : resolve())),
  { email: secrets.MOFACTS_AGENT_ADMIN_EMAIL, password: secrets.MOFACTS_AGENT_ADMIN_PASSWORD });
  await page.goto('http://localhost:3200/contentUpload');
  await page.locator('#upload-file').waitFor({ state: 'attached', timeout: 60000 });
  async function loadAllFixtureRows() {
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
    await page.locator('#upload-file').setInputFiles(filename);
    await page.locator('tr').filter({ hasText: titles[0] }).locator('#tdf-edit-btn').waitFor({ timeout: 60000 });
    await loadAllFixtureRows();
  }
  const ids = [];
  for (const title of titles) {
    const row = page.locator('tr').filter({ hasText: title });
    await row.locator('#tdf-edit-btn').waitFor({ timeout: 60000 });
    assert.equal(await row.count(), 1);
    ids.push(await row.locator('#tdf-edit-btn').evaluate(element => ({ id: element.value, label: element.getAttribute('aria-label') })));
  }
  const idFile = path.join(output, `local-activity-ids-${run}.json`);
  await writeFile(idFile, JSON.stringify(ids, null, 2) + '\n');
  console.log(`${process.argv.includes('--collect-existing') ? 'Collected existing' : 'Uploaded three fresh'} localhost fixtures. Activity IDs: ${idFile}`);
} finally { await browser.close(); }
