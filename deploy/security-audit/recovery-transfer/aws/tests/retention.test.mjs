import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { source, bindings, privateKey, category } from '../../../../../mofacts/scripts/security-audit/tests/recovery-fixtures.mjs';
import { prepareRecoveryBundle } from '../../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { recoveryVersionId } from '../store.mjs';
import { rehearseRecoveryRetention, retentionVersionId } from '../retention.mjs';
import { makeAwsClient, makeAwsRetentionClient } from '../sdk-client.mjs';
import { runRecoveryRetention } from '../run-retention.mjs';
import { target, credentials, runnerEnv } from './sdk-fixtures.mjs';
import { retentionCloud } from './retention-cloud.mjs';
const rehearsalSource = { commit: 'b'.repeat(40), runId: '67890', runAttempt: '1' };
const rehearsalTarget = { ...target, roleArn: target.roleArn.replace('transfer', 'rehearsal') };
function setup(options = {}, terminalLf = true) {
  const input = bindings();
  if (!terminalLf) input.AUDIT_SSH_PRIVATE_KEY = input.AUDIT_SSH_PRIVATE_KEY.slice(0, -1);
  const prepared = prepareRecoveryBundle(input, source);
  const expected = { commit: source.commit, runId: source.runId, runAttempt: source.runAttempt,
    versionId: recoveryVersionId(source), bytes: prepared.bytes };
  const cloud = retentionCloud({ baseline: { ClientRequestToken: expected.versionId, SecretString: prepared.serialized },
    runId: rehearsalSource.runId, ...options });
  const aws = makeAwsRetentionClient(credentials, { requestHandler: cloud.handler });
  return { prepared, expected, cloud, invoke: () => rehearseRecoveryRetention({ target: rehearsalTarget,
    expected, source: rehearsalSource, aws }) };
}
function restored(value) {
  assert.deepEqual(new Set(value.cloud.versions.get(value.expected.versionId).labels), new Set(['AWSCURRENT', 'MOFACTS_RECOVERY_BASELINE']));
  for (const version of value.cloud.versions.values()) assert.equal(version.labels.includes('MOFACTS_RECOVERY_CANDIDATE'), false);
  assert.equal(value.cloud.calls.filter(c => c.operation === 'PutSecretValue').length, 1);
}

test('retention uses real SDK serialization, recovers both immutable versions and restores original labels', async () => {
  for (const lf of [true, false]) {
    const value = setup({}, lf); const result = await value.invoke();
    assert.equal(result.state, 'recovery-retention-verified-unqualified');
    assert.equal(result.recoveredBoth, true); assert.equal(result.baselineCurrentRestored, true);
    restored(value);
    const candidate = value.cloud.versions.get(result.candidateVersionId);
    assert.deepEqual(candidate.labels, ['AWSPREVIOUS']);
    assert.equal(candidate.text, value.prepared.serialized);
    assert.deepEqual(JSON.parse(candidate.text).provenance.commit, source.commit);
    assert.notEqual(result.candidateVersionId, value.expected.versionId);
    const digest = crypto.createHash('sha256').update(candidate.text).digest('hex');
    const decrypted = crypto.privateDecrypt({ key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(result.documentDigestCiphertext, 'base64'));
    assert.equal(decrypted.toString('ascii'), digest);
    assert.equal(JSON.stringify(result).includes(digest), false);
    assert.equal(JSON.stringify(result).includes('synthetic'), false);
    assert.equal(value.cloud.calls.filter(c => c.operation === 'UpdateSecretVersionStage').length, 3);
    assert.equal(value.cloud.calls.filter(c => c.operation === 'GetSecretValue').length, 4);
    await assert.rejects(value.invoke(), category('version-labels'));
    assert.equal(value.cloud.calls.filter(c => c.operation === 'PutSecretValue').length, 1);
  }
});

test('ambiguous mutation responses reconcile actual state without repeating a mutation or reporting success', async () => {
  for (const point of ['put-before', 'put-after', 'move-before', 'move-after', 'restore-after', 'retire-after']) {
    let fired = false;
    const value = setup({ fault(when, operation, input) {
      const key = operation === 'PutSecretValue' ? `put-${when}`
        : operation === 'UpdateSecretVersionStage' ? input.VersionStage === 'MOFACTS_RECOVERY_CANDIDATE'
          ? `retire-${when}` : input.MoveToVersionId === recoveryVersionId(source) ? `restore-${when}` : `move-${when}` : '';
      if (!fired && key === point) { fired = true; throw new Error('synthetic sensitive AWS diagnostic'); }
    } });
    const result = await value.invoke();
    assert.equal(fired, true); assert.equal(result.state, 'recovery-retention-failed-restored');
    assert.equal(result.baselineCurrentRestored, true); restored(value);
    assert.equal(JSON.stringify(result).includes('sensitive'), false);
    assert.equal(value.cloud.calls.filter(c => c.operation === 'UpdateSecretVersionStage'
      && c.input.MoveToVersionId === value.expected.versionId).length <= 1, true);
  }
});

test('failed compensating write stops with explicit reconciliation requirement and no blind retry', async () => {
  for (const stage of ['restore', 'retire']) {
    const value = setup({ fault(when, operation, input) {
      if (when === 'before' && operation === 'UpdateSecretVersionStage'
        && (stage === 'restore' ? input.MoveToVersionId === recoveryVersionId(source)
          : input.VersionStage === 'MOFACTS_RECOVERY_CANDIDATE')) throw new Error('synthetic');
    } });
    const result = await value.invoke();
    assert.equal(result.state, 'recovery-retention-reconciliation-required');
    assert.equal(result.baselineCurrentRestored, false);
    assert.equal(value.cloud.calls.filter(c => c.operation === 'UpdateSecretVersionStage'
      && (stage === 'restore' ? c.input.MoveToVersionId === value.expected.versionId
        : c.input.VersionStage === 'MOFACTS_RECOVERY_CANDIDATE')).length, 1);
  }
});

test('bad candidate bytes still restore current; unexpected state never triggers blind repair', async () => {
  const value = setup({ mutate(operation, response) {
    if (operation === 'GetSecretValue' && response.VersionId !== recoveryVersionId(source)) response.SecretString += ' ';
  } });
  const result = await value.invoke(); assert.equal(result.state, 'recovery-retention-failed-restored'); restored(value);
  let changed = false;
  const conflict = setup({ fault(when, operation, _input, { versions }) {
    if (!changed && when === 'after' && operation === 'PutSecretValue') {
      changed = true; versions.get(recoveryVersionId(source)).labels = ['AWSCURRENT'];
    }
  } });
  const failed = await conflict.invoke();
  assert.equal(failed.state, 'recovery-retention-reconciliation-required');
  assert.equal(conflict.cloud.calls.some(c => c.operation === 'UpdateSecretVersionStage'), false);
});

test('pagination, foreign versions and altered baseline metadata refuse before a write', async () => {
  for (const mutate of [
    (op, response) => { if (op === 'ListSecretVersionIds') response.NextToken = 'more'; },
    (op, response) => { if (op === 'ListSecretVersionIds') response.Versions.push({ VersionId: 'c'.repeat(64), VersionStages: [] }); },
    (op, response) => { if (op === 'DescribeSecret') response.RotationEnabled = true; },
    (op, response) => { if (op === 'GetSecretValue') response.VersionId = 'wrong'; },
  ]) {
    const value = setup({ mutate }); await assert.rejects(value.invoke());
    assert.equal(value.cloud.calls.some(c => /Put|Update/.test(c.operation)), false);
  }
});

test('baseline label and non-rehearsal write capabilities remain blocked before network', async () => {
  const handler = { destroy() {}, handle() { assert.fail('network'); } };
  const aws = makeAwsRetentionClient(credentials, { requestHandler: handler });
  for (const request of [{ VersionStage: 'MOFACTS_RECOVERY_BASELINE' }, { VersionStage: 'AWSPREVIOUS' },
    { VersionStage: 'AWSCURRENT' }, { VersionStage: 'MOFACTS_RECOVERY_CANDIDATE', MoveToVersionId: 'a'.repeat(64) }]) {
    await assert.rejects(aws('secretsmanager', 'update-secret-version-stage', request), category('aws-operation'));
  }
  await assert.rejects(aws('secretsmanager', 'put-secret-value', { VersionStages: ['AWSCURRENT'] }), category('aws-operation'));
  await assert.rejects(makeAwsClient(credentials, { requestHandler: handler })('secretsmanager', 'update-secret-version-stage', {}), category('aws-operation'));
});

test('isolated runner validates all metadata before OIDC and accepts no deployment credential bindings', async () => {
  const { expected } = setup(); const env = runnerEnv();
  for (const key of Object.keys(env)) if (/^(AUDIT_|TS_)/.test(key)) delete env[key];
  Object.assign(env, { GITHUB_SHA: rehearsalSource.commit, RECOVERY_EXPECTED_COMMIT: rehearsalSource.commit,
    GITHUB_RUN_ID: rehearsalSource.runId, RECOVERY_ROLE_ARN: rehearsalTarget.roleArn,
    GITHUB_WORKFLOW_REF: 'memphis-iis/MoFaCTS/.github/workflows/recovery-retention.yml@refs/heads/main',
    RECOVERY_BASELINE_COMMIT: expected.commit, RECOVERY_BASELINE_RUN_ID: expected.runId,
    RECOVERY_BASELINE_RUN_ATTEMPT: expected.runAttempt, RECOVERY_VERSION_ID: expected.versionId,
    RECOVERY_EXPECTED_BYTES: String(expected.bytes) });
  const options = { platform: 'linux', fetchToken() { assert.fail('OIDC'); }, client() { assert.fail('AWS'); } };
  for (const override of [{ AUDIT_AUTH_FIXTURES_JSON: '' }, { AWS_PROFILE: '' }, { RECOVERY_VERSION_ID: 'wrong' },
    { RECOVERY_ROLE_ARN: target.roleArn }, { GITHUB_WORKFLOW_REF: 'other' }]) await assert.rejects(runRecoveryRetention({ ...env, ...override }, options));
  assert.notEqual(retentionVersionId(rehearsalSource), recoveryVersionId(source));
  const value = setup();
  const result = await runRecoveryRetention(env, { platform: 'linux',
    client: session => makeAwsRetentionClient(session, { requestHandler: value.cloud.handler }),
    fetchToken: async () => ({ ok: true, text: async () => '{"value":"synthetic.oidc.token"}' }) });
  assert.equal(result.state, 'recovery-retention-verified-unqualified');
});
