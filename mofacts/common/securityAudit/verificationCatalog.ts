import type { ExpectedAuthorizationPolicy } from './authorizationOutcomes.ts';

// The shared sample vector is acquired once for both comparison properties.
// Four reset requests leave one of the app's five-per-IP/hour requests for the
// separate current-token scenario. Throttle probes run last under their lease.
export const AUTHENTICATION_COMPARISON_POLICY = Object.freeze({
  login: Object.freeze({ sampleCount: 5, minimumBoundMs: 150, relativeBound: 0.5 }),
  reset: Object.freeze({ sampleCount: 2, minimumBoundMs: 250, relativeBound: 0.75 }),
  directionFraction: 0.8,
  maximumAttemptMs: 15000,
  credentialRejectionCode: '403',
  credentialRejectionReasons: Object.freeze([
    'Something went wrong. Please check your credentials.', 'Incorrect password', 'User not found',
  ]),
  rateLimitCodes: Object.freeze(['rate-limit', 'too-many-requests']),
});
export const AUTHENTICATION_COMPARISON_BASELINE = Object.freeze({
  verificationId: 'authn.baseline.password-login', kind: 'publicPositiveProbe' as const,
  surfaceId: 'framework:accounts-password:password-login', lane: 'remote' as const,
  actor: 'learnerA' as const, proofShape: 'authenticated-bound-user' as const,
  mutation: 'authentication-comparison' as const,
});
export const AUTHENTICATION_COMPARISON_SAMPLES = Object.freeze((['login', 'reset'] as const).flatMap(sampleSet =>
  Array.from({ length: AUTHENTICATION_COMPARISON_POLICY[sampleSet].sampleCount }, (_, index) => Object.freeze({
    sampleId: `authn.comparison.${sampleSet}.${index + 1}`, sampleSet, existingFirst: index % 2 === 0,
  }))),
);

export type AuditProtocolQualification = Readonly<{
  verificationId: string; surfaceId: string; kind: 'protocolQualification'; lane: 'remote';
  controlId: 'authentication.enumeration' | 'authentication.timing';
  sampleSet: 'login' | 'reset'; mutation: 'authentication-comparison';
  requiredBaselineIds: readonly string[];
}>;
export const AUTHENTICATION_PROTOCOL_VERIFICATIONS: readonly AuditProtocolQualification[] = Object.freeze(
  (['enumeration', 'timing'] as const).flatMap(property => (['login', 'reset'] as const).map(sampleSet => Object.freeze({
    verificationId: `authn.${property}.${sampleSet}`,
    surfaceId: sampleSet === 'login' ? 'framework:accounts-password:password-login' : 'method:requestPasswordReset',
    kind: 'protocolQualification' as const, lane: 'remote' as const,
    controlId: `authentication.${property}` as const, sampleSet, mutation: 'authentication-comparison' as const,
    requiredBaselineIds: Object.freeze([AUTHENTICATION_COMPARISON_BASELINE.verificationId]),
  }))),
);

export const AUTHENTICATION_PROTOCOL_MUTATIONS = Object.freeze({
  'logout-revocation': Object.freeze({
    mutates: true, owner: 'audit-runner',
    preconditions: Object.freeze(['synthetic-bindings-verified', 'environment-lease-held', 'two-positive-connections-sharing-the-owned-capability']),
    setup: 'clone-only-the-job-owned-session-capability',
    postconditions: Object.freeze(['logout-completed', 'guarded-method-and-fresh-resume-denied', 'fresh-password-login-allowed']),
    cleanup: 'logout-and-close-only-owned-browser-contexts',
    interruptedRunRecovery: 'discard-owned-contexts-and-capabilities-verify-no-account-password-change',
  }),
  'passwordless-provisioning': Object.freeze({
    mutates: true, owner: 'audit-runner',
    preconditions: Object.freeze(['synthetic-bindings-verified', 'environment-lease-held', 'owned-targets-and-participant', 'successful-admin-ordinary-and-foreign-resource-baselines']),
    setup: 'mint-only-owned-passwordless-participant-session',
    postconditions: Object.freeze(['exact-participant-and-sealed-target', 'typed-method-denials', 'readable-scoped-publication', 'complete-disclosure-hooks']),
    cleanup: 'remove-only-owned-participant-progress-and-targets-close-sessions',
    interruptedRunRecovery: 'reconcile-owned-manifest-and-confirm-participant-target-data-absence',
  }),
  'authentication-throttling': Object.freeze({
    mutates: true, owner: 'audit-runner',
    preconditions: Object.freeze(['synthetic-bindings-verified', 'environment-lease-held', 'fresh-throttle-window', 'successful-login-baseline', 'independent-scope-attribution']),
    setup: 'bind-owned-lockout-canary-and-unique-absent-identifiers',
    postconditions: Object.freeze(['exact-rate-limit-codes-for-connection-identifier-and-ip', 'bounded-attempt-budgets', 'throttles-run-last']),
    cleanup: 'remove-only-owned-canary-close-sessions-wait-unowned-throttle-window-expiry',
    interruptedRunRecovery: 'reconcile-run-journal-and-wait-actual-window-never-clear-unowned-state',
  }),
  'password-reset': Object.freeze({
    mutates: true, owner: 'audit-runner',
    preconditions: Object.freeze(['synthetic-bindings-verified', 'environment-lease-held', 'successful-password-baselines', 'separate-current-and-expiry-actors', 'owned-unused-reset-records']),
    setup: 'mint-current-and-unused-aged-tokens-for-owned-actors',
    postconditions: Object.freeze(['new-password-verified', 'same-capability-replay-rejected', 'expired-unused-token-rejected-with-password-unchanged']),
    cleanup: 'remove-only-owned-actors-reset-records-and-sessions',
    interruptedRunRecovery: 'reconcile-owned-records-and-token-consumption-from-private-run-journal',
  }),
  'authentication-comparison': Object.freeze({
    mutates: true, owner: 'audit-runner',
    preconditions: Object.freeze(['synthetic-bindings-verified', 'environment-lease-held', 'fresh-throttle-window', 'successful-login-baseline', 'fresh-anonymous-connection-per-pair']),
    setup: 'bind-owned-existing-and-absent-identifiers',
    postconditions: Object.freeze(['one-shared-paired-vector', 'bounded-login-and-reset-attempts']),
    cleanup: 'close-owned-sessions-remove-only-owned-fixtures',
    interruptedRunRecovery: 'reconcile-run-journal-wait-unowned-throttle-window-expiry',
  }),
});

export const AUTHENTICATION_RESET_POLICY = Object.freeze({ lifetimeMs: 3600000, denialCodes: Object.freeze(['invalid-token']) });
export const AUTHENTICATION_SESSION_POLICY = Object.freeze({ maximumLifetimeDays: 30 });
export const AUTHENTICATION_MATERIAL_CHANNELS = Object.freeze(['dom', 'url', 'cookies', 'console', 'requests'] as const);
// Qualification attempt budgets, not a second application rate limiter. A
// stricter observed throttle can pass, but an unrelated scope's limit cannot.
export const AUTHENTICATION_THROTTLE_CASES = Object.freeze([
  { verificationId: 'authn.throttle.connection', scope: 'connection', maximumAttempts: 12, policyDenialCodes: ['too-many-requests'] },
  { verificationId: 'authn.throttle.identifier', scope: 'identifier', maximumAttempts: 12, policyDenialCodes: ['rate-limit'] },
  { verificationId: 'authn.throttle.ip', scope: 'ip', maximumAttempts: 21, policyDenialCodes: ['rate-limit'] },
].map(row => Object.freeze({ ...row, policyDenialCodes: Object.freeze(row.policyDenialCodes),
  surfaceId: 'framework:accounts-password:password-login', kind: 'protocolQualification' as const, lane: 'remote' as const,
  controlId: 'authentication.throttling', mutation: 'authentication-throttling' as const })));
export const AUTHENTICATION_MATERIAL_CASES = Object.freeze(AUTHENTICATION_MATERIAL_CHANNELS.map(channel => Object.freeze({
  verificationId: `authn.material.${channel}`, channel, surfaceId: `client:authentication-${channel}`,
  kind: 'protocolQualification' as const, lane: 'remote' as const, controlId: 'authentication.material-leakage',
  mutation: 'none' as const,
})));

// Source intent for the existing twelve passwordless controls. Protected
// fixtures supply identities/resources only, never expected outcomes or codes.
const passwordlessLogin = 'authn.passwordless.token-login';
export const PASSWORDLESS_PROTOCOL_VERIFICATIONS = Object.freeze([
  { verificationId: 'authn.passwordless.baseline.admin', controlId: null, family: 'method', surfaceId: 'method:admin.securityAudits.list', expectedPolicy: 'allow', allowedBaselineIds: [], policyDenialCodes: [] },
  { verificationId: 'authn.passwordless.baseline.ordinary', controlId: null, family: 'method', surfaceId: 'method:getOwnOpenRouterSettings', expectedPolicy: 'allow', allowedBaselineIds: [], policyDenialCodes: [] },
  { verificationId: 'authn.passwordless.baseline.foreign-performance', controlId: null, family: 'method', surfaceId: 'method:getStudentPerformanceByIdAndTDFIdFromHistory', expectedPolicy: 'allow', allowedBaselineIds: [], policyDenialCodes: [] },
  { verificationId: 'authn.passwordless.baseline.publication', controlId: null, family: 'predicate', surfaceId: 'publication:userExperimentState', allowedBaselineIds: [], policyDenialCodes: [] },
  { verificationId: 'authn.passwordless.baseline.other-target', controlId: null, family: 'predicate', surfaceId: 'method:getTdfByExperimentTarget', allowedBaselineIds: [], policyDenialCodes: [] },
  { verificationId: 'authn.passwordless.resume-token-issued', controlId: 'authentication.passwordless.resume-token-issued', family: 'predicate', surfaceId: 'method:provisionExperimentUser', allowedBaselineIds: [], policyDenialCodes: [] },
  { verificationId: passwordlessLogin, controlId: 'authentication.passwordless.token-login', family: 'predicate', surfaceId: 'framework:accounts-base:resume', allowedBaselineIds: ['authn.passwordless.resume-token-issued'], policyDenialCodes: [] },
  ...(['participant-identity', 'experiment-flag', 'sealed-target-binding'] as const).map(name => ({ verificationId: `authn.passwordless.${name}`, controlId: `authentication.passwordless.${name}`, family: 'predicate', surfaceId: 'framework:accounts-base:current-user', allowedBaselineIds: [passwordlessLogin], policyDenialCodes: [] })),
  { verificationId: 'authn.passwordless.modified-target-rejected', controlId: 'authentication.passwordless.modified-target-rejected', family: 'method', surfaceId: 'method:provisionExperimentUser', expectedPolicy: 'deny', allowedBaselineIds: [passwordlessLogin, 'authn.passwordless.baseline.other-target'], policyDenialCodes: ['experiment-target-mismatch'] },
  { verificationId: 'authn.passwordless.admin-denied', controlId: 'authentication.passwordless.admin-denied', family: 'method', surfaceId: 'method:admin.securityAudits.list', expectedPolicy: 'deny', allowedBaselineIds: [passwordlessLogin, 'authn.passwordless.baseline.admin'], policyDenialCodes: ['not-authorized'] },
  { verificationId: 'authn.passwordless.ordinary-account-denied', controlId: 'authentication.passwordless.ordinary-account-denied', family: 'method', surfaceId: 'method:getOwnOpenRouterSettings', expectedPolicy: 'deny', allowedBaselineIds: [passwordlessLogin, 'authn.passwordless.baseline.ordinary'], policyDenialCodes: ['experiment-account-restricted'] },
  { verificationId: 'authn.passwordless.assigned-experiment-allowed', controlId: 'authentication.passwordless.assigned-experiment-allowed', family: 'predicate', surfaceId: 'method:getTdfByExperimentTarget', allowedBaselineIds: [passwordlessLogin], policyDenialCodes: [] },
  { verificationId: 'authn.passwordless.cross-user-method-denied', controlId: 'authentication.passwordless.cross-user-method-denied', family: 'method', surfaceId: 'method:getStudentPerformanceByIdAndTDFIdFromHistory', expectedPolicy: 'deny', allowedBaselineIds: [passwordlessLogin, 'authn.passwordless.baseline.foreign-performance'], policyDenialCodes: ['403'] },
  { verificationId: 'authn.passwordless.cross-user-publication-contained', controlId: 'authentication.passwordless.cross-user-publication-contained', family: 'predicate', surfaceId: 'publication:userExperimentState', allowedBaselineIds: [passwordlessLogin, 'authn.passwordless.baseline.publication'], policyDenialCodes: [] },
  { verificationId: 'authn.passwordless.token-not-leaked', controlId: 'authentication.passwordless.token-not-leaked', family: 'predicate', surfaceId: 'client:passwordless-observation-channels', allowedBaselineIds: [passwordlessLogin], policyDenialCodes: [] },
].map(row => Object.freeze({ ...row, expectedPolicy: 'expectedPolicy' in row ? row.expectedPolicy as ExpectedAuthorizationPolicy : undefined,
  allowedBaselineIds: Object.freeze(row.allowedBaselineIds), policyDenialCodes: Object.freeze(row.policyDenialCodes),
  kind: 'protocolQualification' as const, lane: 'remote' as const, mutation: 'passwordless-provisioning' as const })));

export const RESET_PROTOCOL_VERIFICATIONS = Object.freeze([
  { verificationId: 'authn.reset.current.password-before', expectedPolicy: 'allow', allowedBaselineIds: [] },
  { verificationId: 'authn.reset.current.accepted', expectedPolicy: 'allow', allowedBaselineIds: ['authn.reset.current.password-before'] },
  { verificationId: 'authn.reset.current.replay', expectedPolicy: 'deny', allowedBaselineIds: ['authn.reset.current.password-before', 'authn.reset.current.accepted'] },
  { verificationId: 'authn.reset.expired.password-before', expectedPolicy: 'allow', allowedBaselineIds: [] },
  { verificationId: 'authn.reset.expired.rejected', expectedPolicy: 'deny', allowedBaselineIds: ['authn.reset.expired.password-before', 'authn.reset.current.accepted'] },
  { verificationId: 'authn.reset.expired.password-unchanged', expectedPolicy: 'allow', allowedBaselineIds: ['authn.reset.expired.password-before'] },
].map(row => Object.freeze({ ...row, expectedPolicy: row.expectedPolicy as ExpectedAuthorizationPolicy,
  allowedBaselineIds: Object.freeze(row.allowedBaselineIds), kind: 'protocolQualification' as const,
  lane: 'remote' as const, mutation: 'password-reset' as const,
  surfaceId: row.verificationId.endsWith('accepted') || row.expectedPolicy === 'deny'
    ? 'method:resetPasswordWithToken' : 'framework:accounts-password:password-login' })));
const currentResetIds = Object.freeze(RESET_PROTOCOL_VERIFICATIONS.filter(row => row.verificationId.startsWith('authn.reset.current.')).map(row => row.verificationId));
export const RESET_PROTOCOL_CONTROL_CASES = Object.freeze({
  'authentication.reset-token.current-single-use': currentResetIds,
  'authentication.reset-token.replay-rejected': currentResetIds,
  'authentication.reset-token.expired-rejected': Object.freeze(RESET_PROTOCOL_VERIFICATIONS.filter(row => !row.verificationId.endsWith('.replay')).map(row => row.verificationId)),
});
export const AUTHENTICATION_SESSION_VERIFICATIONS = Object.freeze([
  { verificationId: 'authn.session.lifetime', controlId: 'authentication.session-lifetime', mutation: 'none', surfaceId: 'framework:accounts-password:password-login' },
  { verificationId: 'authn.session.revocation.logout', controlId: 'authentication.session-revocation', mutation: 'logout-revocation', surfaceId: 'framework:accounts-base:logout' },
  { verificationId: 'authn.session.revocation.password-reset', controlId: 'authentication.session-revocation', mutation: 'password-reset', surfaceId: 'method:resetPasswordWithToken' },
].map(row => Object.freeze({ ...row, kind: 'protocolQualification' as const, lane: 'remote' as const,
  requiredBaselineIds: Object.freeze([AUTHENTICATION_COMPARISON_BASELINE.verificationId]) })));

export type AuditActorAlias = 'anonymous' | 'learnerA' | 'learnerB' | 'teacherA' | 'teacherB' | 'admin';
export type AuthorizationProofShape = 'own-settings-v1' | 'self-performance-v1' | 'audit-summary-v2'
  | 'progress-snapshot-v1' | 'settings-snapshot-v1' | 'rendered-route-v1' | 'single-use-download-v1';
export type AuditAuthorizationScenario = Readonly<{
  verificationId: string;
  surfaceId: string;
  kind: 'authorizationScenario';
  lane: 'remote';
  family: 'method' | 'publication' | 'route' | 'download';
  proofShape: AuthorizationProofShape;
  actor: AuditActorAlias;
  expectedPolicy: ExpectedAuthorizationPolicy;
  allowedBaselineIds: readonly string[];
  policyDenialCodes: readonly string[];
  bindingAliases: readonly string[];
  subjectActor?: Exclude<AuditActorAlias, 'anonymous'>;
  expectedPath?: string;
  template?: string;
  mutation: 'none' | 'single-use-capability';
}>;

const ordinary = ['learnerA', 'learnerB', 'teacherA', 'teacherB'] as const;
const method = (id: string, name: string, actor: AuditActorAlias, expectedPolicy: ExpectedAuthorizationPolicy,
  proofShape: AuthorizationProofShape, bindings: string[] = [], baselines: string[] = [], codes: string[] = [],
  subjectActor?: Exclude<AuditActorAlias, 'anonymous'>): AuditAuthorizationScenario => ({
  verificationId: id, surfaceId: `method:${name}`, kind: 'authorizationScenario', lane: 'remote', family: 'method',
  proofShape, actor, expectedPolicy, bindingAliases: bindings, allowedBaselineIds: baselines,
  policyDenialCodes: codes, mutation: 'none', ...(subjectActor ? { subjectActor } : {}),
});
const settingsLearner = 'authz.method.own-settings.learnerA';
const adminList = 'authz.method.audit-list.admin';
const progressOwn = (actor: typeof ordinary[number]) => `authz.publication.progress-own.${actor}`;

// Non-secret intent for the selected P1-D8 cases and their required baselines.
// No target-specific IDs, credentials, canary values or expectations come from
// protected fixture configuration. Broader Phase 2/3 coverage stays explicit.
const definitions: readonly AuditAuthorizationScenario[] = [
  method(settingsLearner, 'getOwnOpenRouterSettings', 'learnerA', 'allow', 'own-settings-v1'),
  method('authz.method.own-settings.teacherB', 'getOwnOpenRouterSettings', 'teacherB', 'allow', 'own-settings-v1'),
  method('authz.method.own-settings.anonymous', 'getOwnOpenRouterSettings', 'anonymous', 'deny', 'own-settings-v1', [], [settingsLearner], ['401']),
  method('authz.method.self-performance.learnerB', 'getStudentPerformanceByIdAndTDFIdFromHistory', 'learnerB', 'allow',
    'self-performance-v1', ['lesson.progress', 'performance.learnerB'], [], [], 'learnerB'),
  method('authz.method.foreign-performance.learnerA', 'getStudentPerformanceByIdAndTDFIdFromHistory', 'learnerA', 'deny',
    'self-performance-v1', ['lesson.progress'], ['authz.method.self-performance.learnerB'], ['403'], 'learnerB'),
  method(adminList, 'admin.securityAudits.list', 'admin', 'allow', 'audit-summary-v2'),
  ...(['learnerB', 'teacherA'] as const).map(actor => method(`authz.method.audit-list.${actor}`,
    'admin.securityAudits.list', actor, 'deny', 'audit-summary-v2', [], [adminList], ['not-authorized'])),
  ...ordinary.map((actor): AuditAuthorizationScenario => ({
    verificationId: progressOwn(actor), surfaceId: 'publication:userExperimentState',
    kind: 'authorizationScenario', lane: 'remote', family: 'publication', proofShape: 'progress-snapshot-v1',
    actor, subjectActor: actor, expectedPolicy: 'allow', allowedBaselineIds: [], policyDenialCodes: [],
    bindingAliases: ['lesson.progress', `progress.${actor}`], mutation: 'none',
  })),
  ...(['anonymous', ...ordinary] as const).map((actor): AuditAuthorizationScenario => {
    const subjectActor = actor === 'learnerA' ? 'learnerB' : 'learnerA';
    return { verificationId: `authz.publication.progress-private.${actor}`, surfaceId: 'publication:userExperimentState',
      kind: 'authorizationScenario', lane: 'remote', family: 'publication', proofShape: 'progress-snapshot-v1',
      actor, subjectActor, expectedPolicy: 'deny',
      allowedBaselineIds: actor === 'anonymous' ? [progressOwn(subjectActor)] : [progressOwn(actor), progressOwn(subjectActor)],
      policyDenialCodes: [], bindingAliases: ['lesson.progress', `progress.${subjectActor}`], mutation: 'none' };
  }),
  { verificationId: 'authz.publication.settings.admin', surfaceId: 'publication:settings', kind: 'authorizationScenario',
    lane: 'remote', family: 'publication', proofShape: 'settings-snapshot-v1', actor: 'admin', expectedPolicy: 'allow',
    allowedBaselineIds: [], policyDenialCodes: [], bindingAliases: ['settings.canary'], mutation: 'none' },
  ...([
    ['profile', 'learnerA', 'allow', '/profile', 'profile', []],
    ['profile', 'anonymous', 'deny', '/auth/login', 'signIn', ['authz.route.profile.learnerA']],
    ['courses', 'teacherA', 'allow', '/courses', 'courses', []],
    ['audit', 'admin', 'allow', '/admin/security-audits', 'adminSecurityAuditsV2', []],
    ['audit', 'learnerB', 'deny', '/home', 'home', ['authz.route.audit.admin']],
    ['audit', 'teacherB', 'deny', '/home', 'home', ['authz.route.audit.admin']],
  ] as const).map(([id, actor, expectedPolicy, expectedPath, template, baselines]): AuditAuthorizationScenario => ({
    verificationId: `authz.route.${id}.${actor}`, surfaceId: `management-route:${id === 'audit' ? '/admin/security-audits' : '/' + id}`,
    kind: 'authorizationScenario', lane: 'remote', family: 'route', proofShape: 'rendered-route-v1',
    actor, expectedPolicy, expectedPath, template, allowedBaselineIds: baselines, policyDenialCodes: [], bindingAliases: [], mutation: 'none',
  })),
  ...([
    ['history', 'learnerA', 'allow', 'learnerA', []],
    ['history', 'anonymous', 'deny', 'learnerA', ['authz.download.history.learnerA']],
    ['history-replay', 'learnerA', 'deny', 'learnerA', ['authz.download.history.learnerA']],
    ['audit', 'admin', 'allow', 'admin', []],
    ['audit', 'teacherA', 'deny', 'admin', ['authz.download.audit.admin']],
  ] as const).map(([id, actor, expectedPolicy, subjectActor, baselines]): AuditAuthorizationScenario => ({
    verificationId: `authz.download.${id}.${actor}`,
    surfaceId: `http:${id.startsWith('history') ? '/data-download/own-history' : '/admin/security-audits/download'}`,
    kind: 'authorizationScenario', lane: 'remote', family: 'download', proofShape: 'single-use-download-v1',
    actor, subjectActor, expectedPolicy, allowedBaselineIds: baselines, policyDenialCodes: [],
    bindingAliases: id.startsWith('history') ? ['history.learnerA'] : ['audit.report'], mutation: 'single-use-capability',
  })),
];

const entries = definitions.map(entry => Object.freeze({ ...entry,
  allowedBaselineIds: Object.freeze([...entry.allowedBaselineIds]), policyDenialCodes: Object.freeze([...entry.policyDenialCodes]),
  bindingAliases: Object.freeze([...entry.bindingAliases]),
}));
const byId = new Map(entries.map(entry => [entry.verificationId, entry]));
if (byId.size !== entries.length) throw new Error('Duplicate audit verification ID');
for (const entry of entries) {
  if (!/^[a-z][a-zA-Z0-9.:-]{2,127}$/.test(entry.verificationId)
    || entry.expectedPolicy === 'deny' && entry.allowedBaselineIds.length === 0
    || entry.expectedPolicy === 'allow' && entry.allowedBaselineIds.length !== 0) throw new Error('Invalid source verification intent');
  for (const baseline of entry.allowedBaselineIds) {
    const allowed = byId.get(baseline);
    if (allowed?.expectedPolicy !== 'allow' || allowed.family !== entry.family || allowed.surfaceId !== entry.surfaceId) {
      throw new Error('Missing same-surface allowed verification baseline');
    }
  }
}
export type HttpIntegrationVerification = Readonly<{
  kind: 'integrationTest';
  lane: 'meteor';
  verificationId: string;
  suite: string;
  cases: readonly [string, ...string[]];
  expectedOutcome: 'pass';
  mutation: 'none';
}>;

export type PublicHttpVerification = Readonly<{
  endpoints: readonly (HttpIntegrationVerification & {
    method: 'GET' | 'HEAD';
    surfaceId: `http:${'get' | 'head'}:/${string}`;
  })[];
  fallthrough: HttpIntegrationVerification & { surfaceId: `middleware:${string}` };
}>;

const healthSuite = '/health mounted HTTP behavior';
const healthTest = { kind: 'integrationTest', lane: 'meteor', suite: healthSuite, expectedOutcome: 'pass', mutation: 'none' } as const;
export const HTTP_HEALTH_VERIFICATIONS = Object.freeze({
  endpoints: Object.freeze([
    Object.freeze({ ...healthTest, verificationId: 'http.health.get', method: 'GET', surfaceId: 'http:get:/health',
      cases: Object.freeze(['serves health for GET through the mounted path and its suffixes'] as const) }),
    Object.freeze({ ...healthTest, verificationId: 'http.health.head', method: 'HEAD', surfaceId: 'http:head:/health',
      cases: Object.freeze(['preserves HEAD without a response body'] as const) }),
  ]),
  fallthrough: Object.freeze({ ...healthTest, verificationId: 'http.health.fallthrough', surfaceId: 'middleware:health',
    cases: Object.freeze(['leaves an unsupported method to the application default handler',
      'leaves an adjacent prefix to the application rather than serving health JSON'] as const) }),
} satisfies PublicHttpVerification);

const auditHttpTest = { kind: 'integrationTest', lane: 'meteor', expectedOutcome: 'pass', mutation: 'none' } as const;
const auditHttpListenerCase = 'serves the V2 HTTP boundary and excludes V1 on the actual application listener';
export const HTTP_AUDIT_VERIFICATIONS = Object.freeze({
  ingest: Object.freeze({ ...auditHttpTest, verificationId: 'http.audit.v2-ingest',
    surfaceId: 'http:post:/internal/security-audits/v2',
    suite: 'activated V2 audit application boundaries', cases: Object.freeze([auditHttpListenerCase] as const) }),
  download: Object.freeze({ ...auditHttpTest, verificationId: 'http.audit.download',
    surfaceId: 'http:get:/admin/security-audits/download/:token/:filename',
    suite: 'activated V2 audit application boundaries', cases: Object.freeze([auditHttpListenerCase,
      'serves V2 through registered admin methods without reading or changing retained V1 records'] as const) }),
});

const fileHttpTest = { kind: 'integrationTest', lane: 'meteor', suite: 'application HTTP registration',
  expectedOutcome: 'pass', mutation: 'none' } as const;
const capabilityResponses = Object.freeze(['retains download method and invalid-capability responses at the mounted paths'] as const);
const assetResponses = Object.freeze(['preserves the retired upload response on both asset mounts',
  'preserves existing asset URLs and keeps private files behind both mounts'] as const);
export const HTTP_FILE_VERIFICATIONS = Object.freeze({
  backup: Object.freeze({ ...fileHttpTest, verificationId: 'http.backup.download',
    surfaceId: 'http:get:/admin/backups/download/:token/:filename', cases: capabilityResponses }),
  history: Object.freeze({ ...fileHttpTest, verificationId: 'http.history.own-download',
    surfaceId: 'http:get:/data-download/own-history/:token/:filename', cases: capabilityResponses }),
  ownedHistory: Object.freeze({ ...fileHttpTest, verificationId: 'http.history.owned-download',
    surfaceId: 'http:get:/data-download/owned-history/:token/:filename', cases: capabilityResponses }),
  asset: Object.freeze({ ...fileHttpTest, verificationId: 'http.assets.dynamic-mount',
    surfaceId: 'middleware:dynamic-assets', cases: assetResponses }),
  cdn: Object.freeze({ ...fileHttpTest, verificationId: 'http.assets.cdn-mount',
    surfaceId: 'middleware:cdn-public-assets', cases: Object.freeze([...assetResponses,
      'routes a canonical missing CDN asset through the application raw handler'] as const) }),
});

const middlewareTest = { kind: 'integrationTest', lane: 'meteor', suite: 'application HTTP registration',
  expectedOutcome: 'pass', mutation: 'none' } as const;
export const HTTP_FRAMEWORK_RUNTIME_CONFIG_VERIFICATION = Object.freeze({
  ...middlewareTest,
  surfaceId: 'framework:webapp:external-runtime-config',
  verificationId: 'http.meteor.external-runtime-config',
  cases: Object.freeze(['binds the Meteor runtime configuration as a same-origin external script'] as const),
});
const defaultPublicationTest = { kind: 'integrationTest', lane: 'meteor', suite: 'application default publications',
  expectedOutcome: 'pass', mutation: 'none' } as const;
export const DEFAULT_PUBLICATION_VERIFICATIONS = Object.freeze({
  account: Object.freeze({ ...defaultPublicationTest, surfaceId: 'publication:default:account-self',
    verificationId: 'publication.default.account-self',
    cases: Object.freeze(['automatically publishes only the current account projection'] as const) }),
  roles: Object.freeze({ ...defaultPublicationTest, surfaceId: 'publication:default:role-assignments-self',
    verificationId: 'publication.default.role-assignments-self',
    cases: Object.freeze(['automatically publishes only the current role assignments'] as const) }),
});
const directWriteTest = { kind: 'integrationTest', lane: 'meteor', suite: 'direct collection write rules',
  expectedOutcome: 'pass', mutation: 'none' } as const;
export const DIRECT_WRITE_VERIFICATIONS = Object.freeze({
  settings: Object.freeze({ ...directWriteTest, surfaceId: 'collection:dynaminc_settings:deny:update', verificationId: 'collection.settings.deny-update',
    cases: Object.freeze(['requires the server methods for administrator settings changes'] as const) }),
  profile: Object.freeze({ ...directWriteTest, surfaceId: 'collection:users:deny:update', verificationId: 'collection.users.deny-update',
    cases: Object.freeze(['keeps direct account updates denied synchronously'] as const) }),
  progress: Object.freeze({ ...directWriteTest, surfaceId: 'collection:global_experiment_state:deny:insert-update', verificationId: 'collection.progress.deny-write',
    cases: Object.freeze(['rejects direct progress inserts and updates and preserves saved progress'] as const) }),
});
const brandingPublications = 'preserves public branding cursors and their exact setting keys';
const selfPublications = 'preserves authenticated dashboard, runtime setting, and audio scope';
const adminPublications = 'preserves administrator-only snapshots, cursor scope and readiness';
function namedPublicationVerification<N extends string>(
  name: N, observedCase: string, suite = 'named application publications', ...additionalCases: string[]
) {
  return Object.freeze({
    ...defaultPublicationTest,
    suite,
    surfaceId: `publication:${name}` as const,
    verificationId: `publication.named.${name}` as const,
    cases: Object.freeze([observedCase, ...additionalCases] as const),
  });
}
export const NAMED_PUBLICATION_VERIFICATIONS = Object.freeze({
  'files.assets.all': namedPublicationVerification('files.assets.all', 'limits asset metadata to the eligible files and stimulus sets', 'named application publications', 'delivers course-only asset metadata from a current assignment and ignores old account IDs'),
  assets: namedPublicationVerification('assets', 'limits asset metadata to the eligible files and stimulus sets'),
  currentTdf: namedPublicationVerification('currentTdf', 'publishes only a single accessible runtime lesson'),
  tdfForEdit: namedPublicationVerification('tdfForEdit', 'distinguishes owner editing from shared upload details'),
  tdfForContentUploadDetails: namedPublicationVerification('tdfForContentUploadDetails', 'distinguishes owner editing from shared upload details'),
  tdfByExperimentTarget: namedPublicationVerification('tdfByExperimentTarget', 'limits experiment lessons to a permitted target and omits runtime secrets'),
  theme: namedPublicationVerification('theme', brandingPublications),
  themeLibrary: namedPublicationVerification('themeLibrary', brandingPublications),
  deploymentBrandProfile: namedPublicationVerification('deploymentBrandProfile', brandingPublications),
  dashboardCache: namedPublicationVerification('dashboardCache', selfPublications),
  clientRuntimeSettings: namedPublicationVerification('clientRuntimeSettings', selfPublications),
  sparcRetrievalEmbeddings: namedPublicationVerification('sparcRetrievalEmbeddings', 'checks SPARC lesson access before parsing a retrieval category'),
  contentUploadMetadata: namedPublicationVerification('contentUploadMetadata', 'rejects anonymous upload metadata and publishes only authorized roots'),
  userAudioSettings: namedPublicationVerification('userAudioSettings', selfPublications),
  userExperimentState: namedPublicationVerification('userExperimentState',
    'finishes logged-out subscriptions without a progress cursor',
    'approved progress-privacy selection on the registered Meteor publication',
    'resumes a passwordless study session and scopes progress on its real DDP connection'),
  settings: namedPublicationVerification('settings', adminPublications),
  filteredUsers: namedPublicationVerification('filteredUsers', adminPublications),
  filteredUsersCount: namedPublicationVerification('filteredUsersCount', adminPublications),
  userAdminDashboardUsage: namedPublicationVerification('userAdminDashboardUsage', adminPublications),
});
const samlMethodCases = Object.freeze(['retains SAML method handling on all three exact paths'] as const);
const socialPreviewCases = Object.freeze(['serves social crawler metadata and lets an ordinary request reach the app'] as const);
export const HTTP_MIDDLEWARE_VERIFICATIONS = Object.freeze({
  saml: Object.freeze([
    Object.freeze({ ...middlewareTest, verificationId: 'http.saml.login', surfaceId: 'http:get:/auth/saml/memphis/login', cases: samlMethodCases }),
    Object.freeze({ ...middlewareTest, verificationId: 'http.saml.acs', surfaceId: 'http:post:/auth/saml/memphis/acs', cases: samlMethodCases }),
    Object.freeze({ ...middlewareTest, verificationId: 'http.saml.metadata', surfaceId: 'http:get:/auth/saml/memphis/metadata', cases: samlMethodCases }),
  ] as const),
  pwa: Object.freeze([Object.freeze({ ...middlewareTest, verificationId: 'http.pwa.manifest', surfaceId: 'middleware:pwa-assets',
    cases: Object.freeze(['serves the public app manifest and leaves unsupported methods to Meteor'] as const) })] as const),
  socialPreview: Object.freeze([Object.freeze({ ...middlewareTest, verificationId: 'http.social-preview.dispatch',
    surfaceId: 'middleware:social-preview', cases: socialPreviewCases })] as const),
  headers: Object.freeze([Object.freeze({ ...middlewareTest, verificationId: 'http.response-headers.public-page',
    surfaceId: 'middleware:security-headers', cases: socialPreviewCases })] as const),
});

function filesDdpVerification<N extends string>(name: N, ...cases: [string, ...string[]]) {
  return Object.freeze({
    ...middlewareTest, suite: 'maintained upload package ownership',
    verificationId: `framework.ostrio-files.assets.${name}` as const,
    surfaceId: `framework:ostrio-files:assets-${name}` as const,
    cases: Object.freeze(['binds all generated Assets method handlers to the package instance', ...cases] as const),
  });
}

export const FILES_DDP_VERIFICATIONS = Object.freeze({
  _Start: filesDdpVerification('start', 'ignores forged ownership and denies anonymous start'),
  _Write: filesDdpVerification('write',
    'rejects cross-user, administrator and anonymous write/finish/abort without changing records or bytes',
    'resumes from persisted ownership and prevents abort or identifier reuse after completion'),
  _Abort: filesDdpVerification('abort',
    'rejects cross-user, administrator and anonymous write/finish/abort without changing records or bytes',
    'resumes from persisted ownership and prevents abort or identifier reuse after completion'),
  _Remove: filesDdpVerification('remove', 'keeps client removal disabled on the registered Assets collection'),
});

function auditAdminMethodVerification<N extends string>(operation: N) {
  const method = `admin.securityAudits.${operation}` as const;
  return Object.freeze({
    ...middlewareTest, suite: 'activated V2 audit application boundaries',
    verificationId: `method.admin-security-audits.${operation}` as const,
    surfaceId: `method:${method}` as const,
    method,
    cases: Object.freeze([
      'binds the three audit descriptors to the registered Meteor handlers',
      `keeps the registered ${method} admin guarded for anonymous`,
      `keeps the registered ${method} admin guarded for synthetic-missing-audit-learner`,
      `keeps the registered ${method} admin guarded for synthetic-missing-audit-teacher`,
      'serves V2 through registered admin methods without reading or changing retained V1 records',
    ]),
  });
}

export const AUDIT_ADMIN_METHOD_VERIFICATIONS = Object.freeze({
  'admin.securityAudits.list': auditAdminMethodVerification('list'),
  'admin.securityAudits.get': auditAdminMethodVerification('get'),
  'admin.securityAudits.downloadToken': auditAdminMethodVerification('downloadToken'),
});

export const DEPLOYMENT_READINESS_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'deploymentReadinessMethods',
  verificationId: 'method.deployment-readiness',
  surfaceId: 'method:deploymentReadiness',
  method: 'deploymentReadiness',
  cases: Object.freeze([
    'binds the registered readiness method and preserves its distinct denials',
    'returns passing checks for a valid session-storage self-hosted configuration',
  ]),
} as const);

function backupMethodVerification<N extends string>(operation: N) {
  const method = `admin.backups.${operation}` as const;
  return Object.freeze({
    ...middlewareTest, suite: 'backupMethods',
    verificationId: `method.admin-backups.${operation}` as const,
    surfaceId: `method:${method}` as const,
    method,
    cases: Object.freeze([
      'binds all backup methods and authorizes before validation or unblocking',
      operation === 'restore'
        ? 'requires explicit restore confirmation before guarded restore work starts'
        : 'preserves authorized operations on a disposable backup archive',
    ]),
  });
}

export const BACKUP_METHOD_VERIFICATIONS = Object.freeze({
  'admin.backups.config': backupMethodVerification('config'),
  'admin.backups.list': backupMethodVerification('list'),
  'admin.backups.get': backupMethodVerification('get'),
  'admin.backups.create': backupMethodVerification('create'),
  'admin.backups.verify': backupMethodVerification('verify'),
  'admin.backups.downloadToken': backupMethodVerification('downloadToken'),
  'admin.backups.delete': backupMethodVerification('delete'),
  'admin.backups.restore': backupMethodVerification('restore'),
});

function brandProfileMethodVerification<N extends string>(method: N) {
  return Object.freeze({
    ...middlewareTest, suite: 'deployment brand profile methods',
    verificationId: `method.brand-profile.${method}` as const,
    surfaceId: `method:${method}` as const,
    method,
    cases: Object.freeze([
      'binds the installed handlers and denies callers without administrator access',
      'preserves the authorized brand draft read, export and import validation',
    ]),
  });
}

export const BRAND_PROFILE_METHOD_VERIFICATIONS = Object.freeze({
  getDeploymentBrandProfileDraft: brandProfileMethodVerification('getDeploymentBrandProfileDraft'),
  saveDeploymentBrandProfileDraft: brandProfileMethodVerification('saveDeploymentBrandProfileDraft'),
  publishDeploymentBrandProfile: brandProfileMethodVerification('publishDeploymentBrandProfile'),
  importDeploymentBrandProfileDraft: brandProfileMethodVerification('importDeploymentBrandProfileDraft'),
  exportDeploymentBrandProfile: brandProfileMethodVerification('exportDeploymentBrandProfile'),
});

export const FILENAME_TDF_MIGRATION_VERIFICATION = Object.freeze({
  ...middlewareTest,
  suite: 'filename TDF reference migration',
  verificationId: 'method.filename-tdf-reference-migration',
  surfaceId: 'method:migrateFilenameTdfReferences',
  method: 'migrateFilenameTdfReferences',
  cases: Object.freeze([
    'binds the installed method and preserves authorization before option validation',
    'keeps authentication and admin authorization at the method boundary',
    'dry-runs, fingerprints, and idempotently writes unambiguous currentTdfId values',
    'requires reviewed fingerprints and stops on write conflicts',
    'retains bounded log pagination and the log-only report contract',
  ]),
} as const);

function conditionCountVerification<N extends string>(method: N, deniedCase: string) {
  return Object.freeze({
    ...middlewareTest,
    suite: 'condition count method authorization',
    method,
    surfaceId: `method:${method}` as const,
    verificationId: `method.study-condition-count.${method}` as const,
    cases: Object.freeze(['binds all count methods to their installed study policies', deniedCase]),
  });
}

export const CONDITION_COUNT_VERIFICATIONS = Object.freeze({
  updateTdfConditionCounts: conditionCountVerification('updateTdfConditionCounts', 'denies unauthenticated condition count updates'),
  incrementTdfConditionCount: conditionCountVerification('incrementTdfConditionCount', 'requires the exact assigned condition for a later block milestone'),
  resetTdfConditionCounts: conditionCountVerification('resetTdfConditionCounts', 'denies condition count resets by unrelated users'),
});

function historyDownloadMethodVerification<N extends string>(method: N, suite: string, ...cases: [string, ...string[]]) {
  return Object.freeze({
    ...middlewareTest, suite, method, surfaceId: `method:${method}` as const,
    verificationId: `method.history-download.${method}` as const, cases: Object.freeze(cases),
  });
}

export const HISTORY_DOWNLOAD_METHOD_VERIFICATIONS = Object.freeze({
  downloadDataByTeacher: historyDownloadMethodVerification('downloadDataByTeacher', 'instructor export method capabilities',
    'returns an all-owned streaming capability using only projected lesson IDs',
    'rejects unsigned and cross-user all-owned requests before reading lesson IDs'),
  downloadOwnHistoryAcrossTdfs: historyDownloadMethodVerification('downloadOwnHistoryAcrossTdfs', 'history export runtime bindings',
    'binds the four history export methods and preserves missing-session denials'),
  downloadDataByClass: historyDownloadMethodVerification('downloadDataByClass', 'history export runtime bindings',
    'keeps class-based export disabled for signed-in callers'),
  downloadDataById: historyDownloadMethodVerification('downloadDataById', 'instructor export method capabilities',
    'returns a single-lesson streaming capability while keeping ownership enforcement'),
});

function telemetryMethodVerification<N extends string>(method: N, suite: string, ...cases: [string, ...string[]]) {
  return Object.freeze({
    ...middlewareTest, suite, method, surfaceId: `method:${method}` as const,
    verificationId: `method.diagnostic-telemetry.${method}` as const, cases: Object.freeze(cases),
  });
}

export const WARNING_METHOD_VERIFICATIONS = Object.freeze({
  reportRecoverableWarning: telemetryMethodVerification('reportRecoverableWarning', 'recoverable warning log methods',
    'binds both installed warning methods to their existing authorization',
    'accepts bounded authenticated reports and derives identity and time on the server',
    'skips stored diagnostics for private participants before validating the report',
    'rejects anonymous, unknown, oversized and text-bearing reports'),
  getRecoverableWarnings: telemetryMethodVerification('getRecoverableWarnings', 'recoverable warning log methods',
    'binds both installed warning methods to their existing authorization',
    'denies non-admin reads before querying and uses bounded chronological cursor pages'),
});

const simulationSuite = 'simulation telemetry runtime bindings';
const simulationBindingCase = 'binds the five installed methods and denies unsigned telemetry operations';
export const SIMULATION_METHOD_VERIFICATIONS = Object.freeze({
  startSimulationResearchAttempt: telemetryMethodVerification('startSimulationResearchAttempt', simulationSuite, simulationBindingCase),
  interruptSimulationResearchActivity: telemetryMethodVerification('interruptSimulationResearchActivity', simulationSuite, simulationBindingCase),
  ingestSimulationResearchBatch: telemetryMethodVerification('ingestSimulationResearchBatch', simulationSuite, simulationBindingCase,
    'preserves owner checks in the installed attempt operations'),
  endSimulationResearchAttempt: telemetryMethodVerification('endSimulationResearchAttempt', simulationSuite, simulationBindingCase,
    'preserves owner checks in the installed attempt operations'),
  exportSimulationResearchTrace: telemetryMethodVerification('exportSimulationResearchTrace', simulationSuite, simulationBindingCase,
    'preserves administrator authorization for the installed trace export'),
});

function experimentEntryVerification<N extends string>(method: N, ...cases: [string, ...string[]]) {
  return Object.freeze({
    ...middlewareTest, suite: 'experiment entry runtime bindings', method, surfaceId: `method:${method}` as const,
    verificationId: `method.experiment-entry.${method}` as const, cases: Object.freeze(cases),
  });
}

const experimentBindingCase = 'binds the four installed experiment entries to their existing admission and rate-limit rules';
const experimentDenialCase = 'retains experiment admission errors and signed-in public demo denial';
export const EXPERIMENT_ENTRY_VERIFICATIONS = Object.freeze({
  provisionExperimentUser: experimentEntryVerification('provisionExperimentUser', experimentBindingCase),
  enterCredentialedExperiment: experimentEntryVerification('enterCredentialedExperiment', experimentBindingCase, experimentDenialCase),
  reconnectExperimentParticipant: experimentEntryVerification('reconnectExperimentParticipant', experimentBindingCase, experimentDenialCase),
  startPublicDemo: experimentEntryVerification('startPublicDemo', experimentBindingCase, experimentDenialCase),
});

function prolificMethodVerification<N extends string>(method: N) {
  return Object.freeze({
    ...middlewareTest, suite: 'Prolific runtime bindings', method, surfaceId: `method:${method}` as const,
    verificationId: `method.prolific.${method}` as const,
    cases: Object.freeze(['binds the installed Prolific methods and preserves their access boundaries']),
  });
}

export const PROLIFIC_METHOD_VERIFICATIONS = Object.freeze({
  startProlificParticipation: prolificMethodVerification('startProlificParticipation'),
  resumeProlificParticipation: prolificMethodVerification('resumeProlificParticipation'),
  completeProlificParticipation: prolificMethodVerification('completeProlificParticipation'),
  prolificConnect: prolificMethodVerification('prolificConnect'),
  prolificCreateTestParticipant: prolificMethodVerification('prolificCreateTestParticipant'),
  prolificPrepareTestStudy: prolificMethodVerification('prolificPrepareTestStudy'),
  prolificExecuteTestStudy: prolificMethodVerification('prolificExecuteTestStudy'),
  prolificTestSetupStatus: prolificMethodVerification('prolificTestSetupStatus'),
  prolificList: prolificMethodVerification('prolificList'),
  prolificBindStudy: prolificMethodVerification('prolificBindStudy'),
  prolificDashboard: prolificMethodVerification('prolificDashboard'),
  prolificMessages: prolificMethodVerification('prolificMessages'),
  prolificPrepareOperation: prolificMethodVerification('prolificPrepareOperation'),
  prolificConfirmOperation: prolificMethodVerification('prolificConfirmOperation'),
  prolificReviewOperation: prolificMethodVerification('prolificReviewOperation'),
  prolificRetryReminder: prolificMethodVerification('prolificRetryReminder'),
});

export const LESSON_SHARING_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'atomic lesson sharing', method: 'assignAccessors', surfaceId: 'method:assignAccessors',
  verificationId: 'method.lesson-sharing.assignAccessors',
  cases: Object.freeze(['rolls back a late child failure and commits owner grants and revocations together',
    'rejects missing new recipients atomically and allows retaining or revoking stale entries']),
} as const);

function courseReadVerification<N extends string>(method: N, observedCase: string) {
  return Object.freeze({ ...middlewareTest, suite: 'course method authorization',
    method, surfaceId: `method:${method}` as const, verificationId: `method.course-read.${method}` as const,
    cases: Object.freeze([observedCase]) });
}
function courseExceptionVerification<N extends string>(method: N) {
  return Object.freeze({ ...middlewareTest, suite: 'course method authorization', method,
    surfaceId: `method:${method}` as const, verificationId: `method.course-exception.${method}` as const,
    cases: Object.freeze(['requires current course enrollment for each due-date exception edit']) });
}
export const COURSE_EXCEPTION_VERIFICATIONS = Object.freeze({
  addUserDueDateException: courseExceptionVerification('addUserDueDateException'),
  removeUserDueDateException: courseExceptionVerification('removeUserDueDateException'),
});
export const CLASS_PERFORMANCE_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'course method authorization', method: 'getClassPerformanceByTDF',
  surfaceId: 'method:getClassPerformanceByTDF', verificationId: 'method.course.class-performance',
  cases: Object.freeze(['counts all practice for enrolled learners only on assigned lessons']),
} as const);

export const COURSE_DELETE_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'course method authorization', method: 'deleteCourse', surfaceId: 'method:deleteCourse',
  verificationId: 'method.course.delete', cases: Object.freeze(['binds course deletion to its owner or an administrator']),
} as const);
export const COURSE_JOIN_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'course method authorization', method: 'addUserToTeachersClass',
  surfaceId: 'method:addUserToTeachersClass', verificationId: 'method.course.join',
  cases: Object.freeze(['returns a successful section join when the confirmation has no recipient']),
} as const);
export const COURSE_CREATE_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'course method authorization', method: 'addCourse',
  surfaceId: 'method:addCourse', verificationId: 'method.course.create',
  cases: Object.freeze(['limits new course owners to existing teachers and administrators']),
} as const);
export const COURSE_EDIT_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'course method authorization', method: 'editCourse',
  surfaceId: 'method:editCourse', verificationId: 'method.course.edit',
  cases: Object.freeze(['renames sections in place and deletes only explicitly selected sections', 'limits new course owners to existing teachers and administrators']),
} as const);
export const COURSE_ASSIGNMENT_SAVE_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'course method authorization', method: 'saveCourseAssignments',
  surfaceId: 'method:saveCourseAssignments', verificationId: 'method.course-assignment.save',
  cases: Object.freeze(['preserves assigned lessons after sharing ends and checks every new use']),
} as const);
export const COURSE_READ_VERIFICATIONS = Object.freeze({
  getProgressiveAssignmentLaunch: courseReadVerification('getProgressiveAssignmentLaunch', 'requires an available progressive assignment before returning lesson content'),
  getCourseAssignmentEditorSnapshot: courseReadVerification('getCourseAssignmentEditorSnapshot', 'preserves assigned lessons after sharing ends and checks every new use'),
  getAllCourseSections: courseReadVerification('getAllCourseSections', 'limits learner teacher discovery to public or enrolled sections'),
  getAllTeachers: courseReadVerification('getAllTeachers', 'limits learner teacher discovery to public or enrolled sections'),
  getLearnerCoursesSnapshot: courseReadVerification('getLearnerCoursesSnapshot', 'binds the learner course snapshot to the current account session'),
  getTdfAssignmentsByCourseIdMap: courseReadVerification('getTdfAssignmentsByCourseIdMap', 'binds instructor course reads to the instructor or an administrator'),
  getAllCoursesForInstructor: courseReadVerification('getAllCoursesForInstructor', 'binds instructor course reads to the instructor or an administrator'),
});

export const SSO_PROFILE_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'server auth and session methods', method: 'populateSSOProfile', surfaceId: 'method:populateSSOProfile',
  verificationId: 'method.sso-profile.populate', cases: Object.freeze([
    'keeps the SSO credential in provider storage and logs canonical email changes',
    'binds SSO profile completion to the account holder or an administrator',
  ]),
} as const);

export const AUDIO_SAVE_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'personal audio settings', method: 'saveAudioSettings', surfaceId: 'method:saveAudioSettings',
  verificationId: 'method.personal-audio.save', cases: Object.freeze(['validates the whole patch and preserves omitted personal audio choices']),
} as const);

export const PREFERENCE_VERIFICATIONS = Object.freeze((['getUserPreference', 'setUserPreference'] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'dashboard preference', method, surfaceId: `method:${method}` as const,
  verificationId: `method.dashboard-preference.${method}` as const,
  cases: Object.freeze(['persists only the signed-in user practice statistics boolean']),
})));

export const STUDY_WAIT_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'Prolific composed account and completion methods', method: 'setLockoutTimeStamp', surfaceId: 'method:setLockoutTimeStamp',
  verificationId: 'method.study-wait.start-or-resume',
  cases: Object.freeze(['issues resume tokens for one immutable participation and denies ordinary provisioning of its account']),
} as const);

export const LESSON_ACCESS_VERIFICATIONS = Object.freeze({
  list: Object.freeze({ ...middlewareTest, suite: 'lesson access bindings', method: 'getAccessableTDFSForUser', surfaceId: 'method:getAccessableTDFSForUser',
    verificationId: 'method.lesson-access.own-list', cases: Object.freeze(['lists only owned lessons and transfers ownership only for the owner']) } as const),
  transfer: Object.freeze({ ...middlewareTest, suite: 'lesson access bindings', method: 'transferDataOwnership', surfaceId: 'method:transferDataOwnership',
    verificationId: 'method.lesson-access.transfer', cases: Object.freeze(['lists only owned lessons and transfers ownership only for the owner']) } as const),
});

export const LEARNER_PROGRESS_VERIFICATIONS = Object.freeze(([
  'getPracticeDashboardSnapshot',
  'ensureDashboardCacheCurrent',
  'resetOwnLessonProgress',
  'getLearnerAnalyticsOverview',
  'getLearnerLessonAnalyticsSource',
  'getLearnerLessonAnalyticsHistoryPage',
  'getLearnerTdfConfig',
  'saveLearnerTdfConfig',
  'getAdaptiveOutcomeRows',
  'getStimulusCrowdStatsForDeck',
  'createExperimentState',
  'updateExperimentState',
  'insertHistory',
] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'approved progress-privacy selection on the registered Meteor publication', method, surfaceId: `method:${method}` as const,
  verificationId: `method.learner-progress.${method}` as const,
  cases: Object.freeze(['observes the installed dashboard and study-specific progress handlers', 'resumes a passwordless study session and scopes progress on its real DDP connection']),
})));

export const PROGRESS_READ_VERIFICATIONS = Object.freeze(([
  'getStudentPerformanceByIdAndTDFIdFromHistory',
  'getStudentPerformanceForUnitFromHistory',
  'getAssessmentCompletedTrialCountFromHistory',
  'getVideoCompletedCheckpointQuestionCountFromHistory',
  'getLearningHistoryForUnit',
  'getSparcHistoryForUnit',
  'getHiddenStimulusKCsFromHistory',
  'getExperimentState',
] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'approved progress-privacy selection on the registered Meteor publication', method, surfaceId: `method:${method}` as const,
  verificationId: `method.progress-read.${method}` as const,
  cases: Object.freeze(['binds each progress read to the signed-in learner', 'resumes a passwordless study session and scopes progress on its real DDP connection']),
})));

export const RUNTIME_LESSON_VERIFICATIONS = Object.freeze(([
  ['getTdfById', 'allows owner public TDF lookup by id'],
  ['getTdfByExperimentTarget', 'returns the full experiment TDF for an authenticated authorized caller'],
  ['getStimuliSetById', 'allows owner public stimulus lookup by stimuliSetId'],
  ['getResponseKCMapForTdf', 'checks the installed lesson reads and rejects anonymous response mappings'],
] as const).map(([method, test]) => Object.freeze({
  ...middlewareTest, suite: 'public TDF and stimulus method authorization', method, surfaceId: `method:${method}` as const,
  verificationId: `method.runtime-lesson.${method}` as const, cases: Object.freeze([test]),
})));

export const SPARC_LESSON_VERIFICATIONS = Object.freeze(([
  'getSparcAdministrativeRemovals',
  'getSparcPromptImage',
  'lookupSparcPrimitive',
  'publishSparcPrimitive',
  'generateSparcPromptImage',
  'resolveSparcVisualSupport',
] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'public TDF and stimulus method authorization', method, surfaceId: `method:${method}` as const,
  verificationId: `method.sparc-lesson.${method}` as const,
  cases: Object.freeze(['requires access to the selected SPARC lesson before library or image operations']),
})));

export const PACKAGE_UPLOAD_VERIFICATIONS = Object.freeze(([
  'processPackageUpload', 'confirmPackageUpload', 'cancelPackageUpload',
] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'package upload identity confirmation integration',
  method, surfaceId: `method:${method}` as const,
  verificationId: `method.package-upload.${method}` as const,
  cases: Object.freeze(['binds package upload and confirmation to stored archives and owned plans']),
})));

export const LESSON_EDIT_VERIFICATIONS = Object.freeze((['saveTdfContent', 'saveTdfStimuli'] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'editor save shape preservation methods', method, surfaceId: `method:${method}` as const,
  verificationId: `method.content-maintenance.${method}` as const,
  cases: Object.freeze(['limits installed editor saves to users who manage the lesson']),
})));

export const GENERATED_PACKAGE_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'AI generated package ingestion policy',
  method: 'saveAiGeneratedPackageContent', surfaceId: 'method:saveAiGeneratedPackageContent',
  verificationId: 'method.package-upload.generated',
  cases: Object.freeze(['requires a signed-in creator and a stored package they can use']),
} as const);

export const OPENROUTER_CALL_VERIFICATIONS = Object.freeze(([
  'getAiContentOpenRouterCapability', 'callAiContentOpenRouterRequest', 'getOpenRouterCapability',
  'callResolvedOpenRouterJson', 'callResolvedOpenRouterEmbeddings',
] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'openRouterMethods Admin Tests configuration', method, surfaceId: `method:${method}` as const,
  verificationId: `method.provider-access.${method}` as const,
  cases: Object.freeze(['registers creator and lesson OpenRouter calls with an authenticated caller boundary']),
})));

export const PACKAGE_DOWNLOAD_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'lesson copy provider keys',
  method: 'getPackageDownloadLink', surfaceId: 'method:getPackageDownloadLink',
  verificationId: 'method.content-maintenance.getPackageDownloadLink',
  cases: Object.freeze(['keeps keys only for the source owner and isolates other authorized copies']),
} as const);

export const LESSON_COPY_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'lesson copy provider keys',
  method: 'copyTdf', surfaceId: 'method:copyTdf',
  verificationId: 'method.content-maintenance.copyTdf',
  cases: Object.freeze([
    'keeps keys only for the source owner and isolates other authorized copies',
    'keeps a copied condition family and its shared media when the original package is deleted',
  ]),
} as const);

export const PACKAGE_DELETION_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'contentMethods content upload summaries',
  method: 'deletePackageFile', surfaceId: 'method:deletePackageFile',
  verificationId: 'method.content-maintenance.deletePackageFile',
  cases: Object.freeze(['deletes only package-bound media with no surviving lesson reference']),
} as const);

export const CONTENT_MAINTENANCE_VERIFICATIONS = Object.freeze(([
  ['removeAssetById', 'Delete Selected media', 'checks single-file identity before lookup and preserves a file whose owner changes'],
  ['removeMultipleAssets', 'Delete Selected media', 'checks permissions for the entire selection before deleting anything'],
  ['setTdfUserSelect', 'contentMethods content upload summaries', 'toggles study visibility while keeping locked and previously listed conditions out of the public list'],
] as const).map(([method, suite, test]) => Object.freeze({
  ...middlewareTest, suite, method, surfaceId: `method:${method}` as const,
  verificationId: `method.content-maintenance.${method}` as const, cases: Object.freeze([test]),
})));

export const PUBLIC_READ_VERIFICATIONS = Object.freeze((['getAuthClientConfig', 'getCustomHelpPage'] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'server auth and session methods', method, surfaceId: `method:${method}` as const,
  verificationId: `method.public-read.${method}` as const,
  cases: Object.freeze(['serves only public sign-in configuration and active help with per-connection limits']),
})));

export const PUBLIC_ACCOUNT_VERIFICATIONS = Object.freeze(([
  ['signUpUser', 'writes auth.signupCompleted for native signup'],
  ['requestPasswordReset', 'does not expose a reset token in requestPasswordReset responses'],
  ['resetPasswordWithToken', 'rejects an unused aged reset token and verifies current reset, replay denial and stored-session revocation'],
  ['resendVerificationEmail', 'acknowledges unknown verification recipients and binds public account limits'],
] as const).map(([method, test]) => Object.freeze({
  ...middlewareTest, suite: 'server auth and session methods', method, surfaceId: `method:${method}` as const,
  verificationId: `method.public-account.${method}` as const, cases: Object.freeze([test]),
})));

export const ACCOUNT_SELF_VERIFICATIONS = Object.freeze(([
  'setUserLoginData',
  'recordSessionRevocation',
  'getCurrentUserRoleFlags',
  'isUserSpeechAPIKeySetup',
  'hasUserPersonalKeys',
  'saveUserSpeechAPIKey',
  'deleteUserSpeechAPIKey',
] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'server auth and session methods', method, surfaceId: `method:${method}` as const,
  verificationId: `method.account-self.${method}` as const,
  cases: Object.freeze(['keeps installed account settings and sign-in updates scoped to the caller']),
})));

export const ACCOUNT_DIAGNOSTIC_VERIFICATIONS = Object.freeze(([
  'sendUserErrorReport', 'logUserAgentAndLoginTime', 'setUserSessionId',
] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'system method authorization', method, surfaceId: `method:${method}` as const,
  verificationId: `method.account-diagnostics.${method}` as const,
  cases: Object.freeze(['records ordinary account diagnostics and suppresses private study writes']),
})));

export const PROFILE_OPERATION_VERIFICATIONS = Object.freeze(([
  'updateOwnProfile',
  'updateOwnUiLocale',
  'updateOwnSparcPersona',
  'getOwnOpenRouterSettings',
  'updateOwnOpenRouterSettings',
  'deleteOwnOpenRouterKey',
  'testOwnOpenRouterSettings',
  'getOpenRouterModelCatalog',
] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'profile methods', method, surfaceId: `method:${method}` as const,
  verificationId: `method.personal-account.${method}` as const,
  cases: Object.freeze(['checks installed personal settings and catalog access at the account boundary']),
})));

export const ADMIN_OPERATION_VERIFICATIONS = Object.freeze(([
  'initializeCustomTheme',
  'createThemeFromBase',
  'duplicateTheme',
  'importThemeFile',
  'exportThemeFile',
  'deleteTheme',
  'renameTheme',
  'setActiveTheme',
  'setCustomHelpPage',
  'removeCustomHelpPage',
  'getServerStatus',
  'setVerbosity',
  'setClientVerbosity',
  'getAdminTestSparcCompoundInterestSource',
  'getAdminTestSparcCompoundInterestSources',
  'getAdminApiKeyAlternativeMetadata',
  'saveAdminApiKeyAlternative',
  'deleteAdminApiKeyAlternative',
  'userAdminDeleteUser',
  'insertNewUsers',
  'userAdminNewsEmailRecipients',
  'getAdminTestOpenRouterCapability',
  'callAdminTestResolvedOpenRouterJson',
  'callAdminTestOpenRouterRequest',
  'setCustomThemeProperty',
  'refreshUserAdminUsageCaches',
  'getSparcVideoCatalogTargets',
  'prepareSparcVideoCatalogTarget',
  'saveSparcVideoCatalogPassages',
  'deleteSparcInstructionalComponent',
  'getSparcLibraryClusters',
  'listSparcInstructionalComponents',
  'replaceSparcLibraryImage',
  'reviseSparcPrimitive',
] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'adminMethods', method, surfaceId: `method:${method}` as const,
  verificationId: `method.admin.${method}` as const,
  cases: Object.freeze(method === 'userAdminDeleteUser'
    ? ['requires an administrator for installed site management operations', 'protects configured accounts before cleanup and removes eligible learner progress']
    : method === 'insertNewUsers'
      ? ['requires an administrator for installed site management operations', 'preserves an enrolled account and creates only new accounts through the installed roster import']
      : method === 'userAdminNewsEmailRecipients'
        ? ['requires an administrator for installed site management operations', 'uses one current contact per account for the news draft and deduplicates shared addresses']
        : ['requires an administrator for installed site management operations']),
})));

export const ADMIN_ROLE_CHANGE_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'adminMethods', method: 'userAdminRoleChange', surfaceId: 'method:userAdminRoleChange',
  verificationId: 'method.admin.role-change', cases: Object.freeze(['protects self and configured roles while permitting ordinary administrator handoff']),
} as const);

export const UPLOAD_READ_VERIFICATIONS = Object.freeze((['getUserAssetByName', 'getUploadQuotaStatus'] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'lesson package daily allowance', method, surfaceId: `method:${method}` as const,
  verificationId: `method.upload-read.${method}` as const,
  cases: Object.freeze(['scopes upload filename and allowance reads to their signed-in owner']),
})));

export const MANUAL_DRAFT_VERIFICATIONS = Object.freeze((['getManualContentDraft', 'saveManualContentDraft', 'deleteManualContentDraft'] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'contentMethods content upload summaries', method, surfaceId: `method:${method}` as const,
  verificationId: `method.manual-draft.${method}` as const,
  cases: Object.freeze(['updates and removes only an existing manual draft owned by the caller']),
})));

export const STIMULUS_FILE_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'content helper authorization', method: 'getStimuliFileForTdf', surfaceId: 'method:getStimuliFileForTdf',
  verificationId: 'method.lesson-file.stimulus', cases: Object.freeze(['returns stimulus files only to the lesson owner and explicit accessors']),
} as const);

export const RECIPIENT_LOOKUP_VERIFICATION = Object.freeze({
  ...middlewareTest, suite: 'accessor identity query authorization', method: 'resolveUsersForTdf', surfaceId: 'method:resolveUsersForTdf',
  verificationId: 'method.lesson-sharing.resolveUsersForTdf',
  cases: Object.freeze(['rejects ambiguous recipient lists and resolves repeated aliases of one account']),
} as const);

export const ACCESSOR_READ_VERIFICATIONS = Object.freeze((['getAccessorsTDFID', 'getAccessors'] as const).map(method => Object.freeze({
  ...middlewareTest, suite: 'accessor identity query authorization', method, surfaceId: `method:${method}` as const,
  verificationId: `method.lesson-sharing.${method}` as const,
  cases: Object.freeze(['limits both installed owner lookups to their documented identity fields']),
})));

export const AUTHORIZATION_VERIFICATIONS = Object.freeze(entries);
// One catalog owner, with the accepted selected subset kept stable for its
// existing runner. Protocol qualifications are not retrofitted into its vector.
export const AUDIT_VERIFICATIONS = Object.freeze([...AUTHORIZATION_VERIFICATIONS,
  AUTHENTICATION_COMPARISON_BASELINE, ...AUTHENTICATION_PROTOCOL_VERIFICATIONS, ...RESET_PROTOCOL_VERIFICATIONS,
  ...PASSWORDLESS_PROTOCOL_VERIFICATIONS, ...AUTHENTICATION_THROTTLE_CASES, ...AUTHENTICATION_MATERIAL_CASES,
  ...AUTHENTICATION_SESSION_VERIFICATIONS,
  ...HTTP_HEALTH_VERIFICATIONS.endpoints, HTTP_HEALTH_VERIFICATIONS.fallthrough,
  HTTP_AUDIT_VERIFICATIONS.ingest, HTTP_AUDIT_VERIFICATIONS.download, ...Object.values(HTTP_FILE_VERIFICATIONS),
  ...Object.values(DIRECT_WRITE_VERIFICATIONS), HTTP_FRAMEWORK_RUNTIME_CONFIG_VERIFICATION, ...Object.values(DEFAULT_PUBLICATION_VERIFICATIONS),
  ...Object.values(NAMED_PUBLICATION_VERIFICATIONS),
  ...Object.values(HTTP_MIDDLEWARE_VERIFICATIONS).flat(), ...Object.values(FILES_DDP_VERIFICATIONS),
  ...Object.values(AUDIT_ADMIN_METHOD_VERIFICATIONS), DEPLOYMENT_READINESS_VERIFICATION, ...Object.values(BACKUP_METHOD_VERIFICATIONS),
  ...Object.values(BRAND_PROFILE_METHOD_VERIFICATIONS), FILENAME_TDF_MIGRATION_VERIFICATION,
  ...Object.values(CONDITION_COUNT_VERIFICATIONS), ...Object.values(HISTORY_DOWNLOAD_METHOD_VERIFICATIONS),
  ...Object.values(WARNING_METHOD_VERIFICATIONS), ...Object.values(SIMULATION_METHOD_VERIFICATIONS),
  ...Object.values(EXPERIMENT_ENTRY_VERIFICATIONS), ...Object.values(PROLIFIC_METHOD_VERIFICATIONS), LESSON_SHARING_VERIFICATION, ...ACCESSOR_READ_VERIFICATIONS, ...MANUAL_DRAFT_VERIFICATIONS, ...UPLOAD_READ_VERIFICATIONS, ...ADMIN_OPERATION_VERIFICATIONS, ...PROFILE_OPERATION_VERIFICATIONS, ...ACCOUNT_DIAGNOSTIC_VERIFICATIONS, ...ACCOUNT_SELF_VERIFICATIONS, ...PUBLIC_ACCOUNT_VERIFICATIONS, ...PUBLIC_READ_VERIFICATIONS, ...PACKAGE_UPLOAD_VERIFICATIONS, ...LESSON_EDIT_VERIFICATIONS, GENERATED_PACKAGE_VERIFICATION, ...OPENROUTER_CALL_VERIFICATIONS, PACKAGE_DOWNLOAD_VERIFICATION, LESSON_COPY_VERIFICATION, PACKAGE_DELETION_VERIFICATION, ...CONTENT_MAINTENANCE_VERIFICATIONS, ...SPARC_LESSON_VERIFICATIONS, ...RUNTIME_LESSON_VERIFICATIONS, ...PROGRESS_READ_VERIFICATIONS, ...LEARNER_PROGRESS_VERIFICATIONS, ADMIN_ROLE_CHANGE_VERIFICATION, STIMULUS_FILE_VERIFICATION, RECIPIENT_LOOKUP_VERIFICATION, ...Object.values(LESSON_ACCESS_VERIFICATIONS), STUDY_WAIT_VERIFICATION, ...PREFERENCE_VERIFICATIONS, AUDIO_SAVE_VERIFICATION, SSO_PROFILE_VERIFICATION, CLASS_PERFORMANCE_VERIFICATION, COURSE_DELETE_VERIFICATION, COURSE_JOIN_VERIFICATION, COURSE_CREATE_VERIFICATION, COURSE_EDIT_VERIFICATION, ...Object.values(COURSE_EXCEPTION_VERIFICATIONS), COURSE_ASSIGNMENT_SAVE_VERIFICATION, ...Object.values(COURSE_READ_VERIFICATIONS)]);
if (new Set(AUDIT_VERIFICATIONS.map(entry => entry.verificationId)).size !== AUDIT_VERIFICATIONS.length) {
  throw new Error('Duplicate audit verification ID');
}
// Phase 2 source coverage, separate from an executed producer and from Phase 3
// whole-runtime registry coverage. Baseline-only rows remain in the same catalog.
export const AUTHENTICATION_CONTROL_CASES = Object.freeze([
  { controlId: 'authentication.authorization', evidenceContract: 'verification-observations-v1', verificationIds: AUTHORIZATION_VERIFICATIONS.map(row => row.verificationId) },
  ...(['enumeration', 'timing'] as const).map(name => ({ controlId: `authentication.${name}`, evidenceContract: `${name}-observations-v2`, verificationIds: AUTHENTICATION_PROTOCOL_VERIFICATIONS.filter(row => row.controlId === `authentication.${name}`).map(row => row.verificationId) })),
  ...Object.entries(RESET_PROTOCOL_CONTROL_CASES).map(([controlId, verificationIds]) => ({ controlId, evidenceContract: 'verification-observations-v1', verificationIds })),
  ...(['authentication.session-lifetime', 'authentication.session-revocation'] as const).map(controlId => ({ controlId,
    evidenceContract: controlId === 'authentication.session-lifetime' ? 'session-lifetime-v2' : 'verification-observations-v1',
    verificationIds: AUTHENTICATION_SESSION_VERIFICATIONS.filter(row => row.controlId === controlId).map(row => row.verificationId) })),
  ...PASSWORDLESS_PROTOCOL_VERIFICATIONS.filter(row => row.controlId !== null).map(row => ({ controlId: row.controlId!, evidenceContract: 'verification-observations-v1', verificationIds: [row.verificationId] })),
  { controlId: 'authentication.material-leakage', evidenceContract: 'verification-observations-v1', verificationIds: AUTHENTICATION_MATERIAL_CASES.map(row => row.verificationId) },
  { controlId: 'authentication.throttling', evidenceContract: 'verification-observations-v1', verificationIds: AUTHENTICATION_THROTTLE_CASES.map(row => row.verificationId) },
].map(row => Object.freeze({ ...row, verificationIds: Object.freeze([...row.verificationIds]) })));
if (new Set(AUTHENTICATION_CONTROL_CASES.map(row => row.controlId)).size !== AUTHENTICATION_CONTROL_CASES.length
    || AUTHENTICATION_CONTROL_CASES.some(row => row.verificationIds.length === 0
      || row.verificationIds.some(id => !AUDIT_VERIFICATIONS.some(entry => entry.verificationId === id)))) {
  throw new Error('Authentication source verification coverage is incomplete');
}
export function auditVerification(id: string): AuditAuthorizationScenario {
  const entry = byId.get(id);
  if (!entry) throw new Error('Unknown audit verification ID');
  return entry;
}

export const AUTHORIZATION_MUTATIONS = Object.freeze({
  none: Object.freeze({ mutates: false as const }),
  'single-use-capability': Object.freeze({
    mutates: true as const, owner: 'audit-runner' as const,
    preconditions: Object.freeze(['bound-synthetic-issuer', 'existing-bound-resource', 'same-origin-download']),
    setup: 'issue-fresh-owned-capability', postconditions: Object.freeze(['verified-baseline-consumed', 'exact-replay-rejected']),
    cleanup: 'close-owned-browser-and-subscriptions',
    interruptedRunRecovery: 'discard-private-session-wait-existing-token-expiry-and-mint-fresh',
  }),
});

// Single-use URLs are temporary capabilities. Setup mints a new capability using
// the bound ordinary/admin fixture; the allowed baseline consumes it, then the
// denial probes that exact URL. Cleanup closes the owned browser/subscriptions;
// unconsumed capabilities retain their existing bounded expiry. Interrupted runs
// discard the private session, wait
// for the existing bounded token expiry and mint new URLs; never reuse tokens.
// No report, learner state, permissions or durable history is changed here.
