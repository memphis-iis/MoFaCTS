import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { auditDigest } from '../../../common/securityAudit/canonicalReport.ts';
import { contentDigest, proofRecord, proofString } from '../../../common/securityAudit/proofFields.ts';
import { digestVerificationBundle, requireMatchingSourceVerification } from '../../../common/securityAudit/verificationBundle.ts';
import { readCiFile } from './collectCiEvidence.mjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';
import { digestVerificationCatalog, requiredMeteorVerificationIds } from './verificationCatalogProof.mjs';

const maxResponseBytes = 600 * 1024;
const maxExpectationBytes = 16384;

// Inputs come from the existing administrator observation and the independent
// build expectation. Neither an application self-report nor this comparison
// can establish which image the platform is actually running.
export async function compareRuntimeVerification(observation, expected) {
  const target = proofRecord(expected, ['buildIdentity', 'profile', 'inventorySha256', 'bundleDigestSha256']);
  const buildIdentity = parseBuildIdentity(target.buildIdentity);
  const inventorySha256 = contentDigest(target.inventorySha256);
  const bundleDigestSha256 = contentDigest(target.bundleDigestSha256);
  const profile = proofRecord(target.profile, ['mode', 'meteorRelease']);
  if (profile.mode !== 'production') throw Error('Expected runtime profile is not production');
  proofString(profile.meteorRelease, /^METEOR@[A-Za-z0-9_.-]+$/, 80);
  const profileSha256 = await auditDigest(profile);
  const requiredIds = new Set(requiredMeteorVerificationIds);

  const response = proofRecord(observation, ['buildIdentity', 'registry', 'verificationBundle']);
  const source = proofRecord(response.buildIdentity, ['state', 'identity']);
  if (source.state !== 'observed' || !isDeepStrictEqual(parseBuildIdentity(source.identity), buildIdentity)) {
    throw Error('Runtime source identity differs from the build expectation');
  }

  const registry = proofRecord(response.registry, ['state', 'inventory', 'inventorySha256', 'profileSha256']);
  const inventory = proofRecord(registry.inventory, ['schema', 'profile', 'surfaces']);
  if (registry.state !== 'sealed' || inventory.schema !== 'StartupSurfaceInventoryV1'
    || !isDeepStrictEqual(inventory.profile, profile) || registry.profileSha256 !== profileSha256
    || registry.inventorySha256 !== inventorySha256 || await auditDigest(inventory) !== inventorySha256) {
    throw Error('Runtime registry or profile differs from the build expectation');
  }
  if (!Array.isArray(inventory.surfaces) || inventory.surfaces.length > requiredIds.size) {
    throw Error('Invalid runtime surface inventory');
  }

  const surfaceIds = new Set();
  const observedIds = new Set();
  for (const entry of inventory.surfaces) {
    const keys = ['surfaceId', 'owner', 'policy', 'dataEgress', 'verificationIds'];
    if (entry && Object.hasOwn(entry, 'transport')) keys.push('transport');
    const row = proofRecord(entry, keys);
    const name = proofString(row.surfaceId, /^[A-Za-z0-9][A-Za-z0-9_./:-]*$/, 256);
    if (surfaceIds.has(name) || !Array.isArray(row.verificationIds) || row.verificationIds.length < 1) {
      throw Error('Runtime registry has duplicate surfaces or missing verification');
    }
    surfaceIds.add(name);
    for (const id of row.verificationIds) {
      if (!requiredIds.has(id) || observedIds.has(id)) throw Error('Runtime registry verification has an unexpected or repeated ID');
      observedIds.add(id);
    }
  }
  if (observedIds.size !== requiredIds.size) throw Error('Runtime registry is missing required verification IDs');

  const verificationCatalogSha256 = await digestVerificationCatalog();
  const embedded = proofRecord(response.verificationBundle, ['state', 'bundle', 'digestSha256']);
  if (embedded.state !== 'observed' || embedded.digestSha256 !== bundleDigestSha256
    || await digestVerificationBundle(embedded.bundle) !== bundleDigestSha256) {
    throw Error('Runtime bundle differs from the retained build proof');
  }
  await requireMatchingSourceVerification(embedded.bundle, {
    buildIdentity, profileSha256, expectedRegistrySha256: inventorySha256,
    verificationCatalogSha256, sourceVerificationIds: requiredIds,
  });
  return { state: 'runtime-proof-matched-unqualified', buildIdentity, profileSha256, inventorySha256,
    bundleDigestSha256, verificationCatalogSha256, verificationCount: observedIds.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [observationFile, expectationFile] = process.argv.slice(2);
  try {
    if (process.argv.length !== 4 || !observationFile || !expectationFile) throw Error();
    const observation = parseCiEvidenceJson(await readCiFile(observationFile, maxResponseBytes), maxResponseBytes);
    const expected = parseCiEvidenceJson(await readCiFile(expectationFile, maxExpectationBytes), maxExpectationBytes);
    process.stdout.write(JSON.stringify(await compareRuntimeVerification(observation, expected)) + '\n');
  } catch {
    process.stderr.write('Runtime verification proof did not match; no qualification was issued.\n');
    process.exitCode = 1;
  }
}
