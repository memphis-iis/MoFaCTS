import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTHENTICATION_MATERIAL_CHANNELS as channels, AUTHENTICATION_THROTTLE_CASES as cases } from '../../../common/securityAudit/verificationCatalog.ts';
import { observeAuthenticationMaterialV2 as material } from '../authentication/materialV2.mjs';
import { evaluateAuthenticationThrottlesV2 as throttle } from '../authentication/throttleV2.mjs';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';
const secret = 'PRIVATE-synthetic-capability';
const materialInput = () => ({ baselineVerified: true, canaries: [secret], channels: Object.fromEntries(channels.map(name => [name, { installed: true, complete: true, values: ['synthetic-public-text'] }])) });
const denied = code => ({ state: 'rejected', code, reason: code === '403' ? 'Incorrect password' : 'Too many requests', details: null, elapsedMs: 10 });
const throttleInput = () => ({ bindingsVerified: true, environmentLeaseHeld: true, baselineVerified: true,
  scopes: Object.fromEntries(cases.map(row => [row.scope, { freshWindowVerified: true, scopeIsolationVerified: true,
    attempts: [denied('403'), denied(row.policyDenialCodes[0])] }])) });
test('material checks cover all five installed channels and never return the matching capability', () => {
  assert.equal(material(materialInput()).status, 'PASS');
  for (const name of channels) { const value = materialInput(); value.channels[name].values.push(secret); const result = material(value);
    assert.equal(result.status, 'FAIL'); assert.equal(result.evidence.metrics.matchedCaseCount, 4);
    assert.ok(!JSON.stringify(result).includes(secret)); parseAuditEvidence('verification-observations-v1', result.status, result.evidence); }
});
test('absent hooks, incomplete capture and missing baseline are ERROR; unexpected channel names and overflow are rejected', () => {
  for (const name of channels) for (const flag of ['installed', 'complete']) { const value = materialInput(); value.channels[name][flag] = false; assert.equal(material(value).status, 'ERROR'); }
  assert.equal(material({ ...materialInput(), baselineVerified: false }).status, 'ERROR');
  const value = materialInput(); value.channels.localStorage = { installed: true, complete: true, values: [secret] }; assert.throws(() => material(value));
  value.channels = materialInput().channels; value.channels.dom.values = ['x'.repeat(65537)]; assert.throws(() => material(value));
});
test('three isolated throttle dimensions require exact reviewed codes and a preceding credential rejection', () => {
  const result = throttle(throttleInput()); assert.equal(result.status, 'PASS'); parseAuditEvidence('verification-observations-v1', 'PASS', result.evidence);
  for (const definition of cases) { const value = throttleInput(); value.scopes[definition.scope].attempts = Array.from({ length: definition.maximumAttempts }, () => denied('403'));
    assert.equal(throttle(value).status, 'FAIL'); }
});
test('foreign limiter, dirty scope, too-short run and transport/domain errors cannot pass throttling', () => {
  for (const definition of cases) for (const mutate of [scope => { scope.freshWindowVerified = false; }, scope => { scope.scopeIsolationVerified = false; },
    scope => { scope.attempts = [denied(definition.policyDenialCodes[0])]; }, scope => { scope.attempts[1] = denied('500'); },
    scope => { scope.attempts[1] = { state: 'transport-error', elapsedMs: 10 }; }, scope => { scope.attempts[1] = denied('unreviewed-lockout'); }]) {
    const value = throttleInput(); mutate(value.scopes[definition.scope]); assert.equal(throttle(value).status, 'ERROR');
  }
  const value = throttleInput(); value.scopes.identifier.attempts[1] = denied('too-many-requests'); assert.equal(throttle(value).status, 'ERROR');
});
