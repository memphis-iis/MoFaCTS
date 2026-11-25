import path from 'node:path';
import fs from 'node:fs/promises';
import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import meteorEvidence from '../../meteorTestEvidence.cjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';
import { readCiFile, realDirectory, writeNew } from './collectCiEvidence.mjs';
import { validateBuildVerificationBundle, verificationBundleHash } from './imageVerificationBundle.mjs';
import { parseVerificationBundle, requireMatchingSourceVerification } from '../../../common/securityAudit/verificationBundle.ts';
import { bindNativeCaseEvidence } from './nativeCaseEvidence.mjs';
import { digestVerificationCatalog, requiredMeteorVerificationIds } from './verificationCatalogProof.mjs';
import { MAX_REGISTRY_BYTES, projectExpectedRegistry, readNativeStartupRegistry } from './registryProjection.mjs';

// The registry expectation is supplied by the release workflow. Deriving it
// from the Meteor test run would conflate its installed profile with the image.
export async function composeNativeVerificationBundle({ nativeEvidence, buildIdentity, expectedRegistry, variant }) {
  const identity = parseBuildIdentity(buildIdentity);
  const testIdentity = parseBuildIdentity(nativeEvidence.expectedTestInputs.identity);
  if (identity.baseCommit !== testIdentity.baseCommit ||
      identity.sourceSnapshotDigestSha256 !== testIdentity.sourceSnapshotDigestSha256 ||
      identity.includedUncommittedLocalChanges !== testIdentity.includedUncommittedLocalChanges) {
    throw Error('Source build identity differs from the captured test inputs');
  }
  const { profile, inventorySha256 } = expectedRegistry;
  const { executions, unresolved } = await bindNativeCaseEvidence(nativeEvidence, requiredMeteorVerificationIds);
  if (unresolved.length !== 0) throw Error('The retained Meteor run does not cover every required source verification');

  const bundle = parseVerificationBundle({
    schema: 'VerificationBundleV1', variant, buildIdentity: identity, profile,
    profileSha256: await auditDigest(profile), expectedRegistrySha256: inventorySha256,
    verificationCatalogSha256: await digestVerificationCatalog(), executions,
  });
  if (bundle.variant === 'source-evidence') {
    return requireMatchingSourceVerification(bundle, {
      buildIdentity: identity, profileSha256: bundle.profileSha256, expectedRegistrySha256: inventorySha256,
      verificationCatalogSha256: bundle.verificationCatalogSha256, sourceVerificationIds: new Set(requiredMeteorVerificationIds),
    });
  }
  return bundle;
}

// The capture command owns the workspace and verified test inputs. A caller's
// declared registry file is only an expectation until the exact-image checks.
export async function writeCapturedVerificationBundle({ root, expectedTestInputs, resultsDirectory, expectedReceiptSha256, registryFile }) {
  const app = path.join(root, 'test-context/mofacts');
  const results = await realDirectory(resultsDirectory);
  const declaration = proofRecord(parseCiEvidenceJson(await readCiFile(registryFile, 4096), 4096),
    ['schema', 'profile', 'registrationProjection']);
  if (declaration.schema !== 'RegistryProjectionDeclarationV1' ||
    declaration.registrationProjection !== 'same-reviewed-owner-descriptors') throw Error('Unsupported registry projection declaration');
  const release = (await fs.readFile(path.join(app, '.meteor/release'), 'utf8')).trim();
  const startupRegistryBytes = await readCiFile(path.join(results, 'startup-registry.json'), MAX_REGISTRY_BYTES);
  const installedDescriptors = readNativeStartupRegistry(startupRegistryBytes, release);
  const expectedRegistry = await projectExpectedRegistry({ ...installedDescriptors, profile: declaration.profile });
  const bundle = await composeNativeVerificationBundle({
    buildIdentity: expectedTestInputs.identity, expectedRegistry, variant: 'source-evidence',
    nativeEvidence: {
      receiptBytes: await readCiFile(path.join(results, 'native-verification.json'), 16384),
      runBytes: await readCiFile(path.join(results, 'meteor-run.json'), meteorEvidence.MAX_BYTES * 2),
      startupRegistryBytes, expectedReceiptSha256, expectedTestInputs, expectedModules: meteorEvidence.discoverTestModules(app),
    },
  });
  const bytes = Buffer.from(canonicalAuditJson(bundle));
  await validateBuildVerificationBundle(bytes, expectedTestInputs.identity, release);
  const bundleFile = path.join(root, 'verification-bundle.json');
  await writeNew(bundleFile, bytes);
  return { state: 'source-proof-prepared-unqualified', bundleFile, bundleDigestSha256: verificationBundleHash(bytes), ...expectedRegistry };
}
