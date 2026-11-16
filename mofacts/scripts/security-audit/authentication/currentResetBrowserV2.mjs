import { auditTargetOrigin } from '../../../common/securityAudit/reportV2.ts';
import { parseAuthorizationActorBindingV2 } from './bindingsV2.mjs';
import { openAuthorizationActorPageV2, validateAuthorizationActorPageV2 } from './browserV2.mjs';

const unavailable = () => new Error('Owned reset browser transport is unavailable');

// The fixture owner supplies only this scenario's ordinary account. Unlike the
// logout test's cloned capability, reset revocation needs two independent logins.
// No admin/provider credential, fixture creation or mailbox access belongs here.
export function createCurrentResetBrowserTransportV2({ browser, target, actor }) {
  const origin = auditTargetOrigin(target), user = parseAuthorizationActorBindingV2(actor);
  if (origin !== 'https://staging2.optimallearning.org'
    || !/\+mofacts_audit_fixture_[a-f0-9]{12}-(reset|expiry)@gmail\.com$/.test(user.username)) throw unavailable();
  const contexts = [], sessions = [];
  let anonymous, baselineStarted = false, verificationStarted = false, closed = false, cleanupFailed = false;
  const ownedBrowser = { async newContext() {
    if (closed) throw unavailable();
    const context = await browser.newContext(); contexts.push(context); return context;
  } };
  async function open(alias, binding) {
    try {
      const active = await openAuthorizationActorPageV2({ browser: ownedBrowser, target: origin, actor: alias,
        ...(binding ? { binding } : {}) });
      if (!active.page || await validateAuthorizationActorPageV2(active.page, origin, alias, binding?.userId ?? null) !== 'matched') throw unavailable();
      return active.page;
    } catch { throw unavailable(); }
  }
  async function anonymousPage() { return anonymous ??= await open('anonymous'); }
  async function method(page, name, args, expectedId) {
    if (closed) throw unavailable();
    try { return await page.evaluate(async ({ name, args, expectedId, origin }) => {
      const owned = () => location.origin === origin && globalThis.Meteor.status().connected
        && [null, expectedId].includes(globalThis.Meteor.userId());
      if (!owned()) return { state: 'inconclusive' };
      let timer;
      try {
        const response = await Promise.race([globalThis.Meteor.callAsync(name, ...args).then(value => ({ value })),
          new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), 12000); })]);
        if (response.timeout) return { state: 'transport-error' };
        if (!owned()) return { state: 'inconclusive' };
        const value = response.value;
        const matched = name === 'getOwnOpenRouterSettings'
          ? value && Object.keys(value).sort().join(',') === 'hasOpenRouterKey,model,reasoningLevel'
            && typeof value.model === 'string' && typeof value.reasoningLevel === 'string' && typeof value.hasOpenRouterKey === 'boolean'
          : value?.success === true;
        return { state: 'returned', allowedObservationMatched: Boolean(matched) };
      } catch (error) {
        const code = String(error.error ?? 'unknown-error');
        return { state: 'rejected', code: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(code) ? code : 'unknown-error' };
      } finally { clearTimeout(timer); }
    }, { name, args, expectedId, origin }); }
    catch { return { state: 'transport-error' }; }
  }
  async function passwordLogin(value) {
    const candidate = parseAuthorizationActorBindingV2(value);
    if (candidate.userId !== user.userId || candidate.username !== user.username) throw unavailable();
    const page = await open('anonymous');
    try { return await page.evaluate(({ candidate, origin }) => new Promise(resolve => {
      if (location.origin !== origin || !globalThis.Meteor.status().connected || globalThis.Meteor.userId() !== null) {
        resolve({ state: 'inconclusive' }); return;
      }
      const timer = setTimeout(() => resolve({ state: 'transport-error' }), 12000);
      globalThis.Meteor.loginWithPassword(candidate.username, candidate.password, error => {
        clearTimeout(timer);
        if (error) {
          const code = String(error.error ?? 'unknown-error');
          resolve({ state: 'rejected', code: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(code) ? code : 'unknown-error' });
        } else resolve({ state: 'returned', allowedObservationMatched: globalThis.Meteor.userId() === candidate.userId });
      });
    }), { candidate, origin }); }
    catch { return { state: 'transport-error' }; }
  }
  async function verifyEmail(token) {
      if (closed || baselineStarted || verificationStarted || typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(token)) throw unavailable();
      verificationStarted = true;
      const page = await anonymousPage();
      let verified = false;
      try {
        verified = await page.evaluate(({ token, origin, userId, username }) => new Promise(resolve => {
          if (location.origin !== origin || !globalThis.Meteor.status().connected || globalThis.Meteor.userId() !== null) {
            resolve(false); return;
          }
          const timer = setTimeout(() => resolve(false), 12000);
          globalThis.Accounts.verifyEmail(token, error => {
            clearTimeout(timer);
            const account = globalThis.Meteor.user();
            resolve(!error && globalThis.Meteor.userId() === userId && account?.username === username
              && account.emails?.some(row => row.address === username && row.verified === true) === true);
          });
        }), { token, origin, userId: user.userId, username: user.username });
      } catch { throw unavailable(); }
      finally { token = ''; }
      if (!verified) throw unavailable();
      const loggedOut = await page.evaluate(() => new Promise(resolve => {
        const timer = setTimeout(() => resolve(false), 12000);
        globalThis.Meteor.logout(error => { clearTimeout(timer); resolve(!error && globalThis.Meteor.userId() === null); });
      })).catch(() => false);
      if (!loggedOut) throw unavailable();
      return { state: 'owned-fixture-email-verified', nativeVerificationSucceeded: true, ownedIdentityMatched: true };
  }
  const transport = {
    async baseline(value) {
      const candidate = parseAuthorizationActorBindingV2(value);
      if (baselineStarted || closed || ['userId', 'username', 'password'].some(key => candidate[key] !== user[key])) throw unavailable();
      baselineStarted = true;
      let observation, lifetime;
      for (let index = 0; index < 2; index++) {
        const page = await open('learnerA', user);
        const observed = await method(page, 'getOwnOpenRouterSettings', [], user.userId);
        if (observed.state !== 'returned' || observed.allowedObservationMatched !== true) throw unavailable();
        const capability = await page.evaluate(() => ({ token: sessionStorage.getItem('Meteor.loginToken'),
          expiresAtMs: new Date(sessionStorage.getItem('Meteor.loginTokenExpires')).getTime(), issuedAtMs: Date.now() }));
        if (typeof capability.token !== 'string' || capability.token.length < 8 || capability.token.length > 4096) throw unavailable();
        sessions.push({ page, token: capability.token }); observation ??= observed;
        lifetime ??= { baselineOutcome: 'ALLOWED', freshSessionVerified: true,
          issuedAtMs: capability.issuedAtMs, expiresAtMs: capability.expiresAtMs };
      }
      return { observation, lifetime, independentSessionCount: sessions.length,
        distinctCapabilitiesVerified: new Set(sessions.map(value => value.token)).size === 2 };
    },
    async request(email) {
      if (email !== user.username || sessions.length !== 2) throw unavailable();
      return method(await anonymousPage(), 'requestPasswordReset', [email], null);
    },
    async reset(email, token, password) {
      if (email !== user.username || !/^[a-f0-9]{64}$/.test(token) || typeof password !== 'string' || password.length < 32) throw unavailable();
      return method(await anonymousPage(), 'resetPasswordWithToken', [email, token, password], null);
    },
    newPasswordLogin: passwordLogin,
    oldPasswordLogin: passwordLogin,
    async revokedSessions() {
      if (sessions.length !== 2) throw unavailable();
      const result = [];
      for (const session of sessions) {
        const observed = await method(session.page, 'getOwnOpenRouterSettings', [], user.userId);
        const page = await open('anonymous');
        const resume = await page.evaluate(({ token, userId, origin }) => new Promise(resolve => {
          if (location.origin !== origin || !globalThis.Meteor.status().connected || globalThis.Meteor.userId() !== null) {
            resolve({ state: 'inconclusive' }); return;
          }
          const timer = setTimeout(() => resolve({ state: 'transport-error' }), 12000);
          globalThis.Meteor.loginWithToken(token, error => {
            clearTimeout(timer);
            resolve(error ? { state: 'rejected', code: String(error.error), reason: String(error.reason ?? '').slice(0, 256) }
              : { state: 'returned', boundIdentityMatched: globalThis.Meteor.userId() === userId });
          });
        }), { token: session.token, userId: user.userId, origin }).catch(() => ({ state: 'transport-error' }));
        result.push({ method: observed, resume });
      }
      return result;
    },
  };
  return { transport, verifyEmail, async close() {
    if (closed) {
      if (cleanupFailed) throw new Error('Owned reset browser cleanup is unverified');
      return;
    }
    let failed = false;
    for (const context of contexts) {
      for (const page of context.pages()) {
        try {
          const clean = await page.evaluate(() => new Promise(resolve => {
            const timer = setTimeout(() => resolve(false), 12000);
            globalThis.Meteor.logout(error => { clearTimeout(timer); resolve(!error && globalThis.Meteor.userId() === null); });
          }));
          if (!clean) failed = true;
        } catch { failed = true; }
      }
      try { await context.close(); } catch { failed = true; }
    }
    sessions.forEach(session => { session.token = ''; });
    closed = true; cleanupFailed = failed;
    if (failed) throw new Error('Owned reset browser cleanup is unverified');
  } };
}
