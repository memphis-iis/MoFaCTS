// Isolate authenticated DDP/storage cost from iframe rendering and retries.
// Synthetic local research attempts are ended explicitly; no lesson credit.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'mofacts/package.json'));
const { chromium } = require('playwright');
const activities = JSON.parse(await readFile(process.argv[2], 'utf8'));
const activity = activities.find(value => value.label.includes('Density:'));
const trace = JSON.parse(gunzipSync(await readFile(path.join(root, 'tmp/phet-pilot/density/monitored/monitor-trace.json.gz'))));
const build = JSON.parse(await readFile(path.join(root, 'tmp/phet-pilot/density/monitored/monitored-build-result.json'), 'utf8'));
assert.equal(trace.buildId, build.identity);
const secrets = Object.fromEntries((await readFile(path.join(root, 'deploy/local-hotfix/agent-secrets.env'), 'utf8')).split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3200');
  await page.waitForFunction(() => window.Meteor?.loginWithPassword, null, { timeout: 60000 });
  await page.evaluate(({email,password}) => new Promise((resolve,reject) => Meteor.loginWithPassword(email,password,error => error ? reject(Error(error.reason)) : resolve())),
    { email: secrets.MOFACTS_AGENT_ADMIN_EMAIL, password: secrets.MOFACTS_AGENT_ADMIN_PASSWORD });
  for (const size of [1000,4000,8000,16000]) {
    const records = trace.trace.slice(0,size);
    const result = await page.evaluate(async ({records,scope}) => {
      const { attemptId } = await Meteor.callAsync('startSimulationResearchAttempt', scope);
      const batch = { firstSequence: records[0].sequence, lastSequence: records.at(-1).sequence, records };
      const bytes = new TextEncoder().encode(JSON.stringify(batch)).length;
      const started = performance.now();
      try {
        const ack = await Meteor.callAsync('ingestSimulationResearchBatch', attemptId, batch);
        return { records: records.length, bytes, ms: performance.now()-started, complete: ack.complete };
      } finally { await Meteor.callAsync('endSimulationResearchAttempt', attemptId, 'left-node'); }
    }, { records, scope: { tdfId: activity.id, pageKey: 'phet-density', nodeId: 'simulation', buildId: build.identity } });
    results.push(result); console.log(JSON.stringify(result));
    await writeFile(path.join(root,'tmp/phet-pilot/ingestion-benchmark.json'), JSON.stringify({buildId:build.identity,browser:browser.version(),results},null,2)+'\n');
    assert.equal(result.complete,true);
  }
} finally { await browser.close(); }
