import { auditDigest, canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { proofRecord, proofString } from '../../../common/securityAudit/proofFields.ts';
import { AUDIT_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { requiredMeteorVerificationIds } from './verificationCatalogProof.mjs';

export const MAX_REGISTRY_BYTES = 256 * 1024;
const requiredIds = new Set(requiredMeteorVerificationIds);
const surfaceByVerification = new Map(AUDIT_VERIFICATIONS.filter(row => requiredIds.has(row.verificationId))
  .map(row => [row.verificationId, row.surfaceId]));

export function requireProductionRegistryProfile(value) {
  const profile = proofRecord(value, ['mode', 'meteorRelease']);
  if (profile.mode !== 'production') throw Error('Expected runtime profile is not production');
  proofString(profile.meteorRelease, /^METEOR@[A-Za-z0-9_.-]+$/, 80);
  return profile;
}

export function checkRegistryCoverage(surfaces) {
  if (!Array.isArray(surfaces) || surfaces.length > requiredIds.size) throw Error('Invalid runtime surface inventory');
  const surfaceIds = new Set();
  const observedIds = new Set();
  for (const entry of surfaces) {
    const keys = ['surfaceId', 'owner', 'policy', 'dataEgress', 'verificationIds'];
    if (entry && Object.hasOwn(entry, 'transport')) keys.push('transport');
    const row = proofRecord(entry, keys);
    const name = proofString(row.surfaceId, /^[A-Za-z0-9][A-Za-z0-9_./:-]*$/, 256);
    if (surfaceIds.has(name) || !Array.isArray(row.verificationIds) || row.verificationIds.length < 1) {
      throw Error('Runtime registry has duplicate surfaces or missing verification');
    }
    surfaceIds.add(name);
    const verifiedSurfaces = row.owner === 'http' ? row.transport?.verifiedSurfaces : undefined;
    if (verifiedSurfaces !== undefined && (!Array.isArray(verifiedSurfaces) || verifiedSurfaces.length !== row.verificationIds.length)) {
      throw Error('Invalid HTTP registry verification projection');
    }
    for (const [index, id] of row.verificationIds.entries()) {
      const expectedSurface = surfaceByVerification.get(id);
      if (!expectedSurface || observedIds.has(id)) throw Error('Runtime registry verification has an unexpected or repeated ID');
      if (expectedSurface !== (verifiedSurfaces === undefined ? name : verifiedSurfaces[index])) {
        throw Error('Registry case belongs to a different surface');
      }
      observedIds.add(id);
    }
  }
  if (observedIds.size !== requiredIds.size) throw Error('Runtime registry is missing required verification IDs');
  return observedIds.size;
}

export function readNativeStartupRegistry(bytes, meteorRelease) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_REGISTRY_BYTES) throw Error('Invalid native registry size');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const inventory = proofRecord(JSON.parse(text), ['schema', 'profile', 'surfaces']);
  const profile = proofRecord(inventory.profile, ['mode', 'meteorRelease']);
  if (inventory.schema !== 'StartupSurfaceInventoryV1' || profile.mode !== 'test' ||
    profile.meteorRelease !== proofString(meteorRelease, /^METEOR@[A-Za-z0-9_.-]+$/, 80) ||
    canonicalAuditJson(inventory) !== text) throw Error('Native startup registry profile or bytes do not match');
  checkRegistryCoverage(inventory.surfaces);
  return inventory;
}

// The caller supplies descriptors reviewed for the declared production profile.
// This computes an expectation from those rows and cannot acquire them from a
// deployment being qualified.
export async function projectExpectedRegistry(value) {
  const input = proofRecord(value, ['schema', 'profile', 'surfaces']);
  if (input.schema !== 'StartupSurfaceInventoryV1') throw Error('Invalid registry projection schema');
  const profile = requireProductionRegistryProfile(input.profile);
  checkRegistryCoverage(input.surfaces);
  const surfaces = [...input.surfaces].sort((left, right) => left.surfaceId < right.surfaceId ? -1 : left.surfaceId > right.surfaceId ? 1 : 0);
  const inventory = { schema: input.schema, profile, surfaces };
  if (Buffer.byteLength(canonicalAuditJson(inventory)) > MAX_REGISTRY_BYTES) throw Error('Registry projection exceeds its byte limit');
  return { profile, inventorySha256: await auditDigest(inventory) };
}
