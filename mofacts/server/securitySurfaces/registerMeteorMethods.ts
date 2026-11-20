import type { Meteor } from 'meteor/meteor';
import type { AUDIT_ADMIN_METHOD_VERIFICATIONS, DEPLOYMENT_READINESS_VERIFICATION } from '../../common/securityAudit/verificationCatalog.ts';

type MethodMap = Parameters<typeof Meteor.methods>[0];
type ReadMethods = () => Readonly<Record<string, unknown>> | undefined;
type MethodVerification = typeof AUDIT_ADMIN_METHOD_VERIFICATIONS[keyof typeof AUDIT_ADMIN_METHOD_VERIFICATIONS]
  | typeof DEPLOYMENT_READINESS_VERIFICATION;

export type MeteorMethodBinding = Readonly<{
  verification: MethodVerification;
  handler: MethodMap[string];
  policy: Readonly<{
    kind: 'role';
    role: 'admin';
    authorize: (userId: string | null | undefined) => Promise<string | void>;
  }>;
  dataEgress: 'audit-report-list' | 'audit-report-summary' | 'audit-download-capability' | 'deployment-diagnostics';
}>;

let observe: (() => ReturnType<typeof observeMeteorMethodBindings>) | undefined;
let duplicateRegistration = false;

export function observeMeteorMethodBindings(
  bindings: readonly MeteorMethodBinding[],
  submitted: Readonly<MethodMap>,
  installed: ReturnType<ReadMethods>,
) {
  const names = new Set<string>();
  const surfaces = [];
  for (const { verification, handler, policy, dataEgress } of bindings) {
    const { method: name, surfaceId } = verification;
    if (names.has(name) || typeof handler !== 'function' || !installed
        || !Object.hasOwn(submitted, name) || submitted[name] !== handler
        || !Object.hasOwn(installed, name) || installed[name] !== handler) {
      return { state: 'unavailable', reason: 'application-method-handler-mismatch' } as const;
    }
    names.add(name);
    surfaces.push(Object.freeze({ name, surfaceId, verification,
      policy: Object.freeze({ kind: policy.kind, role: policy.role }), dataEgress }));
  }
  return Object.freeze({ state: 'observed', surfaces: Object.freeze(surfaces) } as const);
}

export function registerMeteorMethods(
  server: { methods: typeof Meteor.methods },
  handlers: MethodMap,
  bindings: readonly MeteorMethodBinding[],
  readMethods: ReadMethods,
): void {
  server.methods(handlers);
  // Publish only evidence backed by the exact handler in Meteor. Keep unrelated
  // methods in the same registration and preserve Meteor's dispatch semantics.
  if (observe) duplicateRegistration = true;
  else observe = () => observeMeteorMethodBindings(bindings, handlers, readMethods());
}

export function registeredMeteorMethodSurfaces() {
  if (!observe || duplicateRegistration) {
    return { state: 'unavailable', reason: 'application-method-owner-binding' } as const;
  }
  return observe();
}
