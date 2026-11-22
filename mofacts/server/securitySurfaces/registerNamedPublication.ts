import { Roles } from 'meteor/alanning:roles';
import type { Meteor } from 'meteor/meteor';
import type { NAMED_PUBLICATION_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';

type Name = keyof typeof NAMED_PUBLICATION_VERIFICATIONS;
type Verification = typeof NAMED_PUBLICATION_VERIFICATIONS[Name];
type Publish = typeof Meteor.publish;
type Handler = Parameters<Publish>[1];
type Policy =
  | Readonly<{ kind: 'public'; applicationRateLimit: 'none' }>
  | Readonly<{ kind: 'authenticated' | 'authenticated-self'; delivery: 'sync' | 'async' }>
  | Readonly<{ kind: 'role'; role: 'admin' }>;
type Egress =
  | 'theme-settings' | 'deployment-brand-profile' | 'own-dashboard-cache' | 'client-log-setting'
  | 'own-audio-settings' | 'own-experiment-progress' | 'system-settings'
  | 'accessible-asset-metadata' | 'stimulus-set-asset-metadata' | 'runtime-lesson' | 'owner-editor-content'
  | 'owner-or-shared-upload-details' | 'experiment-lesson-family'
  | 'admin-user-page' | 'admin-user-count' | 'admin-dashboard-usage';
type Descriptor = Readonly<{ policy: Policy; dataEgress: Egress; verification: Verification }>;
type Registration = Descriptor & Readonly<{ name: Name; surfaceId: `publication:${Name}` }>;
const registrations: Registration[] = [];

function applyPolicy(policy: Policy, handler: Handler): Handler {
  if (policy.kind === 'public') return handler;
  if (policy.kind === 'role') {
    return async function(...args) {
      if (!this.userId || !await Roles.userIsInRoleAsync(this.userId, [policy.role])) return this.ready();
      return handler.apply(this, args);
    };
  }
  // Authentication is synchronous even when the authorized cursor needs async
  // setup. Keep the original result and error timing for both kinds of handler.
  const guarded: Handler = function(...args) {
    if (!this.userId) return this.ready();
    return handler.apply(this, args);
  };
  if (policy.delivery === 'sync') return guarded;
  return async function(...args) { return guarded.apply(this, args); };
}

export function registerNamedPublication<N extends Name>(
  server: { publish: Publish },
  name: N,
  descriptor: Omit<Descriptor, 'verification'> & { verification: typeof NAMED_PUBLICATION_VERIFICATIONS[NoInfer<N>] },
  handler: Handler,
): void {
  server.publish(name, applyPolicy(descriptor.policy, handler));
  registrations.push(Object.freeze({
    ...descriptor,
    name,
    surfaceId: `publication:${name}`,
    policy: Object.freeze({ ...descriptor.policy }),
  }));
}

export function registeredNamedPublications(): readonly Registration[] {
  return Object.freeze([...registrations]);
}
