import { RESET_PROTOCOL_VERIFICATIONS, RESET_PROTOCOL_CONTROL_CASES } from '../../../common/securityAudit/verificationCatalog.ts';
import { evaluateSourceVerificationVector } from '../../../common/securityAudit/authorizationVerification.ts';
import { methodAuthorizationOutcome, evaluateAuthorizationOutcome, AUTHORIZATION_OUTCOME_CATEGORIES } from '../../../common/securityAudit/authorizationOutcomes.ts';
import { resetAttemptOutcome } from '../../../common/securityAudit/resetProtocol.ts';
import { evaluateSessionLifetime } from '../../../common/securityAudit/sessionLifetime.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { fixtureNamespaceV2 } from './stagingFixturesV2.mjs';
import { parseAuthorizationActorBindingV2 } from './bindingsV2.mjs';
import { parseResetMailboxBindingV2, readResetMailboxMessageV2 } from './mailboxV2.mjs';
import { sessionResumeOutcomeV2 } from './sessionBrowserV2.mjs';

const invalid = () => { throw new Error('Current reset acquisition is invalid'); };
const currentCases = RESET_PROTOCOL_VERIFICATIONS.filter(row => RESET_PROTOCOL_CONTROL_CASES['authentication.reset-token.current-single-use'].includes(row.verificationId));

// The fixture/lease owner provides private transport callbacks and owns cleanup.
// This scenario never creates credentials or acquires a mailbox authorization.
// Only an exact run-owned account may reach a password-changing callback.
export async function captureCurrentResetV2({ namespace, target, actor, newPassword, transport, acquireMail }) {
  fixtureNamespaceV2(namespace);
  const user = parseAuthorizationActorBindingV2(actor);
  if (target !== 'https://staging2.optimallearning.org'
      || !user.username.endsWith(`+${namespace}-reset@gmail.com`)
      || typeof newPassword !== 'string' || newPassword.length < 32 || newPassword.length > 1024
      || newPassword === user.password || typeof acquireMail !== 'function') invalid();
  const names = ['baseline', 'request', 'reset', 'newPasswordLogin', 'oldPasswordLogin', 'revokedSessions'];
  proofRecord(transport, names);
  if (names.some(name => typeof transport[name] !== 'function')) invalid();

  const baseline = await transport.baseline(user);
  const baselineOutcome = methodAuthorizationOutcome(baseline.observation, []);
  const lifetime = evaluateSessionLifetime(baseline.lifetime);
  if (baselineOutcome !== 'ALLOWED' || baseline.lifetime.baselineOutcome !== 'ALLOWED'
      || baseline.lifetime.freshSessionVerified !== true || baseline.independentSessionCount !== 2
      || baseline.distinctCapabilitiesVerified !== true) throw new Error('Reset positive baseline is unavailable');
  const requestedAtMs = Date.now();
  const binding = parseResetMailboxBindingV2({ namespace, recipient: user.username, target,
    requestedAtMs, deadlineMs: requestedAtMs + 120000 });
  if (methodAuthorizationOutcome(await transport.request(user.username), []) !== 'ALLOWED') {
    throw new Error('Reset request is unavailable');
  }
  const mail = await acquireMail(binding);
  const delivery = readResetMailboxMessageV2(binding, mail.metadata, mail.plainText);
  const accepted = resetAttemptOutcome(await transport.reset(user.username, delivery.token, newPassword));
  const resetResults = [{ verificationId: 'authn.reset.current.password-before', outcome: baselineOutcome },
    { verificationId: 'authn.reset.current.accepted', outcome: accepted }];
  // A failed mutation cannot qualify replay or revocation and must not issue
  // further password attempts. The owner still cleans the same fixture.
  if (accepted !== 'ALLOWED') return { delivery: delivery.receipt, lifetime,
    current: evaluateSourceVerificationVector(resetResults, currentCases), session: { status: 'ERROR' } };
  const newLogin = methodAuthorizationOutcome(await transport.newPasswordLogin({ ...user, password: newPassword }), []);
  const oldLogin = methodAuthorizationOutcome(await transport.oldPasswordLogin(user), ['403']);
  const revoked = await transport.revokedSessions();
  if (!Array.isArray(revoked) || revoked.length !== 2) invalid();
  const sessions = revoked.map(value => {
    const row = proofRecord(value, ['method', 'resume']);
    return { method: methodAuthorizationOutcome(row.method, ['401']), resume: sessionResumeOutcomeV2(row.resume) };
  });
  resetResults.push({ verificationId: 'authn.reset.current.replay',
    outcome: resetAttemptOutcome(await transport.reset(user.username, delivery.token, newPassword)) });
  return { delivery: delivery.receipt, lifetime, current: evaluateSourceVerificationVector(resetResults, currentCases),
    session: evaluateCurrentResetSessionsV2({ newLogin, oldLogin, sessions }) };
}

export function evaluateCurrentResetSessionsV2(value) {
  const row = proofRecord(value, ['newLogin', 'oldLogin', 'sessions']);
  if (!Array.isArray(row.sessions) || row.sessions.length !== 2) invalid();
  const sessionOutcomes = row.sessions.flatMap(value => Object.values(proofRecord(value, ['method', 'resume'])));
  if ([row.newLogin, row.oldLogin, ...sessionOutcomes].some(outcome => !AUTHORIZATION_OUTCOME_CATEGORIES.includes(outcome))) invalid();
  if (row.newLogin !== 'ALLOWED') return { status: 'ERROR', outcomes: row };
  const statuses = [row.oldLogin, ...sessionOutcomes].map(outcome => evaluateAuthorizationOutcome('deny', outcome));
  return { status: statuses.includes('ERROR') ? 'ERROR' : statuses.includes('FAIL') ? 'FAIL' : 'PASS', outcomes: row };
}
