import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTHORIZATION_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { evaluateAuthorizationVerifications } from '../../../common/securityAudit/authorizationVerification.ts';
import { publicationAuthorizationOutcome, downloadReplayAuthorizationOutcome } from '../../../common/securityAudit/authorizationOutcomes.ts';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';

const complete = () => AUTHORIZATION_VERIFICATIONS.map(entry => ({ verificationId: entry.verificationId,
  outcome: entry.expectedPolicy === 'allow' ? 'ALLOWED' : 'DENIED_BY_POLICY' }));
test('exact executed membership and successful referenced baselines are required for authorization PASS', () => {
  const result = evaluateAuthorizationVerifications(complete());
  assert.equal(result.status, 'PASS'); assert.equal(result.metrics.expectedCaseCount, 29);
  parseAuditEvidence('verification-observations-v1', result.status, { summary: 'Source-owned selected verification cases completed.', metrics: result.metrics });
  assert.equal(evaluateAuthorizationVerifications(complete().slice(1)).status, 'ERROR');
  assert.equal(evaluateAuthorizationVerifications([]).status, 'ERROR');
  assert.throws(() => evaluateAuthorizationVerifications([...complete().slice(1), complete()[1]]));
  assert.throws(() => evaluateAuthorizationVerifications([{ verificationId: 'unknown', outcome: 'ALLOWED' }]));
  assert.throws(() => evaluateAuthorizationVerifications([{ ...complete()[0], rawResponse: 'unretained' }]));
});
test('a failed positive baseline prevents related denied cases becoming PASS', () => {
  const value = complete(); value.find(row => row.verificationId === 'authz.publication.progress-own.learnerA').outcome = 'TRANSPORT_OR_RUNNER_ERROR';
  const result = evaluateAuthorizationVerifications(value); assert.equal(result.status, 'ERROR');
  assert.equal(result.results.find(row => row.verificationId === 'authz.publication.progress-private.anonymous').outcome, 'INCONCLUSIVE');
});
test('source-policy violations remain FAIL; domain, runner and inconclusive results remain ERROR', () => {
  for (const outcome of ['ALLOWED', 'DOMAIN_REJECTION', 'TRANSPORT_OR_RUNNER_ERROR', 'INCONCLUSIVE']) {
    const value = complete(); value.find(row => row.verificationId === 'authz.method.audit-list.teacherA').outcome = outcome;
    const result = evaluateAuthorizationVerifications(value);
    assert.equal(result.status, outcome === 'ALLOWED' ? 'FAIL' : 'ERROR');
    if (result.status === 'FAIL') parseAuditEvidence('verification-observations-v1', 'FAIL',
      { summary: 'A selected authorization case violated source policy.', metrics: result.metrics });
  }
});
test('publication readiness, readable scoped state and an actual own positive are distinct requirements', () => {
  const valid = { ready: true, readable: true, bindingMatched: true, ownObserved: true, foreignObserved: false, anonymous: false };
  assert.equal(publicationAuthorizationOutcome(valid, 'allow'), 'ALLOWED');
  assert.equal(publicationAuthorizationOutcome(valid, 'deny'), 'DENIED_BY_POLICY');
  for (const key of ['ready', 'readable', 'bindingMatched', 'ownObserved']) {
    assert.equal(publicationAuthorizationOutcome({ ...valid, [key]: false }, 'allow'), 'INCONCLUSIVE');
  }
  assert.equal(publicationAuthorizationOutcome({ ...valid, foreignObserved: true }, 'deny'), 'ALLOWED');
  assert.equal(publicationAuthorizationOutcome({ ...valid, ownObserved: false }, 'deny'), 'INCONCLUSIVE');
  assert.equal(publicationAuthorizationOutcome({ ...valid, ownObserved: false, anonymous: true }, 'deny'), 'DENIED_BY_POLICY');
  assert.throws(() => publicationAuthorizationOutcome({ ...valid, ready: 'true' }, 'deny'));
});
test('download 404 proves denial only for the exact capability consumed by a content-verified positive', () => {
  const valid = { baselineVerified: true, sameCapability: true, status: 404 };
  assert.equal(downloadReplayAuthorizationOutcome(valid), 'DENIED_BY_POLICY');
  for (const key of ['baselineVerified', 'sameCapability']) assert.equal(downloadReplayAuthorizationOutcome({ ...valid, [key]: false }), 'INCONCLUSIVE');
  assert.equal(downloadReplayAuthorizationOutcome({ ...valid, status: 200 }), 'ALLOWED');
  for (const status of [401, 403, 500, 503]) assert.equal(downloadReplayAuthorizationOutcome({ ...valid, status }), 'DOMAIN_REJECTION');
  assert.throws(() => downloadReplayAuthorizationOutcome({ ...valid, status: '404' }));
});
