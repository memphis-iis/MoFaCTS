import { randomBytes } from 'node:crypto';
import { AUTHENTICATION_COMPARISON_BASELINE, AUTHENTICATION_COMPARISON_SAMPLES } from '../../../common/securityAudit/verificationCatalog.ts';
import { parseAuthorizationActorBindingV2 } from './bindingsV2.mjs';
import { openAuthorizationActorPageV2, validateAuthorizationActorPageV2 } from './browserV2.mjs';
import { authenticationComparisonProofsV2, captureAuthenticationComparisonPairV2 } from './comparisonV2.mjs';
import { fixtureNamespaceV2 } from './stagingFixturesV2.mjs';

export async function captureAuthenticationComparisonsV2({ browser, namespace, target, actor, requireOwnership, confirmLease }) {
  fixtureNamespaceV2(namespace);
  const binding = parseAuthorizationActorBindingV2(actor);
  const missing = `${namespace}-missing@localhost.invalid`;
  const unavailable = () => new Error('Live authentication comparison incomplete');
  if (target !== 'https://staging2.optimallearning.org' || !binding.username.endsWith(`+${namespace}-reset@gmail.com`)) throw unavailable();
  if (await requireOwnership() !== true) throw unavailable();
  await confirmLease();
  const baseline = await openAuthorizationActorPageV2({ browser, target, actor: 'learnerA', binding });
  try {
    if (!baseline.page || await validateAuthorizationActorPageV2(baseline.page, target, 'learnerA', binding.userId) !== 'matched') throw unavailable();
    const loggedOut = await baseline.page.evaluate(() => new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 10000);
      Meteor.logout(error => { clearTimeout(timer); resolve(!error && Meteor.userId() === null); });
    }));
    if (!loggedOut) throw unavailable();
  } finally { await baseline.context.close(); }

  const wrongPassword = randomBytes(32).toString('base64url');
  const loginPairs = [], resetPairs = [];
  async function observe(sampleSet, username) {
    const attempt = await openAuthorizationActorPageV2({ browser, target, actor: 'anonymous' });
    try {
      if (!attempt.page) throw unavailable();
      return await attempt.page.evaluate(({ sampleSet, username, password, target }) => new Promise(resolve => {
        if (location.origin !== target || !Meteor.status().connected || Meteor.userId() !== null) {
          resolve({ state: 'inconclusive', elapsedMs: 0 }); return;
        }
        const started = performance.now();
        const timer = setTimeout(() => resolve({ state: 'transport-error', elapsedMs: 12000 }), 12000);
        const complete = (error, value) => {
          clearTimeout(timer);
          const elapsedMs = performance.now() - started;
          if (error) resolve({ state: 'rejected', code: String(error.error ?? ''),
            reason: String(error.reason ?? ''), details: typeof error.details === 'string' ? error.details : null, elapsedMs });
          else if (sampleSet === 'reset') resolve({ state: 'returned', value, elapsedMs });
          else resolve({ state: 'inconclusive', elapsedMs });
        };
        if (sampleSet === 'login') Meteor.loginWithPassword(username, password, complete);
        else Meteor.callAsync('requestPasswordReset', username).then(value => complete(null, value), complete);
      }), { sampleSet, username, password: wrongPassword, target });
    } finally { await attempt.context.close(); }
  }
  for (const sample of AUTHENTICATION_COMPARISON_SAMPLES) {
    await confirmLease();
    const subjects = sample.existingFirst ? [binding.username, missing] : [missing, binding.username];
    const first = await observe(sample.sampleSet, subjects[0]);
    const second = await observe(sample.sampleSet, subjects[1]);
    const pair = captureAuthenticationComparisonPairV2(sample.sampleId, ...(sample.existingFirst ? [first, second] : [second, first]));
    (sample.sampleSet === 'login' ? loginPairs : resetPairs).push(pair);
    if (pair.existing.category !== 'observed' || pair.missing.category !== 'observed') throw unavailable();
  }
  const observation = { bindingsVerified: await requireOwnership(), environmentLeaseHeld: true,
    baselineVerificationId: AUTHENTICATION_COMPARISON_BASELINE.verificationId, baselineOutcome: 'ALLOWED', loginPairs, resetPairs };
  await confirmLease();
  return { observation, proofs: authenticationComparisonProofsV2(observation) };
}
