import { AUTHENTICATION_COMPARISON_POLICY as policy, AUTHENTICATION_COMPARISON_SAMPLES,
  AUTHENTICATION_COMPARISON_BASELINE } from '../../../common/securityAudit/verificationCatalog.ts';
import { AUTHORIZATION_OUTCOME_CATEGORIES } from '../../../common/securityAudit/authorizationOutcomes.ts';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { proofRecord } from '../../../common/securityAudit/proofFields.ts';
import { classifyAuthenticationTiming } from '../authentication-probes.mjs';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';

const invalid = () => { throw new Error('Authentication comparison observation is invalid'); };
const categories = ['observed', 'rate-limited', 'domain-rejection', 'transport-error', 'inconclusive'];
function duration(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > policy.maximumAttemptMs) invalid();
  return value;
}

// Wire values stay in memory only. Retained pair observations contain categories,
// durations and equality, never identifiers, messages, details or response hashes.
function response(sampleSet, value) {
  if (!['login', 'reset'].includes(sampleSet)) invalid();
  const row = proofRecord(value, value?.state === 'returned' ? ['state', 'value', 'elapsedMs']
    : value?.state === 'rejected' ? ['state', 'code', 'reason', 'details', 'elapsedMs'] : ['state', 'elapsedMs']);
  const elapsedMs = duration(row.elapsedMs);
  if (['transport-error', 'inconclusive'].includes(row.state)) return { category: row.state, elapsedMs };
  if (row.state === 'returned') {
    if (sampleSet !== 'reset' || !row.value || typeof row.value !== 'object' || Array.isArray(row.value)
        || row.value.success !== true) return { category: 'domain-rejection', elapsedMs };
    if (Object.keys(row.value).length > 16 || Object.values(row.value).some(item =>
      !['string', 'number', 'boolean'].includes(typeof item) && item !== null
      || typeof item === 'string' && item.length > 256
      || typeof item === 'number' && !Number.isFinite(item))) invalid();
    const fingerprint = canonicalAuditJson(row.value);
    if (Buffer.byteLength(fingerprint) > 4096) invalid();
    return { category: 'observed', elapsedMs, fingerprint };
  }
  if (row.state !== 'rejected' || !['string', 'number'].includes(typeof row.code)) invalid();
  const code = String(row.code);
  if (!code || code.length > 80) invalid();
  if (policy.rateLimitCodes.includes(code)) return { category: 'rate-limited', elapsedMs };
  if (sampleSet !== 'login' || code !== policy.credentialRejectionCode
      || !policy.credentialRejectionReasons.includes(row.reason)
      || row.details !== null && (typeof row.details !== 'string' || row.details.length > 256)) {
    return { category: 'domain-rejection', elapsedMs };
  }
  return { category: 'observed', elapsedMs, fingerprint: canonicalAuditJson([code, row.reason, row.details]) };
}

export function captureAuthenticationComparisonPairV2(sampleId, existing, missing) {
  const sample = AUTHENTICATION_COMPARISON_SAMPLES.find(row => row.sampleId === sampleId);
  if (!sample) invalid();
  const { sampleSet } = sample;
  const left = response(sampleSet, existing), right = response(sampleSet, missing);
  return { sampleId, existing: { category: left.category, elapsedMs: left.elapsedMs },
    missing: { category: right.category, elapsedMs: right.elapsedMs },
    responseMatched: left.category === 'observed' && right.category === 'observed' && left.fingerprint === right.fingerprint };
}

function pairs(value, sampleSet) {
  if (!Array.isArray(value) || value.length !== policy[sampleSet].sampleCount) invalid();
  const expected = AUTHENTICATION_COMPARISON_SAMPLES.filter(row => row.sampleSet === sampleSet);
  return value.map((item, index) => {
    const row = proofRecord(item, ['sampleId', 'existing', 'missing', 'responseMatched']);
    if (typeof row.responseMatched !== 'boolean' || row.sampleId !== expected[index].sampleId) invalid();
    const result = { sampleId: row.sampleId, responseMatched: row.responseMatched };
    for (const side of ['existing', 'missing']) {
      const observation = proofRecord(row[side], ['category', 'elapsedMs']);
      if (!categories.includes(observation.category)) invalid();
      result[side] = { category: observation.category, elapsedMs: duration(observation.elapsedMs) };
    }
    if (row.responseMatched && [result.existing, result.missing].some(entry => entry.category !== 'observed')) invalid();
    return result;
  });
}

// Source qualification only: active reports retain their released catalog and
// evidence meanings until a separately qualified catalog/receiver cutover.
export function evaluateAuthenticationComparisonsV2(value) {
  const row = proofRecord(value, ['bindingsVerified', 'environmentLeaseHeld', 'baselineVerificationId', 'baselineOutcome', 'loginPairs', 'resetPairs']);
  if (typeof row.bindingsVerified !== 'boolean' || typeof row.environmentLeaseHeld !== 'boolean'
      || row.baselineVerificationId !== AUTHENTICATION_COMPARISON_BASELINE.verificationId
      || !AUTHORIZATION_OUTCOME_CATEGORIES.includes(row.baselineOutcome)) invalid();
  const login = pairs(row.loginPairs, 'login'), reset = pairs(row.resetPairs, 'reset');
  const attempts = [...login, ...reset].flatMap(pair => [pair.existing, pair.missing]);
  const counts = Object.fromEntries(categories.map(category => [category, attempts.filter(attempt => attempt.category === category).length]));
  const ready = row.bindingsVerified && row.environmentLeaseHeld && row.baselineOutcome === 'ALLOWED';
  const complete = ready && attempts.every(attempt => attempt.category === 'observed');
  if (!complete) return { enumeration: { status: 'ERROR' }, timing: { status: 'ERROR' }, counts };
  const matches = { loginResponseMatch: login.every(pair => pair.responseMatched), resetResponseMatch: reset.every(pair => pair.responseMatched) };
  const timing = classifyAuthenticationTiming(login.map(pair => pair.existing.elapsedMs), login.map(pair => pair.missing.elapsedMs),
    reset.map(pair => pair.existing.elapsedMs), reset.map(pair => pair.missing.elapsedMs));
  return { enumeration: { status: Object.values(matches).every(Boolean) ? 'PASS' : 'FAIL', ...matches }, timing, counts };
}

export function authenticationComparisonProofsV2(value) {
  const result = evaluateAuthenticationComparisonsV2(value);
  const common = { loginPairCount: policy.login.sampleCount, resetPairCount: policy.reset.sampleCount,
    baselineVerified: value.baselineOutcome === 'ALLOWED', bindingsVerified: value.bindingsVerified,
    environmentLeaseHeld: value.environmentLeaseHeld, rateLimitedAttemptCount: result.counts['rate-limited'],
    domainRejectionCount: result.counts['domain-rejection'], transportErrorCount: result.counts['transport-error'],
    inconclusiveCaseCount: result.counts.inconclusive };
  return ['enumeration', 'timing'].map(name => {
    const observation = result[name], evidenceContract = `${name}-observations-v2`;
    let evidence;
    if (observation.status === 'ERROR') {
      evidence = { summary: 'Authentication comparison evidence is incomplete.',
        category: common.transportErrorCount > 0 ? 'transport' : 'evidence-incomplete' };
    } else {
      const measurements = name === 'enumeration'
        ? { loginResponseMatch: observation.loginResponseMatch, resetResponseMatch: observation.resetResponseMatch }
        : Object.fromEntries(['login', 'reset'].flatMap(family => Object.entries(observation[family])
          .filter(([key]) => key !== 'status').map(([key, measurement]) =>
            [`${family}${key[0].toUpperCase()}${key.slice(1)}`, measurement])));
      evidence = { summary: name === 'enumeration' ? 'Bounded public responses compared.' : 'Paired authentication timings compared.',
        metrics: { ...common, ...measurements } };
    }
    return { controlId: `authentication.${name}`, status: observation.status, evidenceContract,
      evidence: parseAuditEvidence(evidenceContract, observation.status, evidence) };
  });
}
