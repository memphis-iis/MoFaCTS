import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTHORIZATION_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { runSelectedAuthorizationV2 } from '../authentication/selectedCasesV2.mjs';
import { parseAuthorizationBindingsV2 } from '../authentication/bindingsV2.mjs';
import { authorizationBindingsFixture } from './fixtures/authorizationBindingsV2.mjs';

function adapter(change = () => {}) {
  const calls = [];
  function sample(entry, baselines) {
    calls.push(entry.verificationId);
    if (entry.expectedPolicy === 'deny') assert(baselines.every(row => calls.includes(row.verificationId)));
    let value;
    if (entry.family === 'method') value = entry.expectedPolicy === 'allow'
      ? { state: 'returned', allowedObservationMatched: true } : { state: 'rejected', code: entry.policyDenialCodes[0] };
    if (entry.family === 'publication') value = { ready: true, readable: true, bindingMatched: true,
      ownObserved: entry.actor !== 'anonymous', foreignObserved: false, anonymous: entry.actor === 'anonymous' };
    if (entry.family === 'route') value = { authReady: true, connected: true, identityMatched: true,
      requestedRendered: entry.expectedPolicy === 'allow', deniedRendered: entry.expectedPolicy === 'deny' };
    if (entry.family === 'download') value = entry.expectedPolicy === 'allow' ? { allowedObservationMatched: true }
      : { baselineVerified: baselines.every(row => row.passed), sameCapability: true, status: 404 };
    return change(entry, value) ?? value;
  }
  return { method: sample, publication: sample, route: sample, download: sample, calls };
}
test('the selected runner executes all source cases once with their allowed baselines first', async () => {
  const io = adapter(), result = await runSelectedAuthorizationV2(io);
  assert.equal(result.status, 'PASS'); assert.equal(io.calls.length, 29); assert.equal(new Set(io.calls).size, 29);
  assert.deepEqual(new Set(result.results.map(row => row.verificationId)), new Set(AUTHORIZATION_VERIFICATIONS.map(row => row.verificationId)));
});
test('the runner retains an observed leak/allowed route as FAIL and does not accept generic method errors', async () => {
  for (const [id, change, expected] of [
    ['authz.method.audit-list.teacherA', () => ({ state: 'rejected', code: '404' }), 'ERROR'],
    ['authz.publication.progress-private.learnerA', (entry, row) => ({ ...row, foreignObserved: true }), 'FAIL'],
    ['authz.route.audit.teacherB', (entry, row) => ({ ...row, requestedRendered: true, deniedRendered: false }), 'FAIL'],
    ['authz.download.history.anonymous', (entry, row) => ({ ...row, baselineVerified: false }), 'ERROR'],
  ]) {
    const result = await runSelectedAuthorizationV2(adapter((entry, row) => entry.verificationId === id ? change(entry, row) : row));
    assert.equal(result.status, expected);
  }
});
test('thrown acquisition failures, unreadable snapshots and extra/raw observations never become policy matches', async () => {
  for (const change of [() => { throw new Error('unretained private diagnostic'); },
    () => ({ state: 'returned', allowedObservationMatched: true, rawResponse: 'unretained' }),
    () => ({ ready: true, readable: false, bindingMatched: true, ownObserved: true, foreignObserved: false, anonymous: false })]) {
    const result = await runSelectedAuthorizationV2(adapter(change)); assert.equal(result.status, 'ERROR');
    assert(!JSON.stringify(result).includes('unretained'));
  }
});

test('bindings contain exact sensitive values and aliases; expected policies, swapped identities and missing canaries are rejected', () => {
  const value = authorizationBindingsFixture(); assert.deepEqual(parseAuthorizationBindingsV2(value), value);
  for (const change of [row => { row.expectDenied = true; }, row => { delete row.values['progress.teacherB']; },
    row => { row.values['progress.learnerB'] = row.values['progress.learnerA']; },
    row => { row.actors.learnerB.userId = row.actors.admin.userId; },
    row => { row.values['performance.learnerB'].stimsIntroduced = 0; },
    row => { row.actors.foreign = row.actors.admin; }]) {
    const input = structuredClone(value); change(input); assert.throws(() => parseAuthorizationBindingsV2(input));
  }
});
