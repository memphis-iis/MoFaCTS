import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parsePostBuildImageObservation } from '../../../common/securityAudit/postBuildImageObservation.ts';
import { composeCiEvidence, parseCiEvidenceJson, CI_EVIDENCE_FILES, CI_EVIDENCE_LIMITS } from './ciEvidence.mjs';
import { collectCiEvidence, evidenceCommand, readCiFile, realDirectory, requireUnexpired,
  writeNew, syncDirectory, sameDirectory, removeOwned } from './collectCiEvidence.mjs';
import { discoverTestModules } from '../../meteorTestEvidence.cjs';

const repositoryApi = 'repos/memphis-iis/MoFaCTS';
const archiveReader = fileURLToPath(new URL('../../../../deploy/security-audit/read-ci-evidence-archive.ps1', import.meta.url));
export const CI_IMAGE_EVIDENCE_LIMITS = Object.freeze({ archiveBytes: 65536, observationBytes: 16384 });
export const CI_IMAGE_EVIDENCE_FILE = 'mofacts-ci-image-observation.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new Error('CI image evidence acquisition failed; no qualification was issued.'); };

/** Pure binding. Source composition owns the one workflow/job validation policy. */
export function composeCiImageEvidence(input) {
  try {
    if (!input || !isDeepStrictEqual(Object.keys(input).sort(), [
      'sourceInput', 'sourceAcquisitionBytes', 'imageArtifact', 'archiveBytes', 'imageObservationBytes',
    ].sort())) invalid();
    const source = composeCiEvidence(input.sourceInput);
    const retained = parseCiEvidenceJson(input.sourceAcquisitionBytes, CI_EVIDENCE_LIMITS.recordBytes);
    if (!isDeepStrictEqual(source, retained)) invalid();
    const artifact = input.imageArtifact;
    const archive = input.archiveBytes;
    const observationBytes = input.imageObservationBytes;
    if (!(archive instanceof Uint8Array) || archive.byteLength < 1
      || archive.byteLength > CI_IMAGE_EVIDENCE_LIMITS.archiveBytes
      || !(observationBytes instanceof Uint8Array) || observationBytes.byteLength < 1
      || observationBytes.byteLength > CI_IMAGE_EVIDENCE_LIMITS.observationBytes
      || !Number.isSafeInteger(artifact.id) || artifact.id < 1 || String(artifact.id) === source.artifact.id
      || artifact.name !== `image-observation-${source.ci.runId}-${source.ci.runAttempt}`
      || artifact.expired !== false || artifact.size_in_bytes !== archive.byteLength
      || artifact.digest !== `sha256:${hash(archive)}`
      || artifact.workflow_run?.id !== input.sourceInput.ciRun.id
      || artifact.workflow_run.head_sha !== source.source.baseCommit
      || artifact.workflow_run.head_branch !== 'main'
      || artifact.workflow_run.repository_id !== input.sourceInput.ciRun.repository.id
      || artifact.workflow_run.head_repository_id !== input.sourceInput.ciRun.repository.id) invalid();
    const observation = parsePostBuildImageObservation(parseCiEvidenceJson(
      observationBytes, CI_IMAGE_EVIDENCE_LIMITS.observationBytes,
    ));
    const ci = { repository: 'memphis-iis/MoFaCTS', commit: source.source.baseCommit,
      runId: source.ci.runId, runAttempt: source.ci.runAttempt };
    if (!isDeepStrictEqual(observation.source, source.source) || !isDeepStrictEqual(observation.ci, ci)
      || observation.sourceEvidenceDigestSha256 !== hash(input.sourceInput.files[CI_EVIDENCE_FILES[2]])) invalid();
    const result = {
      schema: 'CiImageEvidenceAcquisitionV1', state: 'acquired-unqualified', qualification: 'unqualified',
      source: source.source, sourceAcquisitionDigestSha256: hash(input.sourceAcquisitionBytes),
      ci: source.ci, security: source.security,
      artifact: { id: String(artifact.id), name: artifact.name, archiveDigestSha256: hash(archive),
        sizeInBytes: archive.byteLength,
        files: [{ name: CI_IMAGE_EVIDENCE_FILE, digestSha256: hash(observationBytes), bytes: observationBytes.byteLength }] },
    };
    if (Buffer.byteLength(JSON.stringify(result)) > CI_EVIDENCE_LIMITS.recordBytes) invalid();
    return result;
  } catch { invalid(); }
}

/** GET-only opt-in acquisition. It never writes the authoritative release record. */
export async function collectCiImageEvidence(options, dependencies = {}) {
  const command = dependencies.command || evidenceCommand;
  const environment = dependencies.environment || process.env;
  const now = dependencies.now || Date.now;
  // The source owner performs all credential, expected-source, module, path and
  // publication checks first. Its accepted bundle remains valid if image work fails.
  let sourceResult;
  try { sourceResult = await collectCiEvidence(options, dependencies); }
  catch { invalid(); }
  let temporary;
  let temporaryIdentity;
  let published;
  let publishedIdentity;
  let complete = false;
  let output;
  try {
    output = await realDirectory(options.outputDirectory);
    const owner = await fs.stat(output);
    if (process.platform !== 'win32' && (owner.uid !== process.getuid() || (owner.mode & 0o022))) invalid();
    const sourceAcquisitionBytes = await readCiFile(path.join(sourceResult.directory, 'acquisition.json'), CI_EVIDENCE_LIMITS.recordBytes);
    if (hash(sourceAcquisitionBytes) !== sourceResult.digestSha256) invalid();
    const retainedSource = parseCiEvidenceJson(sourceAcquisitionBytes, CI_EVIDENCE_LIMITS.recordBytes);
    const files = {};
    for (const name of CI_EVIDENCE_FILES) files[name] = await readCiFile(path.join(sourceResult.directory, name), CI_EVIDENCE_LIMITS.jsonBytes);
    const sourceArchive = await readCiFile(path.join(sourceResult.directory, 'artifact.zip'), CI_EVIDENCE_LIMITS.archiveBytes);
    const expectedObservation = parseCiEvidenceJson(await readCiFile(options.expectedSourceFile, 16384), 16384);
    const expectedModules = discoverTestModules(await realDirectory(options.testAppRoot));
    const request = async resource => parseCiEvidenceJson(await command('gh', [
      'api', '--hostname', 'github.com', '-H', 'Accept: application/vnd.github+json',
      '-H', 'X-GitHub-Api-Version: 2022-11-28', `${repositoryApi}/${resource}`,
    ], CI_EVIDENCE_LIMITS.metadataBytes, environment), CI_EVIDENCE_LIMITS.metadataBytes);
    const sourceInput = async () => {
      const ciWorkflow = await request('actions/workflows/ci.yml');
      const securityWorkflow = await request('actions/workflows/security.yml');
      const ciRun = await request(`actions/runs/${options.ciRunId}`);
      const securityRun = await request(`actions/runs/${options.securityRunId}`);
      if (String(ciRun.id) !== retainedSource.ci.runId || String(ciRun.run_attempt) !== retainedSource.ci.runAttempt
        || String(securityRun.id) !== retainedSource.security.runId
        || String(securityRun.run_attempt) !== retainedSource.security.runAttempt) invalid();
      const ciJobs = await request(`actions/runs/${ciRun.id}/attempts/${ciRun.run_attempt}/jobs?per_page=100`);
      const securityJobs = await request(`actions/runs/${securityRun.id}/attempts/${securityRun.run_attempt}/jobs?per_page=100`);
      const artifact = await request(`actions/artifacts/${retainedSource.artifact.id}`);
      requireUnexpired(artifact, now());
      if (String(artifact.id) !== retainedSource.artifact.id) invalid();
      return { expectedObservation, expectedModules, ciWorkflow, ciRun, ciJobs, securityWorkflow, securityRun,
        securityJobs, artifact, files, archiveDigestSha256: hash(sourceArchive), archiveSizeBytes: sourceArchive.length };
    };
    const initialSource = await sourceInput();
    if (!isDeepStrictEqual(composeCiEvidence(initialSource), retainedSource)) invalid();
    const name = `image-observation-${retainedSource.ci.runId}-${retainedSource.ci.runAttempt}`;
    const listed = await request(`actions/runs/${options.ciRunId}/artifacts?name=${name}&per_page=100`);
    if (!Array.isArray(listed.artifacts) || listed.total_count !== listed.artifacts.length || listed.artifacts.length > 20) invalid();
    const matching = listed.artifacts.filter(artifact => artifact.name === name);
    if (matching.length !== 1 || !Number.isSafeInteger(matching[0].id) || matching[0].id < 1) invalid();
    const imageArtifact = matching[0];
    requireUnexpired(imageArtifact, now());
    const archiveBytes = await command('gh', ['api', '--hostname', 'github.com',
      `${repositoryApi}/actions/artifacts/${imageArtifact.id}/zip`], CI_IMAGE_EVIDENCE_LIMITS.archiveBytes, environment);
    temporary = await fs.mkdtemp(path.join(output, '.mofacts-ci-image-acquire-'));
    temporaryIdentity = await fs.lstat(temporary);
    await fs.chmod(temporary, 0o700);
    const archivePath = path.join(temporary, 'artifact.zip');
    await writeNew(archivePath, archiveBytes);
    const extracted = path.join(temporary, 'files');
    await fs.mkdir(extracted, { mode: 0o700 });
    const decoded = parseCiEvidenceJson(await command(options.powershell, ['-NoLogo', '-NoProfile',
      '-NonInteractive', '-File', archiveReader, '-ArchivePath', archivePath,
      '-OutputDirectory', extracted, '-Profile', 'image'], 16384, environment), 16384);
    if (decoded.state !== 'ci-evidence-archive-read' || decoded.files !== 1
      || decoded.archiveDigestSha256 !== hash(archiveBytes)
      || !isDeepStrictEqual(await fs.readdir(extracted), [CI_IMAGE_EVIDENCE_FILE])) invalid();
    const imageObservationBytes = await readCiFile(path.join(extracted, CI_IMAGE_EVIDENCE_FILE), CI_IMAGE_EVIDENCE_LIMITS.observationBytes);
    const input = { sourceInput: initialSource, sourceAcquisitionBytes, imageArtifact, archiveBytes, imageObservationBytes };
    const result = composeCiImageEvidence(input);
    const finalArtifact = await request(`actions/artifacts/${imageArtifact.id}`);
    requireUnexpired(finalArtifact, now());
    const finalResult = composeCiImageEvidence({ ...input, sourceInput: await sourceInput(), imageArtifact: finalArtifact });
    if (!isDeepStrictEqual(result, finalResult)) invalid();
    const recordBytes = Buffer.from(`${JSON.stringify(result)}\n`);
    const digestSha256 = hash(recordBytes);
    published = path.join(output, digestSha256);
    const preserved = { 'acquisition.json': recordBytes, 'artifact.zip': archiveBytes, [CI_IMAGE_EVIDENCE_FILE]: imageObservationBytes };
    try { await fs.mkdir(published, { mode: 0o700 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await realDirectory(published);
      if (!isDeepStrictEqual((await fs.readdir(published)).sort(), Object.keys(preserved).sort())) invalid();
      for (const [file, bytes] of Object.entries(preserved)) {
        const target = path.join(published, file);
        if ((await fs.stat(target)).mode & 0o222 || !(await readCiFile(target, bytes.length)).equals(bytes)) invalid();
      }
      complete = true;
    }
    if (!complete) {
      publishedIdentity = await fs.lstat(published);
      for (const [file, bytes] of Object.entries(preserved)) await writeNew(path.join(published, file), bytes);
      await syncDirectory(published);
      for (const file of Object.keys(preserved)) await fs.chmod(path.join(published, file), 0o400);
      await fs.chmod(published, 0o500);
      await syncDirectory(output);
      complete = true;
    }
    return { state: 'acquired-unqualified', qualification: 'unqualified', directory: published, digestSha256,
      sourceAcquisitionDigestSha256: sourceResult.digestSha256, ciImageObservationDigestSha256: hash(imageObservationBytes) };
  } catch { invalid(); }
  finally {
    if (publishedIdentity && !complete) {
      if (!sameDirectory(publishedIdentity, await fs.lstat(published))) invalid();
      await fs.chmod(published, 0o700);
      for (const file of await fs.readdir(published)) {
        const target = path.join(published, file);
        const stat = await fs.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) invalid();
        await fs.chmod(target, 0o600);
      }
      await removeOwned(published, output, publishedIdentity);
    }
    if (temporaryIdentity) await removeOwned(temporary, output, temporaryIdentity);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packageJson = JSON.parse(await fs.readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
  if (process.versions.node !== packageJson.engines.node) {
    process.stderr.write('CI image evidence acquisition requires the repository-pinned Node version.\n');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const names = ['--ci-run', '--security-run', '--expected-source', '--test-app', '--output', '--powershell'];
  const options = {};
  let valid = args.length === names.length * 2;
  for (let index = 0; index < args.length; index += 2) {
    if (!names.includes(args[index]) || Object.hasOwn(options, args[index]) || !args[index + 1]) valid = false;
    options[args[index]] = args[index + 1];
  }
  const action = valid ? collectCiImageEvidence({ ciRunId: options['--ci-run'], securityRunId: options['--security-run'],
    expectedSourceFile: options['--expected-source'], testAppRoot: options['--test-app'],
    outputDirectory: options['--output'], powershell: options['--powershell'] }) : Promise.reject();
  action.then(result => process.stdout.write(`${JSON.stringify(result)}\n`), () => {
    process.stderr.write('CI image evidence acquisition failed; no qualification was issued.\n');
    process.exitCode = 1;
  });
}
