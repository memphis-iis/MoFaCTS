import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReleaseBytes, readReleaseBytes, writeReleaseRecordWithReceiptV2 } from './releaseRecordStore.mjs';
import { observeDeploymentImage } from './observeDeploymentImage.mjs';
import { observePublishedImage } from './observePublishedImage.mjs';
import { realDirectory } from './collectCiEvidence.mjs';

// This post-acceptance hook extends the existing release authority. It does not
// deploy, run participant checks or issue source/CI/release qualification.
export async function recordDeploymentRelease({ recordPath, candidatePath, sshHost, sshKey, knownHosts, evidenceDirectory, participantChecksPassed }, dependencies = {}) {
  if (participantChecksPassed !== true) throw new Error('Participant acceptance must precede release recording');
  const candidate = parseReleaseBytes(await readReleaseBytes(path.resolve(candidatePath)));
  if (candidate.imageId !== undefined || candidate.qualification !== undefined) throw new Error('Expected the ordinary six-field deployment candidate');
  const directory = await realDirectory(evidenceDirectory);
  const files = Object.fromEntries(['running-image', 'published-image', 'release-receipt'].map(name => [name, path.join(directory, name + '.json')]));
  for (const file of Object.values(files)) {
    try { await fs.lstat(file); throw new Error('Observation destination exists'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const running = await (dependencies.observe ?? observeDeploymentImage)({ sshHost, sshKey, knownHosts });
  if (running.baseCommit !== candidate.baseCommit) throw new Error('Running source differs from the accepted candidate');
  const repository = candidate.image.slice(0, candidate.image.lastIndexOf(':'));
  const published = await (dependencies.publication ?? observePublishedImage)(`${repository}@${candidate.digest}`, { configDigest: running.configDigest, platform: running.platform });
  const bytes = Buffer.from(JSON.stringify({ ...candidate, imageId: running.configDigest,
    acceptance: 'operator-confirmed readiness and participant smoke checks' }) + '\n');
  const receipt = await writeReleaseRecordWithReceiptV2(recordPath, bytes, published, running);
  for (const [name, value] of [['running-image', running], ['published-image', published], ['release-receipt', receipt]]) {
    await fs.writeFile(files[name], JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
  }
  return { state: 'deployment-release-recorded-unqualified', recordDigestSha256: receipt.recordDigestSha256 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [recordPath, candidatePath, sshHost, sshKey, knownHosts, evidenceDirectory, accepted, ...extra] = process.argv.slice(2);
    const pins = JSON.parse(await fs.readFile(new URL('../../../package.json', import.meta.url)));
    if (process.version !== `v${pins.engines.node}` || !evidenceDirectory || accepted !== '--participant-checks-passed' || extra.length) throw new Error();
    const result = await recordDeploymentRelease({ recordPath, candidatePath, sshHost, sshKey, knownHosts, evidenceDirectory, participantChecksPassed: true });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch { process.stderr.write('Deployment release recording failed; no receipt acceptance or qualification claimed.\n'); process.exitCode = 1; }
}
