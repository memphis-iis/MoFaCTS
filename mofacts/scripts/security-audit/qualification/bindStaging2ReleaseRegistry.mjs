import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { AUDIT_CATALOG_V2 } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { proofRecord, sourceCommit } from '../../../common/securityAudit/proofFields.ts';
import { compareReleaseReceiptV2, parseReleaseReceiptV2 } from '../../../common/securityAudit/releaseReceipt.mjs';
import { parseRunningImageObservation } from '../../../common/securityAudit/releaseQualification.ts';
import { MAX_VERIFICATION_BUNDLE_BYTES, parseVerificationBundle } from '../../../common/securityAudit/verificationBundle.ts';
import { readAuditMetadataV2 } from '../core/metadataV2.mjs';
import { assembleAuditReportFromProducerFilesV2, writeAuditFileV2 } from '../core/producerFilesV2.mjs';
import { qualifySavedAuditArchiveV2, readMatchedAuditReportV2 } from '../report/reportFilesV2.mjs';
import { evidenceCommand, readCiFile, realDirectory, writeNew } from './collectCiEvidence.mjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';
import { projectReleaseReceiptV2, readReleaseBytes } from './releaseRecordStore.mjs';
import { validateBuildVerificationBundle, verificationBundleHash } from './imageVerificationBundle.mjs';

const staging2ImageRepository = 'ppavlikmemphis/mofacts-staging2';
const reportToolRoot = fileURLToPath(new URL('../../../../', import.meta.url));

async function verifyCleanSourceCheckout(directory, pin, { command = evidenceCommand, env = process.env } = {}) {
  const expected = sourceCommit(pin);
  const root = await realDirectory(directory);
  const gitEnv = { PATH: env.PATH, SystemRoot: env.SystemRoot, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
  const git = (args, maximum) => command('git', ['--no-optional-locks', '-C', root, ...args], maximum, gitEnv);
  const top = await git(['rev-parse', '--show-toplevel'], 8192);
  const revision = await git(['rev-parse', '--verify', 'HEAD'], 128);
  const status = await git(['status', '--porcelain=v1', '--untracked-files=all'], 65536);
  if (path.relative(root, top.toString('utf8').trim()) !== ''
    || sourceCommit(revision.toString('utf8').trim()) !== expected || status.length !== 0) {
    throw new Error('Source revision does not match the reviewed clean checkout');
  }
  return root;
}

// Source verification expectations belong to the deployed application revision.
async function readDeployedVerificationCatalog(applicationCheckout, revision, sourceOptions) {
  const root = await verifyCleanSourceCheckout(applicationCheckout, revision, sourceOptions);
  const module = pathToFileURL(path.join(root, 'mofacts/scripts/security-audit/qualification/verificationCatalogProof.mjs'));
  const { digestVerificationCatalog, requiredMeteorVerificationIds } = await import(module.href);
  const verificationCatalogSha256 = await digestVerificationCatalog();
  const sourceVerificationIds = new Set(requiredMeteorVerificationIds);
  await verifyCleanSourceCheckout(root, revision, sourceOptions);
  return { verificationCatalogSha256, sourceVerificationIds };
}

export function staging2PlatformImage(publishedImage) {
  const digest = publishedImage.kind === 'index' ? publishedImage.platformManifestDigest : publishedImage.digest;
  return `${staging2ImageRepository}@${digest}`;
}

// The registry observer verifies the installed surface inventory. The host
// observer verifies the running image independently. Match both to the same
// retained workstation authority before using them in an environment run.
export async function bindStaging2ReleaseRegistry({ authorityBytes, publication, runningImage, hostReceipt, bundleBytes, acceptance },
  releaseSource) {
  const expectedReceipt = projectReleaseReceiptV2(authorityBytes, publication);
  if (!expectedReceipt.image.startsWith(staging2ImageRepository + ':')
      || expectedReceipt.publishedImage.platform !== 'linux/amd64') throw Error('Expected an accepted staging2 Linux/amd64 release');
  const running = parseRunningImageObservation(runningImage);
  const host = proofRecord(hostReceipt, ['state', 'result', 'receipt']);
  if (host.state !== 'observed' || host.result !== 'MATCH' ||
      !isDeepStrictEqual(parseReleaseReceiptV2(host.receipt), expectedReceipt) ||
      compareReleaseReceiptV2(expectedReceipt, running.configDigest, running.baseCommit, running.platform).result !== 'MATCH') {
    throw Error('Host receipt, running image and release authority do not match');
  }

  const accepted = proofRecord(acceptance, ['state', 'sameLearnerAfterReload', 'ordinaryRoleVerified', 'sessionCleanupVerified', 'registry']);
  if (accepted.state !== 'phase3-runtime-verified' || accepted.sameLearnerAfterReload !== true ||
      accepted.ordinaryRoleVerified !== true || accepted.sessionCleanupVerified !== true) throw Error('Staging2 browser acceptance is incomplete');
  const registry = proofRecord(accepted.registry, ['state', 'buildIdentity', 'profileSha256', 'inventorySha256',
    'bundleDigestSha256', 'verificationCatalogSha256', 'verificationCount']);
  const identity = parseBuildIdentity(registry.buildIdentity);
  if (identity.baseCommit !== running.baseCommit ||
      identity.includedUncommittedLocalChanges !== expectedReceipt.includedUncommittedLocalChanges) {
    throw Error('Verified registry refers to different application source');
  }
  const parsedBundle = parseVerificationBundle(parseCiEvidenceJson(bundleBytes, MAX_VERIFICATION_BUNDLE_BYTES));
  const sourceCatalog = releaseSource === undefined ? undefined
    : await readDeployedVerificationCatalog(releaseSource.applicationCheckout, running.baseCommit, releaseSource.sourceOptions);
  const bundle = await validateBuildVerificationBundle(bundleBytes, identity, parsedBundle.profile.meteorRelease, sourceCatalog);
  if (registry.state !== 'runtime-proof-matched-unqualified' ||
      registry.bundleDigestSha256 !== verificationBundleHash(bundleBytes) ||
      registry.inventorySha256 !== bundle.expectedRegistrySha256 || registry.profileSha256 !== bundle.profileSha256 ||
      registry.verificationCatalogSha256 !== bundle.verificationCatalogSha256 ||
      registry.verificationCount !== bundle.executions.length) {
    throw Error('Retained registry result does not match the source verification bundle');
  }

  return {
    schema: 'Staging2RegistryReleaseBindingV1', state: 'matched',
    target: 'https://staging2.optimallearning.org',
    buildIdentity: identity, recordDigestSha256: expectedReceipt.recordDigestSha256,
    publishedImage: expectedReceipt.publishedImage, inventorySha256: bundle.expectedRegistrySha256,
    bundleDigestSha256: registry.bundleDigestSha256, verificationCatalogSha256: bundle.verificationCatalogSha256,
  };
}

function checkStaging2ReportIdentity(report, binding, hostReceipt) {
  const { baseCommit, includedUncommittedLocalChanges } = binding.buildIdentity;
  const platformImage = staging2PlatformImage(binding.publishedImage);
  if (includedUncommittedLocalChanges || report.reportType !== 'full'
    || !isDeepStrictEqual(report.deployedApplicationRevision, { state: 'observed', value: baseCommit })
    || !isDeepStrictEqual(report.deployedImageDigest, { state: 'observed', value: platformImage })) {
    throw new Error('Full report and staging2 release identity do not match');
  }
  // The verified host receipt identifies this deployment even when the same image is redeployed.
  if (!(Date.parse(report.startedAt) >= Date.parse(hostReceipt.receipt.deployedAtUtc))) {
    throw new Error('Full report started before the accepted staging2 deployment');
  }
  return platformImage;
}

// Assemble collected observations through the registered staging2 catalog.
// This command owns report files only. Acquisition and ingestion are separate.
export async function assembleStaging2FullReport({ releaseEvidence, metadataPath, artifactDirectory,
  outputPath, reportToolRevision, applicationCheckout }, sourceOptions) {
  await verifyCleanSourceCheckout(reportToolRoot, reportToolRevision, sourceOptions);
  const binding = await bindStaging2ReleaseRegistry(releaseEvidence, { applicationCheckout, sourceOptions });
  const envelope = { ...await readAuditMetadataV2(metadataPath), scannerSourceRevision: reportToolRevision };
  checkStaging2ReportIdentity(envelope, binding, releaseEvidence.hostReceipt);
  const report = await assembleAuditReportFromProducerFilesV2({ artifactDirectory, envelope,
    acceptedCatalog: AUDIT_CATALOG_V2, env: { AUDIT_TARGET: binding.target } });
  await verifyCleanSourceCheckout(reportToolRoot, reportToolRevision, sourceOptions);
  await writeAuditFileV2(outputPath, report);
  return report;
}

// Verify previously collected evidence for the coordinated cutover. The operator
// supplies the independently acquired receiver copy in the protected workspace.
export async function bindStaging2ReportReadback({ releaseEvidence, reportPath, readbackPath,
  archiveEvidence, reportToolRevision, applicationCheckout }, sourceOptions) {
  const separateTool = reportToolRevision !== undefined;
  if (separateTool !== (applicationCheckout !== undefined)) {
    throw new Error('The report tool pin and application source checkout must be supplied together');
  }
  if (separateTool) await verifyCleanSourceCheckout(reportToolRoot, reportToolRevision, sourceOptions);
  const binding = await bindStaging2ReleaseRegistry(releaseEvidence, separateTool ? { applicationCheckout, sourceOptions } : undefined);
  const env = { AUDIT_TARGET: binding.target };
  const scanner = reportToolRevision ?? binding.buildIdentity.baseCommit;
  const report = await readMatchedAuditReportV2({ reportPath, readbackPath, env });
  const platformImage = checkStaging2ReportIdentity(report, binding, releaseEvidence.hostReceipt);
  if (report.catalogDigestSha256 !== AUDIT_CATALOG_V2.catalogDigestSha256
    || report.scannerSourceRevision !== scanner) {
    throw new Error('Full report and staging2 release identity do not match');
  }
  const reportBinding = {
    schema: 'Staging2ReportReleaseBindingV1', reportId: report.reportId, reportDigestSha256: report.digestSha256,
    catalogDigestSha256: report.catalogDigestSha256, scannerSourceRevision: report.scannerSourceRevision,
    platformImage, recordDigestSha256: binding.recordDigestSha256, inventorySha256: binding.inventorySha256,
    bundleDigestSha256: binding.bundleDigestSha256,
    executionComplete: report.counts.error === 0 && report.executionErrors.length === 0,
  };
  if (archiveEvidence === undefined) return reportBinding;
  const archive = await qualifySavedAuditArchiveV2({
    ...archiveEvidence, reportPath, expectedReportDigestSha256: report.digestSha256, env,
  });
  return { ...reportBinding, archive };
}

export async function readStaging2ReleaseRegistryEvidence(evidenceDirectory, authorityFile) {
  const root = await realDirectory(evidenceDirectory);
  const json = async name => parseCiEvidenceJson(await readCiFile(path.join(root, name), 16384), 16384);
  return {
    authorityBytes: await readReleaseBytes(path.resolve(authorityFile)),
    publication: await json('publication.json'), runningImage: await json('running-image.json'),
    hostReceipt: await json('host-receipt.json'), acceptance: await json('accepted.json'),
    bundleBytes: await readCiFile(path.join(root, 'verification-bundle.json'), MAX_VERIFICATION_BUNDLE_BYTES),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [evidenceDirectory, authorityFile, outputFile, mode, ...options] = process.argv.slice(2);
  try {
    if (!evidenceDirectory || !authorityFile || !outputFile
      || ![undefined, '--assemble-full', '--report-readback', '--report-archive'].includes(mode)) throw Error();
    const assemble = mode === '--assemble-full';
    const qualifyArchive = mode === '--report-archive';
    const archiveOptionCount = qualifyArchive ? 2 : 0;
    const sourceOptions = options.slice(archiveOptionCount);
    if (!options.every(Boolean) || options.length < archiveOptionCount
      || (sourceOptions.length !== 0 && sourceOptions.length !== 2)
      || (assemble && sourceOptions.length !== 2)
      || (mode === undefined && sourceOptions.length !== 0)) throw Error();
    const [reportToolRevision, applicationCheckout] = sourceOptions;
    const root = await realDirectory(evidenceDirectory);
    const releaseEvidence = await readStaging2ReleaseRegistryEvidence(root, authorityFile);
    let archiveEvidence;
    if (qualifyArchive) {
      const [fingerprintPath, privateKeyPath] = options;
      const pin = proofRecord(parseCiEvidenceJson(await readCiFile(fingerprintPath, 1024), 1024), ['publicKeySha256']);
      archiveEvidence = {
        encryptedPath: path.join(root, 'report-encrypted.json'),
        archiveReceipt: parseCiEvidenceJson(await readCiFile(path.join(root, 'archive-receipt.json'), 4096), 4096),
        expectedPublicKeySha256: pin.publicKeySha256, privateKeyPath,
      };
    }
    if (assemble) {
      await assembleStaging2FullReport({ releaseEvidence, metadataPath: path.join(root, 'metadata.json'),
        artifactDirectory: path.join(root, 'producers'), outputPath: outputFile, reportToolRevision, applicationCheckout });
    } else {
      const result = mode === undefined ? await bindStaging2ReleaseRegistry(releaseEvidence)
        : await bindStaging2ReportReadback({ releaseEvidence, reportPath: path.join(root, 'report.json'),
          readbackPath: path.join(root, 'receiver-readback.json'), archiveEvidence,
          reportToolRevision, applicationCheckout });
      await writeNew(outputFile, Buffer.from(canonicalAuditJson(result) + '\n'));
    }
  } catch {
    process.stderr.write('Staging2 qualification evidence did not match.\n');
    process.exitCode = 1;
  }
}
