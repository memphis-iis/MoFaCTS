import type { Meteor } from 'meteor/meteor';
import type { AUDIT_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';

type MethodMap = Parameters<typeof Meteor.methods>[0];
type ReadMethods = () => Readonly<Record<string, unknown>> | undefined;
type MethodVerification = Extract<typeof AUDIT_VERIFICATIONS[number], { method: string; surfaceId: `method:${string}` }>;

export type MeteorMethodBinding = Readonly<{
  verification: MethodVerification;
  handler: MethodMap[string];
  policy: Readonly<{
    kind: 'role';
    role: 'admin';
    authorize: (userId: string | null | undefined) => Promise<string | void>;
  }> | Readonly<{
    kind: 'study-condition-count';
    operation: 'replace' | 'increment' | 'reset';
    authorize: (...args: never[]) => Promise<void>;
  }> | Readonly<{
    kind: 'history-download';
    operation: 'owned-lessons' | 'own-history' | 'disabled-class' | 'owned-lesson';
    authorize: (...args: never[]) => unknown;
  }> | Readonly<{
    kind: 'diagnostic-telemetry';
    operation: 'non-private-report' | 'lesson-package' | 'owned-attempt';
    authorize: (...args: never[]) => unknown;
  }> | Readonly<{
    kind: 'experiment-entry';
    operation: 'passwordless' | 'credentialed' | 'scoped-reconnect' | 'public-demo';
    rateLimit: Readonly<{ requests: number; windowMs: number; scope: 'connection' }> | null;
    authorize: (...args: never[]) => unknown;
  }>;
  dataEgress: 'audit-report-list' | 'audit-report-summary' | 'audit-download-capability' | 'deployment-diagnostics'
    | 'backup-configuration' | 'backup-job-metadata' | 'backup-download-capability'
    | 'brand-profile-draft' | 'published-brand-profile' | 'redacted-brand-profile-export'
    | 'filename-reference-migration-report' | 'history-download-capability' | 'none'
    | 'warning-report-status' | 'warning-page' | 'simulation-attempt-id' | 'simulation-batch-status' | 'simulation-trace-page'
    | 'experiment-login-token' | 'participant-session' | 'public-demo-launch';
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
    const policyMetadata = policy.kind === 'role'
      ? { kind: policy.kind, role: policy.role }
      : policy.kind === 'experiment-entry'
      ? { kind: policy.kind, operation: policy.operation, rateLimit: policy.rateLimit }
      : { kind: policy.kind, operation: policy.operation };
    surfaces.push(Object.freeze({ name, surfaceId, verification, policy: Object.freeze(policyMetadata), dataEgress }));
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
