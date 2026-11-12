import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTHENTICATION_COMPARISON_POLICY as policy, AUTHENTICATION_PROTOCOL_VERIFICATIONS,
  AUTHENTICATION_PROTOCOL_MUTATIONS, AUTHORIZATION_VERIFICATIONS, AUTHENTICATION_COMPARISON_BASELINE,
  AUTHENTICATION_COMPARISON_SAMPLES, AUDIT_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { captureAuthenticationComparisonPairV2 as capture, evaluateAuthenticationComparisonsV2 as evaluate } from '../authentication/comparisonV2.mjs';
import { authenticationComparisonProofsV2 as proofs } from '../authentication/comparisonV2.mjs';
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
  assert.equal(AUDIT_VERIFICATIONS.length, 34);
  assert.equal(new Set(AUDIT_VERIFICATIONS.map(row => row.verificationId)).size, 34);
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
