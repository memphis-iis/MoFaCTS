import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import {
  BASELINE_LABEL, RECOVERY_PUBLIC_VARIABLE, RECOVERY_SECRETS, RecoveryTransferError,
  prepareRecoveryBundle, transferRecoveryBaseline,
} from '../recovery-transfer.mjs';
import { makeAwsClient, runRecoveryTransfer } from '../transfer-recovery-baseline.mjs';

const source = {
  repository: 'memphis-iis/MoFaCTS', environment: 'production-security-audit',
  commit: 'a'.repeat(40), runId: '12345', runAttempt: '1',
};
const target = {
  accountId: '123456789012', roleArn: 'arn:aws:iam::123456789012:role/mofacts-recovery-transfer',
  secretArn: 'arn:aws:secretsmanager:us-east-2:123456789012:secret:mofacts/security-audit/recovery-ABC123',
};
const publicKey = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 }).publicKey
  .export({ type: 'spki', format: 'pem' });
function bindings() {
  const sshKeyType = 'OPENSSH PRIVATE KEY';
  const actors = ['learnerA', 'learnerB', 'teacherA', 'teacherB', 'admin', 'reset', 'expiry', 'lockout'];
  const fixture = {
    users: Object.fromEntries(actors.map(actor => [actor, { username: `${actor}@audit.invalid`, password: 'synthetic-only', newPassword: 'synthetic-reset-only' }])),
    runNamespace: 'synthetic', imaps: { host: 'mail.audit.invalid', username: 'synthetic', mailbox: 'INBOX' },
    passwordless: { experimentTarget: 'one', otherExperimentTarget: 'two', participantId: 'synthetic' },
    authorizationProbes: ['anonymous', ...actors.slice(0, 5)].map(actor => ({ actor, method: 'syntheticMethod', args: [] })),
    publicationProbes: [{ actor: 'anonymous', publication: 'syntheticPublication' }],
    routeProbes: [{ actor: 'anonymous', path: '/synthetic' }],
    downloadProbes: [{ actor: 'anonymous', path: '/synthetic.wav' }],
    connectionThrottleIdentifiers: Array.from({ length: 12 }, (_, i) => `connection-${i}`),
    ipThrottleIdentifiers: Array.from({ length: 21 }, (_, i) => `ip-${i}`),
    canaries: ['synthetic-canary'], additionalData: { unicode: 'é漢', preserve: true },
  };
  return {
    ...Object.fromEntries(RECOVERY_SECRETS.map(key => [key, 'synthetic-only'])),
    AUDIT_AUTH_FIXTURES_JSON: JSON.stringify(fixture, null, 2),
    AUDIT_REPORT_INGEST_SECRET: 'synthetic-only-'.repeat(4),
    // Deliberately unusable envelope: framing/byte preservation is tested here,
    // not key generation or authentication against an actual SSH service.
    AUDIT_SSH_PRIVATE_KEY: `-----BEGIN ${sshKeyType}-----\nc3ludGhldGljLW9ubHk=\n-----END ${sshKeyType}-----\n`,
    [RECOVERY_PUBLIC_VARIABLE]: publicKey,
  };
}
const category = expected => error => error instanceof RecoveryTransferError && error.category === expected;
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

test('recovery bundle preserves all binding bytes, nested JSON, extra fields and provenance', () => {
  const input = bindings();
  const result = prepareRecoveryBundle(input, source);
  const bundle = JSON.parse(result.serialized);
  assert.deepEqual(bundle.secrets, Object.fromEntries(RECOVERY_SECRETS.map(key => [key, input[key]])));
  assert.equal(bundle.variables[RECOVERY_PUBLIC_VARIABLE], input[RECOVERY_PUBLIC_VARIABLE]);
  assert.equal(bundle.provenance.state, 'github-current-unqualified');
  assert.equal(bundle.provenance.historicalRollbackAvailable, false);
  assert.equal(result.bytes, Buffer.byteLength(result.serialized));
  assert.equal(input.AUDIT_SSH_PRIVATE_KEY.endsWith('\n'), true);
});

test('recovery rejects missing/extra bindings, malformed or duplicate JSON, bad keys and incomplete fixtures', () => {
  const cases = [
    [value => { delete value.TS_OAUTH_SECRET; }, 'binding-inventory'],
    [value => { value.EXTRA_PRIVATE_KEY = 'synthetic'; }, 'binding-inventory'],
    [value => { value.AUDIT_IMAPS_PASSWORD = '\0'; }, 'binding-inventory'],
    [value => { value.AUDIT_AUTH_FIXTURES_JSON = '{"users":{},"users":{}}'; }, 'fixture-json'],
    [value => { value.AUDIT_AUTH_FIXTURES_JSON = '{'; }, 'fixture-json'],
    [value => { value.AUDIT_AUTH_FIXTURES_JSON = '{}'; }, 'fixture-completeness'],
    [value => { value.AUDIT_REPORT_INGEST_SECRET = 'short'; }, 'ingest-key'],
    [value => { value.AUDIT_SSH_PRIVATE_KEY = value.AUDIT_SSH_PRIVATE_KEY.trimEnd(); }, 'ssh-key-format'],
    [value => { value[RECOVERY_PUBLIC_VARIABLE] = publicKey.replaceAll('PUBLIC KEY', 'PRIVATE KEY'); }, 'report-public-key'],
  ];
  for (const [mutate, expected] of cases) {
    const value = bindings(); mutate(value);
    assert.throws(() => prepareRecoveryBundle(value, source), category(expected));
  }
  for (const [key, mutate, expected] of [
    ['connectionThrottleIdentifiers', list => [...list.slice(1), list[1]], 'fixture-throttles'],
    ['ipThrottleIdentifiers', list => list.slice(1), 'fixture-throttles'],
    ['authorizationProbes', list => [...list, list[0]], 'fixture-probes'],
    ['downloadProbes', () => [], 'fixture-probes'],
  ]) {
    const value = bindings(); const fixture = JSON.parse(value.AUDIT_AUTH_FIXTURES_JSON);
    fixture[key] = mutate(fixture[key]); value.AUDIT_AUTH_FIXTURES_JSON = JSON.stringify(fixture);
    assert.throws(() => prepareRecoveryBundle(value, source), category(expected));
  }
});

test('serialized UTF-8 quota includes JSON overhead and accepts exactly 65536 bytes', () => {
  const value = bindings(); const initial = prepareRecoveryBundle(value, source).bytes;
  value.AUDIT_IMAPS_PASSWORD += 'x'.repeat(65536 - initial);
  assert.equal(prepareRecoveryBundle(value, source).bytes, 65536);
  value.AUDIT_IMAPS_PASSWORD += 'é';
  assert.throws(() => prepareRecoveryBundle(value, source), category('size-limit'));
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

test('AWS adapter uses stdin, sanitized credentials and fixed endpoints; hides raw diagnostics', async () => {
  const credentials = { AccessKeyId: 'synthetic-session', SecretAccessKey: 'synthetic-secret', SessionToken: 'synthetic-token' };
  let observed;
  const aws = makeAwsClient(credentials, { PATH: '/bin', HOME: '/home/runner',
    AUDIT_IMAPS_PASSWORD: 'synthetic-mail', AWS_PROFILE: 'wrong', AWS_ENDPOINT_URL: 'https://wrong.invalid' },
  (command, args, options) => { observed = { command, args, options }; return { status: 0, stdout: '{"ok":true}' }; });
  await aws('secretsmanager', 'put-secret-value', { SecretString: 'synthetic-private-payload' });
  assert.equal(JSON.stringify(observed.args).includes('synthetic'), false);
  assert.equal(observed.options.input, '{"SecretString":"synthetic-private-payload"}');
  assert.equal(observed.options.env.AUDIT_IMAPS_PASSWORD, undefined);
  assert.equal(observed.options.env.AWS_PROFILE, undefined);
  assert.equal(observed.options.env.AWS_ENDPOINT_URL, undefined);
  assert.equal(observed.options.env.AWS_CONFIG_FILE, '/dev/null');
  assert.equal(observed.options.env.AWS_MAX_ATTEMPTS, '1');
  const failed = makeAwsClient(credentials, {}, () => ({ status: 1, stderr: 'synthetic-private-diagnostic' }));
  await assert.rejects(failed('sts', 'get-caller-identity', {}), category('aws-call'));
  await assert.rejects(aws('secretsmanager', 'delete-secret', {}), category('aws-operation'));
});

test('runner refuses ordinary local execution before fetching a token or spawning AWS', async () => {
  await assert.rejects(runRecoveryTransfer({}, {
    fetchToken: () => assert.fail('token request'), spawn: () => assert.fail('AWS request'),
  }), category('runner-context'));
});

test('hosted runner exchanges OIDC for a 15-minute session and transfers only through the adapter', async () => {
  const env = {
    ...bindings(), GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: source.repository,
    GITHUB_REF: 'refs/heads/main', GITHUB_SHA: source.commit, RECOVERY_EXPECTED_COMMIT: source.commit,
    GITHUB_WORKFLOW_REF: 'memphis-iis/MoFaCTS/.github/workflows/recovery-transfer.yml@refs/heads/main',
    GITHUB_RUN_ID: source.runId, GITHUB_RUN_ATTEMPT: source.runAttempt,
    RECOVERY_ACCOUNT_ID: target.accountId, RECOVERY_ROLE_ARN: target.roleArn, RECOVERY_SECRET_ARN: target.secretArn,
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://run-actions-1.actions.githubusercontent.com/token?api-version=2.0',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-request-token',
  };
  const mock = cloud();
  let tokenRequests = 0;
  const options = {
    platform: 'linux',
    fetchToken: async (url, request) => {
      tokenRequests++;
      assert.equal(url.searchParams.get('audience'), 'sts.amazonaws.com');
      assert.equal(request.redirect, 'error');
      return { ok: true, text: async () => '{"value":"synthetic.oidc.token"}' };
    },
    spawn: (command, args, request) => {
      const payload = JSON.parse(request.input);
      if (args[1] === 'assume-role-with-web-identity') {
        assert.equal(payload.DurationSeconds, 900);
        assert.equal(payload.WebIdentityToken, 'synthetic.oidc.token');
        assert.equal(request.env.AWS_ACCESS_KEY_ID, undefined);
        return { status: 0, stdout: JSON.stringify({ Credentials: {
          AccessKeyId: 'synthetic-access', SecretAccessKey: 'synthetic-secret', SessionToken: 'synthetic-session',
        } }) };
      }
      return { status: 0, stdout: JSON.stringify(mock.aws(args[0], args[1], payload)) };
    },
  };
  const result = await runRecoveryTransfer(env, options);
  assert.equal(result.state, 'recovery-baseline-transferred-unqualified');
  assert.equal(tokenRequests, 1);
  for (const override of [
    { GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/other' },
    { RECOVERY_EXPECTED_COMMIT: 'b'.repeat(40) }, { RUNNER_DEBUG: '1' },
    { RUNNER_ENVIRONMENT: 'self-hosted' }, { GITHUB_WORKFLOW_REF: 'other' },
  ]) {
    await assert.rejects(runRecoveryTransfer({ ...env, ...override }, {
      ...options, fetchToken: () => assert.fail('token request'), spawn: () => assert.fail('AWS request'),
    }), category('runner-context'));
  }
  await assert.rejects(runRecoveryTransfer({ ...env, ACTIONS_ID_TOKEN_REQUEST_URL: 'https://wrong.invalid/token' }, {
    ...options, fetchToken: () => assert.fail('token request'), spawn: () => assert.fail('AWS request'),
  }), category('oidc'));
});

test('review workflow remains inert and policies bind exact source environment and one secret', () => {
  const root = new URL('../../../../deploy/security-audit/recovery-transfer/', import.meta.url);
  const workflow = yaml.load(fs.readFileSync(new URL('workflow.yml.review', root), 'utf8'));
  assert.equal(new URL('workflow.yml.review', root).pathname.includes('/.github/workflows/'), false);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.jobs.transfer.environment, source.environment);
  assert.equal(workflow.jobs.transfer.permissions['id-token'], 'write');
  assert.equal(workflow.jobs.transfer.steps.some(step => step.uses?.includes('upload-artifact')), false);
  const transferStep = workflow.jobs.transfer.steps.at(-1);
  assert.deepEqual(Object.keys(transferStep.env).filter(key => !key.startsWith('RECOVERY_')).sort(),
    [...RECOVERY_SECRETS, RECOVERY_PUBLIC_VARIABLE].sort());
  const policy = JSON.parse(fs.readFileSync(new URL('permissions-policy.example.json', root)));
  assert.deepEqual(policy.Statement[0].Action, ['secretsmanager:DescribeSecret', 'secretsmanager:ListSecretVersionIds', 'secretsmanager:PutSecretValue', 'secretsmanager:GetSecretValue']);
  assert.equal(policy.Statement[0].Resource, '<EXACT_PRECREATED_RECOVERY_SECRET_ARN>');
  const trust = JSON.parse(fs.readFileSync(new URL('trust-policy.example.json', root)));
  assert.equal(trust.Statement[0].Condition.StringEquals['token.actions.githubusercontent.com:sub'],
    `repo:${source.repository}:environment:${source.environment}`);
  assert.equal(trust.Statement[0].Condition.DateLessThan['aws:CurrentTime'], '<APPROVED_UTC_DEADLINE>');
  assert.deepEqual(policy.Statement[0].Condition.DateLessThan, trust.Statement[0].Condition.DateLessThan);
});
