import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTHENTICATION_COMPARISON_POLICY as policy, AUTHENTICATION_PROTOCOL_VERIFICATIONS,
  AUTHENTICATION_PROTOCOL_MUTATIONS, AUTHORIZATION_VERIFICATIONS, AUTHENTICATION_COMPARISON_BASELINE,
  AUTHENTICATION_COMPARISON_SAMPLES, AUDIT_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { captureAuthenticationComparisonPairV2 as capture, evaluateAuthenticationComparisonsV2 as evaluate } from '../authentication/comparisonV2.mjs';
import { authenticationComparisonProofsV2 as proofs } from '../authentication/comparisonV2.mjs';
import { captureAuthenticationComparisonsV2 } from '../authentication/comparisonBrowserV2.mjs';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';
const pair = (family, existing, missing, index = 0) => capture(
  AUTHENTICATION_COMPARISON_SAMPLES.filter(row => row.sampleSet === family)[index].sampleId, existing, missing);

const rejected = (reason = policy.credentialRejectionReasons[0], code = '403', elapsedMs = 900, details = null) =>
  ({ state: 'rejected', code, reason, details, elapsedMs });
const returned = (value = { success: true }, elapsedMs = 300) => ({ state: 'returned', value, elapsedMs });
function fixture() {
  return { bindingsVerified: true, environmentLeaseHeld: true,
    baselineVerificationId: AUTHENTICATION_COMPARISON_BASELINE.verificationId, baselineOutcome: 'ALLOWED',
    loginPairs: Array.from({ length: 5 }, (_, i) => pair('login', rejected(), rejected(), i)),
    resetPairs: Array.from({ length: 2 }, (_, i) => pair('reset', returned(), returned(), i)) };
}

test('versioned proofs preserve independent results and reject forged readiness, counts and timing claims', () => {
  const source = fixture();
  const [enumeration, timing] = proofs(source);
  for (const item of [enumeration, timing]) {
    assert.equal(item.status, 'PASS');
    assert.throws(() => parseAuditEvidence(item.evidenceContract, 'FAIL', item.evidence));
    for (const [key, value] of Object.entries({ baselineVerified: false, bindingsVerified: false,
      environmentLeaseHeld: false, loginPairCount: 4, resetPairCount: 1, rateLimitedAttemptCount: 1,
      domainRejectionCount: 1, transportErrorCount: 1, inconclusiveCaseCount: 1, privatePayload: 0 })) {
      const copy = structuredClone(item.evidence); copy.metrics[key] = value;
      assert.throws(() => parseAuditEvidence(item.evidenceContract, 'PASS', copy), key);
    }
  }
  for (const [key, value] of Object.entries({ loginApprovedBoundMs: 0, loginDifferentialMs: 1,
    resetRequiredDirectionCount: 1, loginDominantDirectionCount: 6, resetExistingMedianMs: 15001 })) {
    const copy = structuredClone(timing.evidence); copy.metrics[key] = value;
    assert.throws(() => parseAuditEvidence(timing.evidenceContract, 'PASS', copy), key);
  }
  source.loginPairs[0] = pair('login', rejected('Incorrect password'), rejected('User not found'));
  assert.deepEqual(proofs(source).map(row => row.status), ['FAIL', 'PASS']);
  source.loginPairs = source.loginPairs.map((row, i) => pair('login', rejected(undefined, '403', 1900), rejected(), i));
  assert.deepEqual(proofs(source).map(row => row.status), ['PASS', 'FAIL']);
  source.environmentLeaseHeld = false;
  for (const row of proofs(source)) {
    assert.equal(row.status, 'ERROR'); assert.equal(Object.hasOwn(row.evidence, 'metrics'), false);
  }
});

test('comparison catalog preserves selected 29 and owns four exact protocol qualifications and one shared sample policy', () => {
  assert.equal(AUTHORIZATION_VERIFICATIONS.length, 29);
  assert.equal(AUTHENTICATION_PROTOCOL_VERIFICATIONS.length, 4);
  assert.equal(AUDIT_VERIFICATIONS.filter(row => row.kind !== 'integrationTest').length, 68);
  assert.equal(new Set(AUDIT_VERIFICATIONS.map(row => row.verificationId)).size, AUDIT_VERIFICATIONS.length);
  assert.equal(new Set(AUTHENTICATION_PROTOCOL_VERIFICATIONS.map(row => row.verificationId)).size, 4);
  for (const row of AUTHENTICATION_PROTOCOL_VERIFICATIONS) {
    assert.equal(row.kind, 'protocolQualification');
    assert.equal(row.mutation, 'authentication-comparison'); assert.ok(Object.isFrozen(row));
    assert.equal(policy[row.sampleSet].sampleCount, row.sampleSet === 'login' ? 5 : 2);
  }
  assert.ok(AUTHENTICATION_PROTOCOL_MUTATIONS['authentication-comparison'].preconditions.includes('environment-lease-held'));
});

test('shared complete comparisons establish independent enumeration and robust timing outcomes', () => {
  const source = fixture(), output = evaluate(source);
  assert.equal(output.enumeration.status, 'PASS'); assert.equal(output.timing.status, 'PASS');
  assert.equal(output.counts.observed, 14);
  source.loginPairs[0] = pair('login', rejected('Incorrect password'), rejected('User not found'));
  const different = evaluate(source); assert.equal(different.enumeration.status, 'FAIL');
  assert.equal(different.timing.status, 'PASS');
  assert.equal(JSON.stringify(different).includes('Incorrect password'), false);
});

test('matching unrelated errors, empty codes and returned-but-unverified login results cannot pass', () => {
  for (const invalidResponse of [rejected('Login forbidden'), rejected('database error', '500'), returned({ id: 'PRIVATE-user', token: 'PRIVATE-token' })]) {
    const source = fixture(); source.loginPairs[0] = pair('login', invalidResponse, invalidResponse);
    const result = evaluate(source); assert.equal(result.enumeration.status, 'ERROR'); assert.equal(result.timing.status, 'ERROR');
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  }
  assert.throws(() => pair('login', rejected(undefined, ''), rejected(undefined, '')));
});

test('public reason/details and reset body differences are compared without retaining sensitive payloads', () => {
  const source = fixture();
  source.loginPairs[0] = pair('login', rejected(undefined, '403', 900, 'PRIVATE-existing'), rejected(undefined, '403', 900, 'PRIVATE-missing'));
  source.resetPairs[0] = pair('reset', returned({ success: true, hint: 'PRIVATE-existing' }), returned());
  const result = evaluate(source); assert.equal(result.enumeration.status, 'FAIL');
  assert.equal(JSON.stringify(source).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('rate limits, domain failures, transport failures, missing readiness and failed baselines stay ERROR', () => {
  for (const response of [rejected(undefined, 'rate-limit'), rejected(undefined, 'too-many-requests'),
    { state: 'transport-error', elapsedMs: 100 }, { state: 'inconclusive', elapsedMs: 100 }]) {
    const source = fixture(); source.loginPairs[0] = pair('login', response, response);
    assert.equal(evaluate(source).enumeration.status, 'ERROR'); assert.equal(evaluate(source).timing.status, 'ERROR');
  }
  for (const patch of [{ bindingsVerified: false }, { environmentLeaseHeld: false },
    { baselineOutcome: 'DOMAIN_REJECTION' }, { baselineOutcome: 'TRANSPORT_OR_RUNNER_ERROR' }, { baselineOutcome: 'INCONCLUSIVE' }]) {
    assert.equal(evaluate({ ...fixture(), ...patch }).enumeration.status, 'ERROR');
  }
  const source = fixture(); source.resetPairs[0] = pair('reset', returned({ success: false }), returned({ success: false }));
  assert.equal(evaluate(source).enumeration.status, 'ERROR');
});

test('timing preserves matched samples and dominant-direction requirements without conflating response equality', () => {
  const source = fixture();
  source.loginPairs = Array.from({ length: 5 }, (_, i) => pair('login', rejected(undefined, '403', 900), rejected(undefined, '403', 90), i));
  assert.equal(evaluate(source).timing.status, 'FAIL'); assert.equal(evaluate(source).enumeration.status, 'PASS');
  const existing = [1000, 1000, 1000, 10, 10], missing = [0, 0, 0, 900, 900];
  source.loginPairs = existing.map((ms, index) => pair('login', rejected(undefined, '403', ms), rejected(undefined, '403', missing[index]), index));
  assert.equal(evaluate(source).timing.status, 'ERROR');
});

test('wrong vector membership, spoofed matches, unsafe durations and private extra keys are rejected', () => {
  for (const mutate of [value => value.loginPairs.pop(), value => value.resetPairs.push(value.resetPairs[0]),
    value => { value.loginPairs[1].sampleId = value.loginPairs[0].sampleId; },
    value => { value.baselineVerificationId = 'unreviewed-baseline'; },
    value => { value.loginPairs[0].existing.category = 'transport-error'; },
    value => { value.loginPairs[0].existing.elapsedMs = -1; },
    value => { value.loginPairs[0].PRIVATE = 'secret'; }]) {
    const source = fixture(); mutate(source); assert.throws(() => evaluate(source));
  }
  assert.throws(() => pair('reset', returned({ success: true, extra: 'x'.repeat(257) }), returned()));
  assert.throws(() => pair('login', rejected(undefined, '403', 15001), rejected()));
});

function comparisonBrowserFixture(mode) {
  const target = 'https://staging2.optimallearning.org';
  const namespace = 'mofacts_audit_fixture_123456abcdef';
  const actor = { userId: 'synthetic-learner', username: `synthetic+${namespace}-reset@gmail.com`, password: 'synthetic-comparison-secret' };
  const calls = [];
  let opened = 0, closed = 0, leaseChecks = 0, baselineClosed = false, baselineLoggedOut = false;

  const browser = {
    async newContext() {
      const baseline = opened++ === 0;
      let userId = null, pageUrl;
      return {
        async close() { closed++; if (baseline) baselineClosed = true; },
        async newPage() {
          return {
            setDefaultTimeout() {},
            url() { return pageUrl; },
            async goto(url) { pageUrl = mode === 'redirect' ? 'https://foreign.example/' : url; },
            async waitForFunction(fn) { assert.equal(await this.evaluate(fn), true); },
            async evaluate(fn, args) {
              if (args?.sampleSet && mode === 'transport') return { state: 'transport-error', elapsedMs: 100 };
              const globals = {
                location: { origin: new URL(pageUrl).origin },
                Session: { get(key) {
                  if (key === 'authRoles') return { admin: false, teacher: false };
                  return key === 'authRolesSyncedUserId' ? userId : true;
                } },
                Meteor: {
                  status: () => ({ connected: true }), userId: () => userId,
                  loginWithPassword(username, password, callback) {
                    if (baseline) {
                      assert.equal(username, actor.username);
                      assert.equal(password, actor.password);
                      if (mode === 'baseline-denied') { callback({ error: 403 }); return; }
                      userId = actor.userId; callback(null); return;
                    }
                    assert.equal(baselineClosed, true);
                    assert.equal(baselineLoggedOut, true);
                    assert.notEqual(password, actor.password);
                    calls.push(['login', username]);
                    if (mode === 'unexpected-login') { callback(null); return; }
                    callback({ error: mode === 'unrelated-denial' ? 500 : 403, reason: policy.credentialRejectionReasons[0] });
                  },
                  logout(callback) { baselineLoggedOut = true; userId = null; callback(null); },
                  async callAsync(method, username) {
                    assert.equal(method, 'requestPasswordReset');
                    calls.push(['reset', username]);
                    if (mode === 'reset-domain') throw Object.assign(new Error('Synthetic request failed'), { error: 500 });
                    return { success: true };
                  },
                },
              };
              let tick = 0;
              globals.performance = { now: () => (tick += 100) };
              const original = Object.getOwnPropertyDescriptors(globalThis);
              try {
                for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
                return await fn(args);
              } finally {
                for (const key of Object.keys(globals)) {
                  if (original[key]) Object.defineProperty(globalThis, key, original[key]);
                  else delete globalThis[key];
                }
              }
            },
          };
        },
      };
    },
  };
  return {
    input: { target, namespace, actor, browser, requireOwnership: async () => mode !== 'foreign-owner',
      async confirmLease() { if (++leaseChecks === 2 && mode === 'lease-lost') throw new Error('Synthetic lease lost'); } },
    calls, counts: () => ({ opened, closed, leaseChecks }),
  };
}

test('comparison browser only samples after the owned baseline and follows exact paired order', async () => {
  const { input, calls, counts } = comparisonBrowserFixture();
  const result = await captureAuthenticationComparisonsV2(input);
  const absent = `${input.namespace}-missing@localhost.invalid`;
  const expected = AUTHENTICATION_COMPARISON_SAMPLES.flatMap(({ sampleSet, existingFirst }) => (
    existingFirst ? [input.actor.username, absent] : [absent, input.actor.username]
  ).map(username => [sampleSet, username]));
  assert.deepEqual(calls, expected);
  assert.deepEqual(result.proofs.map(row => row.status), ['PASS', 'PASS']);
  assert.deepEqual(counts(), { opened: 15, closed: 15, leaseChecks: 9 });
  assert(!JSON.stringify(result).includes(input.actor.username));
  assert(!JSON.stringify(result).includes(input.actor.password));
});

test('comparison browser closes every opened context when acquisition fails', async () => {
  const attemptedCounts = { 'foreign-owner': 0, redirect: 0, 'baseline-denied': 0,
    'lease-lost': 0, transport: 0, 'unrelated-denial': 2, 'unexpected-login': 2, 'reset-domain': 12 };
  for (const [mode, expectedCount] of Object.entries(attemptedCounts)) {
    const { input, calls, counts } = comparisonBrowserFixture(mode);
    await assert.rejects(captureAuthenticationComparisonsV2(input), /comparison incomplete|lease lost/i, mode);
    const { opened, closed } = counts();
    assert.equal(closed, opened, mode);
    assert.equal(calls.length, expectedCount, mode);
  }
});
