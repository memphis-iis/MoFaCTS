import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pilots = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8')).pilots;
for (const pilot of pilots) {
  const directory = path.join(root, 'tmp/phet-pilot', pilot.simulation, 'monitored');
  const build = JSON.parse(await readFile(path.join(directory, 'monitored-build-result.json'), 'utf8'));
  const probe = JSON.parse(await readFile(path.join(directory, 'monitor-probe.json'), 'utf8'));
  if (build.status !== 'built' || probe.buildId !== build.identity || !probe.status.complete || probe.reconstructionErrors.length) throw new Error(`Unverified catalog source: ${pilot.simulation}`);
  const addresses = new Map();
  for (const item of probe.coverage) {
    // Build metadata describes validated addresses, never attempt IDs or actual values.
    if (item.coverage !== 'observed' || item.path.includes('.eventArgs.')) continue;
    const description = { path: item.path, tandem: item.tandem, kind: item.kind, coverage: item.coverage };
    if (addresses.has(item.path) && JSON.stringify(addresses.get(item.path)) !== JSON.stringify(description)) throw new Error('Ambiguous catalog address');
    addresses.set(item.path, description);
  }
  const content = JSON.stringify({ version: 1, buildId: build.identity, artifactSha256: build.artifactHash, protocolVersion: 3,
    registrationVersion: build.registrationVersion, addresses: [...addresses.values()],
    limitation: 'Descriptive build addresses. Runtime identity and required coverage are validated separately in each attempt.' }, null, 2) + '\n';
  await writeFile(path.join(directory, 'monitor-catalog.json'), content);
  await writeFile(path.join(directory, 'monitor-catalog.sha256'), createHash('sha256').update(content).digest('hex') + '\n');
  console.log(`${pilot.simulation}: ${addresses.size} validated build addresses`);
}
