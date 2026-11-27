import { Meteor } from 'meteor/meteor';
import { AUDIT_VERIFICATIONS, DEFAULT_PUBLICATION_VERIFICATIONS, DIRECT_WRITE_VERIFICATIONS,
  HTTP_AUDIT_VERIFICATIONS, HTTP_FILE_VERIFICATIONS, HTTP_FRAMEWORK_RUNTIME_CONFIG_VERIFICATION,
  HTTP_HEALTH_VERIFICATIONS, HTTP_MIDDLEWARE_VERIFICATIONS, NAMED_PUBLICATION_VERIFICATIONS,
} from '../../common/securityAudit/verificationCatalog.ts';
import { registeredAssetUploadSurfaces } from './bindAssetUploadSurfaces';
import { registeredDefaultPublications } from './registerDefaultPublication';
import { registeredDirectWriteDenials } from './registerDirectWriteDenial';
import { registeredFrameworkAuthSurfaces } from './registerFrameworkAuth';
import { registeredHttpSurfaces } from './registerHttpRoutes';
import { registeredMeteorMethodSurfaces } from './registerMeteorMethods';
import { registeredNamedPublications } from './registerNamedPublication';
import { createSurfaceInventorySeal, RegistryObservationError, type StartupSurface } from './surfaceInventorySeal';

type HasVerification = { verification: { verificationId: string } };
const verificationId = (row: HasVerification) => row.verification.verificationId;
const meteorVerificationIdsBySurface = new Map<string, readonly string[]>();
for (const row of AUDIT_VERIFICATIONS) {
  if (row.kind !== 'integrationTest' || row.lane !== 'meteor') continue;
  meteorVerificationIdsBySurface.set(row.surfaceId,
    Object.freeze([...(meteorVerificationIdsBySurface.get(row.surfaceId) ?? []), row.verificationId]));
}
const meteorVerificationIds = (surfaceId: string) => meteorVerificationIdsBySurface.get(surfaceId) ?? [];

function requireOwnerCoverage(registered: readonly string[], expected: readonly { verificationId: string }[], reason: string) {
  const actualIds = new Set(registered);
  if (registered.length !== expected.length || expected.some(row => !actualIds.has(row.verificationId))) {
    throw new RegistryObservationError(reason);
  }
}

function collectRegisteredSurfaces(): StartupSurface[] {
  const methods = registeredMeteorMethodSurfaces();
  const uploads = registeredAssetUploadSurfaces();
  const auth = registeredFrameworkAuthSurfaces();
  if (methods.state !== 'observed') throw new RegistryObservationError(methods.reason);
  if (uploads.state !== 'observed') throw new RegistryObservationError(uploads.reason);
  if (auth.state !== 'observed') throw new RegistryObservationError(auth.reason);

  const named = registeredNamedPublications();
  const defaults = registeredDefaultPublications();
  const writes = registeredDirectWriteDenials();
  requireOwnerCoverage(named.map(verificationId), Object.values(NAMED_PUBLICATION_VERIFICATIONS), 'named-publication-coverage');
  requireOwnerCoverage(defaults.map(verificationId), Object.values(DEFAULT_PUBLICATION_VERIFICATIONS), 'default-publication-coverage');
  requireOwnerCoverage(writes.map(verificationId), Object.values(DIRECT_WRITE_VERIFICATIONS), 'collection-denial-coverage');

  const http = registeredHttpSurfaces().map((row, registrationIndex) => {
    const { verification, surfaceId, dispatch, mount, stack, policy, dataEgress } = row;
    const entries = 'endpoints' in verification ? [...verification.endpoints, verification.fallthrough]
      : Array.isArray(verification) ? verification : [verification];
    return {
      surfaceId, owner: 'http', policy, dataEgress,
      verificationIds: entries.map(entry => entry.verificationId),
      transport: { stack, mount, dispatch, registrationIndex, verifiedSurfaces: entries.map(entry => entry.surfaceId) },
    };
  });
  requireOwnerCoverage(http.flatMap(row => row.verificationIds), [
    ...Object.values(HTTP_AUDIT_VERIFICATIONS), ...Object.values(HTTP_FILE_VERIFICATIONS),
    HTTP_FRAMEWORK_RUNTIME_CONFIG_VERIFICATION, ...Object.values(HTTP_MIDDLEWARE_VERIFICATIONS).flat(),
    ...HTTP_HEALTH_VERIFICATIONS.endpoints, HTTP_HEALTH_VERIFICATIONS.fallthrough,
  ], 'http-registration-coverage');

  return [
    ...methods.surfaces.map(row => ({ surfaceId: row.surfaceId, owner: 'application-method',
      policy: row.policy, dataEgress: row.dataEgress, verificationIds: meteorVerificationIds(row.surfaceId) })),
    ...uploads.surfaces.map(row => ({ surfaceId: row.surfaceId, owner: row.owner,
      policy: row.policy, dataEgress: row.dataEgress, verificationIds: [verificationId(row)], transport: { name: row.name } })),
    ...auth.surfaces.map(row => ({ surfaceId: row.surfaceId, owner: 'framework-accounts',
      policy: row.policy, dataEgress: row.dataEgress, verificationIds: meteorVerificationIds(row.surfaceId), transport: { packagePins: row.packagePins } })),
    ...named.map(row => ({ surfaceId: row.surfaceId, owner: 'named-publication',
      policy: row.policy.kind === 'sparc-lesson' ? { kind: row.policy.kind } : row.policy,
      dataEgress: row.dataEgress, verificationIds: meteorVerificationIds(row.surfaceId) })),
    ...defaults.map(row => ({ surfaceId: row.surfaceId, owner: 'default-publication',
      policy: row.policy, dataEgress: row.surfaceId === DEFAULT_PUBLICATION_VERIFICATIONS.roles.surfaceId
        ? 'current-role-assignment-projection' : 'current-account-projection', verificationIds: [verificationId(row)] })),
    ...writes.map(row => ({ surfaceId: row.verification.surfaceId, owner: 'collection-rule',
      policy: { deny: Object.keys(row.rules).sort() }, dataEgress: 'none', verificationIds: [verificationId(row)] })),
    ...http,
  ];
}

const registry = createSurfaceInventorySeal(
  () => ({
    profile: {
      mode: Meteor.isTest || Meteor.isAppTest ? 'test' : Meteor.isProduction ? 'production' : 'development',
      meteorRelease: Meteor.release ?? 'unversioned',
    },
    surfaces: collectRegisteredSurfaces(),
  }),
  new Set(AUDIT_VERIFICATIONS.map(row => row.verificationId)),
);

export const completeStartupSurfaceRegistration = registry.complete;
export const readStartupSurfaceInventory = registry.read;
