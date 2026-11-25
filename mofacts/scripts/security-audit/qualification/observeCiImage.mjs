import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { parseCiRunReference, parsePostBuildImageObservation } from '../../../common/securityAudit/postBuildImageObservation.ts';
import { contentDigest, imageDigest, proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { parseImageObservation } from '../../../common/securityAudit/releaseQualification.ts';
import { evidenceCommand, readCiFile } from './collectCiEvidence.mjs';
import { parseCiEvidenceJson, CI_EVIDENCE_LIMITS } from './ciEvidence.mjs';
import { validateRun } from '../../meteorTestEvidence.cjs';
import { observeDockerImage } from './observeDockerImage.mjs';

const maximumObservationBytes = 16384;
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new Error('CI image observation failed; no qualification was issued.'); };
const probeOwnerLabel = 'org.mofacts.ci-image-observation.owner';
const probeListingFormat = '{"id":{{json .ID}},"name":{{json .Names}}}';
const probeInspectFormat = `{"id":{{json .Id}},"owner":{{json (index .Config.Labels "${probeOwnerLabel}")}}}`;
const cleanupFailureMessage = 'CI image observation probe cleanup failed; no qualification was issued.';
const embeddedRead = "const fs=require('node:fs'),p='/opt/mofacts-source-observation.json',s=fs.lstatSync(p);"
  + "if(!s.isFile()||s.isSymbolicLink()||s.size>16384)process.exit(1);"
  + "const b=fs.readFileSync(p);if(b.length>16384)process.exit(1);process.stdout.write(b);";

function validateSourceEvidence(sourceObservationBytes, sourceEvidenceBytes, ci) {
  const observation = parseCiEvidenceJson(sourceObservationBytes, maximumObservationBytes);
  proofRecord(observation, ['state', 'identity', 'testInputContractDigestSha256', 'supplementalDigestSha256']);
  if (observation.state !== 'test-inputs-verified-unqualified') invalid();
  const source = parseBuildIdentity(observation.identity);
  if (source.includedUncommittedLocalChanges) invalid();
  parseCiRunReference(ci, source.baseCommit);
  contentDigest(observation.testInputContractDigestSha256);
  contentDigest(observation.supplementalDigestSha256);
  const evidence = parseCiEvidenceJson(sourceEvidenceBytes, CI_EVIDENCE_LIMITS.jsonBytes);
  proofRecord(evidence, ['schema', 'state', 'qualification', 'source', 'testInputContractDigestSha256',
    'supplementalDigestSha256', 'runEvidenceDigestSha256', 'ci', 'run']);
  if (evidence.schema !== 'SourceMeteorTestEvidenceV1' || evidence.qualification !== 'unqualified'
    || !isDeepStrictEqual(evidence.source, source) || !isDeepStrictEqual(evidence.ci, ci)
    || evidence.testInputContractDigestSha256 !== observation.testInputContractDigestSha256
    || evidence.supplementalDigestSha256 !== observation.supplementalDigestSha256) invalid();
  contentDigest(evidence.runEvidenceDigestSha256);
  // The previous CI binding step owns independent discovery and raw-run binding.
  // Here the shared validator checks the retained joined record's exact shape,
  // counters and completion. No new catalog/discovery assertion is manufactured.
  const modules = Object.fromEntries(evidence.run.environments.map(environment => [environment.side, environment.modules]));
  const run = validateRun(evidence.run, modules);
  const state = run.environments.some(environment => environment.counts.pending) ? 'completed-with-pending' : 'completed';
  if (evidence.state !== state) invalid();
  return source;
}

async function removeFailedProbe(command, probe) {
  try {
    // A successful empty listing establishes absence; command errors are never
    // treated as absence. A full immutable ID prevents name-replacement races.
    const listed = await command('docker', ['--context', 'default', 'container', 'ls', '--all', '--no-trunc',
      '--filter', `name=^/${probe.name}$`, '--format', probeListingFormat], maximumObservationBytes);
    if (!listed.toString('utf8').trim()) return;
    const container = parseCiEvidenceJson(listed, maximumObservationBytes);
    proofRecord(container, ['id', 'name']);
    if (typeof container.id !== 'string' || !/^[0-9a-f]{64}$/.test(container.id)
      || container.name !== probe.name) invalid();
    const owned = parseCiEvidenceJson(await command('docker', [
      '--context', 'default', 'container', 'inspect', '--format', probeInspectFormat, container.id,
    ], maximumObservationBytes), maximumObservationBytes);
    proofRecord(owned, ['id', 'owner']);
    if (owned.id !== container.id || owned.owner !== probe.owner) invalid();
    const removed = await command('docker', [
      '--context', 'default', 'container', 'rm', '--force', container.id,
    ], maximumObservationBytes);
    if (removed.toString('utf8').trim() !== container.id) invalid();
  } catch {
    const error = new Error(cleanupFailureMessage);
    error.code = 'CI_IMAGE_PROBE_CLEANUP_FAILED';
    throw error;
  }
}

// Shared bounded read only. This establishes embedded source equality, never
// source-test execution, GitHub coordinates or complete image qualification.
export async function readEmbeddedImageSource(imageReference, expectedSource, command = evidenceCommand) {
  const requestedImage = imageDigest(imageReference), source = parseBuildIdentity(expectedSource);
  const owner = randomUUID(), probe = { name: `mofacts-ci-image-probe-${owner}`, owner };
  try {
    const embedded = parseCiEvidenceJson(await command('docker', [
      '--context', 'default', 'run', '--rm', '--name', probe.name, '--label', `${probeOwnerLabel}=${probe.owner}`,
      '--pull', 'never', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node', requestedImage, '-e', embeddedRead,
    ], maximumObservationBytes), maximumObservationBytes);
    proofRecord(embedded, ['schema', 'state', 'identity']);
    if (embedded.schema !== 'MoFaCTSImageSourceObservationV1' || embedded.state !== 'source-matched-unqualified'
      || !isDeepStrictEqual(parseBuildIdentity(embedded.identity), source)) invalid();
    return embedded;
  } catch {
    // Killing docker's CLI does not necessarily stop its daemon-side run.
    await removeFailedProbe(command, probe);
    invalid();
  }
}

/** Actual immutable-image reads, never a caller-supplied successful command flag. */
export async function observeCiImage(input, dependencies = {}) {
  try {
    proofRecord(input, ['imageReference', 'sourceObservationBytes', 'sourceEvidenceBytes', 'ci']);
    const requestedImage = imageDigest(input.imageReference);
    const source = validateSourceEvidence(input.sourceObservationBytes, input.sourceEvidenceBytes, input.ci);
    const command = dependencies.command || evidenceCommand;
    const inspected = parseImageObservation(await observeDockerImage(requestedImage, dependencies));
    if (inspected.platform !== 'linux/amd64') invalid();
    await readEmbeddedImageSource(requestedImage, source, command);
    return parsePostBuildImageObservation({
      schema: 'PostBuildImageObservationV1', state: 'observed-unqualified', lane: 'ci-test-image',
      source, image: inspected, sourceEvidenceDigestSha256: hash(input.sourceEvidenceBytes), ci: input.ci,
    });
  } catch (error) {
    if (error?.code === 'CI_IMAGE_PROBE_CLEANUP_FAILED') throw error;
    if (error?.code === 'DOCKER_IMAGE_OBSERVATION_FAILED'
      && ['input', 'inspect', 'archive', 'identity'].includes(error.stage)) {
      const failed = new Error('CI image observation failed; no qualification was issued.');
      failed.code = 'CI_IMAGE_IDENTITY_FAILED';
      failed.stage = error.stage;
      throw failed;
    }
    invalid();
  }
}

export async function writeCiImageObservation(imageReference, sourceFile, evidenceFile, output, ci, dependencies = {}) {
  try {
    const destination = path.resolve(output);
    const relative = path.relative(repositoryRoot, destination);
    if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) invalid();
    const parent = path.dirname(destination);
    const real = await fs.realpath(parent);
    const equal = process.platform === 'win32' ? real.toLowerCase() === parent.toLowerCase() : real === parent;
    if (!equal || !(await fs.lstat(parent)).isDirectory() || (await fs.lstat(parent)).isSymbolicLink()) invalid();
    const owner = await fs.stat(parent);
    if (process.platform !== 'win32' && (owner.uid !== process.getuid() || (owner.mode & 0o022))) invalid();
    try { await fs.lstat(destination); invalid(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const sourceObservationBytes = await readCiFile(sourceFile, maximumObservationBytes);
    const sourceEvidenceBytes = await readCiFile(evidenceFile, CI_EVIDENCE_LIMITS.jsonBytes);
    const observation = await observeCiImage({ imageReference, sourceObservationBytes, sourceEvidenceBytes, ci }, dependencies);
    const bytes = Buffer.from(`${JSON.stringify(observation)}\n`);
    if (bytes.length > maximumObservationBytes) invalid();
    const handle = await fs.open(destination, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    return observation;
  } catch (error) {
    if (['CI_IMAGE_PROBE_CLEANUP_FAILED', 'CI_IMAGE_IDENTITY_FAILED'].includes(error?.code)) throw error;
    invalid();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [imageReference, sourceFile, evidenceFile, output] = process.argv.slice(2);
  const environment = process.env;
  const action = environment.CI && imageReference && sourceFile && evidenceFile && output && process.argv.length === 6
    ? writeCiImageObservation(imageReference, sourceFile, evidenceFile, output, {
      repository: environment.GITHUB_REPOSITORY, commit: environment.GITHUB_SHA,
      runId: environment.GITHUB_RUN_ID, runAttempt: environment.GITHUB_RUN_ATTEMPT,
    }) : Promise.reject();
  action.then(() => process.stdout.write('CI image observation retained; no qualification was issued.\n'), error => {
    const stage = error?.code === 'CI_IMAGE_IDENTITY_FAILED'
      && ['input', 'inspect', 'archive', 'identity'].includes(error.stage) ? ` at image ${error.stage}` : '';
    process.stderr.write(error?.code === 'CI_IMAGE_PROBE_CLEANUP_FAILED'
      ? `${cleanupFailureMessage}\n` : `CI image observation failed${stage}; no qualification was issued.\n`);
    process.exitCode = 1;
  });
}
