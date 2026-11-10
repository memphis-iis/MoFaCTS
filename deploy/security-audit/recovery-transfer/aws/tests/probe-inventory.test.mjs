import '../../../../../mofacts/scripts/security-audit/tests/legacyProbeInventory.test.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import test from 'node:test';
import { source, bindings, privateKey } from '../../../../../mofacts/scripts/security-audit/tests/recovery-fixtures.mjs';
import { prepareRecoveryBundle } from '../../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { inspectRecoveryProbeInventory } from '../probe-inventory.mjs';
import { runRecoveryProbeInventory } from '../run-probe-inventory.mjs';
import { makeAwsReadClient } from '../sdk-client.mjs';
import { recoveryVersionId } from '../store.mjs';
import { target, credentials, runnerEnv } from './sdk-fixtures.mjs';
import { retentionCloud } from './retention-cloud.mjs';

const runId = '98765', candidateId = 'c'.repeat(64);
const readTarget = { ...target, roleArn: target.roleArn.replace('transfer', 'restore') };
function setup(options = {}) {
  const input = bindings(), fixture = JSON.parse(input.AUDIT_AUTH_FIXTURES_JSON);
  for (const probe of fixture.authorizationProbes) { probe.method = 'getStudentPerformanceByIdAndTDFIdFromHistory'; probe.args = ['PRIVATE-resource']; }
  fixture.publicationProbes[0].publication = 'userHistory'; fixture.publicationProbes[0].otherUserCanary = 'PRIVATE-canary';
  fixture.routeProbes[0].path = '/admin?token=PRIVATE-query'; fixture.downloadProbes[0].path = '/dynamicAssets/PRIVATE-resource';
  input.AUDIT_AUTH_FIXTURES_JSON = JSON.stringify(fixture);
  const prepared = prepareRecoveryBundle(input, source);
  const expected = { commit: source.commit, runId: source.runId, runAttempt: source.runAttempt,
    versionId: recoveryVersionId(source), bytes: prepared.bytes };
  const cloud = retentionCloud({ baseline: { ClientRequestToken: expected.versionId, SecretString: prepared.serialized },
    runId, sessionKind: 'inventory', ...options });
  cloud.versions.set(candidateId, { text: prepared.serialized, labels: ['AWSPREVIOUS'] });
  const env = runnerEnv(); for (const key of Object.keys(env)) if (/^(AUDIT_|TS_)/.test(key)) delete env[key];
  Object.assign(env, { GITHUB_SHA: 'b'.repeat(40), RECOVERY_EXPECTED_COMMIT: 'b'.repeat(40), GITHUB_RUN_ID: runId,
    GITHUB_WORKFLOW_REF: 'memphis-iis/MoFaCTS/.github/workflows/recovery-probe-inventory.yml@refs/heads/main',
    RECOVERY_ROLE_ARN: readTarget.roleArn, RECOVERY_BASELINE_COMMIT: expected.commit,
    RECOVERY_BASELINE_RUN_ID: expected.runId, RECOVERY_BASELINE_RUN_ATTEMPT: expected.runAttempt,
    RECOVERY_EXPECTED_BYTES: String(expected.bytes), RECOVERY_VERSION_ID: expected.versionId,
    RECOVERY_CANDIDATE_VERSION_ID: candidateId });
  const dependencies = { platform: 'linux', client: session => makeAwsReadClient(session, { requestHandler: cloud.handler }),
    fetchToken: async () => ({ ok: true, text: async () => '{"value":"synthetic.oidc.token"}' }) };
  return { prepared, cloud, expected, env, dependencies, invoke: () => runRecoveryProbeInventory(env, dependencies) };
}

test('probe inventory reads one exact version through the real SDK and emits no fixture credential/resource/canary values', async () => {
  const f = setup(), before = structuredClone([...f.cloud.versions]), result = await f.invoke();
  assert.equal(result.state, 'recovery-authentication-probe-inventory-unqualified');
  assert.equal(result.finalLabelsVerified, true); assert.equal(result.inventory.total, 9);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(result).includes('synthetic-only'), false);
  assert.deepEqual([...f.cloud.versions], before);
  assert.deepEqual(f.cloud.calls.map(row => row.operation), ['AssumeRoleWithWebIdentity', 'GetCallerIdentity',
    'DescribeSecret', 'ListSecretVersionIds', 'GetSecretValue', 'DescribeSecret', 'ListSecretVersionIds']);
  assert.deepEqual(f.cloud.calls.filter(row => row.operation === 'GetSecretValue').map(row => [row.input.VersionId, row.input.VersionStage]),
    [[f.expected.versionId, 'MOFACTS_RECOVERY_BASELINE']]);
  const digest = crypto.createHash('sha256').update(f.prepared.serialized).digest('hex');
  const decrypted = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(result.documentDigestCiphertext, 'base64'));
  assert.equal(decrypted.toString(), digest); assert.equal(JSON.stringify(result).includes(digest), false);
});

test('probe inventory refuses foreign identity and missing/finally moved version labels without guessing another version', async () => {
  const f = setup(), aws = makeAwsReadClient(credentials, { requestHandler: f.cloud.handler });
  await assert.rejects(inspectRecoveryProbeInventory({ target: readTarget, expected: f.expected, candidateId, runId: '123', aws, manifest: {} }), /aws-identity/);
  for (const point of ['before', 'after']) {
    const value = setup({ fault: (stage, operation, _input, context) => {
      if (stage === point && operation === 'GetSecretValue') context.versions.get(candidateId).labels = [];
    } });
    await assert.rejects(value.invoke());
    assert.equal(value.cloud.calls.some(row => /Put|Update|Delete/.test(row.operation)), false);
  }
});

test('probe inventory runner rejects production bindings, debug and foreign context before requesting credentials', async () => {
  for (const change of [{ AUDIT_AUTH_FIXTURES_JSON: 'PRIVATE' }, { AWS_ACCESS_KEY_ID: 'PRIVATE' },
    { RUNNER_DEBUG: '1' }, { GITHUB_REF: 'refs/heads/other' }, { GITHUB_WORKFLOW_REF: 'other' }]) {
    const f = setup(); await assert.rejects(runRecoveryProbeInventory({ ...f.env, ...change }, f.dependencies));
    assert.equal(f.cloud.calls.length, 0);
  }
});

test('read-only SDK capability denies version/stage writes independently of the inventory reader', async () => {
  const f = setup(), aws = makeAwsReadClient(credentials, { requestHandler: f.cloud.handler });
  for (const operation of ['put-secret-value', 'update-secret-version-stage']) await assert.rejects(aws('secretsmanager', operation, {}), /aws-operation/);
  assert.equal(f.cloud.calls.length, 0);
});

test('prepared inventory workflow stays inactive, manual, exact-source and isolated from deployment bindings', async () => {
  const text = await fs.readFile(new URL('../../probe-inventory-workflow.yml.review', import.meta.url), 'utf8');
  assert.match(text, /workflow_dispatch:/); assert.doesNotMatch(text, /schedule:|pull_request:|\n\s+push:/);
  assert.match(text, /github\.sha == inputs\.expected_commit/);
  assert.match(text, /environment: security-audit-recovery-rehearsal/);
  assert.match(text, /node-version: '24\.22\.1'/); assert.doesNotMatch(text, /secrets\.|AUDIT_AUTH_FIXTURES_JSON|TS_OAUTH/);
  assert.match(text, /run-probe-inventory\.mjs/);
  await assert.rejects(fs.stat(new URL('../../../../../.github/workflows/recovery-probe-inventory.yml', import.meta.url)), { code: 'ENOENT' });
  const policy = JSON.parse(await fs.readFile(new URL('../../restore-permissions-policy.example.json', import.meta.url), 'utf8'));
  assert.deepEqual(policy.Statement[0].Action, ['secretsmanager:DescribeSecret', 'secretsmanager:ListSecretVersionIds', 'secretsmanager:GetSecretValue']);
  assert.equal(policy.Statement[0].Resource, '<EXACT_PRECREATED_RECOVERY_SECRET_ARN>');
  assert.equal(policy.Statement[0].Condition.DateLessThan['aws:CurrentTime'], '<APPROVED_UTC_DEADLINE>');
});
