import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// Exercise the ordinary Download UI with synthetic localhost fixtures only.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const activities = JSON.parse(await readFile(process.argv[2], 'utf8'));
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const secrets = Object.fromEntries((await readFile(path.join(root, 'deploy/local-hotfix/agent-secrets.env'), 'utf8')).split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3200');
  await page.waitForFunction(() => window.Meteor?.loginWithPassword, null, { timeout: 60000 });
  await page.evaluate(({ email, password }) => new Promise((resolve, reject) => Meteor.loginWithPassword(email, password, error => error ? reject(Error(error.reason)) : resolve())), { email: secrets.MOFACTS_AGENT_ADMIN_EMAIL, password: secrets.MOFACTS_AGENT_ADMIN_PASSWORD });
  await page.goto('http://localhost:3200/dataDownload');
  const download = async button => {
    const pending = page.waitForEvent('download', { timeout: 60000 });
    await button.click();
    const file = await pending;
    assert.equal(await file.failure(), null);
    const bytes = await readFile(await file.path());
    const text = bytes[0] === 255 && bytes[1] === 254 ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
    const [header, ...rows] = text.trimEnd().split(/\r?\n/).map(line => line.split('\t'));
    const column = header.indexOf('CF (Simulation Activity)');
    assert.ok(column >= 0, 'Normal download omitted simulation activity column');
    const activityRows = rows.filter(row => row[column]).map(row => ({
      context: JSON.parse(row[column]), action: row[header.indexOf('Action')], outcome: row[header.indexOf('Outcome')],
      input: row[header.indexOf('Input')], time: row[header.indexOf('Time')],
    }));
    assert.ok(activityRows.every(row => row.context.recordRole === 'activity'), 'Internal simulation rows leaked into Download');
    const keys = activityRows.map(row => row.context.sourceEventId + ':' + row.context.eventName);
    assert.equal(new Set(keys).size, keys.length, 'Duplicate activity in ordinary export');
    return activityRows;
  };
  const own = await download(page.locator('#ownHistoryDownloadButton'));
  const owned = await download(page.locator('#userDataDownloadLink'));
  for (const activity of activities) {
    const rows = await download(page.locator(`.data-download-link[data-fileId="${activity.id}"]`));
    assert.ok(rows.some(row => row.action === 'Start'));
    assert.ok(rows.some(row => row.action === 'Interrupted'));
    assert.ok(rows.some(row => row.action === 'Complete'));
    const completed=rows.find(row=>row.action==='Complete').context;
    assert.ok(Object.keys(completed.values).length>0 && completed.evidence, 'Completion after reload must retain the last observed selected state and evidence');
    assert.ok(rows.every(row => row.context.buildId === rows[0].context.buildId), 'Fixture mixes simulation builds');
    assert.ok(rows.some(row => row.action === 'Check' && row.outcome.toLowerCase() === 'incorrect'));
    assert.equal(rows.filter(row => row.action === 'Request hint').length, 2, 'Repeated hints must remain distinct actions');
    assert.equal(rows.filter(row => row.action === 'Reset').length, 1, 'Reset must produce one explicit activity');
    for (const row of rows) {
      for (const broader of [own, owned]) assert.ok(broader.some(other => JSON.stringify(other) === JSON.stringify(row)), 'Export scope lost or changed simulation fields');
      assert.ok(row.time, 'Missing recorded event time');
    }
    const title = activity.label.replace(/^Edit TDF settings: /, '');
    if (title.startsWith('Density')) {
      const change = rows.find(row => row.action === 'Adjust volume');
      assert.ok(change, 'No completed volume adjustment');
      assert.equal(change.context.origin, 'input');
      assert.equal(change.context.values.volume.before, .005);
      assert.equal(change.context.values.volume.unit, 'm³');
      assert.ok(change.context.values.volume.value > .005);
      assert.match(change.input, /m³/, 'Ordinary adjustment text must include its scientific units');
    }
    if (title.startsWith('Pendulum')) assert.ok(rows.some(row => row.action === 'Adjust length' && row.context.origin === 'input'));
    if (title.startsWith('Circuit')) for (const action of ['Component added', 'Component removed', 'Conducting circuit established']) assert.ok(rows.some(row => row.action === action), `Missing ${action}`);
    results.push({ simulation: title.split(':')[0], lessonTitle:title, buildId:rows[0].context.buildId, activityRows: rows.length, actions: rows.map(row => row.action),
      scopesAgree: true, internalRowsExcluded: true, noDuplicateActivity: true });
  }
  await writeFile(path.join(root, 'tmp/phet-pilot/history-acceptance.json'), JSON.stringify({ browser: browser.version(), results }, null, 2) + '\n');
  console.log(JSON.stringify({ results }));
} finally { await browser.close(); }
