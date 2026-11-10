import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const optional = async filename => {
  try { return await readFile(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

/** Preserve the last verified artifact and its modified source before preparation replaces them. */
export async function archiveBuild(workspace, pilot, prior) {
  if (!prior) return;
  const bytes = await optional(path.join(workspace, 'monitored-build-result.json'));
  if (!bytes) return;
  const build = JSON.parse(bytes);
  if (build.status !== 'built' || build.identity !== prior.identity) return;
  const destination = path.join(path.dirname(workspace), 'archive', build.identity);
  async function save(relative, content) {
    const filename = path.join(destination, relative);
    const existing = await optional(filename);
    if (existing && hash(existing) !== hash(content)) throw new Error(`Conflicting archived evidence: ${filename}`);
    await mkdir(path.dirname(filename), { recursive: true });
    if (!existing) await writeFile(filename, content);
  }
  const artifact = await readFile(path.join(workspace, pilot.simulation, pilot.buildArtifact));
  if (hash(artifact) !== build.artifactHash) throw new Error(`Cannot archive a modified artifact: ${pilot.simulation}`);
  await save('simulation.html', artifact);
  await save('monitored-build-result.json', bytes);
  await save('monitor-build.json', await readFile(path.join(workspace, 'monitor-build.json')));
  for (const change of prior.changes) {
    const source = (await readFile(path.join(workspace, change.path), 'utf8')).replace(/\r\n/g, '\n');
    if (hash(source) !== change.modified) throw new Error(`Cannot archive modified source: ${change.path}`);
    await save(`source/${change.path}`, source);
  }
  for (const [file, expected] of [['research-collector.js', prior.collectorHash], ['research-bridge.js', prior.bridgeHash], ['research-bootstrap.js', prior.bootstrapHash]]) {
    const source = await readFile(path.join(workspace, 'chipper/js', file));
    if (hash(source) !== expected) throw new Error(`Cannot archive modified generated preload: ${file}`);
    await save(`source/chipper/js/${file}`, source);
  }
  await save('monitored-build.log', await readFile(path.join(workspace, 'monitored-build.log')));
  for (const file of await readdir(path.dirname(workspace))) {
    if (!/^performance-\d+ms\.json$/.test(file)) continue;
    const content = await readFile(path.join(path.dirname(workspace), file));
    if (JSON.parse(content).buildId === build.identity) await save(file, content);
  }
  for (const file of ['monitor-probe.json', 'startup-probe.json', 'event-sampling-probe.json', 'object-events-probe.json']) {
    const content = await optional(path.join(workspace, file));
    if (content && JSON.parse(content).buildId === build.identity) {
      await save(file, content);
      if (file === 'monitor-probe.json') await save('monitor-trace.json.gz', await readFile(path.join(workspace, 'monitor-trace.json.gz')));
    }
  }
}
