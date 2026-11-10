import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'tmp/phet-pilot');
const read = async file => JSON.parse(await readFile(path.join(output, file), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const collectorHash = hash(await readFile(path.join(root, 'packages/phet-monitor/collector.js')));
const bridgeHash = hash(await readFile(path.join(root, 'packages/phet-monitor/bridge.js')));
const host = await read('host-acceptance.json');
const interactions = await read('interaction-acceptance.json');
const disposal = await read('circuit-construction-kit-dc/disposal-probe.json');
const results = [];
for (const simulation of ['density', 'pendulum-lab', 'circuit-construction-kit-dc']) {
  const build = await read(`${simulation}/monitored/monitored-build-result.json`);
  const performance = await read(`${simulation}/performance-600000ms.json`);
  const probe = await read(`${simulation}/monitored/monitor-probe.json`);
  const startup = await read(`${simulation}/monitored/startup-probe.json`);
  const eventSampling = await read(`${simulation}/monitored/object-events-probe.json`);
  if (build.collectorHash !== collectorHash || build.bridgeHash !== bridgeHash
    || performance.buildId !== build.identity || probe.buildId !== build.identity
    || startup.buildId !== build.identity || eventSampling.buildId !== build.identity) {
    throw new Error(`Evidence does not match current sources: ${simulation}`);
  }
  const activity = host.results.filter(result => result.buildId === build.identity);
  if (!activity.length) throw new Error(`Missing host evidence: ${simulation}`);
  const interaction = interactions.results.find(result => result.buildId === build.identity);
  if (!interaction || simulation === 'circuit-construction-kit-dc' && disposal.buildId !== build.identity) {
    throw new Error(`Missing matching interaction/disposal evidence: ${simulation}`);
  }
  const active = performance.results.monitored.objects;
  const coverage = {};
  for (const item of probe.coverage) coverage[item.coverage] = (coverage[item.coverage] || 0) + 1;
  results.push({ simulation, buildId: build.identity, browser: performance.browser,
    startup: { records: startup.startupRecords, checkedSources: startup.comparisons.length, complete: startup.status.complete },
    objectEvents: { idleInspections: eventSampling.idleInspections, counts: eventSampling.counts, complete: eventSampling.status.complete },
    reconstruction: { passed: probe.reconstructionErrors.length === 0 && probe.status.complete, records: probe.counts, catalogRecordsByCoverage: coverage,
      namedCatalogRecords: probe.coverage.filter(item => item.tandem).length, unsupportedFields: probe.unsupportedFields.length },
    tenMinuteComparison: { baselineP95Ms: performance.results.baseline.p95FrameMs,
      monitoredP95Ms: performance.results.monitored.p95FrameMs, collectorP95Ms: performance.results.monitored.p95CollectorMs,
      overhead: performance.p95FrameOverhead, overheadTargetPassed: performance.p95FrameOverhead <= .10
        && performance.results.baseline.measurementValid === true && performance.results.monitored.measurementValid === true,
      measurementValid: performance.results.baseline.measurementValid && performance.results.monitored.measurementValid,
      maximumFrameGapMs: { baseline: performance.results.baseline.maximumFrameGapMs, monitored: performance.results.monitored.maximumFrameGapMs },
      complete: performance.results.monitored.monitor.complete,
      baselineActions: performance.results.baseline.interactions, monitoredActions: performance.results.monitored.interactions,
      activeInventory: { first: active[0], last: active.at(-1), minimum: Math.min(...active), maximum: Math.max(...active) },
      errors: [...performance.results.baseline.errors, ...performance.results.monitored.errors] },
    host: activity.map(({ title, completion, iframePreserved, explicitRestartOnReload, completedTaskPreserved, observationToDurableRuleTrace }) =>
      ({ title, completion, iframePreserved, explicitRestartOnReload, completedTaskPreserved, observationToDurableRuleTrace,
        durableDecisionLatencyTargetPassed: observationToDurableRuleTrace ? observationToDurableRuleTrace.p95Ms < 500 : null })),
    interactions: interaction,
  });
}
const summary = { generatedAt: new Date().toISOString(), collectorHash, bridgeHash, results, authoring: host.authoring, hostErrors: host.errors, disposal,
  acceptance: 'Not established: interpret measured targets and the explicit coverage/interaction limitations together.',
  limitations: [
    'One sequential comparison per simulation; these are local feasibility measurements, not deployment qualification.',
    'Ten-minute rendering comparisons use public model API actions and drain locally; host transport and instructional latency are separate browser tests.',
    'Pendulum timing and host use the documented accessibility query flag.',
    'The circuit WeakRef/forced-GC probe covers the tested components and properties, not a complete heap-retention audit.',
    'Only observed notifications and supported samples reconstruct; this is not physical replay.',
    'Startup capture begins before the first model factory; earlier module-loading activity is outside coverage.',
    'Object-level Axon notifications and observable collection API mutations are observed. Plain fields, ordinary collections, typed arrays, and direct vector/matrix writes without a notification remain unsupported; no model polling is performed.',
    ...host.limitations,
  ],
};
await writeFile(path.join(output, 'acceptance-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(results.map(result => ({ simulation: result.simulation, ...result.tenMinuteComparison })), null, 2));
