import assert from 'node:assert/strict';
import test from 'node:test';
import { RecoveryTransferError } from '../../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { source, bindings } from '../../../../../mofacts/scripts/security-audit/tests/recovery-fixtures.mjs';
import { BASELINE_LABEL, transferRecoveryBaseline } from '../transfer.mjs';
const target = {
  accountId: '123456789012', roleArn: 'arn:aws:iam::123456789012:role/mofacts-recovery-transfer',
  secretArn: 'arn:aws:secretsmanager:us-east-2:123456789012:secret:mofacts/security-audit/recovery-ABC123',
};
function cloud({ existing = false, mutateRead, mutateDescription, mutateVersions, wrongIdentity = false, failAt } = {}) {
  const calls = [];
  let stored;
  const aws = (service, operation, request) => {
    calls.push({ service, operation, request });
    if (operation === failAt) throw new Error('synthetic-upstream-private-diagnostic');
    if (operation === 'get-caller-identity') return {
      Account: target.accountId,
      Arn: `arn:aws:sts::${target.accountId}:assumed-role/mofacts-recovery-transfer/${wrongIdentity ? 'wrong' : 'mofacts-recovery-12345'}`,
    };
    if (operation === 'describe-secret') {
      const result = { ARN: target.secretArn, Name: 'mofacts/security-audit/recovery' };
      if (existing) result.VersionIdsToStages = { old: ['AWSCURRENT'] };
      if (stored) result.VersionIdsToStages = { [stored.ClientRequestToken]: ['AWSCURRENT', BASELINE_LABEL] };
      return mutateDescription ? mutateDescription(result, calls) : result;
    }
    if (operation === 'list-secret-version-ids') {
      assert.equal(request.IncludeDeprecated, true);
      assert.equal(request.MaxResults, 2);
      const result = { ARN: target.secretArn, Name: 'mofacts/security-audit/recovery',
        Versions: stored ? [{ VersionId: stored.ClientRequestToken }] : [] };
      return mutateVersions ? mutateVersions(result) : result;
    }
    if (operation === 'put-secret-value') {
      stored = request;
      assert.deepEqual(request.VersionStages, [BASELINE_LABEL]);
      return { ARN: target.secretArn, VersionId: request.ClientRequestToken };
    }
    if (operation === 'get-secret-value') {
      const result = { ARN: target.secretArn, VersionId: stored.ClientRequestToken,
        SecretString: stored.SecretString, VersionStages: ['AWSCURRENT', BASELINE_LABEL] };
      return mutateRead ? mutateRead(result) : result;
    }
    throw new Error('unexpected synthetic operation');
  };
  return { calls, aws };
}

test('recovery preserves the GitHub SSH binding with or without a terminal LF through write and read-back', async () => {
  for (const terminalLf of [true, false]) {
    const input = bindings();
    if (!terminalLf) input.AUDIT_SSH_PRIVATE_KEY = input.AUDIT_SSH_PRIVATE_KEY.slice(0, -1);
    const original = input.AUDIT_SSH_PRIVATE_KEY;
    const mock = cloud();
    await transferRecoveryBaseline({ bindings: input, source, target, aws: mock.aws });
    const written = JSON.parse(mock.calls.find(call => call.operation === 'put-secret-value').request.SecretString);
    assert.equal(written.secrets.AUDIT_SSH_PRIVATE_KEY, original);
    assert.equal(written.secrets.AUDIT_SSH_PRIVATE_KEY.endsWith('\n'), terminalLf);
    assert.equal(input.AUDIT_SSH_PRIVATE_KEY, original);
  }
});

test('bootstrap uses one exact secret, retains baseline label and verifies exact read-back', async () => {
  const mock = cloud();
  const result = await transferRecoveryBaseline({ bindings: bindings(), source, target, aws: mock.aws });
  assert.equal(result.state, 'recovery-baseline-transferred-unqualified');
  assert.equal(result.historicalRollbackAvailable, false);
  assert.deepEqual(mock.calls.map(call => call.operation), ['get-caller-identity', 'describe-secret',
    'list-secret-version-ids', 'put-secret-value', 'get-secret-value', 'describe-secret', 'list-secret-version-ids']);
  assert.equal(mock.calls.filter(call => call.service === 'secretsmanager').every(call => call.request.SecretId === target.secretArn), true);
  assert.equal(JSON.stringify(result).includes('synthetic-only'), false);
});

test('invalid bindings/source/destination cause no cloud request', async () => {
  const cases = [
    { target: { ...target, accountId: '999999999999' } },
    { target: { ...target, secretArn: target.secretArn.replace('us-east-2', 'us-east-1') } },
    { target: { ...target, secretArn: target.secretArn + '-other' } },
    { source: { ...source, environment: 'staging2-security-audit' } },
    { source: { ...source, commit: 'bad' } },
    { source: { ...source, runId: 12345 } },
    { bindings: { ...bindings(), AUDIT_IMAPS_PASSWORD: '' } },
  ];
  for (const override of cases) {
    const mock = cloud();
    await assert.rejects(transferRecoveryBaseline({ bindings: bindings(), source, target, aws: mock.aws, ...override }), RecoveryTransferError);
    assert.equal(mock.calls.length, 0);
  }
});

test('wrong AWS identity, existing versions, rotation, replicas and custom encryption block writes', async () => {
  for (const options of [
    { wrongIdentity: true }, { existing: true },
    // A secret with no labelled versions can still hold deprecated data.
    { mutateVersions: value => ({ ...value, Versions: [{ VersionId: 'old-unlabelled', VersionStages: [] }] }) },
    { mutateVersions: value => ({ ...value, NextToken: 'more-even-on-empty-page' }) },
    ...[{ RotationEnabled: true }, { RotationEnabled: 'false' }, { KmsKeyId: 'custom' },
      { ReplicationStatus: [{ Region: 'us-east-1' }] }, { ReplicationStatus: {} },
      { ARN: 'wrong' }, { DeletedDate: 1 }].map(extra => ({ mutateDescription: value => ({ ...value, ...extra }) })),
  ]) {
    const mock = cloud(options);
    await assert.rejects(transferRecoveryBaseline({ bindings: bindings(), source, target, aws: mock.aws }), RecoveryTransferError);
    assert.equal(mock.calls.some(call => call.operation === 'put-secret-value'), false);
  }
});

test('ambiguous writes and altered read-back stop with no retry, deletion or GitHub changes', async () => {
  for (const options of [
    { failAt: 'put-secret-value' }, { failAt: 'get-secret-value' },
    { mutateRead: value => ({ ...value, SecretString: value.SecretString.trimEnd() + ' ' }) },
    { mutateRead: value => ({ ...value, VersionStages: ['AWSCURRENT'] }) },
    { mutateDescription: value => value.VersionIdsToStages ? { ...value, VersionIdsToStages: { race: ['AWSCURRENT'] } } : value },
  ]) {
    const mock = cloud(options);
    await assert.rejects(transferRecoveryBaseline({ bindings: bindings(), source, target, aws: mock.aws }));
    assert.equal(mock.calls.filter(call => call.operation === 'put-secret-value').length, 1);
    assert.equal(mock.calls.some(call => /delete|update|create/.test(call.operation)), false);
  }
});
