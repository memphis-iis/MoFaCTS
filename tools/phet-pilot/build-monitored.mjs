import { readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const pilot = manifest.pilots.find(p => p.simulation === process.argv[2]);
if (!pilot) throw new Error('Specify a pilot simulation');
const workspace = path.join(root, 'tmp/phet-pilot', pilot.simulation, 'monitored');
const config = JSON.parse(await readFile(path.join(workspace, 'monitor-build.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
for (const change of config.changes) {
  const actual = (await readFile(path.join(workspace, change.path), 'utf8')).replace(/\r\n/g, '\n');
  if (hash(actual) !== change.modified) throw new Error(`Modified monitoring source: ${change.path}`);
}
const collector = await readFile(path.join(workspace, 'chipper/js/research-collector.js'));
if (hash(collector) !== config.collectorHash) throw new Error('Collector hash mismatch');
if (hash(await readFile(path.join(workspace, 'chipper/js/research-bridge.js'))) !== config.bridgeHash) throw new Error('Bridge hash mismatch');
if (hash(await readFile(path.join(workspace, 'chipper/js/research-bootstrap.js'))) !== config.bootstrapHash) throw new Error('Bootstrap hash mismatch');
const acquisition = JSON.parse(await readFile(path.join(root, 'tmp/phet-pilot/acquisition.json'), 'utf8'));
for (const dependency of acquisition.results.filter(p => p.simulation === pilot.simulation)) {
  const cwd = path.join(workspace, dependency.name);
  const head = (await exec('git', ['rev-parse', 'HEAD'], { cwd, windowsHide: true })).stdout.trim();
  if (head !== dependency.sha) throw new Error(`Wrong monitored revision: ${dependency.name}`);
  const files = (await exec('git', ['diff', 'HEAD', '--name-only'], { cwd, windowsHide: true })).stdout.trim().split('\n').filter(Boolean);
  for (const file of files) {
    if (!config.changes.some(c => c.path === `${dependency.name}/${file}`)) throw new Error(`Unrecorded monitored edit: ${file}`);
  }
}
const baseline = JSON.parse(await readFile(path.join(root, 'tmp/phet-pilot', pilot.simulation, 'baseline/baseline-build.json'), 'utf8'));
const log = createWriteStream(path.join(workspace, 'monitored-build.log'));
const startedAt = new Date().toISOString();
let code;
try {
  code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, baseline.command.slice(1), { cwd: path.join(workspace, pilot.simulation), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => log.write(data));
    child.stderr.on('data', data => log.write(data));
    child.on('error', reject);
    child.on('close', resolve);
  });
} finally {
  await new Promise(resolve => log.end(resolve));
}
const result = { ...config, node: process.version, startedAt, finishedAt: new Date().toISOString(), exitCode: code,
  status: code === 0 ? 'built' : 'build-failed', command: baseline.command };
if (code === 0) result.artifactHash = hash(await readFile(path.join(workspace, pilot.simulation, pilot.buildArtifact)));
await writeFile(path.join(workspace, 'monitored-build-result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`${pilot.simulation}: ${result.status}`);
process.exitCode = code === 0 ? 0 : 1;
