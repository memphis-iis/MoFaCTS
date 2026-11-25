import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSessionLifetime as evaluate } from '../../../common/securityAudit/sessionLifetime.ts';
import { parseAuditEvidence } from '../../../common/securityAudit/evidenceContracts.ts';
const fixture = days => ({ baselineOutcome: 'ALLOWED', freshSessionVerified: true,
  issuedAtMs: 2000000000000, expiresAtMs: 2000000000000 + days * 86400000 });
test('session lifetime enforces positive lower and thirty-day upper bounds with a fresh verified baseline', () => {
  for (const days of [1, 30, 0, -1, 31]) {
    const result = evaluate(fixture(days));
    assert.equal(result.status, days > 0 && days <= 30 ? 'PASS' : 'FAIL');
    const evidence = { summary: 'Newly issued verified session duration observed.', metrics: result.metrics };
    parseAuditEvidence('session-lifetime-v2', result.status, evidence);
    assert.throws(() => parseAuditEvidence('session-lifetime-v2', result.status === 'PASS' ? 'FAIL' : 'PASS', evidence));
  }
});
test('unverified, stale, failed or malformed session observations cannot pass the lifetime check', () => {
  for (const outcome of ['DENIED_BY_POLICY', 'DOMAIN_REJECTION', 'TRANSPORT_OR_RUNNER_ERROR', 'INCONCLUSIVE']) {
    assert.equal(evaluate({ ...fixture(30), baselineOutcome: outcome }).status, 'ERROR');
  }
  assert.equal(evaluate({ ...fixture(30), freshSessionVerified: false }).status, 'ERROR');
  for (const patch of [{ issuedAtMs: NaN }, { expiresAtMs: null }, { expiresAtMs: 'bad' }, { token: 'PRIVATE' }]) {
    assert.throws(() => evaluate({ ...fixture(30), ...patch }));
  }
  for (const key of ['authenticated', 'freshSessionVerified']) {
    const metrics = { ...evaluate(fixture(30)).metrics, [key]: false };
    assert.throws(() => parseAuditEvidence('session-lifetime-v2', 'PASS', { summary: 'Incomplete baseline.', metrics }));
  }
});
