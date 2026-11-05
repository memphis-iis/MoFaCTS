import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { makeAwsClient } from '../sdk-client.mjs';
import { runRecoveryTransfer } from '../run.mjs';
import { BASELINE_LABEL } from '../transfer.mjs';
import { credentials, target, sdkCloud, runnerEnv } from './sdk-fixtures.mjs';
import { category } from '../../../../../mofacts/scripts/security-audit/tests/recovery-fixtures.mjs';

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
