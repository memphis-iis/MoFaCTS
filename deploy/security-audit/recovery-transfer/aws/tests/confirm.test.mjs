import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { source, bindings, privateKey, category } from '../../../../../mofacts/scripts/security-audit/tests/recovery-fixtures.mjs';
import { prepareRecoveryBundle } from '../../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { confirmRecoveryVersions } from '../confirm.mjs';
import { runRecoveryConfirmation } from '../run-confirm.mjs';
import { restoreRecoveryBaseline } from '../restore.mjs';
import { makeAwsReadClient } from '../sdk-client.mjs';
import { recoveryVersionId } from '../store.mjs';
import { target, credentials, runnerEnv } from './sdk-fixtures.mjs';
import { retentionCloud } from './retention-cloud.mjs';
const runId = '98765';
const candidateId = 'c'.repeat(64);
const readTarget = { ...target, roleArn: target.roleArn.replace('transfer', 'restore') };
function setup(options = {}, terminalLf = true) {
  const input = bindings(); if (!terminalLf) input.AUDIT_SSH_PRIVATE_KEY = input.AUDIT_SSH_PRIVATE_KEY.slice(0, -1);
  const prepared = prepareRecoveryBundle(input, source);
  const expected = { commit: source.commit, runId: source.runId, runAttempt: source.runAttempt,
    versionId: recoveryVersionId(source), bytes: prepared.bytes };
  const cloud = retentionCloud({ baseline: { ClientRequestToken: expected.versionId, SecretString: prepared.serialized },
    runId, sessionKind: 'confirm', ...options });
  cloud.versions.set(candidateId, { text: prepared.serialized, labels: ['AWSPREVIOUS'] });
  const aws = makeAwsReadClient(credentials, { requestHandler: cloud.handler });
  const args = { target: readTarget, expected, candidateId, runId, aws };
  return { prepared, expected, cloud, args, invoke: () => confirmRecoveryVersions(args) };
}
function envFor(expected) {
  const env = runnerEnv(); for (const key of Object.keys(env)) if (/^(AUDIT_|TS_)/.test(key)) delete env[key];
  return { ...env, GITHUB_SHA: 'b'.repeat(40), RECOVERY_EXPECTED_COMMIT: 'b'.repeat(40), GITHUB_RUN_ID: runId,
    GITHUB_WORKFLOW_REF: 'memphis-iis/MoFaCTS/.github/workflows/recovery-confirm.yml@refs/heads/main',
    RECOVERY_ROLE_ARN: readTarget.roleArn, RECOVERY_BASELINE_COMMIT: expected.commit,
    RECOVERY_BASELINE_RUN_ID: expected.runId, RECOVERY_BASELINE_RUN_ATTEMPT: expected.runAttempt,
    RECOVERY_EXPECTED_BYTES: String(expected.bytes), RECOVERY_VERSION_ID: expected.versionId,
    RECOVERY_CANDIDATE_VERSION_ID: candidateId };
}

test('fresh confirmation reads both explicit settled versions through the real SDK without mutating and encrypts the complete digest', async () => {
  for (const lf of [true, false]) {
    const value = setup({}, lf); const before = structuredClone([...value.cloud.versions]);
    const result = await runRecoveryConfirmation(envFor(value.expected), { platform: 'linux',
      client: session => makeAwsReadClient(session, { requestHandler: value.cloud.handler }),
      fetchToken: async () => ({ ok: true, text: async () => '{"value":"synthetic.oidc.token"}' }) });
    assert.equal(result.state, 'recovery-existing-versions-confirmed-unqualified');
    assert.equal(result.recoveredBoth && result.bytesEqual && result.finalLabelsVerified, true);
    assert.equal(result.bytes, value.expected.bytes); assert.equal(result.secretBindings, 9); assert.equal(result.publicBindings, 1);
    assert.deepEqual([...value.cloud.versions], before);
    assert.deepEqual(value.cloud.calls.map(c => c.operation), ['AssumeRoleWithWebIdentity','GetCallerIdentity',
      'DescribeSecret','ListSecretVersionIds','GetSecretValue','GetSecretValue','DescribeSecret','ListSecretVersionIds']);
    assert.deepEqual(value.cloud.calls.filter(c => c.operation === 'GetSecretValue').map(c => [c.input.VersionId,c.input.VersionStage]),
      [[value.expected.versionId,'MOFACTS_RECOVERY_BASELINE'],[candidateId,'AWSPREVIOUS']]);
    const digest = crypto.createHash('sha256').update(value.prepared.serialized).digest('hex');
    const decrypted = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256' }, Buffer.from(result.documentDigestCiphertext, 'base64'));
    assert.equal(decrypted.toString('ascii'), digest); assert.equal(JSON.stringify(result).includes(digest), false);
    assert.equal(JSON.stringify(result).includes('synthetic'), false);
  }
});

test('foreign, deprecated, duplicate or paginated versions and wrong configuration/labels refuse before reading values', async () => {
  for (const mutate of [
    (op, r) => { if (op === 'ListSecretVersionIds') r.NextToken = 'more'; },
    (op, r) => { if (op === 'ListSecretVersionIds') r.Versions.push({ VersionId: 'd'.repeat(64), VersionStages: [] }); },
    (op, r) => { if (op === 'ListSecretVersionIds') r.Versions[1] = r.Versions[0]; },
    (op, r) => { if (op === 'DescribeSecret') r.VersionIdsToStages[candidateId] = ['AWSPREVIOUS','MOFACTS_RECOVERY_CANDIDATE']; },
    (op, r) => { if (op === 'DescribeSecret') r.RotationEnabled = true; },
    (op, r) => { if (op === 'DescribeSecret') r.KmsKeyId = 'different'; },
    (op, r) => { if (op === 'DescribeSecret') r.ReplicationStatus = [{ Region: 'us-east-1' }]; },
  ]) {
    const value = setup({ mutate }); await assert.rejects(value.invoke());
    assert.equal(value.cloud.calls.some(c => c.operation === 'GetSecretValue'), false);
  }
});

test('wrong payload identity, labels, binary, bytes or same-length differing complete contents fail with no writes', async () => {
  for (const mutate of [
    r => { r.VersionId = 'wrong'; }, r => { r.SecretString += ' '; },
    r => { r.VersionStages = ['AWSCURRENT']; }, r => { r.SecretBinary = 'AA=='; },
    r => { const v = JSON.parse(r.SecretString); const text = v.secrets.AUDIT_IMAPS_PASSWORD;
      v.secrets.AUDIT_IMAPS_PASSWORD = (text[0] === 'x' ? 'z' : 'x') + text.slice(1); r.SecretString = JSON.stringify(v); },
  ]) {
    const value = setup({ mutate(op, r) { if (op === 'GetSecretValue' && r.VersionId === candidateId) mutate(r); } });
    await assert.rejects(value.invoke()); assert.equal(value.cloud.calls.some(c => /Put|Update|Delete/.test(c.operation)), false);
  }
});

test('changed post-read inventory and SDK failures never become confirmation success or trigger a retry', async () => {
  const value = setup({ mutate(op, r, { calls }) {
    if (op === 'DescribeSecret' && calls.filter(c => c.operation === 'GetSecretValue').length === 2) delete r.VersionIdsToStages[candidateId];
  } }); await assert.rejects(value.invoke(), category('version-labels'));
  const failed = setup({ fault(when, op) { if (when === 'before' && op === 'GetSecretValue') throw new Error('synthetic sensitive detail'); } });
  await assert.rejects(failed.invoke(), category('aws-call'));
  assert.equal(failed.cloud.calls.filter(c => c.operation === 'GetSecretValue').length, 1);
});

test('confirmation validates candidate, source, role, runner and deployment isolation before OIDC; original cold reader stays strict', async () => {
  const value = setup(); const env = envFor(value.expected);
  const options = { platform: 'linux', fetchToken() { assert.fail('OIDC'); }, client() { assert.fail('AWS'); } };
  for (const override of [{ RECOVERY_CANDIDATE_VERSION_ID: value.expected.versionId }, { RECOVERY_CANDIDATE_VERSION_ID: 'wrong' },
    { RECOVERY_VERSION_ID: candidateId }, { RECOVERY_EXPECTED_BYTES: '1e4' }, { RECOVERY_ROLE_ARN: target.roleArn },
    { AUDIT_AUTH_FIXTURES_JSON: '' }, { TS_OAUTH_SECRET: '' }, { AWS_PROFILE: '' }, { GITHUB_WORKFLOW_REF: 'other' }]) {
    await assert.rejects(runRecoveryConfirmation({ ...env, ...override }, options));
  }
  await assert.rejects(confirmRecoveryVersions({ ...value.args, aws: async () => ({ Account: 'other' }) }), category('aws-identity'));
  // Rebind only the synthetic identity, to reach the unchanged original reader's one-version check.
  await assert.rejects(restoreRecoveryBaseline({ ...value.args, aws: async (service, op, input) => op === 'get-caller-identity'
    ? { Account: target.accountId, Arn: `arn:aws:sts::${target.accountId}:assumed-role/mofacts-recovery-restore/mofacts-restore-${runId}` }
    : value.args.aws(service, op, input) }), category('version-labels'));
});

test('confirmation CLI exposes only a fixed safe category on invalid input', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../run-confirm.mjs', import.meta.url))], {
    encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false', AUDIT_SSH_PRIVATE_KEY: 'synthetic-private-detail' } });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Recovery confirmation stopped: runner-context; reconcile before retry\n');
});
