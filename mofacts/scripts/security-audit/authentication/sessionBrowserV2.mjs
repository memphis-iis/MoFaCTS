import { auditTargetOrigin } from '../../../common/securityAudit/reportV2.ts';
import { proofBoolean, proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { AUTHORIZATION_OUTCOME_CATEGORIES, evaluateAuthorizationOutcome } from '../../../common/securityAudit/authorizationOutcomes.ts';
import { parseAuthorizationActorBindingV2 } from './bindingsV2.mjs';
import { openAuthorizationActorPageV2, validateAuthorizationActorPageV2 } from './browserV2.mjs';

const invalid = () => { throw new Error('Session revocation observation is invalid'); };
const revokedReasons = ["You've been logged out by the server. Please log in again.", 'Your session has expired. Please log in again.'];
export function sessionResumeOutcomeV2(value) {
  const row = proofRecord(value, value?.state === 'rejected' ? ['state', 'code', 'reason']
    : value?.state === 'returned' ? ['state', 'boundIdentityMatched'] : ['state']);
  if (row.state === 'transport-error') return 'TRANSPORT_OR_RUNNER_ERROR';
  if (row.state === 'inconclusive') return 'INCONCLUSIVE';
  if (row.state === 'returned') return proofBoolean(row.boundIdentityMatched) ? 'ALLOWED' : 'INCONCLUSIVE';
  if (row.state !== 'rejected' || typeof row.code !== 'string' || row.code.length > 80
      || typeof row.reason !== 'string' || row.reason.length > 256) invalid();
  return row.code === '403' && revokedReasons.includes(row.reason) ? 'DENIED_BY_POLICY' : 'DOMAIN_REJECTION';
}

export function evaluateLogoutRevocationV2(value) {
  const row = proofRecord(value, ['originalBaselineMatched', 'cloneBaselineMatched', 'sameCapabilityCloned',
    'logoutCompleted', 'passwordReloginMatched', 'revokedMethodOutcome', 'revokedResumeOutcome']);
  const ready = ['originalBaselineMatched', 'cloneBaselineMatched', 'sameCapabilityCloned', 'logoutCompleted', 'passwordReloginMatched']
    .map(key => proofBoolean(row[key])).every(Boolean);
  const outcomes = [row.revokedMethodOutcome, row.revokedResumeOutcome];
  if (outcomes.some(outcome => !AUTHORIZATION_OUTCOME_CATEGORIES.includes(outcome))) invalid();
  if (!ready) return { status: 'ERROR' };
  const statuses = outcomes.map(outcome => evaluateAuthorizationOutcome('deny', outcome));
  return { status: statuses.includes('ERROR') ? 'ERROR' : statuses.includes('FAIL') ? 'FAIL' : 'PASS',
    metrics: { expectedCaseCount: 2, completedCaseCount: 2, matchedCaseCount: statuses.filter(status => status === 'PASS').length,
      domainRejectionCount: outcomes.filter(outcome => outcome === 'DOMAIN_REJECTION').length,
      transportErrorCount: outcomes.filter(outcome => outcome === 'TRANSPORT_OR_RUNNER_ERROR').length,
      inconclusiveCaseCount: outcomes.filter(outcome => outcome === 'INCONCLUSIVE').length } };
}

// Only this job's sessions are created/revoked. Existing passwords, accounts,
// content and unrelated login tokens are not changed. Caller owns the browser.
export async function captureLogoutRevocationV2({ browser, target, binding }) {
  const origin = auditTargetOrigin(target), user = parseAuthorizationActorBindingV2(binding);
  if (origin !== 'https://staging2.optimallearning.org') invalid();
  const contexts = [];
  const sessionBrowser = { async newContext() {
    const context = await browser.newContext(); contexts.push(context); return context;
  } };
  async function openPassword() {
    const active = await openAuthorizationActorPageV2({ browser: sessionBrowser, target: origin, actor: 'learnerA', binding: user });
    if (!active.page || active.state) throw new Error('Session baseline is unavailable');
    return active.page;
  }
  async function openAnonymous() {
    const active = await openAuthorizationActorPageV2({ browser: sessionBrowser, target: origin, actor: 'anonymous' });
    if (!active.page || active.state) throw new Error('Session transport is unavailable');
    return active.page;
  }
  async function allowed(page) {
    if (await validateAuthorizationActorPageV2(page, origin, 'learnerA', user.userId) !== 'matched') return false;
    return page.evaluate(async () => {
      let timer;
      try {
        const value = await Promise.race([Meteor.callAsync('getOwnOpenRouterSettings'), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Session baseline timed out')), 12000);
        })]);
        return typeof value?.model === 'string' && typeof value?.reasoningLevel === 'string' && typeof value?.hasOpenRouterKey === 'boolean';
      } finally { clearTimeout(timer); }
    });
  }
  async function resume(page, token) {
    return page.evaluate(({ token, userId }) => new Promise(resolve => {
      const timer = setTimeout(() => resolve({ state: 'transport-error' }), 12000);
      Meteor.loginWithToken(token, error => { clearTimeout(timer);
        resolve(error ? { state: 'rejected', code: String(error.error), reason: String(error.reason ?? '') }
          : { state: 'returned', boundIdentityMatched: Meteor.userId() === userId }); });
    }), { token, userId: user.userId });
  }
  async function logout(page) {
    return page.evaluate(() => new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 12000);
      Meteor.logout(error => { clearTimeout(timer); resolve(!error); });
    }));
  }
  let observation, failure;
  try {
    const original = await openPassword(), originalBaselineMatched = await allowed(original);
    if (!originalBaselineMatched) throw new Error('Session original baseline unavailable');
    const capability = await original.evaluate(() => ({ token: sessionStorage.getItem('Meteor.loginToken'), userId: sessionStorage.getItem('Meteor.userId') }));
    if (typeof capability.token !== 'string' || capability.token.length < 8 || capability.token.length > 4096 || capability.userId !== user.userId) invalid();
    const clone = await openAnonymous();
    if (sessionResumeOutcomeV2(await resume(clone, capability.token)) !== 'ALLOWED') throw new Error('Session clone baseline unavailable');
    await clone.waitForFunction(() => Session.get('authRolesHydrated') === true && Session.get('authRolesSyncedUserId') === Meteor.userId());
    const cloneBaselineMatched = await allowed(clone);
    const sameCapabilityCloned = await clone.evaluate(token => sessionStorage.getItem('Meteor.loginToken') === token, capability.token);
    const logoutCompleted = await logout(original);
    // Await normal revocation propagation, but never reinterpret a timeout as
    // denial. The subsequent real guarded call determines its typed outcome.
    await clone.waitForFunction(() => Meteor.userId() === null, null, { timeout: 12000 }).catch(() => {});
    const revokedMethodOutcome = await clone.evaluate(async userId => {
      let timer;
      try {
        const timedOut = Symbol('transport-timeout');
        const result = await Promise.race([Meteor.callAsync('getOwnOpenRouterSettings'), new Promise(resolve => {
          timer = setTimeout(() => resolve(timedOut), 12000);
        })]);
        if (result === timedOut) return 'TRANSPORT_OR_RUNNER_ERROR';
        return Meteor.userId() === userId ? 'ALLOWED' : 'INCONCLUSIVE';
      } catch (error) { return String(error.error) === '401' ? 'DENIED_BY_POLICY' : 'DOMAIN_REJECTION'; }
      finally { clearTimeout(timer); }
    }, user.userId);
    const replay = await openAnonymous(), revokedResumeOutcome = sessionResumeOutcomeV2(await resume(replay, capability.token));
    const fresh = await openPassword(), passwordReloginMatched = await allowed(fresh);
    observation = { originalBaselineMatched, cloneBaselineMatched, sameCapabilityCloned, logoutCompleted,
      passwordReloginMatched, revokedMethodOutcome, revokedResumeOutcome };
  } catch (error) { failure = error; }
  finally {
    let clean = true;
    for (const page of contexts.flatMap(context => context.pages())) {
      try {
        const id = await page.evaluate(() => Meteor.userId());
        if (id === user.userId) clean = await logout(page) && clean;
        else if (id !== null) clean = false;
      } catch { clean = false; }
    }
    for (const context of contexts) { try { await context.close(); } catch { clean = false; } }
    if (!clean) failure = new Error('Session observation cleanup is unverified');
  }
  if (failure) throw failure;
  return { observation, result: evaluateLogoutRevocationV2(observation) };
}
