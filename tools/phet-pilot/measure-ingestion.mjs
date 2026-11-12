import { randomUUID } from 'node:crypto';
import { launchLocalPilotBrowser, signInLocalPilot } from './local-app.mjs';
// Isolate authenticated DDP/storage cost from iframe rendering and retries.
// Synthetic local research attempts are ended explicitly; no lesson credit.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const activities = JSON.parse(await readFile(process.argv[2], 'utf8'));
const activity = activities.find(value => value.label.includes('Density:'));
const trace = JSON.parse(gunzipSync(await readFile(path.join(root, 'tmp/phet-pilot/density/monitored/monitor-trace.json.gz'))));
const build = JSON.parse(await readFile(path.join(root, 'tmp/phet-pilot/density/monitored/monitored-build-result.json'), 'utf8'));
assert.equal(trace.buildId, build.identity);
const browser = await launchLocalPilotBrowser();
const results = [];
try {
  const page = await browser.newPage();
  await signInLocalPilot(page);
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
    }, { records, scope: { tdfId: activity.id, pageKey: 'phet-density', nodeId: 'simulation', buildId: build.identity, history: { sessionID: `ingestion-benchmark-${randomUUID()}`, levelUnit: 0 } } });
    results.push(result); console.log(JSON.stringify(result));
    await writeFile(path.join(root,'tmp/phet-pilot/ingestion-benchmark.json'), JSON.stringify({buildId:build.identity,browser:browser.version(),results},null,2)+'\n');
    assert.equal(result.complete,true);
  }
} finally { await browser.close(); }
