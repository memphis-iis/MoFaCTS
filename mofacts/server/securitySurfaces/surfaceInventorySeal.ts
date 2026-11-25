import { createHash } from 'node:crypto';
import type { VerificationProfile } from '../../common/securityAudit/verificationBundle.ts';
import { canonicalAuditJson } from '../../common/securityAudit/canonicalReport.ts';

export type StartupSurface = Readonly<{
  surfaceId: string;
  owner: string;
  policy: unknown;
  dataEgress: unknown;
  verificationIds: readonly string[];
  transport?: Readonly<Record<string, unknown>>;
}>;
export type StartupProfile = Readonly<VerificationProfile>;
type Snapshot = { schema: 'StartupSurfaceInventoryV1'; profile: StartupProfile; surfaces: readonly StartupSurface[] };
type Result = { state: 'unavailable'; reason: string } |
  { state: 'sealed'; inventorySha256: string; profileSha256: string; inventory: Snapshot };
type StartupOwner = 'entrypoint-modules' | 'application-startup';

const digest = (json: string) => createHash('sha256').update(json).digest('hex');

export function createSurfaceInventorySeal(
  observe: () => Omit<Snapshot, 'schema'>, knownVerificationIds: ReadonlySet<string>,
) {
  const finished = new Set<StartupOwner>();
  let sealed: ReturnType<typeof capture> | undefined;
  let failure: string | undefined;

  function capture() {
    const { profile, surfaces } = observe();
    if (surfaces.length === 0) throw Error('surface-inventory-empty');
    const surfaceIds = new Set<string>();
    const verifierOwners = new Set<string>();
    for (const row of surfaces) {
      if (surfaceIds.has(row.surfaceId) || row.verificationIds.length === 0) throw Error('surface-verification-closure');
      surfaceIds.add(row.surfaceId);
      for (const id of row.verificationIds) {
        if (verifierOwners.has(id) || !knownVerificationIds.has(id)) throw Error('surface-verification-closure');
        verifierOwners.add(id);
      }
    }
    const sorted = [...surfaces].sort((left, right) => left.surfaceId < right.surfaceId ? -1 : left.surfaceId > right.surfaceId ? 1 : 0);
    const json = canonicalAuditJson({ schema: 'StartupSurfaceInventoryV1', profile, surfaces: sorted });
    if (Buffer.byteLength(json, 'utf8') > 256 * 1024) throw Error('surface-inventory-size');
    return { json, inventorySha256: digest(json), profileSha256: digest(canonicalAuditJson(profile)) };
  }

  function complete(owner: StartupOwner): void {
    if (finished.has(owner)) failure = 'startup-owner-signaled-twice';
    finished.add(owner);
    if (finished.size !== 2 || failure) return;
    try { sealed = capture(); }
    catch (error) { failure = error instanceof RegistryObservationError ? error.reason : 'invalid-surface-inventory'; }
  }

  function read(): Result {
    if (failure) return { state: 'unavailable', reason: failure };
    if (!sealed) return { state: 'unavailable', reason: 'startup-incomplete' };
    try {
      if (capture().inventorySha256 !== sealed.inventorySha256) failure = 'registration-changed-after-startup';
    } catch {
      failure = 'registration-changed-after-startup';
    }
    if (failure) return { state: 'unavailable', reason: failure };
    const { json, inventorySha256, profileSha256 } = sealed;
    return { state: 'sealed', inventorySha256, profileSha256, inventory: JSON.parse(json) as Snapshot };
  }

  return { complete, read };
}

export class RegistryObservationError extends Error {
  constructor(readonly reason: string) { super(reason); }
}
