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
export const AUTHORIZATION_VERIFICATIONS = Object.freeze(entries);
// One catalog owner, with the accepted selected subset kept stable for its
// existing runner. Protocol qualifications are not retrofitted into its vector.
export const AUDIT_VERIFICATIONS = Object.freeze([...AUTHORIZATION_VERIFICATIONS,
  AUTHENTICATION_COMPARISON_BASELINE, ...AUTHENTICATION_PROTOCOL_VERIFICATIONS, ...RESET_PROTOCOL_VERIFICATIONS]);
if (new Set(AUDIT_VERIFICATIONS.map(entry => entry.verificationId)).size !== AUDIT_VERIFICATIONS.length) {
  throw new Error('Duplicate audit verification ID');
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
