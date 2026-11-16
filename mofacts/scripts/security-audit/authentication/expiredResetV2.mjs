import { setTimeout as delay } from 'node:timers/promises';
import { AUTHENTICATION_RESET_POLICY } from '../../../common/securityAudit/verificationCatalog.ts';
import { methodAuthorizationOutcome } from '../../../common/securityAudit/authorizationOutcomes.ts';
import { resetAttemptOutcome, unusedExpiredResetPrecondition } from '../../../common/securityAudit/resetProtocol.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { parseAuthorizationActorBindingV2 } from './bindingsV2.mjs';
import { fixtureNamespaceV2 } from './stagingFixturesV2.mjs';
import { readAuthenticationLeaseV2 } from './leaseV2.mjs';
import { parseResetMailboxBindingV2, readResetMailboxMessageV2 } from './mailboxV2.mjs';

const unavailable = () => new Error('Owned unused reset expiry observation is incomplete');

// This collector never changes token dates or reads a stored capability. Only
// its exact connected-mail capability stays in memory while the real clock ages.
// Return the three observations, not a standalone passing control: the common
// reset evaluator also requires the same protocol owner's current-token baseline.
export async function captureUnusedExpiredResetV2({ namespace, target, actor, newPassword, transport,
  acquireMail, observeTokenAge, confirmMailLease, leaseDirectory }, { now = Date.now, wait = delay } = {}) {
  let capability;
  try {
    fixtureNamespaceV2(namespace);
    const user = parseAuthorizationActorBindingV2(actor);
    if (target !== 'https://staging2.optimallearning.org' || !user.username.endsWith(`+${namespace}-expiry@gmail.com`)
      || typeof newPassword !== 'string' || newPassword.length < 32 || newPassword.length > 1024 || newPassword === user.password
      || typeof acquireMail !== 'function' || typeof observeTokenAge !== 'function' || typeof confirmMailLease !== 'function'
      || typeof now !== 'function' || typeof wait !== 'function') throw unavailable();
    const methods = ['baseline', 'request', 'reset', 'newPasswordLogin', 'oldPasswordLogin', 'revokedSessions'];
    proofRecord(transport, methods);
    if (methods.some(name => typeof transport[name] !== 'function')) throw unavailable();
    const lease = await readAuthenticationLeaseV2(leaseDirectory);
    if (lease.namespace !== namespace || lease.target !== target || lease.startedAtMs > now()
      || lease.deadlineMs - now() <= AUTHENTICATION_RESET_POLICY.lifetimeMs + 120000) throw unavailable();
    let previous = now();
    const requireLease = async () => {
      const time = now();
      if (!Number.isSafeInteger(time) || time < previous || time >= lease.deadlineMs
        || canonicalAuditJson(await readAuthenticationLeaseV2(leaseDirectory)) !== canonicalAuditJson(lease)) throw unavailable();
      previous = time;
    };
    await requireLease();
    const baseline = await transport.baseline(user);
    const before = methodAuthorizationOutcome(baseline.observation, []);
    if (before !== 'ALLOWED') throw unavailable();
    const requestedAtMs = now(), binding = parseResetMailboxBindingV2({ namespace, recipient: user.username, target,
      requestedAtMs, deadlineMs: requestedAtMs + 120000 });
    await requireLease();
    if (methodAuthorizationOutcome(await transport.request(user.username), []) !== 'ALLOWED') throw unavailable();
    const mail = await acquireMail(binding);
    capability = readResetMailboxMessageV2(binding, mail.metadata, mail.plainText);
    mail.plainText = '';
    let metadata = await observeTokenAge();
    // Validate the common exact metadata shape even while it is not yet expired.
    unusedExpiredResetPrecondition(metadata);
    if (!metadata.owned || !metadata.unused || metadata.lifetimeMs !== AUTHENTICATION_RESET_POLICY.lifetimeMs
      || metadata.ageMs > 120000 || metadata.remainingMs <= 0) throw unavailable();
    const first = { time: now(), ageMs: metadata.ageMs };
    await confirmMailLease();
    while (!unusedExpiredResetPrecondition(metadata)) {
      await requireLease();
      await wait(Math.min(30000, metadata.remainingMs + 1));
      await requireLease();
      await confirmMailLease();
      metadata = await observeTokenAge();
      unusedExpiredResetPrecondition(metadata);
      if (!metadata.owned || !metadata.unused || metadata.lifetimeMs !== AUTHENTICATION_RESET_POLICY.lifetimeMs
        || Math.abs(metadata.ageMs - first.ageMs - (now() - first.time)) > 5000) throw unavailable();
    }
    await requireLease();
    const rejected = resetAttemptOutcome(await transport.reset(user.username, capability.token, newPassword));
    capability.token = '';
    const unchanged = methodAuthorizationOutcome(await transport.oldPasswordLogin(user), ['403']);
    return { delivery: capability.receipt, expiredToken: metadata, results: [
      { verificationId: 'authn.reset.expired.password-before', outcome: before },
      { verificationId: 'authn.reset.expired.rejected', outcome: rejected },
      { verificationId: 'authn.reset.expired.password-unchanged', outcome: unchanged },
    ] };
  } catch { throw unavailable(); }
  finally { if (capability) capability.token = ''; }
}
