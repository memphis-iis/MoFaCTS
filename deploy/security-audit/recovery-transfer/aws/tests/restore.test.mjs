import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { source, bindings, category, privateKey } from '../../../../../mofacts/scripts/security-audit/tests/recovery-fixtures.mjs';
import { prepareRecoveryBundle } from '../../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { makeAwsReadClient } from '../sdk-client.mjs';
import { runRecoveryRestore } from '../run-restore.mjs';
import { restoreRecoveryBaseline } from '../restore.mjs';
import { recoveryVersionId } from '../store.mjs';
import { sdkCloud, runnerEnv, target, credentials } from './sdk-fixtures.mjs';
const runId = '67890';
const restoreTarget = { ...target, roleArn: target.roleArn.replace('mofacts-recovery-transfer', 'mofacts-recovery-restore') };

function baseline(terminalLf = true) {
  const input = bindings();
  if (!terminalLf) input.AUDIT_SSH_PRIVATE_KEY = input.AUDIT_SSH_PRIVATE_KEY.slice(0, -1);
  const prepared = prepareRecoveryBundle(input, source);
  const expected = { commit: source.commit, runId: source.runId, runAttempt: source.runAttempt,
    versionId: recoveryVersionId(source), bytes: prepared.bytes };
  return { prepared, expected, stored: { ClientRequestToken: expected.versionId, SecretString: prepared.serialized } };
}

function envFor(expected) {
  const env = runnerEnv();
  for (const key of Object.keys(env)) if (/^(AUDIT_|TS_)/.test(key)) delete env[key];
  return { ...env, GITHUB_SHA: 'b'.repeat(40), RECOVERY_EXPECTED_COMMIT: 'b'.repeat(40),
    GITHUB_WORKFLOW_REF: 'memphis-iis/MoFaCTS/.github/workflows/recovery-restore.yml@refs/heads/main',
    GITHUB_RUN_ID: runId, RECOVERY_ROLE_ARN: restoreTarget.roleArn,
    RECOVERY_BASELINE_COMMIT: expected.commit, RECOVERY_BASELINE_RUN_ID: expected.runId,
    RECOVERY_BASELINE_RUN_ATTEMPT: expected.runAttempt, RECOVERY_VERSION_ID: expected.versionId,
    RECOVERY_EXPECTED_BYTES: String(expected.bytes) };
}

test('fresh isolated runner cold-reads only the exact baseline through real SDK serialization and emits a whole-document digest', async () => {
  for (const terminalLf of [true, false]) {
    const value = baseline(terminalLf);
    const cloud = sdkCloud({ baseline: value.stored, restoreRunId: runId });
    const result = await runRecoveryRestore(envFor(value.expected), { platform: 'linux',
      client: session => makeAwsReadClient(session, { requestHandler: cloud.handler }),
      fetchToken: async () => ({ ok: true, text: async () => '{"value":"synthetic.oidc.token"}' }),
    });
    assert.equal(result.state, 'recovery-baseline-cold-read-unqualified');
    const digest = crypto.createHash('sha256').update(value.prepared.serialized).digest('hex');
    const decrypted = crypto.privateDecrypt({ key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(result.documentDigestCiphertext, 'base64'));
    assert.equal(decrypted.toString('ascii'), digest);
    assert.equal(result.digestEncryption, 'RSA-OAEP-SHA256');
    assert.equal(JSON.stringify(result).includes(digest), false);
    assert.equal(result.documentDigestSha256, undefined);
    assert.equal(result.bytes, value.expected.bytes);
    assert.equal(result.secretBindings, 9); assert.equal(result.publicBindings, 1);
    assert.equal(JSON.stringify(result).includes('synthetic'), false);
    assert.deepEqual(cloud.calls.map(call => call.operation), ['AssumeRoleWithWebIdentity', 'GetCallerIdentity',
      'DescribeSecret', 'ListSecretVersionIds', 'GetSecretValue', 'DescribeSecret', 'ListSecretVersionIds']);
    const read = cloud.calls.find(call => call.operation === 'GetSecretValue').input;
    assert.equal(read.VersionId, value.expected.versionId);
    assert.equal(read.VersionStage, 'MOFACTS_RECOVERY_BASELINE');
  }
});

test('read-only capability refuses writes before any request', async () => {
  const aws = makeAwsReadClient(credentials, { requestHandler: { destroy() {}, handle() { assert.fail('network'); } } });
  for (const operation of ['put-secret-value', 'update-secret-version-stage', 'delete-secret', 'create-secret']) {
    await assert.rejects(aws('secretsmanager', operation, {}), category('aws-operation'));
  }
});

test('deployment bindings, ambient credential inputs and invalid version coordinates fail before OIDC', async () => {
  const { expected } = baseline(); const env = envFor(expected);
  const options = { platform: 'linux', fetchToken() { assert.fail('OIDC'); }, client() { assert.fail('AWS'); } };
  for (const key of ['AUDIT_AUTH_FIXTURES_JSON', 'AUDIT_SSH_PRIVATE_KEY', 'TS_OAUTH_SECRET',
    'AWS_ACCESS_KEY_ID', 'AWS_PROFILE', 'AWS_WEB_IDENTITY_TOKEN_FILE']) {
    await assert.rejects(runRecoveryRestore({ ...env, [key]: '' }, options), category('restore-input-isolation'));
  }
  for (const override of [{ RECOVERY_VERSION_ID: 'a'.repeat(64) }, { RECOVERY_BASELINE_RUN_ID: 'other' },
    { RECOVERY_EXPECTED_BYTES: '1e4' }, { RECOVERY_EXPECTED_BYTES: '65537' }]) {
    await assert.rejects(runRecoveryRestore({ ...env, ...override }, options), category('baseline-identity'));
  }
  await assert.rejects(runRecoveryRestore({ ...env, RECOVERY_ROLE_ARN: target.roleArn }, options), category('destination'));
  await assert.rejects(runRecoveryRestore({ ...env, GITHUB_WORKFLOW_REF: 'other' }, options), category('runner-context'));
});

test('wrong AWS identity, extra versions, pagination, replicas and labels block a secret read', async () => {
  const { expected, stored } = baseline();
  let identityCalls = 0;
  await assert.rejects(restoreRecoveryBaseline({ target: restoreTarget, expected, runId,
    aws: () => { identityCalls++; return { Account: 'wrong' }; } }), category('aws-identity'));
  assert.equal(identityCalls, 1);
  for (const options of [
    { mutateVersions: value => ({ ...value, NextToken: 'more' }) },
    { mutateVersions: value => ({ ...value, Versions: [...value.Versions, { VersionId: 'other' }] }) },
    { mutateDescription: value => ({ ...value, VersionIdsToStages: { [expected.versionId]: ['AWSCURRENT'] } }) },
    { mutateDescription: value => ({ ...value, ReplicationStatus: [{ Region: 'us-east-1' }] }) },
  ]) {
    const cloud = sdkCloud({ baseline: stored, restoreRunId: runId, ...options });
    await assert.rejects(restoreRecoveryBaseline({ target: restoreTarget, expected, runId,
      aws: makeAwsReadClient(credentials, { requestHandler: cloud.handler }) }));
    assert.equal(cloud.calls.some(call => call.operation === 'GetSecretValue'), false);
  }
});

test('wrong returned version, bytes, labels, provenance or changed post-read metadata fails without writes', async () => {
  const { expected, stored } = baseline();
  for (const options of [
    { mutateRead: value => ({ ...value, VersionId: 'wrong' }) },
    { mutateRead: value => ({ ...value, SecretString: value.SecretString + ' ' }) },
    { mutateRead: value => ({ ...value, VersionStages: ['AWSCURRENT'] }) },
    { mutateRead: value => ({ ...value, SecretBinary: 'AA==' }) },
    { mutateRead: value => ({ ...value, SecretString: value.SecretString.replace('"runId":"12345"', '"runId":"54321"') }) },
    { mutateDescription: (value, calls) => calls.some(call => call.operation === 'GetSecretValue')
      ? { ...value, VersionIdsToStages: {} } : value },
  ]) {
    const cloud = sdkCloud({ baseline: stored, restoreRunId: runId, ...options });
    await assert.rejects(restoreRecoveryBaseline({ target: restoreTarget, expected, runId,
      aws: makeAwsReadClient(credentials, { requestHandler: cloud.handler }) }));
    assert.equal(cloud.calls.filter(call => call.operation === 'GetSecretValue').length, 1);
    assert.equal(cloud.calls.some(call => /Put|Update|Create|Delete/.test(call.operation)), false);
  }
});

test('reader executable exposes only a sanitized category for an invalid context', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../run-restore.mjs', import.meta.url))], {
    encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false', AUDIT_SSH_PRIVATE_KEY: 'synthetic-private-diagnostic' },
  });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Recovery restore stopped: runner-context; reconcile before retry\n');
});
