import { AUDIT_SURFACE_INVENTORY_VERIFICATION } from '../../common/securityAudit/verificationCatalog.ts';
import { createAuditReceiverIdentityLoader } from '../securityAudit/securityAuditReceiverIdentity.ts';
import type { MeteorMethodBinding } from './registerMeteorMethods.ts';
import { readStartupSurfaceInventory } from './startupSurfaceInventory.ts';
import { createVerificationBundleLoader } from './verificationBundle.ts';

export function createSecurityAuditInventoryRegistration(authorize: (userId: string | null | undefined) => Promise<void>) {
  const readBuildIdentity = createAuditReceiverIdentityLoader();
  const readBundle = createVerificationBundleLoader();
  const policy = Object.freeze({ kind: 'role', role: 'admin', authorize } as const);
  const methods = {
    'admin.securityAudits.surfaceInventory': async function(this: { userId?: string | null }) {
      await policy.authorize(this.userId);
      const [buildIdentity, verificationBundle] = await Promise.all([readBuildIdentity(), readBundle()]);
      return { registry: readStartupSurfaceInventory(), buildIdentity, verificationBundle };
    },
  };
  const binding = Object.freeze({
    handler: methods['admin.securityAudits.surfaceInventory'], policy, dataEgress: 'bounded-surface-inventory',
    verification: AUDIT_SURFACE_INVENTORY_VERIFICATION,
  } satisfies MeteorMethodBinding);
  return { methods, binding };
}
