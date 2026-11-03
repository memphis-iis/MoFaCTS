import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { parsePostBuildImageObservation } from '../../../common/securityAudit/postBuildImageObservation.ts';
import { parseWorkstationReleaseRecord, classifyReleaseRecordProof } from '../../../common/securityAudit/releaseQualification.ts';
import { contentDigest } from '../../../common/securityAudit/proofFields.ts';
import { parseCiEvidenceJson, CI_EVIDENCE_FILES, CI_EVIDENCE_LIMITS } from './ciEvidence.mjs';
import { readCiFile, realDirectory } from './collectCiEvidence.mjs';
import { collectCiImageEvidence, CI_IMAGE_EVIDENCE_FILE, CI_IMAGE_EVIDENCE_LIMITS } from './collectCiImageEvidence.mjs';

const maximum = CI_EVIDENCE_LIMITS.recordBytes;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new Error('Release evidence preparation failed; no qualification was issued.'); };

/** Prepare a separate candidate. This never writes release authority or host proof. */
export async function prepareReleaseEvidence(options, dependencies = {}) {
  try {
    const candidateBytes = await readCiFile(options.candidateFile, maximum);
    const candidateValue = parseCiEvidenceJson(candidateBytes, maximum);
    // Existing proof is not implicitly migrated, replaced, or stripped.
    if (candidateValue && typeof candidateValue === 'object' && Object.hasOwn(candidateValue, 'qualification')) invalid();
    const candidate = parseWorkstationReleaseRecord(candidateValue);
    const expectedBytes = await readCiFile(options.expectedSourceFile, maximum);
    const expectedObservation = parseCiEvidenceJson(expectedBytes, maximum);
    const expected = parseBuildIdentity(expectedObservation.identity);
    if (expected.includedUncommittedLocalChanges || candidate.baseCommit !== expected.baseCommit
      || candidate.includedUncommittedLocalChanges !== expected.includedUncommittedLocalChanges) invalid();

    // The acquisition owner alone validates remote provenance, jobs and ZIPs.
    // Dependency injection substitutes that trusted operation in fixture tests;
    // this action has no mode accepting caller-supplied digest claims.
    const acquire = dependencies.collectCiImageEvidence || collectCiImageEvidence;
    const acquired = await acquire({ ciRunId: options.ciRunId, securityRunId: options.securityRunId,
      expectedSourceFile: options.expectedSourceFile, testAppRoot: options.testAppRoot,
      outputDirectory: options.outputDirectory, powershell: options.powershell }, dependencies);
    if (acquired.state !== 'acquired-unqualified' || acquired.qualification !== 'unqualified') invalid();
    const sourceDigest = contentDigest(acquired.sourceAcquisitionDigestSha256);
    const imageDigest = contentDigest(acquired.digestSha256);
    const observationDigest = contentDigest(acquired.ciImageObservationDigestSha256);
    const output = await realDirectory(options.outputDirectory);
    const sourceDirectory = path.join(output, sourceDigest);
    const imageDirectory = path.join(output, imageDigest);
    if (path.relative(imageDirectory, path.resolve(acquired.directory)) !== '') invalid();
    const sourceBytes = await readCiFile(path.join(sourceDirectory, 'acquisition.json'), maximum);
    const imageBytes = await readCiFile(path.join(imageDirectory, 'acquisition.json'), maximum);
    if (hash(sourceBytes) !== sourceDigest || hash(imageBytes) !== imageDigest) invalid();
    const source = parseCiEvidenceJson(sourceBytes, maximum);
    const image = parseCiEvidenceJson(imageBytes, maximum);
    if (source.schema !== 'CiEvidenceAcquisitionV1' || image.schema !== 'CiImageEvidenceAcquisitionV1'
      || source.state !== 'acquired-unqualified' || image.state !== 'acquired-unqualified'
      || source.qualification !== 'unqualified' || image.qualification !== 'unqualified'
      || !isDeepStrictEqual(parseBuildIdentity(source.source), expected)
      || !isDeepStrictEqual(parseBuildIdentity(image.source), expected)
      || image.sourceAcquisitionDigestSha256 !== sourceDigest
      || !isDeepStrictEqual(image.ci, source.ci) || !isDeepStrictEqual(image.security, source.security)) invalid();
    const observationBytes = await readCiFile(path.join(imageDirectory, CI_IMAGE_EVIDENCE_FILE),
      CI_IMAGE_EVIDENCE_LIMITS.observationBytes);
    const observation = parsePostBuildImageObservation(parseCiEvidenceJson(observationBytes,
      CI_IMAGE_EVIDENCE_LIMITS.observationBytes));
    const retainedFiles = image.artifact?.files;
    if (hash(observationBytes) !== observationDigest || !Array.isArray(retainedFiles) || retainedFiles.length !== 1
      || retainedFiles[0].name !== CI_IMAGE_EVIDENCE_FILE || retainedFiles[0].digestSha256 !== observationDigest
      || retainedFiles[0].bytes !== observationBytes.length || !isDeepStrictEqual(observation.source, expected)
      || !isDeepStrictEqual(observation.ci, { repository: 'memphis-iis/MoFaCTS', commit: expected.baseCommit,
        runId: source.ci.runId, runAttempt: source.ci.runAttempt })) invalid();
    const joinedBytes = await readCiFile(path.join(sourceDirectory, CI_EVIDENCE_FILES[2]), CI_EVIDENCE_LIMITS.jsonBytes);
    const joinedReferences = source.artifact?.files?.filter(file => file.name === CI_EVIDENCE_FILES[2]);
    if (!Array.isArray(joinedReferences) || joinedReferences.length !== 1
      || joinedReferences[0].digestSha256 !== hash(joinedBytes) || joinedReferences[0].bytes !== joinedBytes.length
      || observation.sourceEvidenceDigestSha256 !== hash(joinedBytes)) invalid();
    if (!(await readCiFile(options.candidateFile, maximum)).equals(candidateBytes)
      || !(await readCiFile(options.expectedSourceFile, maximum)).equals(expectedBytes)) invalid();

    const prepared = parseWorkstationReleaseRecord({ ...candidate, qualification: {
      schema: 'ReleaseQualificationV2', state: 'unqualified', buildIdentity: expected,
      evidenceReferences: { sourceAcquisitionDigestSha256: sourceDigest,
        ciImageAcquisitionDigestSha256: imageDigest, ciImageObservationDigestSha256: observationDigest },
    } });
    if (classifyReleaseRecordProof(prepared) !== 'incomplete-unqualified'
      || Buffer.byteLength(`${JSON.stringify(prepared)}\n`) > maximum) invalid();
    return { state: 'prepared-unqualified', qualification: 'unqualified', candidate: prepared };
  } catch { invalid(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packageJson = JSON.parse(await fs.readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
  if (process.versions.node !== packageJson.engines.node) {
    process.stderr.write('Release evidence preparation requires the repository-pinned Node version.\n');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const names = ['--ci-run', '--security-run', '--expected-source', '--test-app', '--output', '--powershell', '--candidate'];
  const options = {};
  let valid = args.length === names.length * 2;
  for (let index = 0; index < args.length; index += 2) {
    if (!names.includes(args[index]) || Object.hasOwn(options, args[index]) || !args[index + 1]) valid = false;
    options[args[index]] = args[index + 1];
  }
  const action = valid ? prepareReleaseEvidence({ ciRunId: options['--ci-run'], securityRunId: options['--security-run'],
    expectedSourceFile: options['--expected-source'], testAppRoot: options['--test-app'],
    outputDirectory: options['--output'], powershell: options['--powershell'], candidateFile: options['--candidate'] }) : Promise.reject();
  action.then(result => process.stdout.write(`${JSON.stringify(result.candidate)}\n`), () => {
    process.stderr.write('Release evidence preparation failed; no qualification was issued.\n');
    process.exitCode = 1;
  });
}
