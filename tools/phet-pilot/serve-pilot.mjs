import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const collectorHash = hash(await readFile(path.join(root, 'packages/phet-monitor/collector.js')));
const bridgeHash = hash(await readFile(path.join(root, 'packages/phet-monitor/bridge.js')));
const artifacts = new Map();
const simulationBuilds = [];
for (const pilot of manifest.pilots) {
  const workspace = path.join(root, 'tmp/phet-pilot', pilot.simulation, 'monitored');
  const result = JSON.parse(await readFile(path.join(workspace, 'monitored-build-result.json'), 'utf8'));
  if (result.status !== 'built' || result.collectorHash !== collectorHash || result.bridgeHash !== bridgeHash) {
    throw new Error(`Rebuild ${pilot.simulation} with the current shared collector and bridge before serving the pilot`);
  }
  const html = await readFile(path.join(workspace, pilot.simulation, pilot.buildArtifact));
  if (hash(html) !== result.artifactHash) throw new Error(`Artifact hash mismatch: ${pilot.simulation}`);
  // The historical AMD framework gates its keyboard/parallel DOM behind this
  // documented shared launch option. The artifact and collector are unchanged.
  const pathname = `/${pilot.simulation}.html${pilot.simulation === 'pendulum-lab' ? '?accessibility' : ''}`;
  artifacts.set(pathname, html);
  simulationBuilds.push({ id: result.identity, url: `http://127.0.0.1:3212${pathname}`, sha256: result.artifactHash });
}
const settingsFile = path.join(root, 'tmp/phet-pilot/settings-fragment.json');
await writeFile(settingsFile, JSON.stringify({ public: { simulationBuilds } }, null, 2) + '\n');
const server = createServer((request, response) => {
  const html = artifacts.get(request.url);
  if (request.method !== 'GET' || !html) { response.writeHead(404).end(); return; }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src data: blob:; worker-src blob:; frame-ancestors http://localhost:3200",
  }).end(html);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(3212, '127.0.0.1', () => {
  console.log(`Local simulation origin: http://127.0.0.1:3212; approved build settings: ${settingsFile}`);
});
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
