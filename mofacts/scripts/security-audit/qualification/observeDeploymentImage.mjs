// Deployment-owner metadata only. No code execution inside the app, settings
// reads, image creation, registry mutation or installed host helper is required.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evidenceCommand } from './collectCiEvidence.mjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';
import { parseDockerImageInspection } from './imageArchiveIdentity.mjs';
import { imageStreamOptions, streamDockerImageIdentity } from './observeDockerImage.mjs';
import { parseRunningImageObservation } from '../../../common/securityAudit/releaseQualification.ts';
import { proofRecord, sourceCommit } from '../../../common/securityAudit/proofFields.ts';
const invalid = () => { throw new Error('Deployment image observation unavailable'); };
const containerCommand = `sudo -n docker inspect mofacts --format '{"containerId":{{json .Id}},"engineImageReference":{{json .Image}},"running":{{json .State.Running}}}'`;
function container(bytes) {
  const value = proofRecord(parseCiEvidenceJson(bytes, 16384), ['containerId', 'engineImageReference', 'running']);
  if (!/^[a-f0-9]{64}$/.test(value.containerId) || !/^sha256:[a-f0-9]{64}$/.test(value.engineImageReference) || value.running !== true) invalid();
  return value;
}
export async function observeDeploymentImage({ sshHost, sshKey, knownHosts, streamOptions = {} }, dependencies = {}) {
  const stream = imageStreamOptions(streamOptions);
  if (typeof sshHost !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.@:[\]-]{0,255}$/.test(sshHost)
    || [sshKey, knownHosts].some(file => typeof file !== 'string' || !path.isAbsolute(file))) invalid();
  for (const file of [sshKey, knownHosts]) {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536) invalid();
  }
  const args = ['-T', '-i', sshKey, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${knownHosts}`, '-o', 'ConnectTimeout=20', '-o', 'ConnectionAttempts=1', sshHost];
  // Windows OpenSSH exits silently even for local `ssh -G` without ProgramData.
  // Keep its OS configuration location, without inheriting application secrets.
  const environment = Object.fromEntries(['PATH', 'SystemRoot', 'ProgramData', 'USERPROFILE', 'HOME', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const command = dependencies.command ?? evidenceCommand;
  const before = container(await command('ssh', [...args, containerCommand], 16384, environment));
  const imageCommand = `sudo -n docker image inspect ${before.engineImageReference} --format '{"nativeId":{{json .Id}},"platform":"{{.Os}}/{{.Architecture}}","descriptor":{{json (index . "Descriptor")}},"baseCommit":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}'`;
  const image = proofRecord(parseCiEvidenceJson(await command('ssh', [...args, imageCommand], 16384, environment), 16384), ['nativeId', 'platform', 'descriptor', 'baseCommit']);
  const baseCommit = sourceCommit(image.baseCommit);
  const inspection = parseDockerImageInspection({ nativeId: image.nativeId, platform: image.platform, descriptor: image.descriptor });
  if (inspection.nativeId !== before.engineImageReference) invalid();
  const identity = await (dependencies.archive ?? ((value) => streamDockerImageIdentity(value, environment,
    (_command, _args, options) => spawn('ssh', [...args, `sudo -n docker image save ${value.nativeId}`], options), stream)))(inspection);
  const after = container(await command('ssh', [...args, containerCommand], 16384, environment));
  if (after.containerId !== before.containerId || after.engineImageReference !== before.engineImageReference) invalid();
  return parseRunningImageObservation({ ...identity, baseCommit });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [sshHost, sshKey, knownHosts, output, ...extra] = process.argv.slice(2);
    if (!output || extra.length) invalid();
    const observed = await observeDeploymentImage({ sshHost, sshKey, knownHosts });
    await fs.writeFile(path.resolve(output), JSON.stringify(observed) + '\n', { flag: 'wx', mode: 0o600 });
    process.stdout.write('Deployment running-image observation saved; no qualification issued.\n');
  } catch { process.stderr.write('Deployment image observation failed; no accepted metadata was written.\n'); process.exitCode = 1; }
}
