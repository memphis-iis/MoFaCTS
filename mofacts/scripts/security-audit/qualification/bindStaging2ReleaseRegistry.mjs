import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { AUTHENTICATION_QUALIFICATION_CATALOG } from '../../../common/securityAudit/catalogRegistry.ts';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { compareReleaseReceiptV2, parseReleaseReceiptV2 } from '../../../common/securityAudit/releaseReceipt.mjs';
import { parseRunningImageObservation } from '../../../common/securityAudit/releaseQualification.ts';
import { MAX_VERIFICATION_BUNDLE_BYTES, parseVerificationBundle } from '../../../common/securityAudit/verificationBundle.ts';
import { qualifySavedAuditArchiveV2, readMatchedAuditReportV2 } from '../core/reportFilesV2.mjs';
import { readCiFile, realDirectory, writeNew } from './collectCiEvidence.mjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';
import { projectReleaseReceiptV2, readReleaseBytes } from './releaseRecordStore.mjs';
import { validateBuildVerificationBundle, verificationBundleHash } from './imageVerificationBundle.mjs';
import { requiredMeteorVerificationIds } from './verificationCatalogProof.mjs';

const staging2ImageRepository = 'ppavlikmemphis/mofacts-staging2';

export function staging2PlatformImage(publishedImage) {
  const digest = publishedImage.kind === 'index' ? publishedImage.platformManifestDigest : publishedImage.digest;
  return `${staging2ImageRepository}@${digest}`;
}

// The registry observer verifies the installed surface inventory. The host
// observer verifies the running image independently. Match both to the same
// retained workstation authority before using them in an environment run.
export async function bindStaging2ReleaseRegistry({ authorityBytes, publication, runningImage, hostReceipt, bundleBytes, acceptance }) {
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
  const bundle = await validateBuildVerificationBundle(bundleBytes, identity, parsedBundle.profile.meteorRelease);
  if (registry.state !== 'runtime-proof-matched-unqualified' ||
      registry.bundleDigestSha256 !== verificationBundleHash(bundleBytes) ||
      registry.inventorySha256 !== bundle.expectedRegistrySha256 || registry.profileSha256 !== bundle.profileSha256 ||
      registry.verificationCatalogSha256 !== bundle.verificationCatalogSha256 ||
      registry.verificationCount !== requiredMeteorVerificationIds.length) {
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

// Verify previously collected evidence for the coordinated cutover. The operator
// supplies the independently acquired receiver copy in the protected workspace.
export async function bindStaging2ReportReadback({ releaseEvidence, reportPath, readbackPath, archiveEvidence }) {
  const binding = await bindStaging2ReleaseRegistry(releaseEvidence);
  const env = { AUDIT_TARGET: binding.target };
  const report = await readMatchedAuditReportV2({ reportPath, readbackPath, env });
  const { buildIdentity } = binding;
  const platformImage = staging2PlatformImage(binding.publishedImage);
  if (buildIdentity.includedUncommittedLocalChanges || report.reportType !== 'full'
    || report.catalogDigestSha256 !== await auditDigest(AUTHENTICATION_QUALIFICATION_CATALOG)
    || report.scannerSourceRevision !== buildIdentity.baseCommit
    || report.deployedApplicationRevision.state !== 'observed' || report.deployedApplicationRevision.value !== buildIdentity.baseCommit
    || report.deployedImageDigest.state !== 'observed' || report.deployedImageDigest.value !== platformImage) {
    throw new Error('Full report and staging2 release identity do not match');
  }
  // The verified host receipt identifies this deployment even when the same image is redeployed.
  const deployedAt = Date.parse(releaseEvidence.hostReceipt.receipt.deployedAtUtc);
  if (!(Date.parse(report.startedAt) >= deployedAt)) {
    throw new Error('Full report started before the accepted staging2 deployment');
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
      || ![undefined, '--report-readback', '--report-archive'].includes(mode)) throw Error();
    const qualifyArchive = mode === '--report-archive';
    if (options.length !== (qualifyArchive ? 2 : 0) || !options.every(Boolean)) throw Error();
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
    const result = mode === undefined ? await bindStaging2ReleaseRegistry(releaseEvidence)
      : await bindStaging2ReportReadback({ releaseEvidence, reportPath: path.join(root, 'report.json'),
        readbackPath: path.join(root, 'receiver-readback.json'), archiveEvidence });
    await writeNew(outputFile, Buffer.from(canonicalAuditJson(result) + '\n'));
  } catch {
    process.stderr.write('Staging2 qualification evidence did not match.\n');
    process.exitCode = 1;
  }
}
