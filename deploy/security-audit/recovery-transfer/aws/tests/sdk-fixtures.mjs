import assert from 'node:assert/strict';
import { BASELINE_LABEL } from '../store.mjs';
import { source, bindings } from '../../../../../mofacts/scripts/security-audit/tests/recovery-fixtures.mjs';

export const credentials = { AccessKeyId: 'synthetic-access', SecretAccessKey: 'synthetic-secret', SessionToken: 'synthetic-session' };
export const target = {
  accountId: '123456789012', roleArn: 'arn:aws:iam::123456789012:role/mofacts-recovery-transfer',
  secretArn: 'arn:aws:secretsmanager:us-east-2:123456789012:secret:mofacts/security-audit/recovery-ABC123',
};
const response = (body, xml = false) => ({ response: { statusCode: 200,
  headers: { 'content-type': xml ? 'text/xml' : 'application/x-amz-json-1.1' },
  body: Buffer.from(xml ? body : JSON.stringify(body)),
} });
const xml = (operation, fields) => response(`<${operation}Response xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><${operation}Result>${fields}</${operation}Result><ResponseMetadata><RequestId>synthetic</RequestId></ResponseMetadata></${operation}Response>`, true);

export function sdkCloud({ baseline, restoreRunId, mutateRead, mutateDescription, mutateVersions } = {}) {
  const calls = [];
  let stored = baseline;
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
        return xml(operation, `<Account>${target.accountId}</Account><Arn>arn:aws:sts::${target.accountId}:assumed-role/${restoreRunId ? `mofacts-recovery-restore/mofacts-restore-${restoreRunId}` : `mofacts-recovery-transfer/mofacts-recovery-${source.runId}`}</Arn><UserId>synthetic</UserId>`);
      }
      assert.equal(request.hostname, 'secretsmanager.us-east-2.amazonaws.com');
      assert.match(request.headers.authorization, /Credential=synthetic-access\//);
      assert.equal(request.headers['x-amz-security-token'], credentials.SessionToken);
      const operation = request.headers['x-amz-target'].split('.').at(-1);
      const input = JSON.parse(body);
      assert.equal(input.SecretId, target.secretArn);
      calls.push({ operation, input });
      const base = { ARN: target.secretArn, Name: 'mofacts/security-audit/recovery' };
      if (operation === 'DescribeSecret') {
        const value = stored ? { ...base, VersionIdsToStages: { [stored.ClientRequestToken]: ['AWSCURRENT', BASELINE_LABEL] } } : base;
        return response(mutateDescription ? mutateDescription(value, calls) : value);
      }
      if (operation === 'ListSecretVersionIds') {
        assert.equal(input.IncludeDeprecated, true); assert.equal(input.MaxResults, 2);
        const value = { ...base, Versions: stored ? [{ VersionId: stored.ClientRequestToken, CreatedDate: 1800000000 }] : [] };
        return response(mutateVersions ? mutateVersions(value) : value);
      }
      if (operation === 'PutSecretValue') {
        assert.equal(restoreRunId, undefined);
        stored = input;
        return response({ ...base, VersionId: input.ClientRequestToken });
      }
      assert.equal(operation, 'GetSecretValue');
      const value = { ...base, VersionId: stored.ClientRequestToken, SecretString: stored.SecretString,
        VersionStages: ['AWSCURRENT', BASELINE_LABEL], CreatedDate: 1800000000 };
      return response(mutateRead ? mutateRead(value) : value);
    },
  } };
}

export function runnerEnv() {
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
