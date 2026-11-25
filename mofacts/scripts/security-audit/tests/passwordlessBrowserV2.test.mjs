import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { passwordlessEligibilityV2 as eligible, redactExpectedResumeBodyV2 as body,
  capturePasswordlessBrowserV2 as capture, captureDisclosureChannelsV2 as channels } from '../authentication/passwordlessBrowserV2.mjs';
test('progress-backed eligibility accepts the laboratory return path without new flags or identity fields', () => {
  assert.equal(eligible({ identityMatched: true, explicitExperiment: false, ownedProgressVerified: true }), true);
  assert.equal(eligible({ identityMatched: true, explicitExperiment: true, ownedProgressVerified: false }), true);
  assert.equal(eligible({ identityMatched: false, explicitExperiment: true, ownedProgressVerified: true }), false);
  assert.equal(eligible({ identityMatched: true, explicitExperiment: false, ownedProgressVerified: false }), false);
  assert.throws(() => eligible({ identityMatched: true, explicitExperiment: false, ownedProgressVerified: true, passwordRequired: true }));
});
test('only the exact native own-session resume handoff is excluded from HTTP disclosure inspection', () => {
  const token = 'PRIVATE-synthetic-session-capability';
  const request = { target: 'https://staging2.optimallearning.org', url: 'https://staging2.optimallearning.org/sockjs/123/session/xhr_send', token,
    body: JSON.stringify([JSON.stringify({ msg: 'method', id: '1', method: 'login', params: [{ resume: token }] })]) };
  assert.ok(!body(request).includes(token));
  for (const change of [{ url: 'https://other.invalid/sockjs/123/session/xhr_send' }, { url: 'https://staging2.optimallearning.org/unrelated' },
    { body: JSON.stringify([JSON.stringify({ msg: 'method', id: '1', method: 'unrelated', params: [{ resume: token }] })]) },
    { body: JSON.stringify([JSON.stringify({ msg: 'method', id: '1', method: 'login', params: [{ resume: token, unexpected: token }] })]) }]) {
    assert.ok(body({ ...request, ...change }).includes(token));
  }
});
test('foreign targets, absent lease and substituted actors reject before any context creation', async () => {
  let created = 0; const browser = { async newContext() { created++; throw Error('Should not open'); } };
  const base = { browser, namespace: 'mofacts_audit_fixture_0123456789ab', requireLease: async () => true };
  await assert.rejects(capture({ ...base, target: 'https://production.invalid' }));
  await assert.rejects(capture({ ...base, target: 'https://staging2.optimallearning.org', requireLease: async () => false }));
  assert.equal(created, 0);
});
test('stalled console decoding is bounded and late values cannot change a finished observation', async () => {
  const context = new EventEmitter(), page = new EventEmitter(), capture = channels(context); context.emit('page', page);
  let complete;
  page.emit('console', { text: () => 'synthetic', args: () => [{ jsonValue: () => new Promise(resolve => { complete = resolve; }) }] });
  const result = await capture.finish('PRIVATE-synthetic-session');
  assert.equal(result.console.complete, false); const before = JSON.stringify(result);
  complete('PRIVATE-late-value'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(result), before); assert.ok(!before.includes('PRIVATE-late-value'));
});
