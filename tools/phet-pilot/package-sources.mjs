// Corresponding pinned source accompanies each distributable simulation.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exec = promisify(execFile);
const require = createRequire(path.join(root, 'mofacts/package.json'));
const JSZip = require('jszip');
const acquisition = JSON.parse(await readFile(path.join(root, 'tmp/phet-pilot/acquisition.json'), 'utf8'));

export async function packageSources(simulation, build) {
  const zip = new JSZip();
  zip.file('MoFaCTS/LICENSE', await readFile(path.join(root, 'LICENSE')));
  const workspace = path.join(root, 'tmp/phet-pilot', simulation, 'monitored');
  for (const repository of acquisition.results.filter(entry => entry.simulation === simulation)) {
    if (repository.status !== 'source-retrieved') throw new Error(`Missing source: ${repository.name}`);
    const directory = path.join(workspace, repository.name);
    const revision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: directory, windowsHide: true })).stdout.trim();
    if (revision !== repository.sha) throw new Error(`Source revision mismatch: ${repository.name}`);
    const files = (await exec('git', ['ls-files', '-z'], { cwd: directory, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })).stdout.split('\0').filter(Boolean);
    for (const filename of files) zip.file(`source/${repository.name}/${filename}`, await readFile(path.join(directory, filename)));
  }
  for (const filename of ['research-collector.js', 'research-bridge.js', 'research-bootstrap.js']) {
    zip.file(`source/chipper/js/${filename}`, await readFile(path.join(workspace, 'chipper/js', filename)));
  }
  zip.file('source/package.json', JSON.stringify({ private: true, type: 'commonjs' }, null, 2));
  for (const filename of ['collector.js', 'bridge.js', 'registration-contract.d.ts', 'README.md']) zip.file(`MoFaCTS/packages/phet-monitor/${filename}`, await readFile(path.join(root, 'packages/phet-monitor', filename)));
  for (const filename of ['releases.json', 'README.md', 'prepare.mjs', 'prepare-monitored.mjs', 'build-baseline.mjs', 'build-monitored.mjs', 'install-build-tools.mjs', 'archive-build.mjs']) zip.file(`MoFaCTS/tools/phet-pilot/${filename}`, await readFile(path.join(root, 'tools/phet-pilot', filename)));
  zip.file('build-result.json', JSON.stringify(build, null, 2));
  zip.file('acquisition.json', JSON.stringify(acquisition.results.filter(entry => entry.simulation === simulation).map(({ directory: _directory, ...entry }) => entry), null, 2));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const directory = path.join(root, 'tmp/phet-pilot', simulation, 'distribution');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${build.identity}-source.zip`), bytes);
  return bytes;
}
