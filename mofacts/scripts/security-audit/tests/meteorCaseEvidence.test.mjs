import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { FRAMEWORK_AUTH_VERIFICATIONS } from '../../../common/securityAudit/verificationCatalog.ts';
import { observeMeteorCaseEvidence } from '../qualification/meteorCaseEvidence.mjs';

const { verificationId, suite, cases } = FRAMEWORK_AUTH_VERIFICATIONS.onLogin;
const modules = { server: ['server/auth.test.ts'], client: ['client/shell.test.ts'] };
const hash = value => createHash('sha256').update(value).digest('hex');
const authId = occurrence => hash(JSON.stringify(['server', JSON.stringify([suite, cases[0]]), occurrence]));

function run(tests) {
  const environments = ['server', 'client'].map(side => {
    const rows = [{ id: hash(side), outcome: 'passed' }, ...(side === 'server' ? tests : [])];
    return { schema: 'MeteorEnvironmentEvidenceV1', side, modules: modules[side], tests: rows, hookFailures: 0,
      counts: { passed: rows.filter(row => row.outcome === 'passed').length, failed: 0,
        pending: rows.filter(row => row.outcome === 'pending').length } };
  });
  return Buffer.from(JSON.stringify({ schema: 'MeteorTestRunEvidenceV1', exitStatus: 0, environments }));
}

test('binds declared Meteor cases to the exact retained run and outcome evidence', async () => {
  const bytes = run([{ id: authId(0), outcome: 'passed' }]);
  const result = await observeMeteorCaseEvidence(bytes, modules, hash(bytes), [verificationId]);
  assert.equal(result.executions.length, 1);
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.executions[0].verificationId, verificationId);
  assert.equal(result.executions[0].runEvidenceSha256, hash(bytes));
  assert.match(result.executions[0].resultEvidenceSha256, /^[0-9a-f]{64}$/);
  await assert.rejects(observeMeteorCaseEvidence(bytes, modules, 'a'.repeat(64), [verificationId]), /retained run digest/);
  await assert.rejects(observeMeteorCaseEvidence(bytes, modules, hash(bytes), ['unreviewed.verification']), /selection/);
});

test('separately records missing, pending and duplicate-title cases', async () => {
  for (const [tests, reason] of [
    [[], 'missing-case'],
    [[{ id: authId(0), outcome: 'pending' }], 'case-did-not-pass'],
    [[{ id: authId(0), outcome: 'passed' }, { id: authId(1), outcome: 'passed' }], 'ambiguous-case'],
  ]) {
    const bytes = run(tests);
    assert.deepEqual(await observeMeteorCaseEvidence(bytes, modules, hash(bytes), [verificationId]),
      { executions: [], unresolved: [{ verificationId, reason }] });
  }
});
