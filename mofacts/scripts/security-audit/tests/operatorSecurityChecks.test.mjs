import assert from 'node:assert/strict';
import test from 'node:test';
import { runSecurityLanes } from '../../../../deploy/security-audit/run-security-checks.mjs';

test('operator security lane preserves four jobs and the existing dependency policy', () => {
  const calls = [];
  const result = runSecurityLanes('/source', '/evidence', spec => { calls.push(spec); return 0; });
  assert.deepEqual(result.map(row => row.name), ['gitleaks', 'source-contracts', 'application', 'sidecar-mongo']);
  assert.ok(result.every(row => row.status === 'PASS'));
  assert.ok(calls[0].args.includes('--redact'));
  assert.ok(calls[0].args.includes('--pull=never'));
  assert.ok(calls[0].args.includes('/source:/repo:ro'));
  assert.deepEqual(calls.filter(row => row.name.endsWith('-policy')).map(row => row.args[1]), ['application', 'sidecar-mongo']);
  assert.equal(calls.filter(row => row.executable === 'npm' && row.args[0] === 'audit').length, 4);
  assert.ok(calls.some(row => row.args.includes('scripts/security-audit/source-security.test.mjs')));
});

test('an unavailable scanner fails its lane without hiding independent checks', () => {
  const calls = [];
  const result = runSecurityLanes('/source', '/evidence', spec => {
    calls.push(spec.name);
    return spec.name === 'gitleaks' ? null : 0;
  });
  assert.equal(result[0].status, 'FAIL');
  assert.ok(result.slice(1).every(row => row.status === 'PASS'));
  assert.ok(calls.includes('sidecar-mongo-policy'));
});

test('audit advisory exit is evaluated by policy; execution error cannot become PASS', () => {
  const calls = [];
  const result = runSecurityLanes('/source', '/evidence', spec => {
    calls.push(spec.name);
    if (spec.name === 'application-all') return 1;
    if (spec.name === 'application-policy') return 1;
    if (spec.name === 'sidecar-mongo-all') return 2;
    return 0;
  });
  assert.equal(result[2].status, 'FAIL');
  assert.equal(result[3].status, 'FAIL');
  assert.ok(calls.includes('application-policy'));
  assert.ok(!calls.includes('sidecar-mongo-policy'));
});
