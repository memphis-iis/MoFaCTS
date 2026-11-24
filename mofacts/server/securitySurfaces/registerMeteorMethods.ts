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
    kind: 'lesson-sharing';
    operation: 'owner-assignment' | 'owner-read' | 'family-owner-transfer';
    authorize: (...args: never[]) => boolean;
  }> | Readonly<{
    kind: 'learner-progress'; operation: 'account-session' | 'study-lesson';
    authorize: (...args: never[]) => unknown;
  }> | Readonly<{
    kind: 'progress-read';
    operation: 'own-study-lessons';
    authorize: (...args: never[]) => string;
  }> | Readonly<{
    kind: 'personal-profile';
    operation: 'edit' | 'provider-settings';
    authorize: (...args: never[]) => Promise<string>;
  }> | Readonly<{
    kind: 'model-catalog';
    operation: 'authenticated-read';
    authorize: (...args: never[]) => string;
  }> | Readonly<{
    kind: 'manual-draft';
    operation: 'owner';
    authorize: (...args: never[]) => string;
  }> | Readonly<{
    kind: 'lesson-file';
    operation: 'owner-or-accessor';
    authorize: (...args: never[]) => boolean | Promise<boolean>;
  }> | Readonly<{
    kind: 'study-wait';
    operation: 'start-or-resume';
    authorize: (...args: never[]) => Promise<number | null>;
  }> | Readonly<{
    kind: 'upload-read' | 'lesson-list' | 'dashboard-preference' | 'personal-audio';
    operation: 'self';
    authorize: (...args: never[]) => Promise<string> | string;
  }> | Readonly<{
    kind: 'course-launch';
    operation: 'progressive-prefix';
    authorize: (...args: never[]) => Promise<unknown>;
  }> | Readonly<{
    kind: 'course-management';
    operation: 'join-section' | 'create-course' | 'manage-course' | 'enrolled-student-exception';
    authorize: (...args: never[]) => Promise<unknown>;
  }> | Readonly<{
    kind: 'course-read';
    operation: 'own-account-session' | 'instructor-or-admin' | 'section-directory';
    authorize: (...args: never[]) => Promise<string> | string;
  }> | Readonly<{
    kind: 'public-account'; operation: 'requestPasswordReset' | 'resetPasswordWithToken' | 'resendVerificationEmail' | 'signUpUser';
    rateLimit: Readonly<{ requests: number; windowMs: number; scope: 'connection' }>;
    authorize: (...args: never[]) => Promise<unknown>;
  }> | Readonly<{
    kind: 'runtime-lesson'; operation: 'public-entry-or-accessible-lesson' | 'accessible-lesson';
    authorize: (...args: never[]) => Promise<unknown>;
  }> | Readonly<{
    kind: 'sparc-lesson'; operation: 'accessible-lesson-or-admin';
    authorize: (...args: never[]) => Promise<string>;
  }> | Readonly<{
    kind: 'account-self';
    operation: 'current-caller';
    authorize: (userId: string | null | undefined) => string;
  }> | Readonly<{
    kind: 'sso-profile';
    operation: 'self-or-admin';
    authorize: (...args: never[]) => Promise<string>;
  }> | Readonly<{
    kind: 'history-download';
    operation: 'owned-lessons' | 'own-history' | 'disabled-class' | 'owned-lesson';
    authorize: (...args: never[]) => unknown;
  }> | Readonly<{
    kind: 'diagnostic-telemetry';
    operation: 'non-private-report' | 'non-private-account' | 'lesson-package' | 'owned-attempt';
    authorize: (...args: never[]) => unknown;
  }> | Readonly<{
    kind: 'experiment-entry';
    operation: 'passwordless' | 'credentialed' | 'scoped-reconnect' | 'public-demo';
    rateLimit: Readonly<{ requests: number; windowMs: number; scope: 'connection' }> | null;
    authorize: (...args: never[]) => unknown;
  }> | Readonly<{
    kind: 'prolific';
    operation: 'participant-entry' | 'participant-resume' | 'own-completion';
    authorize: (...args: never[]) => unknown;
  }> | Readonly<{
    kind: 'prolific';
    operation: 'researcher';
    roles: readonly ['admin', 'teacher'];
    rateLimit: Readonly<{ ipLimit: number; identifierLimit: number; windowMs: number }>;
    authorize: (...args: never[]) => unknown;
  }>;
  dataEgress: 'audit-report-list' | 'audit-report-summary' | 'audit-download-capability' | 'deployment-diagnostics'
    | 'backup-configuration' | 'backup-job-metadata' | 'backup-download-capability'
    | 'brand-profile-draft' | 'published-brand-profile' | 'redacted-brand-profile-export'
    | 'filename-reference-migration-report' | 'history-download-capability' | 'none'
    | 'error-report-id' | 'warning-report-status' | 'warning-page' | 'simulation-attempt-id' | 'simulation-batch-status' | 'simulation-trace-page'
    | 'experiment-login-token' | 'participant-session' | 'public-demo-launch'
    | 'delete-result' | 'progressive-lesson-content' | 'join-result' | 'course-id' | 'assignment-editor-snapshot' | 'course-section-list' | 'teacher-display-list' | 'learner-course-snapshot' | 'assignments-by-course' | 'instructor-course-list'
    | 'account-creation-result' | 'runtime-lesson' | 'experiment-entry-lesson' | 'runtime-stimuli' | 'response-kc-map' | 'removed-component-ids' | 'instructional-figure-response' | 'instructional-image' | 'role-flags' | 'key-configured' | 'class-performance' | 'learner-dashboard' | 'dashboard-cache-status' | 'progress-reset-result' | 'learner-analytics-overview' | 'learner-analytics-source' | 'learner-history-page' | 'learner-lesson-config' | 'adaptive-outcomes' | 'stimulus-crowd-stats' | 'history-save-result'
    | 'performance-history' | 'completed-trial-count' | 'learning-history' | 'sparc-history' | 'hidden-stimulus-kcs' | 'experiment-state'
    | 'model-catalog' | 'provider-test-result' | 'theme-document' | 'theme-export' | 'verbosity-level' | 'evaluation-page' | 'evaluation-page-list' | 'provider-settings-metadata' | 'account-deletion-result' | 'roster-import-result' | 'news-recipient-list'
    | 'usage-cache-results' | 'video-catalog-targets' | 'video-catalog-preparation' | 'video-catalog-passages' | 'stimulus-display-map-version'
    | 'instructional-clusters' | 'instructional-component-page' | 'image-metadata' | 'instructional-component'
    | 'role-change-result' | 'owned-asset-filename' | 'own-upload-quota' | 'manual-draft' | 'draft-save-receipt' | 'stimulus-file' | 'account-email-or-status' | 'accessor-identities' | 'recipient-lookup-result' | 'statistics-expanded' | 'save-status' | 'saved-wait' | 'owned-lesson-list' | 'transfer-status' | 'prolific-participant-entry' | 'prolific-completion' | 'prolific-researcher-result';
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
      : (policy.kind === 'experiment-entry' || policy.kind === 'public-account')
      ? { kind: policy.kind, operation: policy.operation, rateLimit: policy.rateLimit }
      : policy.kind === 'prolific' && policy.operation === 'researcher'
      ? { kind: policy.kind, operation: policy.operation, roles: policy.roles, rateLimit: policy.rateLimit }
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
