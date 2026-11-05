import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { makeAwsClient } from '../sdk-client.mjs';
import { runRecoveryTransfer } from '../run.mjs';
import { BASELINE_LABEL } from '../transfer.mjs';
import { source, bindings, category } from '../../../../../mofacts/scripts/security-audit/tests/recovery-fixtures.mjs';

const credentials = { AccessKeyId: 'synthetic-access', SecretAccessKey: 'synthetic-secret', SessionToken: 'synthetic-session' };
const target = {
  accountId: '123456789012', roleArn: 'arn:aws:iam::123456789012:role/mofacts-recovery-transfer',
  secretArn: 'arn:aws:secretsmanager:us-east-2:123456789012:secret:mofacts/security-audit/recovery-ABC123',
};
const response = (body, xml = false) => ({ response: { statusCode: 200,
  headers: { 'content-type': xml ? 'text/xml' : 'application/x-amz-json-1.1' },
  body: Buffer.from(xml ? body : JSON.stringify(body)),
} });
const xml = (operation, fields) => response(`<${operation}Response xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><${operation}Result>${fields}</${operation}Result><ResponseMetadata><RequestId>synthetic</RequestId></ResponseMetadata></${operation}Response>`, true);

function sdkCloud() {
  const calls = [];
  let stored;
  return { calls, handler: { metadata: { handlerProtocol: 'http/1.1' }, destroy() {},
    async handle(request, options) {
      assert.equal(options.abortSignal instanceof AbortSignal, true);
      assert.equal(options.abortSignal.aborted, false);
      assert.equal(request.protocol, 'https:');
      const body = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
      if (request.hostname === 'sts.us-east-2.amazonaws.com') {
        const input = new URLSearchParams(body);
        const operation = input.get('Action');
        calls.push({ operation, input: Object.fromEntries(input) });
        if (operation === 'AssumeRoleWithWebIdentity') {
          assert.equal(request.headers.authorization, undefined);
          assert.equal(input.get('DurationSeconds'), '900');
          assert.equal(input.get('WebIdentityToken'), 'synthetic.oidc.token');
          return xml(operation, '<Credentials><AccessKeyId>synthetic-access</AccessKeyId><SecretAccessKey>synthetic-secret</SecretAccessKey><SessionToken>synthetic-session</SessionToken><Expiration>2100-01-01T00:00:00Z</Expiration></Credentials>');
        }
        assert.equal(operation, 'GetCallerIdentity');
        assert.match(request.headers.authorization, /Credential=synthetic-access\//);
        return xml(operation, `<Account>${target.accountId}</Account><Arn>arn:aws:sts::${target.accountId}:assumed-role/mofacts-recovery-transfer/mofacts-recovery-${source.runId}</Arn><UserId>synthetic</UserId>`);
      }
      assert.equal(request.hostname, 'secretsmanager.us-east-2.amazonaws.com');
      assert.match(request.headers.authorization, /Credential=synthetic-access\//);
      assert.equal(request.headers['x-amz-security-token'], credentials.SessionToken);
      const operation = request.headers['x-amz-target'].split('.').at(-1);
      const input = JSON.parse(body);
      assert.equal(input.SecretId, target.secretArn);
      calls.push({ operation, input });
      const base = { ARN: target.secretArn, Name: 'mofacts/security-audit/recovery' };
      if (operation === 'DescribeSecret') return response(stored ? { ...base,
        VersionIdsToStages: { [stored.ClientRequestToken]: ['AWSCURRENT', BASELINE_LABEL] } } : base);
      if (operation === 'ListSecretVersionIds') {
        assert.equal(input.IncludeDeprecated, true); assert.equal(input.MaxResults, 2);
        return response({ ...base, Versions: stored ? [{ VersionId: stored.ClientRequestToken, CreatedDate: 1800000000 }] : [] });
      }
      if (operation === 'PutSecretValue') {
        stored = input;
        return response({ ...base, VersionId: input.ClientRequestToken });
      }
      assert.equal(operation, 'GetSecretValue');
      return response({ ...base, VersionId: stored.ClientRequestToken, SecretString: stored.SecretString,
        VersionStages: ['AWSCURRENT', BASELINE_LABEL], CreatedDate: 1800000000 });
    },
  } };
}

function runnerEnv() {
  return { ...bindings(), GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: source.repository,
    GITHUB_REF: 'refs/heads/main', GITHUB_SHA: source.commit, RECOVERY_EXPECTED_COMMIT: source.commit,
    GITHUB_WORKFLOW_REF: 'memphis-iis/MoFaCTS/.github/workflows/recovery-transfer.yml@refs/heads/main',
    GITHUB_RUN_ID: source.runId, GITHUB_RUN_ATTEMPT: source.runAttempt,
    RECOVERY_ACCOUNT_ID: target.accountId, RECOVERY_ROLE_ARN: target.roleArn, RECOVERY_SECRET_ARN: target.secretArn,
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://run-actions-1.actions.githubusercontent.com/token?api-version=2.0',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-request-token',
  };
}

test('real SDK serializes unsigned OIDC exchange and signed exact-byte bootstrap without profiles or endpoints from the environment', async () => {
  const contaminated = { AWS_PROFILE: 'must-not-be-used', AWS_ENDPOINT_URL: 'https://wrong.invalid',
    AWS_REGION: 'us-west-2', AWS_ACCESS_KEY_ID: 'ambient-wrong', AWS_SECRET_ACCESS_KEY: 'ambient-wrong',
    AWS_USE_FIPS_ENDPOINT: 'true', AWS_USE_DUALSTACK_ENDPOINT: 'true' };
  const saved = Object.fromEntries(Object.keys(contaminated).map(key => [key, process.env[key]]));
  Object.assign(process.env, contaminated);
  try {
    for (const terminalLf of [true, false]) {
      const cloud = sdkCloud(); const env = runnerEnv();
      if (!terminalLf) env.AUDIT_SSH_PRIVATE_KEY = env.AUDIT_SSH_PRIVATE_KEY.slice(0, -1);
      let tokenRequests = 0;
      const result = await runRecoveryTransfer(env, { platform: 'linux',
        client: session => makeAwsClient(session, { requestHandler: cloud.handler }),
        fetchToken: async (url, request) => {
          tokenRequests++;
          assert.equal(url.searchParams.get('audience'), 'sts.amazonaws.com');
          assert.equal(request.redirect, 'error');
          assert.equal(request.headers.Authorization, 'Bearer synthetic-request-token');
          return { ok: true, text: async () => '{"value":"synthetic.oidc.token"}' };
        },
      });
      assert.equal(tokenRequests, 1);
      assert.equal(result.state, 'recovery-baseline-transferred-unqualified');
      assert.equal(cloud.calls.length, 8);
      const written = cloud.calls.find(call => call.operation === 'PutSecretValue').input;
      assert.deepEqual(written.VersionStages, [BASELINE_LABEL]);
      const bundle = JSON.parse(written.SecretString);
      assert.equal(bundle.secrets.AUDIT_SSH_PRIVATE_KEY, env.AUDIT_SSH_PRIVATE_KEY);
      assert.equal(bundle.secrets.AUDIT_AUTH_FIXTURES_JSON, env.AUDIT_AUTH_FIXTURES_JSON);
      assert.equal(JSON.stringify(result).includes('synthetic'), false);
    }
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('SDK transport sanitizes raw errors and makes one attempt on retryable responses', async () => {
  for (const throws of [false, true]) {
    let attempts = 0;
    const aws = makeAwsClient(credentials, { requestHandler: { destroy() {}, async handle() {
      attempts++;
      if (throws) throw new Error('synthetic-private-upstream');
      return { response: { statusCode: 503, headers: {}, body: Buffer.from('{"message":"synthetic-private-upstream"}') } };
    } } });
    await assert.rejects(aws('secretsmanager', 'describe-secret', { SecretId: target.secretArn }), category('aws-call'));
    assert.equal(attempts, 1);
  }
});

test('unsupported operations, absent sessions and invalid runner/source inputs fail before network access', async () => {
  const handler = { handle() { assert.fail('AWS request'); }, destroy() {} };
  await assert.rejects(makeAwsClient(credentials, { requestHandler: handler })('secretsmanager', 'delete-secret', {}), category('aws-operation'));
  await assert.rejects(makeAwsClient(null, { requestHandler: handler })('sts', 'get-caller-identity', {}), category('aws-session'));
  assert.throws(() => makeAwsClient({}), category('aws-session'));
  const options = { platform: 'linux', fetchToken() { assert.fail('OIDC request'); }, client() { assert.fail('AWS client'); } };
  for (const override of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/other' },
    { RECOVERY_EXPECTED_COMMIT: 'b'.repeat(40) }, { RUNNER_DEBUG: '1' },
    { RUNNER_ENVIRONMENT: 'self-hosted' }, { GITHUB_WORKFLOW_REF: 'other' }]) {
    await assert.rejects(runRecoveryTransfer({ ...runnerEnv(), ...override }, options), category('runner-context'));
  }
  await assert.rejects(runRecoveryTransfer({ ...runnerEnv(), AUDIT_IMAPS_PASSWORD: '' }, options), category('binding-inventory'));
  await assert.rejects(runRecoveryTransfer({ ...runnerEnv(), ACTIONS_ID_TOKEN_REQUEST_URL: 'https://wrong.invalid/token' }, options), category('oidc'));
});

test('executable runner prints only a fixed sanitized category on failure', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../run.mjs', import.meta.url))],
    { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false', AUDIT_IMAPS_PASSWORD: 'synthetic-private-upstream' } });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Recovery transfer stopped: runner-context; reconcile before retry\n');
});

test('default SDK HTTP handler has finite connection/request/abort limits and no CLI bridge', () => {
  const code = fs.readFileSync(new URL('../sdk-client.mjs', import.meta.url), 'utf8');
  assert.match(code, /connectionTimeout: 10000, requestTimeout: 20000, throwOnRequestTimeout: true/);
  assert.match(code, /AbortSignal.timeout\(45000\)/);
  assert.equal(/child_process|spawnSync|cli-input-json|writeFile/.test(code), false);
});
