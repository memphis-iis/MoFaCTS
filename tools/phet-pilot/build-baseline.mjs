import { readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { verifyBaselineSource } from './baseline-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
const pilot = manifest.pilots.find(entry => entry.simulation === process.argv[2]);
if (!pilot) throw new Error('Specify a pilot simulation');
const workspace = path.join(root, 'tmp/phet-pilot', pilot.simulation, 'baseline');
const acquisition = JSON.parse(await readFile(path.join(root, 'tmp/phet-pilot/acquisition.json'), 'utf8'));
const dependencies = acquisition.results.filter(entry => entry.simulation === pilot.simulation);
if (!dependencies.length || dependencies.some(entry => entry.status !== 'source-retrieved')) {
  throw new Error('Run prepare.mjs successfully before building');
}

function run(command, args, cwd, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', data => { if (log) log.write(data); else output += data; });
    }
    child.on('error', reject);
    child.on('close', code => resolve({ code, output: output.trim() }));
  });
}

// Accept only pinned source and the explicitly approved branding metadata diff.
const sources = [];
for (const dependency of dependencies) {
  const head = await run('git', ['rev-parse', 'HEAD'], dependency.directory);
  if (head.code !== 0 || head.output !== dependency.sha) {
    throw new Error(`Baseline source differs from acquisition: ${dependency.name}`);
  }
  const brandingChange = await verifyBaselineSource(dependency.directory, pilot.simulation, dependency.name, dependency.sha);
  const source = { name: dependency.name, revision: head.output, brandingChange, licenseFiles: [] };
  const files = await run('git', ['ls-files'], dependency.directory);
  if (files.code !== 0) throw new Error(`Cannot inventory ${dependency.name}`);
  for (const name of files.output.split('\n').filter(name => /(^|\/)(LICENSE[^/]*|license\.json)$/i.test(name))) {
    const contents = await readFile(path.join(dependency.directory, name));
    source.licenseFiles.push({ path: name, sha256: createHash('sha256').update(contents).digest('hex') });
  }
  sources.push(source);
}

const args = ['../chipper/node_modules/grunt-cli/bin/grunt', 'build',
  pilot.simulation === 'pendulum-lab' ? '--brand=adapted-from-phet' : '--brands=adapted-from-phet', '--locales=en'];
const log = createWriteStream(path.join(workspace, 'baseline-build.log'));
const startedAt = new Date().toISOString();
let result;
try {
  result = await run(process.execPath, args, path.join(workspace, pilot.simulation), log);
} finally {
  await new Promise(resolve => log.end(resolve));
}
const evidence = {
  schemaVersion: 1, simulation: pilot.simulation, version: pilot.version,
  manifestCommit: pilot.manifestCommit, node: process.version, platform: process.platform,
  startedAt, finishedAt: new Date().toISOString(), command: ['node', ...args], sources,
  exitCode: result.code, status: result.code === 0
    ? (sources.some(source => source.brandingChange) ? 'built-branding-configured' : 'built-unmodified') : 'build-failed',
  licenseReview: 'Inventory only; asset and dependency redistribution review is incomplete.',
};
if (result.code === 0) {
  const artifact = await readFile(path.join(workspace, pilot.simulation, pilot.buildArtifact));
  evidence.artifact = { path: pilot.buildArtifact, sha256: createHash('sha256').update(artifact).digest('hex') };
}
await writeFile(path.join(workspace, 'baseline-build.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`${pilot.simulation}: ${evidence.status}; see ${path.join(workspace, 'baseline-build.log')}`);
process.exitCode = result.code === 0 ? 0 : 1;
