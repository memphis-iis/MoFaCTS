import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { compareReleaseReceiptV2, parseReleaseReceiptV2 } from '../../../common/securityAudit/releaseReceipt.mjs';
import { parseRunningImageObservation } from '../../../common/securityAudit/releaseQualification.ts';
import { MAX_VERIFICATION_BUNDLE_BYTES, parseVerificationBundle } from '../../../common/securityAudit/verificationBundle.ts';
import { readCiFile, realDirectory, writeNew } from './collectCiEvidence.mjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';
import { projectReleaseReceiptV2, readReleaseBytes } from './releaseRecordStore.mjs';
import { validateBuildVerificationBundle, verificationBundleHash } from './imageVerificationBundle.mjs';
import { requiredMeteorVerificationIds } from './verificationCatalogProof.mjs';

// The registry observer verifies the installed surface inventory. The host
// observer verifies the running image independently. Match both to the same
// retained workstation authority before using them in an environment run.
export async function bindStaging2ReleaseRegistry({ authorityBytes, publication, runningImage, hostReceipt, bundleBytes, acceptance }) {
  const expectedReceipt = projectReleaseReceiptV2(authorityBytes, publication);
  if (!expectedReceipt.image.startsWith('ppavlikmemphis/mofacts-staging2:')
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [evidenceDirectory, authorityFile, outputFile] = process.argv.slice(2);
  try {
    if (process.argv.length !== 5 || !evidenceDirectory || !authorityFile || !outputFile) throw Error();
    const root = await realDirectory(evidenceDirectory);
    const json = async name => parseCiEvidenceJson(await readCiFile(path.join(root, name), 16384), 16384);
    const result = await bindStaging2ReleaseRegistry({
      authorityBytes: await readReleaseBytes(path.resolve(authorityFile)),
      publication: await json('publication.json'), runningImage: await json('running-image.json'),
      hostReceipt: await json('host-receipt.json'), acceptance: await json('accepted.json'),
      bundleBytes: await readCiFile(path.join(root, 'verification-bundle.json'), MAX_VERIFICATION_BUNDLE_BYTES),
    });
    await writeNew(outputFile, Buffer.from(canonicalAuditJson(result) + '\n'));
  } catch {
    process.stderr.write('Staging2 registry and release evidence did not match.\n');
    process.exitCode = 1;
  }
}
